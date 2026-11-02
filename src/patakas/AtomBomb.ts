import { pick, quality, rand } from '../config';
import { color, Flag, Kind } from '../particles/ParticleSystem';
import { spriteSize, type Behavior, type PatakaDef, type Placed, type World } from './types';

/**
 * Atom bomb: huge flash, shockwave ring, smoke, debris and a screen shake.
 * Nearby unlit patakas are jolted but never ignited (no chain reactions).
 */

const SPARKS = [color('#ffffff'), color('#ffe3a1'), color('#ffb347'), color('#ff7b2e')];
const COOL = color('#ff3d14');
const DEBRIS = [color('#7d1a14'), color('#5a120e'), color('#b89a62'), color('#3b3533'), color('#c22b22')];

const LIFETIME = 4;

class AtomBombBehavior implements Behavior {
  private t = 0;
  private exploded = false;
  private scorchW = 0;

  constructor(private p: Placed, private w: World) {}

  private explode() {
    const { p, w } = this;
    this.exploded = true;
    const ds = w.depthScale(p.y);
    const unit = w.unit;
    const { w: sw, h } = spriteSize(p, w);
    this.scorchW = sw * 1.6;
    const cx = p.x;
    const cy = p.y - h * 0.35;
    const em = Math.max(0.35, w.emission());

    w.audio.play('atomBomb', { volume: 1, pan: w.audio.panFor(p.x, w.width) });
    w.audio.duck(0.2, 0.6, 1.6);
    w.fx.flashScreen(quality.reducedMotion ? 0.3 : 0.85);
    w.fx.flashSky('255,220,180', 1);
    w.fx.ring(p.x, p.y, 340 * ds * unit, 0.75, 0.32, 16 * ds);
    w.fx.ring(p.x, p.y, 190 * ds * unit, 0.45, 0.32, 10 * ds);
    w.shake(18 * ds * unit + 6, 0.6);
    w.jolt(p.x, p.y, 300 * ds * unit, 1, p);

    for (let i = 0; i < Math.round(150 * em); i++) {
      const ang = rand(-Math.PI, 0) + rand(-0.15, 0.15);
      const sp = rand(200, 720) * unit * ds;
      w.particles.spawn(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp, rand(0.35, 1), rand(1.4, 2.6) * ds, pick(SPARKS), Kind.Spark, Flag.STREAK | Flag.GROUND | Flag.COOL, 900 * unit, 1.2, 1, undefined, COOL, p.y + rand(-3, 6) * ds);
    }
    for (let i = 0; i < Math.round(55 * em); i++) {
      const ang = rand(-Math.PI + 0.25, -0.25);
      const sp = rand(150, 540) * unit * ds;
      w.particles.spawn(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp, rand(1.2, 2.4), rand(2, 5) * ds, pick(DEBRIS), Kind.Debris, Flag.GROUND, 1300 * unit, 0.3, 1, undefined, undefined, p.y + rand(-6, 10) * ds);
    }
    for (let i = 0; i < 26; i++) {
      w.particles.smoke(cx + rand(-20, 20) * ds, cy + rand(-10, 10) * ds, rand(-90, 90) * ds, rand(-100, -20) * ds, rand(2, 3.6), 14 * ds * unit, 4, 0.6);
    }
  }

  update(dt: number): boolean {
    if (!this.exploded) this.explode();
    this.t += dt;
    const { p, w } = this;
    const k = Math.max(0, 1 - this.t / 0.5);
    if (k > 0) {
      const ds = w.depthScale(p.y);
      w.fx.glow(p.x, p.y - 20 * ds, 420 * ds * w.unit, '255,190,120', k);
      w.fx.glow(p.x, p.y, 520 * ds * w.unit, '255,140,60', 0.8 * k, 0.3);
    }
    return this.t < LIFETIME;
  }

  /** Only a fading scorch mark remains on the road. */
  draw(ctx: CanvasRenderingContext2D) {
    const a = 0.55 * Math.max(0, 1 - this.t / LIFETIME);
    if (a <= 0) return;
    ctx.save();
    ctx.translate(this.p.x, this.p.y);
    ctx.scale(1, 0.3);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.scorchW);
    g.addColorStop(0, `rgba(15,10,8,${a})`);
    g.addColorStop(1, 'rgba(15,10,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-this.scorchW, -this.scorchW, this.scorchW * 2, this.scorchW * 2);
    ctx.restore();
  }

  stop() {}
}

export const AtomBomb: PatakaDef = {
  kind: 'atomBomb',
  hi: 'एटम बम',
  en: 'Atom Bomb',
  image: 'atomBomb',
  heightMul: 0.9,
  fuseTip: [0.73, 0.03],
  create: (p, w) => new AtomBombBehavior(p, w),
};
