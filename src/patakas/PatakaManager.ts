import { clamp, FUSE_TIME, hoverQuery, MAX_PLACED, pick, quality, rand } from '../config';
import { color, Flag, Kind } from '../particles/ParticleSystem';
import {
  affordance, anchor, DEFAULT_HINT, drawAffordanceGlow, drawShadow, drawSprite, spriteSize, TOUCH_INTRO_PULSE,
  type HintTarget, type PatakaDef, type Placed, type World,
} from './types';

const FUSE_SPARKS = [color('#fff1b8'), color('#ffc34d'), color('#ff8a2b')];

/** Owns every pataka placed on the road and runs their state machine. */
export class PatakaManager {
  items: Placed[] = [];
  private nextId = 1;
  private drawOrder: Placed[] = [];
  private time = 0;
  /** Unlit pataka currently under a hovering mouse/pen, if any. */
  hovered: Placed | null = null;
  /** Called every time a pataka is lit. */
  onLit: (() => void) | null = null;

  constructor(private world: World) {}

  /** Patakas still on the road (lit or not) count toward the cap. */
  get isFull() {
    return this.items.length >= MAX_PLACED;
  }

  place(def: PatakaDef, x: number, y: number, dropHeight: number): Placed {
    const p: Placed = {
      id: this.nextId++,
      def, x, y,
      state: 'landing',
      t: 0,
      hop: Math.max(0, dropHeight),
      hopV: 0,
      slideV: 0,
      wobble: rand(-0.15, 0.15),
      wobbleV: 0,
      hoverK: 0,
      fuseSound: null,
      behavior: null,
    };
    this.items.push(p);
    return p;
  }

  /**
   * Topmost unlit pataka whose sprite box (plus padding) contains the point.
   * Items are drawn far-to-near (ascending y), so the largest y is on top.
   */
  hitTest(x: number, y: number): Placed | null {
    let best: Placed | null = null;
    for (const p of this.items) {
      if (p.state !== 'idle' && p.state !== 'landing') continue;
      const { w, h } = spriteSize(p, this.world);
      // Small padding, grown for tiny sprites so the target is at least ~48px.
      const padX = Math.max(8, (48 - w) / 2);
      const padY = Math.max(8, (48 - h) / 2);
      const top = p.y - p.hop - h - padY;
      const bottom = p.y - p.hop + padY;
      if (x >= p.x - w / 2 - padX && x <= p.x + w / 2 + padX && y >= top && y <= bottom) {
        if (!best || p.y > best.y) best = p;
      }
    }
    return best;
  }

  light(p: Placed) {
    if (p.state !== 'idle' && p.state !== 'landing') return;
    p.state = 'fuse';
    p.t = 0;
    p.hoverK = 0;
    if (this.hovered === p) this.hovered = null;
    p.fuseSound = this.world.audio.play('fuse', { volume: 0.5, loop: true, pan: this.world.audio.panFor(p.x, this.world.width) });
    this.onLit?.();
  }

