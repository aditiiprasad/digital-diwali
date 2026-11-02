import type { LoadedImage } from '../assets';
import type { SoundHandle } from '../audio/AudioManager';
import { clamp, hoverQuery, pick, quality, rand } from '../config';
import { color, Flag, Kind } from '../particles/ParticleSystem';
import {
  affordance, drawAffordanceGlow, TOUCH_INTRO_PULSE,
  type Behavior, type HintTarget, type PatakaDef, type Placed, type World,
} from './types';

/**
 * Fuljhadi (sparkler). Unlike the road patakas it is never placed and tapped:
 * it is carried by a pointer and burns only while held AND moving.
 *
 *   held + moving        -> burning: sparks, glow, crackle loop, light trail
 *   held, still > idle   -> dims to an ember, sound near silent
 *   released / cancelled -> extinguished: smoke wisp, stays where dropped
 *   fuel exhausted       -> black burnt stick, smoke puff, fades away
 */

/** Seconds of active burning per sparkler (only counts while actually burning). */
export const FULJHADI_FUEL = 10;
/** Pointer must move within this window to keep it burning. */
export const FULJHADI_IDLE_MS = 300;
/** Unfinished sparklers allowed on screen (lying + newly held). */
export const MAX_SPARKLERS_ON_SCREEN = 6;
/** One sparkler per pointer, at most this many pointers at once. */
export const MAX_HELD_SPARKLERS = 2;
/** Light-painting trail fade time (seconds). */
const TRAIL_LIFE = 1.5;
const TRAIL_MAX = 96;

/* Anchor points in the trimmed sprite box (x 0..1 from left, y 0..1 from top). */
/** Where the pointer holds the bare wire. */
const GRIP: [number, number] = [0.1, 0.93];
/** Top of the coated rod (full fuel) and where the coating ends (no fuel). */
const COAT_TOP: [number, number] = [0.93, 0.04];
const COAT_END: [number, number] = [0.36, 0.68];

const SPARKS = [color('#ffffff'), color('#fff3cf'), color('#ffe08a'), color('#ffd25e')];
const COOL = color('#ff9a3c');

/** Darkened copy of a sprite for the burnt part of the rod (cached per image). */
const burntCache = new WeakMap<object, HTMLCanvasElement>();
function burntSprite(img: LoadedImage): HTMLCanvasElement {
  let c = burntCache.get(img.source);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img.source, 0, 0, img.width, img.height);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(22,14,10,0.88)';
    ctx.fillRect(0, 0, c.width, c.height);
    burntCache.set(img.source, c);
  }
  return c;
}

type SparkState = 'held' | 'lying' | 'burnt';

export class SparklerBehavior implements Behavior {
  state: SparkState = 'lying';
  fuel = FULJHADI_FUEL;
  hoverK = 0;
  /** Seconds since it was last released (drives the touch affordance pulse). */
  lyingAge = 0;
  /** Invoked on every ignition (used for the hint counter). */
  onIgnite: (() => void) | null = null;

  private time = 0;
  private intensity = 0;
  private lastMoveAt = -1;
  private lastMoveMs = 0;
  private speed = 0;
  private vx = 0;
  private rot = 0;
  private litThisPress = false;
  private everLit = false;
  private sound: SoundHandle | null = null;
  private wisp = 0;
  private burntT = 0;
  private acc = 0;
  private branchAcc = 0;
  private trailX = new Float32Array(TRAIL_MAX);
  private trailY = new Float32Array(TRAIL_MAX);
  private trailT = new Float32Array(TRAIL_MAX);
  private trailHead = 0;
  private trailLen = 0;

  /** Pointer-to-grip offset, so a picked-up sparkler doesn't jump under the finger. */
  private offX = 0;
  private offY = 0;

  /** `p.x/p.y` is the grip point (bare wire end) in scene px. */
  constructor(readonly p: Placed, private w: World) {}

  get unfinished() {
    return this.state !== 'burnt' && this.fuel > 0;
  }

  private size() {
    const img = this.w.image('fuljhadi');
    const h = this.w.baseSize * this.p.def.heightMul;
    return { w: (h * img.width) / img.height, h };
  }

  /** Sprite-box point -> scene px, rotating about the grip. */
  private toWorld(nx: number, ny: number, scale = 1) {
    const { w, h } = this.size();
    const lx = (nx - GRIP[0]) * w * scale;
    const ly = (ny - GRIP[1]) * h * scale;
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { x: this.p.x + lx * c - ly * s, y: this.p.y + lx * s + ly * c };
  }

