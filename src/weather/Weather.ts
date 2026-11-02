import type { AudioManager, SoundHandle } from '../audio/AudioManager';
import { quality, rand, clamp } from '../config';

interface Drop {
  x: number;
  y: number;
  len: number;
  spd: number;
  w: number;
}

/** Rain visuals on the fx canvas and a looping rain bed on the ambient bus. */
export class Weather {
  /** Whether rain is active. */
  active = false;
  private drops: Drop[] = [];
  private w = 0;
  private h = 0;
  private rainSound: SoundHandle | null = null;

  constructor(private audio: AudioManager) {}

  toggleRain() {
    this.setActive(!this.active);
  }

  setActive(on: boolean) {
    if (this.active === on) return;
    this.active = on;
    if (!on) {
      this.rainSound?.stop(0.4);
      this.rainSound = null;
      return;
    }
    this.ensureDrops();
    if (this.audio.ctx) {
      this.rainSound = this.audio.play('rain', { bus: 'ambient', loop: true, volume: 0.26, rate: 1 });
    }
  }

  onResize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (this.active) this.ensureDrops(true);
  }

  update(dt: number) {
    if (!this.active) return;
    const wind = 280;
    for (const d of this.drops) {
      d.y += d.spd * dt;
      d.x += wind * dt * (0.6 + d.w * 0.4);
      if (d.y > this.h + d.len || d.x > this.w + 40) {
        d.x = rand(-40, this.w + 20);
        d.y = rand(-this.h * 0.2, -d.len);
        d.spd = rand(380, 620);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(30, 40, 58, 0.16)';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.strokeStyle = 'rgba(200, 220, 255, 0.32)';
    ctx.lineCap = 'round';
    for (const d of this.drops) {
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = d.w;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.22, d.y + d.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  private ensureDrops(rebuild = false) {
    if (!rebuild && this.drops.length) return;
    const n = quality.reducedMotion
      ? Math.round(clamp(this.w / 12, 35, 70))
      : Math.round(clamp(this.w / 7, 85, 160));
    this.drops = Array.from({ length: n }, () => ({
      x: rand(-40, this.w + 20),
      y: rand(-this.h * 0.15, this.h),
      len: rand(10, 22),
      spd: rand(380, 620),
      w: rand(0.6, 1.4),
    }));
  }
}
