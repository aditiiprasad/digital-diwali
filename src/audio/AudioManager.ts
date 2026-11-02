import { SOUND_KEYS, soundUrl, type SoundKey } from '../assets';
import { pick, rand } from '../config';
import { synthesizeBuffer } from './synth';

export type Bus = 'ambient' | 'sfx' | 'music';

export interface PlayOptions {
  volume?: number;
  /** Stereo pan -1..1. */
  pan?: number;
  loop?: boolean;
  bus?: Bus;
  /** Exact playbackRate; otherwise sfx get a random 0.95-1.05 jitter. */
  rate?: number;
}

export interface SoundHandle {
  stop(fadeSeconds?: number): void;
  setPan(pan: number): void;
  /** Smoothly moves the voice gain toward `volume`. */
  setVolume(volume: number, timeConstant?: number): void;
  setRate(rate: number): void;
}

const NOOP_HANDLE: SoundHandle = { stop() {}, setPan() {}, setVolume() {}, setRate() {} };

/**
 * Web Audio graph:
 *
 *   sources -> [panner] -> voice gain -> ambientBus -> ambientDuck ─┐
 *                                       sfxBus ────────────────────┼─> master -> compressor -> out
 *                                       musicBus -> musicDuck ─────┘
 *
 * The AudioContext is only created inside the "Enter the Gali" click, so no
 * audio can start before a user gesture. Files are fetched ahead of time;
 * decoding happens on unlock. Anything missing/undecodable is synthesized.
 */
