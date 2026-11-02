import { pick, rand } from '../config';
import { color, Flag, Kind } from '../particles/ParticleSystem';
import type { SoundHandle } from '../audio/AudioManager';
import { anchor, drawShadow, drawSprite, spriteSize, type Behavior, type PatakaDef, type Placed, type World } from './types';

/** Anaar (flower pot): a ~6s cone fountain of gold/orange/white sparks. */

const GOLD = color('#ffcf5a');
const ORANGE = color('#ff8c2a');
const WHITE = color('#fff4dc');
const RED = color('#ff4a1a');
const COLORS = [GOLD, GOLD, ORANGE, WHITE, WHITE];

const DURATION = 6;
const FADE_OUT = 0.8;
/** Top of the cone in the sprite box, where sparks emerge. */
const NOZZLE: [number, number] = [0.5, 0.22];

class AnaarBehavior implements Behavior {
  private t = 0;
  private acc = 0;
  private sound: SoundHandle;
  private soundStopped = false;

  constructor(private p: Placed, private w: World) {
    this.sound = w.audio.play('anaar', { volume: 0.55, loop: true, pan: w.audio.panFor(p.x, w.width) });
  }

  update(dt: number): boolean {
    const { p, w } = this;
    this.t += dt;
    const t = this.t;
    if (t < DURATION) {
      // Envelope: quick ramp up, long sustain, taper at the end.
      const env = Math.min(1, t / 0.4) * Math.min(1, (DURATION - t) / 1.4);
      // Layered sines + noise give an organic brightness flicker.
      const flick = 0.78 + 0.22 * Math.sin(t * 37) * Math.sin(t * 13.3) + rand(-0.08, 0.08);
      const ds = w.depthScale(p.y);
      const noz = anchor(p, w, NOZZLE[0], NOZZLE[1]);
      const hMax = w.height * 0.4 * ds * (0.55 + 0.45 * env);
      const g = 650 * w.unit * ds;
      // Launch speed for that apex height (drag trims it a little).
      const v = Math.sqrt(2 * g * hMax) * 1.1;

      this.acc += 440 * env * flick * w.emission() * dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        const ang = -Math.PI / 2 + rand(-0.24, 0.24);
        // Bias toward the top speed so the plume reads as a tall cone.
        const sp = v * (1 - Math.random() * Math.random() * 0.6);
        w.particles.spawn(
          noz.x + rand(-2, 2) * ds, noz.y,
          Math.cos(ang) * sp, Math.sin(ang) * sp,
          rand(1, 1.8), rand(1.3, 2.4) * ds, pick(COLORS), Kind.Spark,
          Flag.STREAK | Flag.GROUND | Flag.COOL | (Math.random() < 0.3 ? Flag.FLICKER : 0),
          g, 0.2, 1, undefined, RED, p.y + rand(-4, 8) * ds,
        );
      }
      if (Math.random() < dt * 7 * env) {
        w.particles.smoke(noz.x, noz.y, rand(-10, 10), rand(-50, -25) * ds, rand(1.4, 2.4), 8 * ds, 4, 0.35);
      }
      const i = env * flick;
      w.fx.glow(noz.x, noz.y, 70 * ds * w.unit, '255,210,130', i);
      w.fx.glow(noz.x, noz.y - hMax * 0.45, hMax * 0.7, '255,170,80', 0.35 * i, 1.3);
      w.fx.glow(p.x, p.y, 230 * ds * w.unit * (0.7 + 0.3 * env), '255,150,60', 0.75 * i, 0.32);
    } else if (!this.soundStopped) {
      this.soundStopped = true;
      this.sound.stop(0.6);
    }
    return t < DURATION + FADE_OUT;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { p, w } = this;
    const { w: sw, h } = spriteSize(p, w);
    const alpha = this.t < DURATION ? 1 : Math.max(0, 1 - (this.t - DURATION) / FADE_OUT);
    drawShadow(ctx, p.x, p.y, sw, 0, 0.45 * alpha);
    drawSprite(ctx, w.image('anaar'), p.x, p.y, h, 0, alpha);
  }

  stop() {
    this.sound.stop(0.2);
  }
}

export const Anaar: PatakaDef = {
  kind: 'anaar',
  hi: 'अनार',
  en: 'Anaar',
  image: 'anaar',
  heightMul: 0.95,
  fuseTip: [0.69, 0.03],
  create: (p, w) => new AnaarBehavior(p, w),
};
