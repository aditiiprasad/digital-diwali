import type { ImageKey, LoadedImage } from '../assets';
import type { AudioManager, SoundHandle } from '../audio/AudioManager';
import { hoverQuery, quality } from '../config';
import type { Effects } from '../particles/Effects';
import type { ParticleSystem } from '../particles/ParticleSystem';

export type PatakaKind = 'diya' | 'anaar' | 'rocket' | 'chakri' | 'atomBomb' | 'fuljhadi';

/**
 * How a pataka is used: `place` = drop on the road then tap to light;
 * `hold` = carried by the pointer and only burns while held (fuljhadi).
 */
export type Interaction = 'place' | 'hold';

export type PatakaState = 'landing' | 'idle' | 'fuse' | 'active' | 'done';

/** Shared services every behavior can use. Implemented in main.ts. */
export interface World {
  particles: ParticleSystem;
  fx: Effects;
  audio: AudioManager;
  readonly width: number;
  readonly height: number;
  readonly roadTop: number;
  readonly roadBottom: number;
  /** Pataka height in px at scale 1 (nearest point of the road). */
  readonly baseSize: number;
  /** Viewport scale for speeds/distances (~1 on a 1440x900 desktop). */
  readonly unit: number;
  /** 0.55 at the far edge of the road -> 1 at the near edge. */
  depthScale(y: number): number;
  /** Particle multiplier: quality setting x remaining pool headroom. */
  emission(): number;
  shake(intensity: number, duration: number): void;
  /** Nudges nearby unlit patakas. Never lights them. */
  jolt(x: number, y: number, radius: number, strength: number, except?: Placed): void;
  image(key: ImageKey): LoadedImage;
}

export interface Behavior {
  /** Advance; return false once fully finished (item is then removed). */
  update(dt: number): boolean;
  /** Draw the pataka body while active (particles are drawn by the system). */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Stop sounds etc. when removed early (e.g. Clear Road). */
  stop(): void;
}

export interface PatakaDef {
  kind: PatakaKind;
  hi: string;
  en: string;
  image: ImageKey;
  /** Height relative to World.baseSize. */
  heightMul: number;
  /** Fuse tip in the sprite box: x 0..1 from left, y 0..1 from top. */
  fuseTip: [number, number];
  /** Resting rotation in radians (the rocket leans a little). */
  restRot?: number;
  /** Defaults to `place`. */
  interaction?: Interaction;
  /** Text of the floating "light me" hint. */
  hint?: string;
  create(p: Placed, world: World): Behavior;
}

export interface Placed {
  id: number;
  def: PatakaDef;
  /** Ground contact point (bottom centre of the sprite), CSS px. */
  x: number;
  y: number;
  state: PatakaState;
  /** Seconds spent in the current state. */
  t: number;
  /** Height above the ground for landing bounces/jolts (px, positive = up). */
  hop: number;
  hopV: number;
  /** Horizontal slide velocity from jolts. */
  slideV: number;
  /** Extra rotation from jolts, springs back to 0. */
  wobble: number;
  wobbleV: number;
  /** Eased 0..1 hover amount for the "tap to light" affordance. */
  hoverK: number;
  fuseSound: SoundHandle | null;
  behavior: Behavior | null;
}

export function spriteSize(p: Placed, world: World) {
  const img = world.image(p.def.image);
  const h = world.baseSize * p.def.heightMul * world.depthScale(p.y);
  return { w: (h * img.width) / img.height, h };
}

/**
 * Maps a normalized point in the sprite box to scene coordinates, honouring
 * rotation about the bottom-centre pivot and the current hop height.
 */
export function anchor(p: Placed, world: World, nx: number, ny: number, rot = (p.def.restRot ?? 0) + p.wobble) {
  const { w, h } = spriteSize(p, world);
  const lx = (nx - 0.5) * w;
  const ly = -(1 - ny) * h;
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: p.x + lx * c - ly * s, y: p.y - p.hop + lx * s + ly * c };
}

/** Draws a sprite with its bottom-centre at (x, y). */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: LoadedImage,
  x: number, y: number, h: number,
  rot = 0, alpha = 1,
) {
  const w = (h * img.width) / img.height;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img.source, -w / 2, -h, w, h);
  ctx.restore();
}

/** Where to show the floating "light me" tooltip (scene px, above the sprite). */
export interface HintTarget {
  x: number;
  y: number;
  text: string;
}

/** Seconds after a drop during which touch devices show the strong pulse. */
export const TOUCH_INTRO_PULSE = 2;
export const DEFAULT_HINT = 'Tap to light 🔥';

/**
 * "Click me to light" affordance for an unlit pataka.
 *  - hover (mouse/pen): pulsing glow + ~1.06 scale, eased by `hoverK`
 *  - touch (no hover): strong pulse for TOUCH_INTRO_PULSE s after drop, then a slow subtle one
 *  - reduced motion: static glow, no pulse or scale
 */
export function affordance(age: number, hoverK: number, time: number) {
  const still = quality.reducedMotion;
  let glow = 0;
  let scale = 1;
  if (hoverK > 0.001) {
    glow = hoverK * (still ? 0.9 : 0.75 + 0.25 * Math.sin(time * 6));
    scale = still ? 1 : 1 + 0.06 * hoverK;
  }
  if (!hoverQuery.matches) {
    let g: number;
    if (age < TOUCH_INTRO_PULSE) {
      g = still ? 0.75 : 0.6 + 0.35 * Math.sin(age * 7.5);
      if (!still) scale = Math.max(scale, 1 + 0.04 * (0.5 + 0.5 * Math.sin(age * 7.5)));
    } else {
      g = still ? 0.35 : 0.3 + 0.12 * Math.sin(time * 2.2);
    }
    glow = Math.max(glow, g);
  }
  return { glow, scale };
}

/** Warm additive halo used by the affordance (drawn just before the sprite). */
export function drawAffordanceGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number) {
  if (k <= 0.01 || r < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(255,200,110,${0.42 * k})`);
  g.addColorStop(0.45, `rgba(255,150,60,${0.2 * k})`);
  g.addColorStop(1, 'rgba(255,140,50,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/** Soft contact shadow under a sprite. */
export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, lift = 0, alpha = 0.45) {
  const k = 1 / (1 + lift * 0.02);
  ctx.save();
  ctx.globalAlpha = alpha * k;
  ctx.translate(x, y);
  ctx.scale(1, 0.28);
  const r = w * 0.55 * k;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(0,0,0,0.8)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}
