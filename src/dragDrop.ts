import type { ImageSet } from './assets';
import { clamp, MAX_PLACED, rand } from './config';
import type { SparklerController } from './patakas/Fuljhadi';
import type { PatakaManager } from './patakas/PatakaManager';
import type { PatakaDef, PatakaKind } from './patakas/types';
import type { Scene } from './scene';

interface DragState {
  pointerId: number;
  def: PatakaDef;
  ghost: HTMLImageElement;
  slot: HTMLElement;
  x: number;
  y: number;
  tilt: number;
  /** Ghost is lifted above the finger on touch so it isn't hidden. */
  liftY: number;
  w: number;
  h: number;
}

/** How far above its ground point a dropped pataka starts, as a fraction of its height. */
const DROP_LIFT = 0.25;

/**
 * Pointer input: dragging patakas from the shop onto the road (mouse, touch,
 * pen via Pointer Events), tapping placed patakas to light them, hover
 * affordances, and routing "hold" patakas (fuljhadi) to their controller.
 */
export class DragDrop {
  private drag: DragState | null = null;

  constructor(
    private scene: Scene,
    private manager: PatakaManager,
    private sparklers: SparklerController,
    private defs: Record<PatakaKind, PatakaDef>,
    private images: ImageSet,
    private toast: (msg: string) => void,
  ) {
    for (const slot of scene.slots) {
      const def = this.defs[slot.dataset.kind as PatakaKind];
      const hold = def.interaction === 'hold';
      slot.addEventListener('pointerdown', (e) => {
        if (!hold) return this.start(e, slot);
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        this.sparklers.startFromShop(e);
      });
      // Fires after pointerup (no-op then); otherwise means the drag was interrupted.
      slot.addEventListener('lostpointercapture', (e) => this.end(e, true));
      // Keyboard users: Enter/Space drops the pataka at a random road spot.
      slot.addEventListener('click', (e) => {
        if (e.detail !== 0) return;
        if (hold) this.toast('Press and hold the fuljhadi, then move it around to light it!');
        else this.placeRandom(def);
      });
    }
    window.addEventListener('pointermove', (e) => this.hover(e));
    document.documentElement.addEventListener('pointerleave', () => this.setHover(null, null));
    // Native HTML5 drag would hijack the pointer stream.
    scene.shelf.addEventListener('dragstart', (e) => e.preventDefault());
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.end(e, false));
    window.addEventListener('pointercancel', (e) => this.end(e, true));
    window.addEventListener('blur', () => {
      if (this.drag) this.end(new PointerEvent('pointercancel', { pointerId: this.drag.pointerId }), true);
    });
    scene.el.addEventListener('pointerdown', (e) => this.tapToLight(e));
  }

  private start(e: PointerEvent, slot: HTMLElement) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // A drag whose pointerup never arrived (e.g. lost window focus): send it home.
    if (this.drag) this.end(new PointerEvent('pointercancel', { pointerId: this.drag.pointerId }), true);
    e.preventDefault();
    if (this.manager.isFull) {
      this.toast(`The road is full (${MAX_PLACED})! Light a few or tap “Clear Road”.`);
      slot.classList.remove('nope');
      void slot.offsetWidth; // restart the CSS animation
      slot.classList.add('nope');
      return;
    }
    const def = this.defs[slot.dataset.kind as PatakaKind];
    const img = this.images[def.image];
    const ghost = document.createElement('img');
    ghost.className = 'drag-ghost';
    ghost.src = img.url;
    ghost.alt = '';
    ghost.draggable = false;
    document.body.appendChild(ghost);
    try {
      slot.setPointerCapture(e.pointerId);
    } catch {
      /* not supported for this pointer */
    }
    this.drag = {
      pointerId: e.pointerId, def, ghost, slot,
      x: e.clientX, y: e.clientY, tilt: 0,
      liftY: 0, w: 0, h: 0,
    };
    this.scene.el.classList.add('dragging');
    slot.classList.add('picked');
    this.updateGhost(e.clientX, e.clientY, e.pointerType === 'touch');
  }

  private move(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    // Tilt follows horizontal velocity, eased so it swings rather than snaps.
    const vx = e.clientX - d.x;
    d.tilt += (clamp(vx * 1.6, -22, 22) - d.tilt) * 0.35;
    d.x = e.clientX;
    d.y = e.clientY;
    this.updateGhost(e.clientX, e.clientY, e.pointerType === 'touch');
  }

  /** Size the ghost by road depth under the pointer and position it. */
  private updateGhost(x: number, y: number, touch: boolean) {
    const d = this.drag!;
    const img = this.images[d.def.image];
    const s = this.scene;
    const guessH = s.baseSize * d.def.heightMul;
    d.liftY = touch ? guessH * 0.5 + 30 : 0;
    const ground = y - d.liftY + guessH / 2;
    const inRoad = ground >= s.roadTop && ground <= s.roadBottom;
    d.h = guessH * (inRoad ? s.depthScale(ground) : 1);
    d.w = (d.h * img.width) / img.height;
    const valid = this.isValid(x, this.groundY(d));
    s.roadZone.classList.toggle('valid', valid);
    d.ghost.classList.toggle('invalid', !valid);
    d.ghost.style.width = `${d.w}px`;
    d.ghost.style.height = `${d.h}px`;
    d.ghost.style.transform = `translate3d(${x - d.w / 2}px, ${y - d.liftY - d.h / 2}px, 0) rotate(${d.tilt.toFixed(1)}deg) scale(1.08)`;
  }

  /** Ground point = slightly below the ghost's bottom edge (it drops onto the road). */
  private groundY(d: DragState) {
    return d.y - d.liftY + d.h / 2 + d.h * DROP_LIFT;
  }

  private isValid(x: number, groundY: number) {
    const s = this.scene;
    if (this.manager.isFull) return false;
    if (groundY < s.roadTop || groundY > s.roadBottom) return false;
    if (x < 10 || x > s.width - 10) return false;
    for (const r of s.blockedRects()) {
      if (x >= r.left && x <= r.right && groundY >= r.top && groundY <= r.bottom) return false;
    }
    return true;
  }

  private end(e: PointerEvent, cancelled: boolean) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    // Use the release point itself; there may have been no move events in between.
    if (!cancelled) {
      d.x = e.clientX;
      d.y = e.clientY;
      this.updateGhost(e.clientX, e.clientY, e.pointerType === 'touch');
    }
    this.drag = null;
    this.scene.el.classList.remove('dragging');
    this.scene.roadZone.classList.remove('valid');
    d.slot.classList.remove('picked');
    const gy = this.groundY(d);
    if (!cancelled && this.isValid(d.x, gy)) {
      d.ghost.remove();
      this.manager.place(d.def, d.x, gy, d.h * DROP_LIFT);
    } else {
      this.returnToShop(d);
    }
  }

  /** Animate the ghost back into its shelf slot, then remove it. */
  private returnToShop(d: DragState) {
    const target = (d.slot.querySelector('img') ?? d.slot).getBoundingClientRect();
    const ghost = d.ghost;
    const tx = target.left + target.width / 2 - d.w / 2;
    const ty = target.top + target.height / 2 - d.h / 2;
    const scale = Math.min(target.width / d.w, target.height / d.h);
    ghost.classList.add('returning');
    // Force the start state to be committed before transitioning.
    void ghost.offsetWidth;
    ghost.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotate(0deg) scale(${scale})`;
    ghost.style.opacity = '0.2';
    const done = () => ghost.remove();
    ghost.addEventListener('transitionend', done, { once: true });
    window.setTimeout(done, 600);
  }

  private placeRandom(def: PatakaDef) {
    if (this.manager.isFull) {
      this.toast(`The road is full (${MAX_PLACED})! Light a few or tap “Clear Road”.`);
      return;
    }
    const s = this.scene;
    for (let i = 0; i < 20; i++) {
      const x = rand(s.width * 0.1, s.width * 0.9);
      const y = rand(s.roadTop + 10, s.roadBottom - 6);
      if (this.isValid(x, y)) {
        this.manager.place(def, x, y, s.baseSize * def.heightMul * DROP_LIFT);
        return;
      }
    }
  }

  private tapToLight(e: PointerEvent) {
    if (this.drag && e.pointerId === this.drag.pointerId) return;
    const target = e.target as HTMLElement;
    if (target.closest('#shop, #radio, .radio-wrap')) return;
    // Sparklers are drawn above road patakas, so they win overlaps.
    const s = this.sparklers.hitTest(e.clientX, e.clientY);
    if (s) {
      e.preventDefault();
      this.sparklers.pickUp(s, e);
      this.setHover(null, null);
      return;
    }
    const p = this.manager.hitTest(e.clientX, e.clientY);
    if (p) {
      e.preventDefault();
      this.manager.light(p);
      this.setHover(null, null);
    }
  }

  /** Hover affordance for mouse/pen: glow, scale, tooltip and pointer cursor. */
  private hover(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    // Only when the pointer is over open scene (not UI) and no button is held.
    if (e.buttons !== 0 || this.drag || e.target !== this.scene.el) {
      this.setHover(null, null);
      return;
    }
    const s = this.sparklers.hitTest(e.clientX, e.clientY);
    this.setHover(s ? null : this.manager.hitTest(e.clientX, e.clientY), s);
  }

  private setHover(p: ReturnType<PatakaManager['hitTest']>, s: ReturnType<SparklerController['hitTest']>) {
    this.manager.hovered = p;
    this.sparklers.hovered = s;
    const cursor = p || s ? 'pointer' : '';
    if (this.scene.el.style.cursor !== cursor) this.scene.el.style.cursor = cursor;
  }
}