export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private ambientDuck!: GainNode;
  private musicDuck!: GainNode;
  private buffers = new Map<SoundKey, AudioBuffer>();
  private raw = new Map<SoundKey, Promise<ArrayBuffer | null>>();
  private ambientHandle: SoundHandle | null = null;
  private honkTimer = 0;
  private duckListeners = new Set<(factor: number, holdSeconds: number) => void>();
  private stateListeners = new Set<() => void>();

  muted = false;
  ambientEnabled = true;
  /** Names of sounds currently using synthesized fallbacks (for the console/debug). */
  synthesized: SoundKey[] = [];

  /** Start downloading every sound file that exists (no AudioContext needed). */
  prefetch() {
    for (const key of SOUND_KEYS) {
      const url = soundUrl(key);
      if (!url) {
        this.raw.set(key, Promise.resolve(null));
        continue;
      }
      this.raw.set(
        key,
        fetch(url)
          .then((r) => {
            const type = r.headers.get('content-type') ?? '';
            // Dev servers may answer missing files with index.html.
            if (!r.ok || type.includes('text/html')) throw new Error(`HTTP ${r.status}`);
            return r.arrayBuffer();
          })
          .catch((err) => {
            console.warn(`[audio] Could not fetch ${url}: ${err.message}`);
            return null;
          }),
      );
    }
  }

  /** Must be called from a user gesture. Creates the context and decodes everything. */
  async unlock(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      console.warn('[audio] Web Audio API not supported; running silently.');
      return;
    }
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // Resume immediately while still inside the gesture's call stack.
    const resumed = ctx.resume().catch(() => {});

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(comp);

    this.ambientDuck = ctx.createGain();
    this.musicDuck = ctx.createGain();
    this.ambientDuck.connect(this.master);
    this.musicDuck.connect(this.master);

    this.buses = {
      ambient: ctx.createGain(),
      sfx: ctx.createGain(),
      music: ctx.createGain(),
    };
    this.buses.ambient.gain.value = this.ambientEnabled ? 1 : 0;
    this.buses.ambient.connect(this.ambientDuck);
    this.buses.sfx.connect(this.master);
    this.buses.music.connect(this.musicDuck);

    await Promise.all(
      SOUND_KEYS.map(async (key) => {
        const data = await (this.raw.get(key) ?? Promise.resolve(null));
        if (data) {
          try {
            this.buffers.set(key, await ctx.decodeAudioData(data));
            return;
          } catch (err) {
            console.warn(`[audio] Could not decode "${key}", using synthesized fallback.`, err);
          }
        }
        this.buffers.set(key, synthesizeBuffer(ctx, key));
        this.synthesized.push(key);
      }),
    );
    if (this.synthesized.length) {
      console.info(`[audio] Synthesized fallbacks for missing files: ${this.synthesized.join(', ')}`);
    }
    await resumed;
  }

  /** Bus input node for external sources (e.g. the radio's media element). */
  getBus(bus: Bus): GainNode | null {
    return this.ctx ? this.buses[bus] : null;
  }

  play(key: SoundKey, opts: PlayOptions = {}): SoundHandle {
    const ctx = this.ctx;
    const buffer = this.buffers.get(key);
    if (!ctx || !buffer) return NOOP_HANDLE;
    const bus = opts.bus ?? 'sfx';

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = !!opts.loop;
    src.playbackRate.value = opts.rate ?? (bus === 'sfx' ? rand(0.95, 1.05) : 1);

    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;

    let panner: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = opts.pan ?? 0;
      src.connect(panner).connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(this.buses[bus]);
    src.start();

    let stopped = false;
    src.onended = () => {
      stopped = true;
      src.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };

    return {
      stop: (fadeSeconds = 0.08) => {
        if (stopped) return;
        stopped = true;
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
        try {
          src.stop(now + fadeSeconds + 0.02);
        } catch {
          /* already stopped */
        }
      },
      setPan: (pan: number) => {
        if (panner) panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime, 0.05);
      },
      setVolume: (volume: number, timeConstant = 0.06) => {
        if (!stopped) gain.gain.setTargetAtTime(volume, ctx.currentTime, timeConstant);
      },
      setRate: (rate: number) => {
        if (!stopped) src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.08);
      },
    };
  }

  /** Converts a screen x into a gentle stereo pan. */
  panFor(x: number, width: number) {
    return Math.max(-1, Math.min(1, ((x / width) * 2 - 1) * 0.7));
  }

  /** Volume of the looping street ambience (0–1). Honks use a separate range in `scheduleHonk`. */
  private static readonly AMBIENT_LOOP_VOLUME = 0.32;

  startAmbient() {
    if (!this.ctx || this.ambientHandle) return;
    this.ambientHandle = this.play('ambient', {
      bus: 'ambient',
      loop: true,
      volume: AudioManager.AMBIENT_LOOP_VOLUME,
      rate: 1,
    });
    this.scheduleHonk();
  }

  private scheduleHonk() {
    window.clearTimeout(this.honkTimer);
    this.honkTimer = window.setTimeout(() => {
      if (this.ambientEnabled && !this.muted && document.visibilityState === 'visible') {
        this.play(pick(['honk1', 'honk2', 'honk3'] as const), {
          bus: 'ambient',
          volume: rand(0.08, 0.16),
          rate: rand(0.9, 1.1),
          pan: rand(-0.85, 0.85),
        });
      }
      this.scheduleHonk();
    }, rand(6000, 18000));
  }

  /**
   * Briefly lowers ambient + music so explosions punch through.
   * `amount` is the gain multiplier at the bottom of the duck.
   */
  duck(amount = 0.35, hold = 0.5, release = 1.2) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const g of [this.ambientDuck.gain, this.musicDuck.gain]) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(amount, now + 0.04);
      g.setValueAtTime(amount, now + 0.04 + hold);
      g.linearRampToValueAtTime(1, now + 0.04 + hold + release);
    }
    this.duckListeners.forEach((fn) => fn(amount, hold + release));
  }

  onDuck(fn: (factor: number, holdSeconds: number) => void) {
    this.duckListeners.add(fn);
  }

  onStateChange(fn: () => void) {
    this.stateListeners.add(fn);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
    this.stateListeners.forEach((fn) => fn());
  }

  setAmbientEnabled(on: boolean) {
    this.ambientEnabled = on;
    if (this.ctx) this.buses.ambient.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1);
    this.stateListeners.forEach((fn) => fn());
  }
}