  /** Current burning tip in sprite-box coords: slides down the coating as fuel burns. */
  private tipLocal(): [number, number] {
    const f = 1 - this.fuel / FULJHADI_FUEL;
    return [COAT_TOP[0] + (COAT_END[0] - COAT_TOP[0]) * f, COAT_TOP[1] + (COAT_END[1] - COAT_TOP[1]) * f];
  }

  tip() {
    const [nx, ny] = this.tipLocal();
    return this.toWorld(nx, ny);
  }

  /** Start holding at pointer (x, y). With `keepGrip` the sparkler stays put and keeps its offset. */
  press(x: number, y: number, keepGrip = false) {
    if (!this.unfinished) return;
    this.state = 'held';
    this.litThisPress = false;
    this.lastMoveAt = -1;
    this.lastMoveMs = performance.now();
    if (keepGrip) {
      this.offX = this.p.x - x;
      this.offY = this.p.y - y;
    } else {
      this.offX = this.offY = 0;
      this.p.x = x;
      this.p.y = y;
    }
  }

  moveTo(px: number, py: number) {
    if (this.state !== 'held') return;
    const x = px + this.offX, y = py + this.offY;
    const now = performance.now();
    const dx = x - this.p.x, dy = y - this.p.y;
    const dist = Math.hypot(dx, dy);
    const dtS = Math.max(0.004, (now - this.lastMoveMs) / 1000);
    this.lastMoveMs = now;
    this.p.x = clamp(x, 0, this.w.width);
    this.p.y = clamp(y, 0, this.w.height);
    if (dist < 0.5) return;
    this.lastMoveAt = this.time;
    this.speed += (dist / dtS - this.speed) * 0.35;
    this.vx += (dx / dtS - this.vx) * 0.3;
  }

  release() {
    if (this.state !== 'held') return;
    this.state = 'lying';
    this.lyingAge = 0;
    if (this.litThisPress) {
      this.sound?.stop(0.3);
      this.sound = null;
      if (this.intensity > 0.03) this.wisp = 1.2;
    }
    this.litThisPress = false;
  }

  update(dt: number): boolean {
    const w = this.w;
    this.time += dt;
    if (this.state === 'burnt') {
      this.burntT += dt;
      this.decayTrail();
      return this.burntT < 1.6 || this.trailLen > 0;
    }

    const moving = this.state === 'held' && this.lastMoveAt >= 0 && this.time - this.lastMoveAt < FULJHADI_IDLE_MS / 1000;
    const burning = moving && this.fuel > 0;
    if (burning && !this.litThisPress) this.ignite();

    // Fast flare-up, ~0.3s dim to ember, ~0.3s out on release.
    const target = burning ? 1 : this.state === 'held' && this.litThisPress ? 0.12 : 0;
    const rate = target > this.intensity ? 14 : target > 0 ? 5 : 10;
    this.intensity += (target - this.intensity) * Math.min(1, dt * rate);

    if (burning) this.fuel = Math.max(0, this.fuel - dt);
    if (!moving) {
      this.speed *= Math.max(0, 1 - dt * 6);
      this.vx *= Math.max(0, 1 - dt * 6);
    }
    // The rod trails behind the motion a little.
    this.rot += (clamp(-this.vx * 0.00035, -0.35, 0.35) - this.rot) * Math.min(1, dt * 8);

    if (this.sound) {
      this.sound.setVolume(burning ? 0.5 : 0.03, burning ? 0.04 : 0.12);
      this.sound.setRate(1 + 0.15 * clamp(this.speed / 1400, 0, 1));
    }

    const tip = this.tip();
    if (this.intensity > 0.02) this.emit(dt, tip);
    if (burning && !quality.reducedMotion) this.pushTrail(tip.x, tip.y);
    this.decayTrail();

    if (this.wisp > 0) {
      this.wisp -= dt;
      if (Math.random() < dt * 16) {
        w.particles.smoke(tip.x + rand(-1, 1), tip.y, rand(-6, 6), rand(-40, -22) * w.unit, rand(1, 1.8), 2.5 * w.unit, 5, 0.35);
      }
    }

    if (this.state === 'lying') this.lyingAge += dt;

    if (this.fuel <= 0) this.burnOut(tip);
    return true;
  }

