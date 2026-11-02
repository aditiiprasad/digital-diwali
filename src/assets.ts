import publicFiles from 'virtual:asset-list';
import { fallbackImage } from './fallbackArt';

/**
 * Asset resolution. Every asset lists candidate file names and is looked up in
 * both `assets/` (the documented folder) and `assests/` (the folder that
 * currently exists on disk). Only files that actually exist in /public are
 * requested; anything missing falls back to procedurally generated art/audio.
 */

const DIRS = ['assets', 'assests'];
const available = new Set(publicFiles);
const base = import.meta.env.BASE_URL;

export type ImageKey =
  | 'street'
  | 'shop'
  | 'anaar'
  | 'rocket'
  | 'chakri'
  | 'atomBomb'
  | 'fuljhadi'
  | 'radio'
  | 'logo';

export type SoundKey =
  | 'ambient'
  | 'honk1'
  | 'honk2'
  | 'honk3'
  | 'fuse'
  | 'thud'
  | 'anaar'
  | 'rocketLaunch'
  | 'rocketBurst'
  | 'chakri'
  | 'atomBomb'
  | 'fuljhadi'
  | 'fuljhadiLight'
  | 'rain';

const IMAGE_FILES: Record<ImageKey, string[]> = {
  street: ['street-bg.png', 'street.png', 'street-bg.jpg', 'street.jpg'],
  shop: ['shop.png'],
  anaar: ['anaar.png'],
  rocket: ['rocket.png'],
  chakri: ['chakri.png'],
  atomBomb: ['atom-bomb.png', 'bomb.png', 'atombomb.png'],
  fuljhadi: ['fuljhadi.png', 'sparkler.png'],
  radio: ['radio.png'],
  logo: ['logo.png', 'happydiwali.png'],
};

const SOUND_FILES: Record<SoundKey, string[]> = {
  ambient: ['ambient-street.mp3'],
  honk1: ['honk-1.mp3'],
  honk2: ['honk-2.mp3'],
  honk3: ['honk-3.mp3'],
  fuse: ['fuse.mp3'],
  thud: ['thud.mp3'],
  anaar: ['anaar.mp3'],
  rocketLaunch: ['rocket-launch.mp3'],
  rocketBurst: ['rocket-burst.mp3'],
  chakri: ['chakri.mp3'],
  atomBomb: ['atom-bomb.mp3', 'bomb.mp3'],
  fuljhadi: ['fuljhadi.mp3'],
  fuljhadiLight: ['fuljhadi-light.mp3'],
  rain: ['rain.mp3', 'rain-loop.mp3'],
};

function resolve(sub: 'images' | 'audio', names: string[]): string | null {
  for (const dir of DIRS) {
    for (const name of names) {
      const rel = `${dir}/${sub}/${name}`;
      if (available.has(rel)) return base + rel;
    }
  }
  return null;
}

export const soundUrl = (key: SoundKey) => resolve('audio', SOUND_FILES[key]);
export const SOUND_KEYS = Object.keys(SOUND_FILES) as SoundKey[];

export interface LoadedImage {
  /** Drawable source for canvas (trimmed to its opaque bounds for sprites). */
  source: HTMLImageElement | HTMLCanvasElement;
  /** URL usable in <img> / CSS (object URL or data URL). */
  url: string;
  width: number;
  height: number;
  isFallback: boolean;
}

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

/**
 * Crops transparent padding so a sprite's bottom edge is its true ground
 * contact point, and downsizes large sprites to keep canvas draws cheap.
 */
function trimSprite(img: HTMLImageElement, maxDim = 360): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext('2d', { willReadFrequently: true })!;
  pctx.drawImage(img, 0, 0);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  try {
    const data = pctx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  } catch {
    // Tainted canvas or other failure: keep the full image.
  }
  if (maxX < 0) {
    minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
  }
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const s = Math.min(1, maxDim / Math.max(cw, ch));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(cw * s));
  out.height = Math.max(1, Math.round(ch * s));
  const octx = out.getContext('2d')!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(probe, minX, minY, cw, ch, 0, 0, out.width, out.height);
  return out;
}

/** Images trimmed to their opaque bounds, with the max dimension kept after trimming. */
const TRIMMED: Partial<Record<ImageKey, number>> = {
  anaar: 360,
  rocket: 360,
  chakri: 360,
  atomBomb: 360,
  fuljhadi: 400,
  // Trimmed so its on-screen size matches the visible stall (used by SHOP_SCALE).
  shop: 1000,
};

async function loadImage(key: ImageKey): Promise<LoadedImage> {
  const url = resolve('images', IMAGE_FILES[key]);
  if (url) {
    try {
      const img = await loadImageEl(url);
      const maxDim = TRIMMED[key];
      if (maxDim) {
        const c = trimSprite(img, maxDim);
        return { source: c, url: c.toDataURL(), width: c.width, height: c.height, isFallback: false };
      }
      return { source: img, url, width: img.naturalWidth, height: img.naturalHeight, isFallback: false };
    } catch (err) {
      console.warn(`[assets] ${key}: ${(err as Error).message}; using generated fallback.`);
    }
  }
  const c = fallbackImage(key);
  return { source: c, url: c.toDataURL(), width: c.width, height: c.height, isFallback: true };
}

export type ImageSet = Record<ImageKey, LoadedImage>;

export async function loadAllImages(onProgress?: (done: number, total: number) => void): Promise<ImageSet> {
  const keys = Object.keys(IMAGE_FILES) as ImageKey[];
  let done = 0;
  const results = await Promise.all(
    keys.map(async (k) => {
      const r = await loadImage(k);
      onProgress?.(++done, keys.length);
      return [k, r] as const;
    }),
  );
  return Object.fromEntries(results) as ImageSet;
}
