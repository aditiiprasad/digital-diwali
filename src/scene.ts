import { FairyLights } from './atmosphere/FairyLights';
import type { ImageSet } from './assets';
import { clamp, portraitQuery, quality, rand, roadBandFractions } from './config';
import type { PatakaDef } from './patakas/types';

interface Star { x: number; y: number; r: number; phase: number; speed: number }
interface DistantBurst { x: number; y: number; t: number; dur: number; r: number; color: number; rays: number; rot: number }

/**
 * Shop size multiplier relative to the street scene (1 = the original size).
 * Landscape: the base width is clamp(230px, 25vw, 380px) x SHOP_SCALE, capped
 * at 42% of the width and so the stall image is at most half the height.
 * Portrait: 33vw x SHOP_SCALE, capped at 45% of the width.
 */
export const SHOP_SCALE = 1.38;

const DISTANT_COLORS = ['#ffcf6b', '#ff7a7a', '#8affc1', '#8ab8ff', '#ff9cf2'];
const rWidth = (el: HTMLElement) => el.getBoundingClientRect().width;
const rHeight = (el: HTMLElement) => el.getBoundingClientRect().height;

function glowSprite(hex: string, size = 32): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.2, hex);
  g.addColorStop(0.45, hex + '55');
  g.addColorStop(1, hex + '00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * The street scene: DOM layers (sky, street art, road, shop, radio), the
 * effects canvas, layout of the road band, ambient atmosphere and screen shake.
 */
export class Scene {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly shopEl: HTMLDivElement;
  readonly shopMoveEl: HTMLDivElement;
  readonly shopImg: HTMLImageElement;
  readonly shelf: HTMLDivElement;
  readonly slots: HTMLButtonElement[] = [];
  readonly radioBtn: HTMLButtonElement;
  readonly roadZone: HTMLDivElement;
  readonly decorLayer: HTMLDivElement;
  private streetLayer: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private hintKey = '';
  private blockers: HTMLElement[] = [];
  private shopAspect: number;

  width = 0;
  height = 0;
  roadTop = 0;
  roadBottom = 0;
  baseSize = 80;
  unit = 1;
  portrait = false;
  /** Bottom of the visible sky band in the street art (for stars/flash). */
  skyBottom = 120;
  private skyTop = 0;
  private streetAspect: number;

  private stars: Star[] = [];
  private bursts: DistantBurst[] = [];
  private nextBurst = rand(1.5, 4);
  private distantSprites = DISTANT_COLORS.map((c) => glowSprite(c, 16));
  readonly fairyLights = new FairyLights();
  private time = 0;
  private pointerX = 0;
  private smoothPX = 0;
  private shakeT = 0;
  private shakeDur = 1;
  private shakeI = 0;
  private resizeListeners = new Set<(oldW: number, oldTop: number, oldBottom: number) => void>();
  private decorations: { kind: 'rangoli' | 'toran' | 'flowers' | 'lantern'; el: HTMLButtonElement }[] = [];
  private viewScale = 1;

  constructor(root: HTMLElement, images: ImageSet, defs: PatakaDef[]) {
    this.streetAspect = images.street.width / images.street.height;
    this.shopAspect = images.shop.height / images.shop.width;
    this.el = document.createElement('div');
    this.el.id = 'scene';
    this.el.innerHTML = `
      <div class="layer layer-sky"></div>
      <div class="layer layer-street"></div>
      <div class="layer layer-road"><div class="road-line"></div></div>
      <div class="road-zone" aria-hidden="true"></div>
      <div class="decor-layer" aria-label="Diwali decorations"></div>
      <div id="shop">
        <div class="shop-movable">
          <div class="shop-title"><span>🪔</span> Diya &amp; Pataka Shop</div>
          <img class="shop-img" alt="Pataka shop — drag to move" draggable="false" />
          <div class="shelf" role="toolbar" aria-label="Patakas — drag one onto the road"></div>
        </div>
      </div>
      <div class="layer grade" aria-hidden="true"></div>
      <canvas id="fx" aria-hidden="true"></canvas>
      <div class="layer vignette" aria-hidden="true"></div>
      <div class="light-hint" aria-hidden="true"></div>
      <button id="radio" class="radio" type="button" aria-label="Radio — click to open, drag to move" aria-expanded="false">
        <img alt="" draggable="false" />
        <span class="notes" aria-hidden="true"><i>♪</i><i>♫</i><i>♪</i></span>
      </button>
    `;
    root.prepend(this.el);

    this.streetLayer = this.el.querySelector('.layer-street')!;
    this.streetLayer.style.backgroundImage = `url("${images.street.url}")`;
    this.roadZone = this.el.querySelector('.road-zone')!;
    this.decorLayer = this.el.querySelector('.decor-layer')!;
    this.shopEl = this.el.querySelector('#shop')!;
    this.shopMoveEl = this.el.querySelector('.shop-movable')!;
    this.shopImg = this.el.querySelector('.shop-img')!;
    this.shopImg.src = images.shop.url;
    this.shelf = this.el.querySelector('.shelf')!;
    this.radioBtn = this.el.querySelector('#radio')!;
    this.radioBtn.querySelector('img')!.src = images.radio.url;
    this.hintEl = this.el.querySelector('.light-hint')!;

    for (const def of defs) {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'slot';
      slot.dataset.kind = def.kind;
      const how = def.interaction === 'hold' ? 'press, hold and move to light' : 'drag onto the road';
      slot.setAttribute('aria-label', `${def.en} (${def.hi}) — ${how}`);
      slot.innerHTML = `
        <span class="slot-art"><img alt="" draggable="false" src="${images[def.image].url}" /></span>
        <span class="slot-label"><span class="hi" lang="hi">${def.hi}</span><span class="en">${def.en}</span></span>
      `;
      this.shelf.appendChild(slot);
      this.slots.push(slot);
    }

    this.canvas = this.el.querySelector('#fx')!;
    this.ctx = this.canvas.getContext('2d', { alpha: true })!;

    window.addEventListener('pointermove', (e) => {
      const px = (e.clientX / Math.max(1, this.width)) * 2 - 1;
      this.pointerX = px;
      this.fairyLights.setPointerNorm(px);
    }, { passive: true });

    // The shop image's height affects the portrait shelf, so re-layout once it decodes.
    this.shopImg.addEventListener('load', () => this.layout());
    this.layout();
  }

  setViewScale(scale: number) {
    this.viewScale = clamp(scale, 0.85, 1.25);
  }

  addDecoration(kind: 'rangoli' | 'toran' | 'flowers' | 'lantern') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `decoration decoration-${kind}`;
    el.textContent = kind === 'rangoli' ? '🌸' : kind === 'toran' ? '🪷🪷🪷' : kind === 'flowers' ? '🌼🌼' : '🏮';
    el.setAttribute('aria-label', `${kind} decoration — drag to move`);
    el.style.left = `${this.width * (0.35 + Math.random() * 0.3)}px`;
    el.style.top = `${this.roadTop + 15 + Math.random() * Math.max(10, this.roadBottom - this.roadTop - 40)}px`;
    this.decorLayer.appendChild(el);
    this.decorations.push({ kind, el });
    let active = false;
    let ox = 0, oy = 0;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      active = true;
      const r = el.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      el.setPointerCapture(e.pointerId);
      el.classList.add('moving');
    });
    el.addEventListener('pointermove', (e) => {
      if (!active) return;
      el.style.left = `${clamp(e.clientX - ox, 8, this.width - rWidth(el) - 8)}px`;
      el.style.top = `${clamp(e.clientY - oy, this.roadTop, this.roadBottom - rHeight(el))}px`;
    });
    const stop = () => { active = false; el.classList.remove('moving'); };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
  }

  decorationSnapshot() {
    return this.decorations.map(({ kind, el }) => ({
      kind,
      x: Number.parseFloat(el.style.left) || 0,
      y: Number.parseFloat(el.style.top) || 0,
    }));
  }

  restoreDecorations(snapshot: { kind: 'rangoli' | 'toran' | 'flowers' | 'lantern'; x: number; y: number }[]) {
    for (const { el } of this.decorations) el.remove();
    this.decorations = [];
    for (const item of snapshot) {
      this.addDecoration(item.kind);
      const current = this.decorations[this.decorations.length - 1].el;
      current.style.left = `${item.x}px`;
      current.style.top = `${item.y}px`;
    }
  }

  celebrate() {
    for (let i = 0; i < 7; i++) {
      this.bursts.push({ x: rand(this.width * 0.1, this.width * 0.9), y: rand(this.skyTop + 20, this.skyBottom), t: 0, dur: 2, r: rand(25, 55) * this.unit, color: i % DISTANT_COLORS.length, rays: 20, rot: rand(0, Math.PI) });
    }
  }

  onResize(fn: (oldW: number, oldTop: number, oldBottom: number) => void) {
    this.resizeListeners.add(fn);
  }

  layout() {
    const oldW = this.width, oldTop = this.roadTop, oldBottom = this.roadBottom;
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.width = W;
    this.height = H;
    this.portrait = portraitQuery.matches;
    const band = roadBandFractions(this.portrait);
    this.roadTop = Math.round(H * band.top);
    this.el.style.setProperty('--road-top', `${this.roadTop}px`);

    const shopW = this.portrait
      ? Math.min(W * 0.33 * SHOP_SCALE, W * 0.45, 320)
      : Math.min(clamp(W * 0.25, 230, 380) * SHOP_SCALE, W * 0.42, (H * 0.5) / this.shopAspect);
    this.el.style.setProperty('--shop-w', `${Math.round(shopW)}px`);

    let clearance = 0;
    if (this.portrait) {
      // Road ends just above the docked shelf.
      const shelfTop = this.shelf.getBoundingClientRect().top;
      clearance = H - shelfTop;
      this.roadBottom = Math.round(Math.min(H * band.bottom, shelfTop - 8));
      if (this.roadBottom - this.roadTop < 90) this.roadTop = Math.max(H * 0.4, this.roadBottom - 90);
      this.el.style.setProperty('--road-top', `${this.roadTop}px`);
    } else {
      this.roadBottom = Math.round(H * band.bottom);
    }
    this.el.style.setProperty('--road-bottom', `${this.roadBottom}px`);
    // Lets fixed UI outside the scene (social links) sit above the docked shelf.
    document.documentElement.style.setProperty('--shelf-clearance', `${Math.round(clearance)}px`);

    this.baseSize = clamp(Math.min(W * 0.2, H * 0.115), 48, 108);
    this.unit = clamp(Math.sqrt((W * H) / (1440 * 900)), 0.45, 1.5);

    // Where does the sky sit inside the cover-scaled street art? The layer is
    // also scaled 1.06x from its bottom edge for parallax headroom.
    const layerH = this.roadTop + 2;
    const dispH = Math.max(layerH, W / this.streetAspect) * 1.06;
    const offTop = layerH - dispH;
    this.skyTop = Math.max(0, offTop);
    this.skyBottom = Math.max(this.skyTop + 60, offTop + dispH * 0.17);

    const dpr = quality.dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;

    this.buildAtmosphere();
    if (oldW > 0) this.resizeListeners.forEach((fn) => fn(oldW, oldTop, oldBottom));
  }

  depthScale(y: number) {
    return 0.55 + 0.45 * clamp((y - this.roadTop) / Math.max(1, this.roadBottom - this.roadTop), 0, 1);
  }

  /** Rects (viewport px) where patakas cannot be dropped even inside the road band. */
  blockedRects(): DOMRect[] {
    const radio = (this.radioBtn.closest('.radio-wrap') as HTMLElement | null) ?? this.radioBtn;
    return [this.shopImg, this.shelf, radio, ...this.blockers].map((el) => el.getBoundingClientRect());
  }

  /** Extra UI (outside the scene) that patakas must not be dropped under. */
  addBlocker(el: HTMLElement) {
    this.blockers.push(el);
  }

  /** Default radio spot: right side, sitting on the curb. */
  radioDefault(w: number, h: number) {
    return { x: this.width - w - Math.max(10, this.width * 0.03), y: this.roadTop - h + 4 };
  }

  /** Positions the floating "light me" tooltip, or hides it. Avoids redundant DOM writes. */
  setHint(target: { x: number; y: number; text: string } | null) {
    const key = target ? `${Math.round(target.x)},${Math.round(target.y)},${target.text}` : '';
    if (key === this.hintKey) return;
    this.hintKey = key;
    if (!target) {
      this.hintEl.classList.remove('show');
      return;
    }
    if (this.hintEl.textContent !== target.text) this.hintEl.textContent = target.text;
    const x = clamp(target.x, 70, this.width - 70);
    const y = Math.max(40, target.y);
    this.hintEl.style.transform = `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0) translate(-50%, -100%)`;
    this.hintEl.classList.add('show');
  }

  shake(intensity: number, duration: number) {
    if (quality.reducedMotion) return;
    this.shakeI = Math.max(this.shakeI * (this.shakeT / this.shakeDur), intensity);
    this.shakeT = this.shakeDur = duration;
  }

  private buildAtmosphere() {
    const W = this.width;
    const count = Math.round(clamp(W / 18, 25, 80));
    this.stars = Array.from({ length: count }, () => ({
      x: rand(0, W),
      y: rand(this.skyTop, this.skyBottom),
      r: rand(0.5, 1.5),
      phase: rand(0, Math.PI * 2),
      speed: rand(0.6, 2.5),
    }));

    this.fairyLights.layout(W, this.portrait, 64);
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;

    // Parallax: slow drift + subtle pointer follow, stronger for nearer layers.
    this.fairyLights.update(dt);
    this.smoothPX += (this.pointerX - this.smoothPX) * Math.min(1, dt * 2);
    const drift = quality.reducedMotion ? 0 : Math.sin(t * 0.06);
    const px = quality.reducedMotion ? 0 : this.smoothPX;
    this.streetLayer.style.transform = `translate3d(${(drift * 8 - px * 10).toFixed(2)}px,0,0) scale(1.06)`;

    // Screen shake: decaying random offset on the whole scene.
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeT / this.shakeDur;
      const m = this.shakeI * k * k;
      this.el.style.transform = this.shakeT > 0
        ? // Slight scale-up hides the viewport edges while the scene is offset.
          `translate3d(${rand(-m, m).toFixed(1)}px, ${rand(-m, m).toFixed(1)}px, 0) rotate(${rand(-0.4, 0.4) * k}deg) scale(${this.viewScale + 0.03 * k})`
        : '';
    } else {
      this.el.style.transform = this.viewScale === 1 ? '' : `scale(${this.viewScale})`;
    }

    // Occasional faint fireworks far away in the sky.
    this.nextBurst -= dt;
    if (this.nextBurst <= 0) {
      this.nextBurst = quality.reducedMotion ? rand(6, 12) : rand(2.5, 7);
      this.bursts.push({
        x: rand(this.width * 0.1, this.width * 0.9),
        y: rand(this.skyTop + 10, Math.max(this.skyTop + 20, this.skyBottom - 10)),
        t: 0,
        dur: rand(1.4, 2),
        r: rand(18, 40) * this.unit + 10,
        color: Math.floor(Math.random() * DISTANT_COLORS.length),
        rays: Math.round(rand(14, 22)),
        rot: rand(0, Math.PI),
      });
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      this.bursts[i].t += dt;
      if (this.bursts[i].t >= this.bursts[i].dur) this.bursts.splice(i, 1);
    }
  }

  /** Stars, distant fireworks and fairy lights (drawn first on the fx canvas). */
  drawAtmosphere(ctx: CanvasRenderingContext2D) {
    const t = this.time;
    const drift = quality.reducedMotion ? 0 : Math.sin(t * 0.06);
    const px = quality.reducedMotion ? 0 : this.smoothPX;

    ctx.globalCompositeOperation = 'lighter';
    // Stars: farthest layer, least parallax.
    const sOff = drift * 4 - px * 5;
    ctx.fillStyle = '#fff6e0';
    for (const s of this.stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      ctx.globalAlpha = tw * 0.8;
      ctx.fillRect(s.x + sOff - s.r / 2, s.y - s.r / 2, s.r, s.r);
    }

    // Distant fireworks: small, faint, drooping rings of dots.
    for (const b of this.bursts) {
      const p = b.t / b.dur;
      const ease = 1 - Math.pow(1 - p, 3);
      const sprite = this.distantSprites[b.color];
      ctx.globalAlpha = 0.45 * (1 - p);
      for (let i = 0; i < b.rays; i++) {
        const a = b.rot + (i / b.rays) * Math.PI * 2;
        const x = b.x + sOff + Math.cos(a) * b.r * ease;
        const y = b.y + Math.sin(a) * b.r * ease + p * p * 14;
        ctx.drawImage(sprite, x - 3, y - 3, 6, 6);
      }
    }

    this.fairyLights.draw(ctx, this.portrait);
  }
}
