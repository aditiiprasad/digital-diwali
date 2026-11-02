import { pick, rand } from '../config';
import { color, Flag, Kind } from '../particles/ParticleSystem';
import type { SoundHandle } from '../audio/AudioManager';
import { drawShadow, drawSprite, spriteSize, type Behavior, type PatakaDef, type Placed, type World } from './types';

/**
 * Rocket: straightens up, launches with a smoke trail and whistle, then bursts
 * into a radial starburst with falling embers and a brief sky flash.
 */

const PALETTES: { stars: string[]; cool: string; rgb: string }[] = [
  { stars: ['#ff3b3b', '#ffd23b', '#ffffff'], cool: '#ff7a1a', rgb: '255,120,90' },
  { stars: ['#3bd1ff', '#7a5cff', '#ffffff'], cool: '#4a6bff', rgb: '120,170,255' },
  { stars: ['#42ff7a', '#ffe95c', '#ffffff'], cool: '#2bd46a', rgb: '150,255,150' },
  { stars: ['#ff5cf0', '#ffb3f5', '#a07cff'], cool: '#c040ff', rgb: '255,140,240' },
  { stars: ['#ffb02e', '#ff6a1a', '#fff3c4'], cool: '#ff3a1a', rgb: '255,180,90' },
  { stars: ['#59ffe1', '#ff4fa3', '#ffffff'], cool: '#2aa8ff', rgb: '140,255,230' },
];

const PALETTE_IDX = PALETTES.map((p) => ({ stars: p.stars.map(color), cool: color(p.cool), rgb: p.rgb }));

const EXHAUST = [color('#ffd27a'), color('#ff9a3c'), color('#fff1c9')];
const EMBER = color('#ffc864');
const FLASH = color('#ffffff');

/** Bottom of the rocket tube (exhaust) in the sprite box. */
const NOZZLE: [number, number] = [0.39, 0.5];
const TILT_TIME = 0.35;

type Phase = 'tilt' | 'fly' | 'burst';

class RocketBehavior implements Behavior {
  private phase: Phase = 'tilt';
  private t = 0;
  private x: number;
  private y: number;
  private vx = rand(-25, 25);
  private vy = 0;
  private rot: number;
  private size = 1;
  private targetY: number;
  private whistle: SoundHandle | null = null;
  private acc = 0;
  private smokeAcc = 0;
  private burstX = 0;
  private burstY = 0;
  private palette = pick(PALETTE_IDX);

  constructor(private p: Placed, private w: World) {
    this.x = p.x;
    this.y = p.y;
    this.rot = (p.def.restRot ?? 0) + p.wobble;
    this.targetY = w.height * rand(0.07, 0.3);
  }

  /** Exhaust position for the current flight pose. */
  private nozzle(h: number, sw: number) {
    const lx = (NOZZLE[0] - 0.5) * sw;
    const ly = -(1 - NOZZLE[1]) * h;
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { x: this.x + lx * c - ly * s, y: this.y + lx * s + ly * c };
  }

  update(dt: number): boolean {
    const { w } = this;
    this.t += dt;
    const ds = w.depthScale(this.p.y);
    const unit = w.unit;
    const { w: baseW, h: baseH } = spriteSize(this.p, w);
    const h = baseH * this.size;
    const sw = baseW * this.size;

    if (this.phase === 'tilt') {
      const k = Math.min(1, this.t / TILT_TIME);
      const ease = 1 - Math.pow(1 - k, 3);
      this.rot = ((this.p.def.restRot ?? 0) + this.p.wobble) * (1 - ease);
      const n = this.nozzle(h, sw);
      if (Math.random() < 0.7) {
        w.particles.spawn(n.x, n.y, rand(-60, 60) * ds, rand(10, 80) * ds, rand(0.15, 0.35), 1.4 * ds, pick(EXHAUST), Kind.Spark, Flag.FLICKER, 300 * unit);
      }
      w.fx.glow(n.x, n.y, 40 * ds * unit, '255,190,110', 0.7 + Math.random() * 0.3);
      if (k >= 1) {
        this.phase = 'fly';
        this.t = 0;
        this.vy = -w.height * 0.35;
        this.whistle = w.audio.play('rocketLaunch', { volume: 0.55, pan: w.audio.panFor(this.x, w.width) });
      }
      return true;
    }

    if (this.phase === 'fly') {
      // Thrust with a cap, plus a slight sideways wiggle.
      this.vy = Math.max(-w.height * 1.5, this.vy - w.height * 2.4 * dt);
      this.vx += Math.sin(this.t * 9) * 60 * unit * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot = Math.atan2(this.vx, -this.vy) * 0.6;
      // Shrink a little as it flies away from the viewer.
      this.size = Math.max(0.55, 1 - this.t * 0.45);
      this.whistle?.setPan(w.audio.panFor(this.x, w.width));

      const n = this.nozzle(h, sw);
      const em = w.emission();
      this.acc += 240 * em * dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        const spread = rand(-0.35, 0.35);
        const back = Math.PI / 2 + this.rot + spread;
        const sp = rand(60, 200) * unit;
        w.particles.spawn(n.x, n.y, Math.cos(back) * sp, Math.sin(back) * sp, rand(0.2, 0.55), rand(1, 1.8) * ds, pick(EXHAUST), Kind.Spark, Flag.FLICKER | Flag.STREAK, 250 * unit, 1.5);
      }
      this.smokeAcc += 40 * Math.max(0.4, em) * dt;
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        w.particles.smoke(n.x + rand(-2, 2), n.y + rand(0, 6), rand(-12, 12), rand(-8, 10), rand(1.2, 2.2), 6 * ds * unit, 4.5, 0.55);
      }
      w.fx.glow(n.x, n.y, 50 * ds * unit, '255,190,110', 0.9);

