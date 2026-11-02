/** Global tunables and device-capability flags. */

export const MAX_PLACED = 25;
export const FUSE_TIME = 1.5;

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarseQuery = window.matchMedia('(pointer: coarse)');

export const isMobile =
  coarseQuery.matches || Math.min(window.screen.width, window.screen.height) < 600;

/**
 * Mutable runtime quality settings. `emission` scales how many particles each
 * pataka spawns; the main loop lowers it further if frame times stay high.
 */
export const quality = {
  reducedMotion: motionQuery.matches,
  particleCap: 2500,
  emission: 1,
  dpr: 1,
};

function applyQuality() {
  quality.reducedMotion = motionQuery.matches;
  if (quality.reducedMotion) {
    quality.particleCap = 800;
    quality.emission = 0.4;
  } else if (isMobile) {
    quality.particleCap = 1200;
    quality.emission = 0.6;
  } else {
    quality.particleCap = 2500;
    quality.emission = 1;
  }
  quality.dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
}
applyQuality();
motionQuery.addEventListener('change', applyQuality);

/** True on devices with a real hover-capable pointer (mouse/trackpad). */
export const hoverQuery = window.matchMedia('(hover: hover)');

/** Portrait/narrow layouts dock the shop shelf along the bottom edge. */
export const portraitQuery = window.matchMedia('(max-aspect-ratio: 9/10)');

/**
 * Road band as fractions of scene height. In portrait the bottom is
 * overridden at runtime to sit just above the docked shelf.
 */
export function roadBandFractions(portrait: boolean) {
  return portrait ? { top: 0.6, bottom: 0.9 } : { top: 0.74, bottom: 0.965 };
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
