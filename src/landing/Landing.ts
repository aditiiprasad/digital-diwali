import publicFiles from 'virtual:asset-list';
import './landing.css';

/**
 * The intro overlay ("Enter the Gali"). Self-contained: owns its DOM, its styles
 * (landing.css, everything under `.landing-*`) and its exit transition. Every
 * image has a pure-CSS fallback, so a missing or broken file never breaks it.
 */

const available = new Set(publicFiles);
const base = import.meta.env.BASE_URL;
const DIRS = ['assets/landing', 'assests/landing'];

/** First existing file among `names` in either landing folder, or null. */
function landingUrl(...names: string[]): string | null {
  for (const dir of DIRS) {
    for (const name of names) {
      const rel = `${dir}/${name}`;
      if (available.has(rel)) return base + rel;
    }
  }
  return null;
}

const HEADING_FONT = 'https://fonts.googleapis.com/css2?family=Yatra+One&display=swap';

/** Flame swell before the reveal begins. */
const SWELL_MS = 400;
/** Radial "light spreading" reveal of the dark veil. */
const REVEAL_MS = 900;
const REDUCED_FADE_MS = 300;
/** Soft edge of the reveal circle (px); must match the mask ramp in landing.css. */
const REVEAL_FEATHER = 160;

export interface Landing {
  root: HTMLDivElement;
  enterBtn: HTMLButtonElement;
  /** Fairy-light garland drawn by main.ts while the landing is up. */
  lightsCanvas: HTMLCanvasElement;
  /** Announces loading progress to screen readers and gates the button. */
  setStatus(text: string, ready: boolean): void;
  /** Plays the exit transition, then removes the overlay. Safe to call twice. */
  exit(): Promise<void>;
}

export function buildLanding(parent: HTMLElement): Landing {
  if (!document.querySelector('link[data-landing-font]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = HEADING_FONT;
    link.dataset.landingFont = '';
    document.head.appendChild(link);
  }

  const root = document.createElement('div');
  root.className = 'landing';
  root.innerHTML = `
    <div class="landing-veil" aria-hidden="true"></div>
    <canvas class="landing-fairy-lights" aria-hidden="true"></canvas>
    <div class="landing-stack">
      <h1 class="landing-title landing-rise" style="--i: 0" lang="hi">शुभ दीपावली</h1>
      <p class="landing-subtitle landing-rise" style="--i: 1">Digital Diwali</p>
      <div class="landing-diya landing-rise" style="--i: 2" aria-hidden="true">
        <div class="landing-glow"></div>
        <img class="landing-mandala" alt="" decoding="async" />
        <img class="landing-diya-img" alt="" decoding="async" />
        <div class="landing-flame"><img class="landing-flame-img" alt="" decoding="async" /></div>
        <span class="landing-css-flame"></span>
        <div class="landing-embers"><i></i><i></i><i></i><i></i></div>
      </div>
      <p class="landing-instruction landing-rise" style="--i: 3">Drag patakas from the shop to the road, tap to light them.</p>
      <button type="button" class="landing-btn landing-rise" style="--i: 4" aria-label="Enter the Gali" disabled>
        <img class="landing-btn-plate" alt="" decoding="async" />
        <span class="landing-btn-label">Enter the Gali</span>
      </button>
      <p class="landing-hint landing-rise" style="--i: 5">Best with sound on · Headphones recommended</p>
      <p class="landing-sr" role="status" aria-live="polite"></p>
    </div>
  `;
  parent.appendChild(root);

  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const veil = q<HTMLDivElement>('.landing-veil');
  const diya = q<HTMLDivElement>('.landing-diya');
  const flame = q<HTMLDivElement>('.landing-flame');
  const enterBtn = q<HTMLButtonElement>('.landing-btn');
  const status = q<HTMLParagraphElement>('.landing-sr');

  // Diya + flame are one picture: if either is missing, both switch to CSS art.
  const diyaImg = q<HTMLImageElement>('.landing-diya-img');
  const flameImg = q<HTMLImageElement>('.landing-flame-img');
  const diyaUrl = landingUrl('diya-unlit.png');
  const flameUrl = landingUrl('diya-flame.png', 'flame.png');
  const useCssDiya = () => diya.classList.add('is-css');
  if (diyaUrl && flameUrl) {
    diyaImg.addEventListener('error', useCssDiya, { once: true });
    flameImg.addEventListener('error', useCssDiya, { once: true });
    diyaImg.src = diyaUrl;
    flameImg.src = flameUrl;
  } else {
    useCssDiya();
  }

  const plate = q<HTMLImageElement>('.landing-btn-plate');
  const plateUrl = landingUrl('button-plate.png');
  const useCssButton = () => enterBtn.classList.add('is-css');
  if (plateUrl) {
    plate.addEventListener('error', useCssButton, { once: true });
    plate.src = plateUrl;
  } else {
    useCssButton();
  }

  const mandala = q<HTMLImageElement>('.landing-mandala');
  const mandalaUrl = landingUrl('mandala.png');
  if (mandalaUrl) {
    mandala.addEventListener('error', () => mandala.remove(), { once: true });
    mandala.src = mandalaUrl;
  } else {
    mandala.remove();
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** Grows a transparent hole in the veil from the flame until it covers the screen. */
  function reveal(done: () => void) {
    const r = flame.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.6;
    const W = window.innerWidth, H = window.innerHeight;
    const maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + REVEAL_FEATHER;
    veil.style.setProperty('--landing-cx', `${cx.toFixed(0)}px`);
    veil.style.setProperty('--landing-cy', `${cy.toFixed(0)}px`);
    veil.style.setProperty('--landing-r', `${-REVEAL_FEATHER}px`);
    root.classList.add('is-revealing');

    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / REVEAL_MS));
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      veil.style.setProperty('--landing-r', `${(e * maxR - REVEAL_FEATHER).toFixed(1)}px`);
      if (p < 1) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
    // rAF stalls in background tabs; make sure the overlay still goes away.
    window.setTimeout(done, REVEAL_MS + 250);
  }

  let exiting: Promise<void> | null = null;

  return {
    root,
    enterBtn,
    lightsCanvas: q<HTMLCanvasElement>('.landing-fairy-lights'),
    setStatus(text, ready) {
      status.textContent = text;
      enterBtn.disabled = !ready;
    },
    exit() {
      exiting ??= new Promise<void>((resolve) => {
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          root.remove();
          resolve();
        };
        root.classList.add('is-exiting');
        if (reduceMotion.matches) {
          root.classList.add('is-fading');
          window.setTimeout(done, REDUCED_FADE_MS);
          return;
        }
        root.classList.add('is-lighting');
        window.setTimeout(() => reveal(done), SWELL_MS);
      });
      return exiting;
    },
  };
}