  /** Eases the hover affordance (called by the controller). */
  setHover(on: boolean, dt: number) {
    const t = on ? 1 : 0;
    this.hoverK = quality.reducedMotion ? t : this.hoverK + (t - this.hoverK) * Math.min(1, dt * 12);
  }

  private ignite() {
    const w = this.w;
    this.litThisPress = true;
    const pan = w.audio.panFor(this.p.x, w.width);
    // Full ignite the first time; a softer one when relighting.
    w.audio.play('fuljhadiLight', { volume: this.everLit ? 0.3 : 0.75, pan });
    this.everLit = true;
    this.sound?.stop(0.05);
    // Crackle loop; the fuljhadi intentionally never ducks ambient/music.
    this.sound = w.audio.play('fuljhadi', { volume: 0.5, loop: true, pan, rate: 1 });
    this.onIgnite?.();
  }

  private burnOut(tip: { x: number; y: number }) {
    const w = this.w;
    this.state = 'burnt';
    this.burntT = 0;
    this.intensity = 0;
    this.sound?.stop(0.3);
    this.sound = null;
    for (let i = 0; i < 14; i++) {
      w.particles.smoke(tip.x + rand(-6, 6), tip.y + rand(-6, 6), rand(-30, 30), rand(-50, -15), rand(1.2, 2.2), 5 * w.unit, 3.5, 0.5);
    }
  }

