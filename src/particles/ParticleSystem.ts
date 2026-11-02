/**
 * Pooled particle system using struct-of-arrays typed buffers. Live particles
 * are packed in [0, count); a dead particle is replaced by the last live one
 * (swap-remove), so there are no per-frame allocations.
 */

export const Kind = {
  Spark: 0, // additive glow sprite, optional streak
  Smoke: 1, // normal blend soft puff that grows
  Debris: 2, // normal blend small solid chunk
} as const;

export const Flag = {
  STREAK: 1, // draw a motion-trail line
  TWINKLE: 2, // strobe on/off near end of life
  FLICKER: 4, // random brightness per frame
  GROUND: 8, // bounce off groundY
  TRAIL: 16, // shed tiny embers while flying (rocket "sparkle tail")
  COOL: 32, // shift from color to color2 as it ages
} as const;

interface ColorEntry {
  css: string;
  sprite: HTMLCanvasElement;
}

const SPRITE = 32;

function makeGlowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
  const wr = Math.round(r + (255 - r) * 0.7), wg = Math.round(g + (255 - g) * 0.7), wb = Math.round(b + (255 - b) * 0.7);
  grad.addColorStop(0, `rgba(${wr},${wg},${wb},1)`);
  grad.addColorStop(0.22, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.25)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SPRITE, SPRITE);
  return c;
}

function makeSmokeSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(200,190,185,0.55)');
  grad.addColorStop(0.5, 'rgba(150,140,140,0.25)');
  grad.addColorStop(1, 'rgba(120,110,110,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

const colorTable: ColorEntry[] = [];
const colorIndex = new Map<string, number>();

/** Registers a hex color (e.g. "#ffcc66") and returns its palette index. */
export function color(hex: string): number {
  const existing = colorIndex.get(hex);
  if (existing !== undefined) return existing;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const idx = colorTable.length;
  colorTable.push({ css: `rgb(${r},${g},${b})`, sprite: makeGlowSprite(r, g, b) });
  colorIndex.set(hex, idx);
  return idx;
}

const EMBER = color('#ffd27a');

export class ParticleSystem {
  readonly capacity: number;
  /** Soft cap that can be lowered at runtime for weaker devices. */
  cap: number;
  count = 0;

  private x: Float32Array; private y: Float32Array;
  private vx: Float32Array; private vy: Float32Array;
  private life: Float32Array; private maxLife: Float32Array;
  private size: Float32Array; private size1: Float32Array;
  private grav: Float32Array; private drag: Float32Array;
  private alpha: Float32Array; private groundY: Float32Array;
  private col: Uint16Array; private col2: Uint16Array;
  private kind: Uint8Array; private flags: Uint8Array;
  private smokeSprite = makeSmokeSprite();
  private time = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.cap = capacity;
    const f = () => new Float32Array(capacity);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f();
    this.life = f(); this.maxLife = f(); this.size = f(); this.size1 = f();
    this.grav = f(); this.drag = f(); this.alpha = f(); this.groundY = f();
    this.col = new Uint16Array(capacity); this.col2 = new Uint16Array(capacity);
    this.kind = new Uint8Array(capacity); this.flags = new Uint8Array(capacity);
  }

  /** Fraction of the pool still free (0..1). Emitters scale their output by this. */
  get headroom() {
    return Math.max(0, 1 - this.count / this.cap);
  }

  /**
   * Spawns one particle. Positional args avoid allocating option objects in
   * hot emitter loops. Returns false when the pool is full.
   */
  spawn(
    x: number, y: number, vx: number, vy: number,
    life: number, size: number, colorIdx: number,
    kind: number = Kind.Spark, flags = 0,
    gravity = 0, drag = 0, alpha = 1,
    size1 = size, color2 = colorIdx, groundY = 1e9,
  ): boolean {
    if (this.count >= this.cap) return false;
    const i = this.count++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size; this.size1[i] = size1;
    this.col[i] = colorIdx; this.col2[i] = color2;
    this.kind[i] = kind; this.flags[i] = flags;
    this.grav[i] = gravity; this.drag[i] = drag; this.alpha[i] = alpha;
    this.groundY[i] = groundY;
    return true;
  }

  smoke(x: number, y: number, vx: number, vy: number, life: number, size: number, grow: number, alpha = 0.5) {
    return this.spawn(x, y, vx, vy, life, size, 0, Kind.Smoke, 0, -12, 1.2, alpha, size * grow);
  }

  clear() {
    this.count = 0;
  }

  update(dt: number) {
    this.time += dt;
    const { x, y, vx, vy, life, grav, drag, flags, groundY } = this;
    let i = 0;
    while (i < this.count) {
      life[i] -= dt;
      if (life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const d = drag[i] > 0 ? Math.max(0, 1 - drag[i] * dt) : 1;
      vx[i] *= d;
      vy[i] = vy[i] * d + grav[i] * dt;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      const fl = flags[i];
      if (fl & Flag.GROUND && y[i] > groundY[i] && vy[i] > 0) {
        y[i] = groundY[i];
        vy[i] *= -0.28;
        vx[i] *= 0.55;
      }
      // Sparkle tail: occasionally drop a tiny short-lived ember behind.
      if (fl & Flag.TRAIL && Math.random() < dt * 22 && this.count < this.cap * 0.92) {
        this.spawn(x[i], y[i], vx[i] * 0.05, vy[i] * 0.05 + 10, 0.35 + Math.random() * 0.35, this.size[i] * 0.45, EMBER, Kind.Spark, Flag.FLICKER, 40, 2);
      }
      i++;
    }
  }

  private kill(i: number) {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last]; this.y[i] = this.y[last];
    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
    this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
    this.size[i] = this.size[last]; this.size1[i] = this.size1[last];
    this.col[i] = this.col[last]; this.col2[i] = this.col2[last];
    this.kind[i] = this.kind[last]; this.flags[i] = this.flags[last];
    this.grav[i] = this.grav[last]; this.drag[i] = this.drag[last];
    this.alpha[i] = this.alpha[last]; this.groundY[i] = this.groundY[last];
  }

  /** Normal-blend pass: smoke and debris. Drawn before the additive pass. */
  drawNormal(ctx: CanvasRenderingContext2D) {
    const { x, y, life, maxLife, size, size1, kind, alpha, col } = this;
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < this.count; i++) {
      const k = kind[i];
      if (k === Kind.Spark) continue;
      const t = life[i] / maxLife[i]; // 1 -> 0
      if (k === Kind.Smoke) {
        const s = size1[i] + (size[i] - size1[i]) * t;
        // Fade in quickly, then out slowly.
        ctx.globalAlpha = alpha[i] * Math.min(1, (1 - t) * 6) * t;
        ctx.drawImage(this.smokeSprite, x[i] - s, y[i] - s, s * 2, s * 2);
      } else {
        ctx.globalAlpha = alpha[i] * Math.min(1, t * 3);
        ctx.fillStyle = colorTable[col[i]].css;
        const s = size[i];
        ctx.fillRect(x[i] - s / 2, y[i] - s / 2, s, s * 0.7);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Additive pass: sparks, embers, burst stars. */
  drawAdditive(ctx: CanvasRenderingContext2D) {
    const { x, y, vx, vy, life, maxLife, size, kind, flags, alpha, col, col2 } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const time = this.time;
    for (let i = 0; i < this.count; i++) {
      if (kind[i] !== Kind.Spark) continue;
      const t = life[i] / maxLife[i];
      const fl = flags[i];
      let a = alpha[i] * Math.min(1, t * 2.2);
      if (fl & Flag.FLICKER) a *= 0.45 + Math.random() * 0.55;
      if (fl & Flag.TWINKLE && t < 0.5 && Math.sin(time * 40 + i * 1.7) < -0.2) a *= 0.15;
      if (a < 0.02) continue;
      const entry = colorTable[(fl & Flag.COOL && t < 0.55) ? col2[i] : col[i]];
      const s = size[i] * (0.6 + 0.4 * t);
      if (fl & Flag.STREAK) {
        ctx.globalAlpha = a * 0.7;
        ctx.strokeStyle = entry.css;
        ctx.lineWidth = Math.max(0.6, s * 0.55);
        ctx.beginPath();
        ctx.moveTo(x[i] - vx[i] * 0.045, y[i] - vy[i] * 0.045);
        ctx.lineTo(x[i], y[i]);
        ctx.stroke();
      }
      ctx.globalAlpha = a;
      const r = s * 2.4;
      ctx.drawImage(entry.sprite, x[i] - r, y[i] - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
