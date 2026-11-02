/**
 * Non-particle visual effects: light pools (immediate mode, re-submitted every
 * frame), expanding shockwave rings, a sky flash and a full-screen flash.
 */

interface Glow {
  x: number; y: number; r: number; squash: number;
  rgb: string; a: number;
}

interface Ring {
  x: number; y: number; t: number; dur: number; maxR: number; squash: number; width: number;
}

const MAX_GLOWS = 64;

export class Effects {
  private glows: Glow[] = Array.from({ length: MAX_GLOWS }, () => ({ x: 0, y: 0, r: 0, squash: 1, rgb: '', a: 0 }));
  private glowCount = 0;
  private rings: Ring[] = [];
  private skyFlash = { a: 0, rgb: '255,240,220' };
  private screenFlash = 0;

  /** Queue a soft additive light for this frame. `rgb` is "r,g,b". */
  glow(x: number, y: number, r: number, rgb: string, intensity: number, squash = 1) {
    if (this.glowCount >= MAX_GLOWS || r < 1 || intensity <= 0.01) return;
    const g = this.glows[this.glowCount++];
    g.x = x; g.y = y; g.r = r; g.squash = squash; g.rgb = rgb; g.a = Math.min(1, intensity);
  }

  ring(x: number, y: number, maxR: number, dur = 0.6, squash = 0.35, width = 10) {
    this.rings.push({ x, y, t: 0, dur, maxR, squash, width });
  }

  flashSky(rgb: string, strength: number) {
    this.skyFlash.rgb = rgb;
    this.skyFlash.a = Math.max(this.skyFlash.a, strength);
  }

  flashScreen(strength: number) {
    this.screenFlash = Math.max(this.screenFlash, strength);
  }

  update(dt: number) {
    this.skyFlash.a = Math.max(0, this.skyFlash.a - dt * 1.6);
    this.screenFlash = Math.max(0, this.screenFlash - dt * 2.8);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.dur) this.rings.splice(i, 1);
    }
  }

  /** Light pools under everything else (drawn right after the patakas). */
  drawGlows(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.glowCount; i++) {
      const g = this.glows[i];
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.scale(1, g.squash);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, g.r);
      grad.addColorStop(0, `rgba(${g.rgb},${0.55 * g.a})`);
      grad.addColorStop(0.35, `rgba(${g.rgb},${0.22 * g.a})`);
      grad.addColorStop(1, `rgba(${g.rgb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(-g.r, -g.r, g.r * 2, g.r * 2);
      ctx.restore();
    }
    this.glowCount = 0;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Rings and flashes on top of particles. `skyBottom` limits the sky flash. */
  drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, skyBottom: number) {
    if (this.rings.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const r of this.rings) {
        const p = r.t / r.dur;
        const ease = 1 - Math.pow(1 - p, 3);
        const rad = r.maxR * ease;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.scale(1, r.squash);
        ctx.strokeStyle = `rgba(255,230,190,${0.75 * (1 - p)})`;
        ctx.lineWidth = r.width * (1 - p) + 1;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,150,60,${0.35 * (1 - p)})`;
        ctx.lineWidth = r.width * 2.5 * (1 - p) + 1;
        ctx.beginPath();
        ctx.arc(0, 0, rad * 0.92, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.skyFlash.a > 0.005) {
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createLinearGradient(0, 0, 0, skyBottom);
      grad.addColorStop(0, `rgba(${this.skyFlash.rgb},${0.32 * this.skyFlash.a})`);
      grad.addColorStop(1, `rgba(${this.skyFlash.rgb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, skyBottom);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.screenFlash > 0.005) {
      ctx.fillStyle = `rgba(255,245,225,${Math.min(0.92, this.screenFlash)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