  private emit(dt: number, tip: { x: number; y: number }) {
    const w = this.w;
    const i = this.intensity;
    const unit = w.unit;
    const reduce = quality.reducedMotion ? 0.5 : 1;
    this.acc += 320 * i * i * w.emission() * reduce * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      const a = rand(0, Math.PI * 2);
      const sp = rand(70, 340) * unit;
      const trail = Math.random() < 0.05 ? Flag.TRAIL : 0;
      w.particles.spawn(
        tip.x, tip.y, Math.cos(a) * sp, Math.sin(a) * sp,
        rand(0.3, 0.6), rand(0.8, 1.6), pick(SPARKS), Kind.Spark,
        Flag.STREAK | Flag.COOL | trail, 160 * unit, 4, 1, undefined, COOL,
      );
    }
    // Branching: little star-shaped sub-bursts just off the tip.
    this.branchAcc += 8 * i * reduce * dt;
    while (this.branchAcc >= 1) {
      this.branchAcc -= 1;
      const a = rand(0, Math.PI * 2);
      const d = rand(14, 42) * unit;
      const bx = tip.x + Math.cos(a) * d, by = tip.y + Math.sin(a) * d;
      const n = Math.round(rand(6, 10) * Math.max(0.4, w.emission()));
      for (let k = 0; k < n; k++) {
        const b = (k / n) * Math.PI * 2 + rand(-0.2, 0.2);
        const sp = rand(60, 160) * unit;
        w.particles.spawn(bx, by, Math.cos(b) * sp, Math.sin(b) * sp, rand(0.12, 0.28), rand(0.6, 1.1), pick(SPARKS), Kind.Spark, Flag.STREAK | Flag.FLICKER, 60 * unit, 5);
      }
    }
    const flick = 0.75 + Math.random() * 0.25;
    if (i > 0.3) {
      w.fx.glow(tip.x, tip.y, (40 + 30 * flick) * unit, '255,228,175', i * flick);
      w.fx.glow(tip.x, tip.y, 210 * unit * (0.7 + 0.3 * flick), '255,170,80', 0.38 * i);
    } else {
      w.fx.glow(tip.x, tip.y, 14 * unit, '255,120,50', 0.8 * flick);
    }
  }

  private pushTrail(x: number, y: number) {
    if (this.trailLen > 0) {
      const last = (this.trailHead - 1 + TRAIL_MAX) % TRAIL_MAX;
      if (Math.hypot(x - this.trailX[last], y - this.trailY[last]) < 2) return;
    }
    this.trailX[this.trailHead] = x;
    this.trailY[this.trailHead] = y;
    this.trailT[this.trailHead] = this.time;
    this.trailHead = (this.trailHead + 1) % TRAIL_MAX;
    this.trailLen = Math.min(TRAIL_MAX, this.trailLen + 1);
  }

  private decayTrail() {
    while (this.trailLen > 0) {
      const oldest = (this.trailHead - this.trailLen + TRAIL_MAX) % TRAIL_MAX;
      if (this.time - this.trailT[oldest] < TRAIL_LIFE) break;
      this.trailLen--;
    }
  }

  /** Additive polyline whose alpha fades with point age. */
  private drawTrail(ctx: CanvasRenderingContext2D) {
    if (this.trailLen < 2) return;
    const unit = this.w.unit;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass === 0 ? 9 * unit + 3 : 2.2 * unit + 1;
      for (let k = 1; k < this.trailLen; k++) {
        const i0 = (this.trailHead - this.trailLen + k - 1 + TRAIL_MAX) % TRAIL_MAX;
        const i1 = (i0 + 1) % TRAIL_MAX;
        const a = 1 - (this.time - this.trailT[i1]) / TRAIL_LIFE;
        if (a <= 0) continue;
        ctx.strokeStyle = pass === 0 ? `rgba(255,150,60,${0.16 * a})` : `rgba(255,232,180,${0.75 * a * a})`;
        ctx.beginPath();
        ctx.moveTo(this.trailX[i0], this.trailY[i0]);
        ctx.lineTo(this.trailX[i1], this.trailY[i1]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D) {
    const img = this.w.image('fuljhadi');
    const { w: sw, h } = this.size();
    const burnt = this.state === 'burnt';
    const alpha = burnt ? Math.max(0, 1 - Math.max(0, this.burntT - 0.4) / 1.2) : 1;

    let scale = 1;
    if (this.state === 'lying' && this.unfinished) {
      const aff = affordance(this.lyingAge, this.hoverK, this.time);
      scale = aff.scale;
      const mid = this.toWorld(0.55, 0.4);
      drawAffordanceGlow(ctx, mid.x, mid.y, Math.max(sw, h) * 0.6, aff.glow);
    }

    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.p.x, this.p.y);
      ctx.rotate(this.rot);
      ctx.scale(scale, scale);
      ctx.translate(-GRIP[0] * sw, -GRIP[1] * h);
      if (burnt) {
        ctx.drawImage(burntSprite(img), 0, 0, sw, h);
      } else {
        this.drawSplit(ctx, img, sw, h);
      }
      ctx.restore();
    }
    this.drawTrail(ctx);
  }

  /**
   * Splits the rod at the burning tip with a line perpendicular to the rod:
   * the unburnt coating below, the darker burnt wire above.
   */
  private drawSplit(ctx: CanvasRenderingContext2D, img: LoadedImage, sw: number, h: number) {
    const [tx, ty] = this.tipLocal();
    const Tx = tx * sw, Ty = ty * h;
    let dx = (COAT_TOP[0] - COAT_END[0]) * sw, dy = (COAT_TOP[1] - COAT_END[1]) * h;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    const L = (sw + h) * 2;
    const half = (dir: number) => {
      ctx.beginPath();
      ctx.moveTo(Tx + nx * L, Ty + ny * L);
      ctx.lineTo(Tx + nx * L + dx * L * dir, Ty + ny * L + dy * L * dir);
      ctx.lineTo(Tx - nx * L + dx * L * dir, Ty - ny * L + dy * L * dir);
      ctx.lineTo(Tx - nx * L, Ty - ny * L);
      ctx.closePath();
    };
    if (this.fuel < FULJHADI_FUEL) {
      ctx.save();
      half(1);
      ctx.clip();
      ctx.drawImage(burntSprite(img), 0, 0, sw, h);
      ctx.restore();
    }
    ctx.save();
    half(-1);
    ctx.clip();
    ctx.drawImage(img.source, 0, 0, sw, h);
    ctx.restore();
  }

  /** Axis-aligned bounds of the (rotated) sprite box, padded. */
  bounds(pad = 8) {
    const pts = [this.toWorld(0, 0), this.toWorld(1, 0), this.toWorld(0, 1), this.toWorld(1, 1)];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) {
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }

  stop() {
    this.sound?.stop(0.2);
    this.sound = null;
  }
}

export const Fuljhadi: PatakaDef = {
  kind: 'fuljhadi',
  hi: 'फुलझड़ी',
  en: 'Fuljhadi',
  image: 'fuljhadi',
  heightMul: 1.7,
  fuseTip: COAT_TOP,
  interaction: 'hold',
  hint: 'Hold & move to light 🔥',
  create: (p, w) => new SparklerBehavior(p, w),
};