  /** Physical nudge from a nearby blast. Only affects unlit patakas. */
  jolt(x: number, y: number, radius: number, strength: number, except?: Placed) {
    const unit = this.world.unit;
    for (const p of this.items) {
      if (p === except || (p.state !== 'idle' && p.state !== 'landing')) continue;
      const dx = p.x - x;
      // Road depth is foreshortened, so stretch vertical distance.
      const dy = (p.y - y) * 2.5;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const f = (1 - d / radius) * strength;
      const dir = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx);
      p.hopV += (180 + 260 * f) * unit;
      p.slideV += dir * 260 * f * unit;
      p.wobbleV += dir * 10 * f + rand(-4, 4);
    }
  }

  clear() {
    for (const p of this.items) {
      p.fuseSound?.stop(0.1);
      p.behavior?.stop();
    }
    this.items = [];
    this.hovered = null;
  }

  /**
   * Tooltip target: the hovered unlit pataka, or (touch devices) the most
   * recently dropped one during its intro pulse.
   */
  hintTarget(): HintTarget | null {
    let p = this.hovered;
    if (!p && !hoverQuery.matches) {
      for (const q of this.items) {
        if (q.state === 'idle' && q.t < TOUCH_INTRO_PULSE + 0.5 && (!p || q.id > p.id)) p = q;
      }
    }
    if (!p || (p.state !== 'idle' && p.state !== 'landing')) return null;
    const { h } = spriteSize(p, this.world);
    return { x: p.x, y: p.y - p.hop - h * 1.08 - 6, text: p.def.hint ?? DEFAULT_HINT };
  }

  /** Keep patakas on the same relative road position after a resize. */
  remap(oldW: number, oldTop: number, oldBottom: number) {
    const w = this.world;
    for (const p of this.items) {
      const f = (p.y - oldTop) / Math.max(1, oldBottom - oldTop);
      p.x = (p.x / Math.max(1, oldW)) * w.width;
      p.y = w.roadTop + clamp(f, 0, 1) * (w.roadBottom - w.roadTop);
    }
  }

  update(dt: number) {
    const w = this.world;
    const g = 2200 * w.unit;
    this.time += dt;
    for (const p of this.items) {
      p.t += dt;
      if (p.state === 'active') {
        if (!p.behavior!.update(dt)) p.state = 'done';
        continue;
      }

      // Simple hop/slide/wobble physics for landing bounces and blast jolts.
      if (p.hop > 0 || p.hopV !== 0) {
        p.hopV -= g * dt;
        p.hop += p.hopV * dt;
        if (p.hop <= 0) {
          p.hop = 0;
          const impact = -p.hopV;
          if (impact > 140 * w.unit) {
            const firstLanding = p.state === 'landing' && p.t < 0.6;
            if (firstLanding || impact > 300 * w.unit) {
              w.audio.play('thud', { volume: clamp(impact / (900 * w.unit), 0.15, 0.6), pan: w.audio.panFor(p.x, w.width) });
            }
            p.hopV = impact * 0.32;
            p.wobbleV += rand(-3, 3);
          } else {
            p.hopV = 0;
          }
        }
      }
      if (p.slideV !== 0) {
        p.x = clamp(p.x + p.slideV * dt, 16, w.width - 16);
        p.slideV *= Math.max(0, 1 - dt * 5);
        if (Math.abs(p.slideV) < 2) p.slideV = 0;
      }
      // Damped spring back to upright.
      p.wobbleV += (-p.wobble * 90 - p.wobbleV * 9) * dt;
      p.wobble += p.wobbleV * dt;

      if (p.state !== 'fuse') {
        const target = this.hovered === p ? 1 : 0;
        p.hoverK = quality.reducedMotion ? target : p.hoverK + (target - p.hoverK) * Math.min(1, dt * 12);
        if (p.hoverK > 0.5) this.fuseEmber(p, dt);
      }

      if (p.state === 'landing' && p.hop === 0 && p.hopV === 0) p.state = 'idle';

      if (p.state === 'fuse') {
        this.burnFuse(p, dt);
        if (p.t >= FUSE_TIME) {
          p.fuseSound?.stop(0.08);
          p.fuseSound = null;
          p.state = 'active';
          p.t = 0;
          p.behavior = p.def.create(p, w);
        }
      }
    }
    if (this.items.some((p) => p.state === 'done')) {
      this.items = this.items.filter((p) => p.state !== 'done');
    }
  }

  /** Hover hint: a tiny unlit ember flickering at the fuse tip. */
  private fuseEmber(p: Placed, dt: number) {
    const w = this.world;
    const ds = w.depthScale(p.y);
    const tip = anchor(p, w, p.def.fuseTip[0], p.def.fuseTip[1]);
    w.fx.glow(tip.x, tip.y, (8 + Math.random() * 6) * ds * w.unit, '255,170,90', 0.45 + Math.random() * 0.35);
    if (!quality.reducedMotion && Math.random() < dt * 6) {
      w.particles.spawn(tip.x, tip.y, rand(-15, 15), rand(-40, -10), rand(0.15, 0.3), 0.8 * ds, pick(FUSE_SPARKS), Kind.Spark, Flag.FLICKER, 80 * w.unit, 1);
    }
  }

  /** Tiny flickering spark at the fuse tip, creeping down the fuse. */
  private burnFuse(p: Placed, dt: number) {
    const w = this.world;
    const ds = w.depthScale(p.y);
    const [fx, fy] = p.def.fuseTip;
    const k = Math.min(1, p.t / FUSE_TIME) * 0.5;
    const tip = anchor(p, w, fx + (0.5 - fx) * k * 0.4, fy + k * 0.12);
    if (Math.random() < dt * 70) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(25, 90) * w.unit;
      w.particles.spawn(tip.x, tip.y, Math.cos(a) * sp, Math.sin(a) * sp - 30, rand(0.12, 0.35), rand(0.8, 1.4) * ds, pick(FUSE_SPARKS), Kind.Spark, Flag.FLICKER, 250 * w.unit, 1);
    }
    w.fx.glow(tip.x, tip.y, (14 + Math.random() * 10) * ds * w.unit, '255,200,120', 0.7 + Math.random() * 0.3);
  }

  draw(ctx: CanvasRenderingContext2D) {
    const w = this.world;
    // Painter's order: farther (smaller y) first.
    this.drawOrder.length = 0;
    for (const p of this.items) this.drawOrder.push(p);
    this.drawOrder.sort((a, b) => a.y - b.y);
    for (const p of this.drawOrder) {
      if (p.state === 'active') {
        p.behavior!.draw(ctx);
        continue;
      }
      const { w: sw, h } = spriteSize(p, w);
      const shiver = p.state === 'fuse' ? rand(-0.6, 0.6) : 0;
      // Unlit patakas advertise "tap to light"; the glow vanishes once lit.
      const aff = p.state === 'fuse' ? { glow: 0, scale: 1 } : affordance(p.t, p.hoverK, this.time);
      drawShadow(ctx, p.x, p.y, p.def.kind === 'rocket' ? sw * 2 : sw, p.hop);
      drawAffordanceGlow(ctx, p.x, p.y - p.hop - h * 0.5, Math.max(sw, h) * 0.85 + 18, aff.glow);
      drawSprite(ctx, w.image(p.def.image), p.x + shiver, p.y - p.hop, h * aff.scale, (p.def.restRot ?? 0) + p.wobble);
    }
  }
}
