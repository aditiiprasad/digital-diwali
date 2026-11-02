import { clamp, lerp, pick, rand } from '../config';
import { color, Flag, Kind } from '../particles/ParticleSystem';
import type { SoundHandle } from '../audio/AudioManager';
import { spriteSize, type Behavior, type PatakaDef, type Placed, type World } from './types';

/**
 * Chakri (ground spinner): spins up in place, then skitters along the road on
 * a wobbly random path while spinning faster, then fizzles into smoke.
 */

const SPARKS = [color('#ffd75e'), color('#fff3d1'), color('#b8ff5c'), color('#ff9b3d')];
const COOL = color('#ff5a1f');

const SPIN_UP = 1.2;
const MOVE = 5;
const FIZZLE = 1;
const END = SPIN_UP + MOVE + FIZZLE;
/** Number of spark nozzles around the rim. */
const NOZZLES = 3;

class ChakriBehavior implements Behavior {
  private t = 0;
  private angle = 0;
  private spin = 5;
  private heading = rand(0, Math.PI * 2);
  private acc = 0;
  private intensity = 0;
  private sound: SoundHandle;
  private fizzled = false;
  private puffed = false;

  constructor(private p: Placed, private w: World) {
    this.sound = w.audio.play('chakri', { volume: 0.5, loop: true, pan: w.audio.panFor(p.x, w.width) });
  }

  update(dt: number): boolean {
    const { p, w } = this;
    this.t += dt;
    const t = this.t;
    const unit = w.unit;

    if (t < SPIN_UP) {
      this.spin = lerp(5, 18, t / SPIN_UP);
      this.intensity = Math.min(1, t / 0.3);
    } else if (t < SPIN_UP + MOVE) {
      const m = t - SPIN_UP;
      this.spin = 18 + m * 4.5;
      this.intensity = 1;
      // Random-walk steering plus a slow sinusoidal wobble = curvy path.
      this.heading += (Math.sin(t * 2.7) * 1.8 + rand(-3, 3)) * dt;
      const ds = w.depthScale(p.y);
      const speed = (45 + m * 18) * unit * ds;
      p.x += Math.cos(this.heading) * speed * dt;
      // Vertical motion is compressed: moving "into" the road covers less screen.
      p.y += Math.sin(this.heading) * speed * 0.4 * dt;
      const margin = 6;
      if (p.y < w.roadTop + margin || p.y > w.roadBottom - margin) {
        this.heading = -this.heading;
        p.y = clamp(p.y, w.roadTop + margin, w.roadBottom - margin);
      }
      if (p.x < 24 || p.x > w.width - 24) {
        this.heading = Math.PI - this.heading;
        p.x = clamp(p.x, 24, w.width - 24);
      }
      this.sound.setPan(w.audio.panFor(p.x, w.width));
    } else if (t < END) {
      const k = 1 - (t - SPIN_UP - MOVE) / FIZZLE;
      this.intensity = k * k;
      this.spin *= Math.max(0, 1 - dt * 1.5);
      if (!this.fizzled) {
        this.fizzled = true;
        this.sound.stop(0.9);
      }
    } else if (!this.puffed) {
      this.puffed = true;
      const ds = w.depthScale(p.y);
      for (let i = 0; i < 18; i++) {
        w.particles.smoke(p.x + rand(-14, 14) * ds, p.y - rand(2, 12) * ds, rand(-30, 30) * ds, rand(-40, -10) * ds, rand(1.2, 2.4), 7 * ds * unit, 4, 0.5);
      }
    }
    this.angle += this.spin * dt;

    if (this.intensity > 0.01) this.emit(dt);
    return t < END + 0.25;
  }

  private emit(dt: number) {
    const { p, w } = this;
    const ds = w.depthScale(p.y);
    const { w: sw, h } = spriteSize(p, w);
    const squash = h / sw;
    const cx = p.x;
    const cy = p.y - h * 0.5;
    const r = sw * 0.47;
    this.acc += 280 * this.intensity * w.emission() * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      const a = this.angle + (Math.floor(Math.random() * NOZZLES) * Math.PI * 2) / NOZZLES + rand(-0.1, 0.1);
      const ca = Math.cos(a), sa = Math.sin(a);
      // Tangent to the rim (direction of spin), flattened by the same perspective squash.
      const sp = rand(120, 260) * w.unit * ds + this.spin * r * 0.25;
      w.particles.spawn(
        cx + ca * r, cy + sa * r * squash,
        -sa * sp, ca * sp * squash - rand(20, 90) * ds,
        rand(0.25, 0.6), rand(1, 1.8) * ds, pick(SPARKS), Kind.Spark,
        Flag.STREAK | Flag.GROUND | Flag.COOL,
        520 * w.unit, 1, 1, undefined, COOL, p.y + rand(0, 4) * ds,
      );
    }
    const i = this.intensity;
    w.fx.glow(cx, cy, r * 2.6, '255,200,110', 0.75 * i, 0.5);
    w.fx.glow(p.x, p.y, r * 4, '255,160,70', 0.5 * i, 0.3);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { p, w } = this;
    if (this.t > END) return;
    const img = w.image('chakri');
    const { w: sw, h } = spriteSize(p, w);
    const squash = h / sw;
    const alpha = this.t < SPIN_UP + MOVE ? 1 : Math.max(0, 1 - (this.t - SPIN_UP - MOVE) / FIZZLE);
    const jitter = this.intensity * 1.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x + rand(-jitter, jitter), p.y - h * 0.5 + rand(-jitter, jitter));
    // Un-squash the elliptical sprite to a circle, rotate, then re-squash:
    // the disc appears to spin flat on the road.
    ctx.scale(1, squash);
    ctx.rotate(this.angle);
    ctx.scale(1, 1 / squash);
    ctx.drawImage(img.source, -sw / 2, -h / 2, sw, h);
    ctx.restore();
  }

  stop() {
    this.sound.stop(0.2);
  }
}

export const Chakri: PatakaDef = {
  kind: 'chakri',
  hi: 'चकरी',
  en: 'Chakri',
  image: 'chakri',
  heightMul: 0.5,
  fuseTip: [0.57, 0.24],
  create: (p, w) => new ChakriBehavior(p, w),
};