/**
 * Owns every sparkler on screen and the hold-to-burn pointer interaction.
 * Up to MAX_HELD_SPARKLERS pointers can each carry one sparkler (multi-touch).
 */
export class SparklerController {
  private items: SparklerBehavior[] = [];
  private held = new Map<number, SparklerBehavior>();
  private nextId = 1;
  hovered: SparklerBehavior | null = null;
  onLit: (() => void) | null = null;

  constructor(private world: World, private toast: (msg: string) => void) {
    window.addEventListener('pointermove', (e) => this.held.get(e.pointerId)?.moveTo(e.clientX, e.clientY));
    window.addEventListener('pointerup', (e) => this.release(e.pointerId));
    window.addEventListener('pointercancel', (e) => this.release(e.pointerId));
    window.addEventListener('blur', () => [...this.held.keys()].forEach((id) => this.release(id)));
  }

  get count() {
    return this.items.length;
  }

  private lyingCount() {
    return this.items.filter((b) => b.state === 'lying' && b.unfinished).length;
  }

  private canHold(pointerId: number) {
    if (this.held.has(pointerId)) return false;
    if (this.held.size >= MAX_HELD_SPARKLERS) {
      this.toast(`Only ${MAX_HELD_SPARKLERS} fuljhadis at a time!`);
      return false;
    }
    return true;
  }

  /** Pointer pressed on the shop's fuljhadi slot: a fresh sparkler follows it. */
  startFromShop(e: PointerEvent): boolean {
    if (!this.canHold(e.pointerId)) return false;
    if (this.lyingCount() + this.held.size >= MAX_SPARKLERS_ON_SCREEN) {
      this.toast(`${MAX_SPARKLERS_ON_SCREEN} fuljhadis are already out — pick one up or tap “Clear Road”.`);
      return false;
    }
    const p: Placed = {
      id: this.nextId++, def: Fuljhadi, x: e.clientX, y: e.clientY,
      state: 'active', t: 0, hop: 0, hopV: 0, slideV: 0, wobble: 0, wobbleV: 0, hoverK: 0,
      fuseSound: null, behavior: null,
    };
    const b = Fuljhadi.create(p, this.world) as SparklerBehavior;
    p.behavior = b;
    b.onIgnite = () => this.onLit?.();
    b.press(e.clientX, e.clientY);
    this.items.push(b);
    this.held.set(e.pointerId, b);
    return true;
  }

  /** Topmost unfinished, unheld sparkler under the point. */
  hitTest(x: number, y: number): SparklerBehavior | null {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const b = this.items[i];
      if (b.state !== 'lying' || !b.unfinished) continue;
      const r = b.bounds();
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return b;
    }
    return null;
  }

  /** Pick up a lying sparkler; it resumes burning once moved. */
  pickUp(b: SparklerBehavior, e: PointerEvent) {
    if (!this.canHold(e.pointerId)) return;
    b.press(e.clientX, e.clientY, true);
    this.held.set(e.pointerId, b);
    // Bring to front.
    this.items.splice(this.items.indexOf(b), 1);
    this.items.push(b);
    if (this.hovered === b) this.hovered = null;
  }

  private release(pointerId: number) {
    const b = this.held.get(pointerId);
    if (!b) return;
    this.held.delete(pointerId);
    b.release();
  }

  update(dt: number) {
    for (const [id, b] of this.held) if (b.state === 'burnt') this.held.delete(id);
    for (const b of this.items) b.setHover(b === this.hovered, dt);
    this.items = this.items.filter((b) => {
      const alive = b.update(dt);
      if (!alive && this.hovered === b) this.hovered = null;
      return alive;
    });
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const b of this.items) b.draw(ctx);
  }

  clear() {
    for (const b of this.items) b.stop();
    this.items = [];
    this.held.clear();
    this.hovered = null;
  }

  hintTarget(): HintTarget | null {
    let b = this.hovered;
    if (!b && !hoverQuery.matches) {
      for (const q of this.items) if (q.state === 'lying' && q.unfinished && q.lyingAge < TOUCH_INTRO_PULSE + 0.5) b = q;
    }
    if (!b || b.state !== 'lying' || !b.unfinished) return null;
    const r = b.bounds(0);
    return { x: (r.x0 + r.x1) / 2, y: r.y0 - 6, text: Fuljhadi.hint! };
  }
}
