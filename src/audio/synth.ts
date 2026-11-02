import type { SoundKey } from '../assets';

/**
 * Offline sound synthesis used when an audio file is missing. Every generator
 * returns raw channel data, which the AudioManager wraps in an AudioBuffer, so
 * synthesized sounds go through exactly the same playback path as real files.
 */

type Channels = Float32Array[];

const TAU = Math.PI * 2;
const white = () => Math.random() * 2 - 1;

/** RBJ-cookbook biquad. Coefficients can be updated per block for sweeps. */
class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private type: 'lowpass' | 'highpass' | 'bandpass', private sr: number, freq: number, q = 0.707) {
    this.set(freq, q);
  }
  set(freq: number, q = 0.707) {
    const w = (TAU * Math.min(freq, this.sr * 0.45)) / this.sr;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0: number, b1: number, b2: number;
    if (this.type === 'lowpass') {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0;
    } else if (this.type === 'highpass') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
    } else {
      b0 = alpha; b1 = 0; b2 = -alpha;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  process(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Smoothed random signal in roughly [-1, 1], changing at about `rate` Hz. */
function flutter(sr: number, rate: number) {
  let v = 0, target = 0, count = 0;
  const step = Math.max(1, Math.floor(sr / rate));
  const k = 1 - Math.exp(-rate * 4 / sr);
  return () => {
    if (count-- <= 0) { target = white(); count = step; }
    v += (target - v) * k;
    return v;
  };
}

function normalize(chs: Channels, peak = 0.9): Channels {
  let max = 0;
  for (const ch of chs) for (let i = 0; i < ch.length; i++) max = Math.max(max, Math.abs(ch[i]));
  if (max > 0) {
    const g = peak / max;
    for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  }
  return chs;
}

/** Linear fade in/out to avoid clicks. */
function fade(ch: Float32Array, sr: number, inS: number, outS: number) {
  const fi = Math.floor(inS * sr), fo = Math.floor(outS * sr);
  for (let i = 0; i < fi && i < ch.length; i++) ch[i] *= i / fi;
  for (let i = 0; i < fo && i < ch.length; i++) ch[ch.length - 1 - i] *= i / fo;
}

/** Adds short noise-burst "crackles" at a time-varying rate. */
function crackles(ch: Float32Array, sr: number, rateAt: (t: number) => number, amp: number, from = 0, to = ch.length / sr) {
  const hp = new Biquad('highpass', sr, 1800);
  let t = from;
  while (t < to) {
    const r = Math.max(0.5, rateAt(t));
    t += -Math.log(1 - Math.random()) / r;
    const start = Math.floor(t * sr);
    const len = Math.floor(sr * (0.002 + Math.random() * 0.006));
    const a = amp * (0.3 + Math.random() * 0.7);
    for (let i = 0; i < len && start + i < ch.length; i++) {
      ch[start + i] += hp.process(white()) * a * (1 - i / len);
    }
  }
}

function fuse(sr: number): Channels {
  const dur = 2.0, n = Math.floor(sr * dur);
  const ch = new Float32Array(n);
  const bp = new Biquad('bandpass', sr, 5200, 1.1);
  const fl = flutter(sr, 18);
  for (let i = 0; i < n; i++) ch[i] = bp.process(white()) * 0.35 * (0.6 + 0.4 * fl());
  crackles(ch, sr, () => 28, 0.9);
  fade(ch, sr, 0.04, 0.25);
  return normalize([ch], 0.7);
}

function thud(sr: number): Channels {
  const dur = 0.4, n = Math.floor(sr * dur);
  const ch = new Float32Array(n);
  const lp = new Biquad('lowpass', sr, 900);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += (TAU * (45 + 110 * Math.exp(-t * 14))) / sr;
    ch[i] = Math.sin(phase) * Math.exp(-t * 13) + (t < 0.025 ? lp.process(white()) * 0.6 * (1 - t / 0.025) : 0);
  }
  fade(ch, sr, 0.001, 0.05);
  return normalize([ch], 0.85);
}

function anaar(sr: number): Channels {
  const dur = 6.6, n = Math.floor(sr * dur);
  const ch = new Float32Array(n);
  const hp = new Biquad('highpass', sr, 1600, 0.7);
  const bp = new Biquad('bandpass', sr, 3400, 1.6);
  const fl = flutter(sr, 9);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.3) * Math.min(1, (dur - t) / 1.6);
    const w = white();
    ch[i] = (hp.process(w) * 0.45 + bp.process(w) * 0.8) * env * (0.7 + 0.35 * fl());
  }
  crackles(ch, sr, (t) => 14 * Math.min(1, (dur - t) / 2), 0.5);
  fade(ch, sr, 0.02, 0.3);
  return normalize([ch], 0.75);
}

