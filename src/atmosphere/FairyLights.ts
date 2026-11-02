import { clamp, quality, rand } from '../config';

interface Bulb {
  t: number;
  color: number;
  phase: number;
  speed: number;
}

interface Strand {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  sag: number;
  bulbs: Bulb[];
}

const BULB_COLORS = ['#ffd36b', '#ff5f5f', '#7dff8a', '#6fc8ff', '#ff8af0', '#ffa94d'];

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

/** Two sagging garlands with twinkling bulbs (street scene + landing overlay). */
export class FairyLights {
  private strands: Strand[] = [];
  private readonly bulbSprites = BULB_COLORS.map((c) => glowSprite(c));
  private time = 0;
  private pointerX = 0;
  private smoothPX = 0;

  /** Rebuild strands for `width`. `yTop` is the wire baseline in canvas coordinates. */
  layout(width: number, portrait: boolean, yTop = 64) {
    const spacing = portrait ? 22 : 30;
    const mk = (x0: number, y0: number, x1: number, y1: number, sag: number): Strand => {
      const len = Math.hypot(x1 - x0, y1 - y0) + sag;
      const n = Math.max(6, Math.round(len / spacing));
      return {
        x0,
        y0,
        x1,
        y1,
        sag,
        bulbs: Array.from({ length: n }, (_, i) => ({
          t: (i + 0.5) / n,
          color: i % BULB_COLORS.length,
          phase: rand(0, Math.PI * 2),
          speed: rand(1.5, 4),
        })),
      };
    };
    this.strands = [
      mk(-20, yTop - 6, width * 0.56, yTop + 6, portrait ? 26 : 46),
      mk(width * 0.44, yTop + 4, width + 20, yTop - 10, portrait ? 30 : 54),
    ];
  }

  /** Pointer x as -1..1 (viewport). */
  setPointerNorm(x: number) {
    this.pointerX = x;
  }

  update(dt: number) {
    this.time += dt;
    this.smoothPX += (this.pointerX - this.smoothPX) * Math.min(1, dt * 2);
  }

  draw(ctx: CanvasRenderingContext2D, portrait: boolean) {
    const t = this.time;
    const drift = quality.reducedMotion ? 0 : Math.sin(t * 0.06);
    const px = quality.reducedMotion ? 0 : this.smoothPX;
    const fOff = drift * 14 - px * 22;

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#1b1020';
    ctx.lineWidth = 1.5;
    for (const s of this.strands) {
      const cx = (s.x0 + s.x1) / 2 + fOff;
      const cy = (s.y0 + s.y1) / 2 + s.sag * 2;
      ctx.beginPath();
      ctx.moveTo(s.x0 + fOff, s.y0);
      ctx.quadraticCurveTo(cx, cy, s.x1 + fOff, s.y1);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.strands) {
      const cx = (s.x0 + s.x1) / 2;
      const cy = (s.y0 + s.y1) / 2 + s.sag * 2;
      for (let i = 0; i < s.bulbs.length; i++) {
        const b = s.bulbs[i];
        const u = b.t;
        const iu = 1 - u;
        const x = iu * iu * s.x0 + 2 * iu * u * cx + u * u * s.x1 + fOff;
        const y = iu * iu * s.y0 + 2 * iu * u * cy + u * u * s.y1 + 3;
        const chase = 0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.7);
        let a = 0.45 + 0.35 * chase + 0.2 * Math.sin(t * b.speed + b.phase);
        if (Math.random() < 0.004) a *= 0.2;
        ctx.globalAlpha = clamp(a, 0, 1);
        const r = portrait ? 7 : 9;
        ctx.drawImage(this.bulbSprites[b.color], x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