      if (this.y - h * 0.7 <= this.targetY) this.explode(h);
      return true;
    }

    // Burst: keep a fading light in the sky for a moment.
    const k = Math.max(0, 1 - this.t / 0.7);
    if (k > 0) w.fx.glow(this.burstX, this.burstY, Math.min(w.width, w.height) * 0.35, this.palette.rgb, 0.8 * k);
    return this.t < 0.7;
  }

  private explode(h: number) {
    const { w } = this;
    this.phase = 'burst';
    this.t = 0;
    this.whistle?.stop(0.12);
    const bx = this.x;
    const by = this.y - h * 0.7;
    this.burstX = bx;
    this.burstY = by;

    w.audio.play('rocketBurst', { volume: 0.85, pan: w.audio.panFor(bx, w.width) });
    w.audio.duck(0.55, 0.2, 0.9);
    w.fx.flashSky(this.palette.rgb, 1);

    const em = Math.max(0.35, w.emission());
    const radius = Math.min(w.width, w.height) * rand(0.17, 0.26);
    const drag = 2.2;
    const n = Math.round(170 * em);
    const pal = this.palette;
    // Particle travel with linear drag is ~v/drag, so v = radius * drag.
    for (let i = 0; i < n; i++) {
      const inner = Math.random() < 0.25;
      const ang = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
      const sp = radius * drag * (inner ? rand(0.3, 0.75) : rand(0.85, 1));
      const trail = Math.random() < 0.3 ? Flag.TRAIL : 0;
      w.particles.spawn(
        bx, by, Math.cos(ang) * sp, Math.sin(ang) * sp,
        rand(1.3, 2.1), rand(1.8, 2.8), pick(pal.stars), Kind.Spark,
        Flag.STREAK | Flag.TWINKLE | Flag.COOL | trail,
        70 * w.unit, drag, 1, undefined, pal.cool,
      );
    }
    // Slow falling embers.
    for (let i = 0; i < Math.round(45 * em); i++) {
      const ang = rand(0, Math.PI * 2);
      const sp = radius * rand(0.2, 0.9);
      w.particles.spawn(bx, by, Math.cos(ang) * sp, Math.sin(ang) * sp, rand(2.4, 3.6), rand(1, 1.6), EMBER, Kind.Spark, Flag.FLICKER, 45 * w.unit, 1.6, 0.9);
    }
    w.particles.spawn(bx, by, 0, 0, 0.25, radius * 0.18, FLASH, Kind.Spark, 0, 0, 0, 1);
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.phase === 'burst') return;
    const { w, p } = this;
    const { w: sw, h } = spriteSize(p, w);
    const lift = p.y - this.y;
    if (lift < w.height * 0.3) drawShadow(ctx, p.x, p.y, sw * 2, lift, 0.4);
    drawSprite(ctx, w.image('rocket'), this.x, this.y, h * this.size, this.rot);
  }

  stop() {
    this.whistle?.stop(0.1);
  }
}

export const Rocket: PatakaDef = {
  kind: 'rocket',
  hi: 'रॉकेट',
  en: 'Rocket',
  image: 'rocket',
  heightMul: 1.55,
  fuseTip: [0.22, 0.64],
  restRot: -0.2,
  create: (p, w) => new RocketBehavior(p, w),
};