function rocketLaunch(sr: number): Channels {
  const dur = 2.4, n = Math.floor(sr * dur);
  const ch = new Float32Array(n);
  const bp = new Biquad('bandpass', sr, 900, 0.9);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 1150 + 1100 * Math.exp(-t * 1.1) + 35 * Math.sin(TAU * 6 * t);
    phase += (TAU * f) / sr;
    const whistle = (Math.sin(phase) + 0.25 * Math.sin(phase * 2)) * Math.min(1, t / 0.12) * (0.55 + 0.45 * Math.exp(-t * 0.6));
    const whoosh = bp.process(white()) * (0.9 * Math.exp(-t * 2.5) + 0.15);
    const ignite = t < 0.15 ? white() * 0.5 * (1 - t / 0.15) : 0;
    ch[i] = whistle * 0.55 + whoosh * 0.6 + ignite;
  }
  fade(ch, sr, 0.003, 0.35);
  return normalize([ch], 0.7);
}

function rocketBurst(sr: number): Channels {
  const dur = 2.9, n = Math.floor(sr * dur);
  const ch = new Float32Array(n);
  const lp = new Biquad('lowpass', sr, 3000);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 63) === 0) lp.set(250 + 3200 * Math.exp(-t * 7));
    phase += (TAU * (55 + 40 * Math.exp(-t * 20))) / sr;
    ch[i] = lp.process(white()) * Math.exp(-t * 8) * 1.2 + Math.sin(phase) * Math.exp(-t * 9) * 0.8;
  }
  crackles(ch, sr, (t) => 70 * Math.exp(-(t - 0.25) * 1.2), 0.35, 0.25, dur - 0.15);
  fade(ch, sr, 0.001, 0.2);
  return normalize([ch], 0.9);
}

function chakri(sr: number): Channels {
  const dur = 7.6, n = Math.floor(sr * dur);
  const ch = new Float32Array(n);
  const bp = new Biquad('bandpass', sr, 1000, 7);
  const hp = new Biquad('highpass', sr, 2500);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 31) === 0) bp.set(900 + 90 * t + 380 * Math.sin(TAU * (6 + t) * t));
    const env = Math.min(1, t / 0.4) * Math.min(1, (dur - t) / 1.2);
    const w = white();
    ch[i] = (bp.process(w) * 2.2 + hp.process(w) * 0.25) * env;
  }
  crackles(ch, sr, () => 10, 0.3);
  fade(ch, sr, 0.02, 0.3);
  return normalize([ch], 0.7);
}

function atomBomb(sr: number): Channels {
  const dur = 3.6, n = Math.floor(sr * dur);
  const ch = new Float32Array(n);
  const lp = new Biquad('lowpass', sr, 4000);
  const rumble = new Biquad('lowpass', sr, 120);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 63) === 0) lp.set(140 + 4200 * Math.exp(-t * 5.5));
    phase += (TAU * (28 + 42 * Math.exp(-t * 1.2))) / sr;
    const crack = t < 0.012 ? white() * 1.5 : 0;
    const boom = lp.process(white()) * Math.exp(-t * 2.2) * 1.6;
    const sub = Math.sin(phase) * Math.exp(-t * 1.9) * 1.1;
    const tail = rumble.process(white()) * 2.5 * Math.exp(-t * 0.9);
    ch[i] = Math.tanh((crack + boom + sub + tail) * 2.2);
  }
  crackles(ch, sr, (t) => 40 * Math.exp(-t * 1.5), 0.25, 0.1, dur - 0.3);
  fade(ch, sr, 0.0005, 0.6);
  return normalize([ch], 0.98);
}

function honk(sr: number, variant: 1 | 2 | 3): Channels {
  const specs = {
    1: { beeps: [[0, 0.45]], f: [415, 523] },
    2: { beeps: [[0, 0.16], [0.24, 0.42]], f: [620, 740] },
    3: { beeps: [[0, 0.75]], f: [220, 277] },
  }[variant];
  const dur = specs.beeps[specs.beeps.length - 1][1] + 0.1;
  const n = Math.floor(sr * dur);
  const ch = new Float32Array(n);
  const lp = new Biquad('lowpass', sr, variant === 3 ? 1400 : 2600);
  const p = [0, 0];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let on = 0;
    for (const [a, b] of specs.beeps) {
      if (t >= a && t <= b) on = Math.min(1, (t - a) / 0.012, (b - t) / 0.03);
    }
    let s = 0;
    for (let k = 0; k < 2; k++) {
      const bend = variant === 3 ? 1 - 0.03 * Math.min(1, t * 2) : 1;
      p[k] += (TAU * specs.f[k] * bend) / sr;
      s += Math.sign(Math.sin(p[k])) * 0.5;
    }
    ch[i] = lp.process(s * on);
  }
  return normalize([ch], 0.6);
}

/** Dense sparkler crackle + fizz; crossfaded so it loops seamlessly. */
function fuljhadi(sr: number): Channels {
  const dur = 3, xf = 0.4;
  const n = Math.floor(sr * dur), nx = Math.floor(sr * xf);
  const tmp = new Float32Array(n + nx);
  const hp = new Biquad('highpass', sr, 3500, 0.7);
  const fl = flutter(sr, 25);
  for (let i = 0; i < tmp.length; i++) tmp[i] = hp.process(white()) * 0.22 * (0.7 + 0.3 * fl());
  crackles(tmp, sr, () => 90, 0.8);
  const ch = tmp.slice(0, n);
  for (let i = 0; i < nx; i++) {
    const a = i / nx;
    ch[i] = ch[i] * a + tmp[n + i] * (1 - a);
  }
  return normalize([ch], 0.7);
}

/** Short ignition: a soft whoomp into a bright fizz. */
function fuljhadiLight(sr: number): Channels {
  const dur = 0.9, n = Math.floor(sr * dur);
  const ch = new Float32Array(n);
  const bp = new Biquad('bandpass', sr, 600, 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 63) === 0) bp.set(600 + 5000 * Math.min(1, t / 0.35), 0.9);
    ch[i] = bp.process(white()) * Math.min(1, t / 0.02) * Math.exp(-t * 3.5) * 1.4;
  }
  crackles(ch, sr, (t) => 120 * Math.exp(-t * 3), 0.6, 0.05, dur - 0.05);
  fade(ch, sr, 0.002, 0.15);
  return normalize([ch], 0.75);
}

/** Seamless rain hiss loop (pink noise + bandpass), stereo. */
function rain(sr: number): Channels {
  const dur = 6, xf = 1.2;
  const n = Math.floor(sr * dur), nx = Math.floor(sr * xf);
  const out: Channels = [];
  for (let c = 0; c < 2; c++) {
    const tmp = new Float32Array(n + nx);
    const bp = new Biquad('bandpass', sr, 1200 + c * 80, 0.65);
    const hp = new Biquad('highpass', sr, 180);
    let pink = 0;
    for (let i = 0; i < tmp.length; i++) {
      pink = 0.98 * pink + 0.02 * white();
      tmp[i] = hp.process(bp.process(pink * 4 + white() * 0.15));
    }
    const ch = tmp.slice(0, n);
    for (let i = 0; i < nx; i++) {
      const a = i / nx;
      ch[i] = ch[i] * a + tmp[n + i] * (1 - a);
    }
    out.push(ch);
  }
  return normalize(out, 0.85);
}

/** Seamless-looping street bed: traffic rumble plus crowd-ish murmur, stereo. */
function ambient(sr: number): Channels {
  const dur = 12, xf = 1.5;
  const n = Math.floor(sr * dur), nx = Math.floor(sr * xf);
  const out: Channels = [];
  for (let c = 0; c < 2; c++) {
    const tmp = new Float32Array(n + nx);
    const lp = new Biquad('lowpass', sr, 380);
    const bp = new Biquad('bandpass', sr, 850, 0.8);
    const murmur = flutter(sr, 2.5);
    let brown = 0;
    for (let i = 0; i < tmp.length; i++) {
      brown = (brown + 0.02 * white()) / 1.02;
      tmp[i] = lp.process(brown * 3.5) * 0.9 + bp.process(white()) * 0.12 * (0.5 + 0.5 * murmur());
    }
    // Crossfade the tail into the head so the loop point is inaudible.
    const ch = tmp.slice(0, n);
    for (let i = 0; i < nx; i++) {
      const a = i / nx;
      ch[i] = ch[i] * a + tmp[n + i] * (1 - a);
    }
    out.push(ch);
  }
  return normalize(out, 0.8);
}

const GENERATORS: Record<SoundKey, (sr: number) => Channels> = {
  ambient,
  honk1: (sr) => honk(sr, 1),
  honk2: (sr) => honk(sr, 2),
  honk3: (sr) => honk(sr, 3),
  fuse,
  thud,
  anaar,
  rocketLaunch,
  rocketBurst,
  chakri,
  atomBomb,
  fuljhadi,
  fuljhadiLight,
  rain,
};

export function synthesizeBuffer(ctx: BaseAudioContext, key: SoundKey): AudioBuffer {
  const sr = ctx.sampleRate;
  const chs = GENERATORS[key](sr);
  const buf = ctx.createBuffer(chs.length, chs[0].length, sr);
  chs.forEach((d, i) => buf.copyToChannel(d as Float32Array<ArrayBuffer>, i));
  return buf;
}
