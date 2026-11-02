import type { LoadedImage } from './assets';
import { GITHUB_URL, LINKEDIN_URL } from './data/links';
import { buildLanding, type Landing } from './landing/Landing';

/** Top bar, landing overlay, tip, toast and social links. Pure DOM; behaviour is wired in main.ts. */

const SOCIAL_ICON = {
  github:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg>',
  linkedin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4V21H3zM9.5 9.75h3.83v1.54h.06c.53-1 1.84-2.06 3.79-2.06 4.05 0 4.8 2.67 4.8 6.13V21h-4v-5.02c0-1.2-.02-2.74-1.67-2.74-1.67 0-1.93 1.3-1.93 2.65V21h-4z"/></svg>',
};

/** “Developed by Aditi” — LinkedIn link in the main page top bar. */
function buildCredit(extraClass = ''): HTMLElement {
  const p = document.createElement('p');
  p.className = extraClass ? `site-credit ${extraClass}` : 'site-credit';
  p.innerHTML = `Developed by <a href="${LINKEDIN_URL}" target="_blank" rel="noopener noreferrer">Aditi</a>`;
  return p;
}

/** GitHub + LinkedIn buttons (main page corner). */
function buildSocialNav(extraClass = ''): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = extraClass ? `social ${extraClass}` : 'social';
  nav.setAttribute('aria-label', 'Social links');
  for (const [key, url, label] of [
    ['github', GITHUB_URL, 'GitHub profile (opens in a new tab)'],
    ['linkedin', LINKEDIN_URL, 'LinkedIn profile (opens in a new tab)'],
  ] as const) {
    const a = document.createElement('a');
    a.className = `social-btn social-${key}`;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', label);
    a.title = label.replace(' (opens in a new tab)', '');
    a.innerHTML = SOCIAL_ICON[key];
    nav.appendChild(a);
  }
  return nav;
}

const ICON = {
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  ambient: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V10l5-3v4l5-3v4l5-3v12z"/><path d="M19 4c1 1 1 2 0 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3l2 2-6.5 6.5-2-2zM7 10.5l4 4-1.5 6.5H3.5l-.5-3z"/><path d="M13 20h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  rain: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4a4 4 0 0 0-3.8 5.2 5 5 0 0 0 2.2 9.3H18a4 4 0 0 0 .2-8 5 5 0 0 0-9.4-2.2A4 4 0 0 0 7 4z" fill="currentColor" opacity="0.35"/><path d="M8 18l-1 3M12 17l-1 3M16 18l-1 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

export interface UI {
  muteBtn: HTMLButtonElement;
  ambientBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  rainBtn: HTMLButtonElement;
  enterBtn: HTMLButtonElement;
  overlay: HTMLDivElement;
  landing: Landing;
  /** Fairy-light garland on the landing screen (same as the street scene). */
  startLightsCanvas: HTMLCanvasElement;
  social: HTMLElement;
  setLogo(img: LoadedImage): void;
  setLoading(text: string, ready: boolean): void;
  setMuted(muted: boolean): void;
  setAmbient(on: boolean): void;
  setRain(on: boolean): void;
  showTip(): void;
  hideTip(): void;
  toast(msg: string): void;
}

export function buildUI(root: HTMLElement): UI {
  const bar = document.createElement('header');
  bar.className = 'topbar';
  bar.innerHTML = `
    <div class="brand">
      <img class="logo" alt="" />
      <div class="brand-line">
        <span class="brand-text">Digital Diwali</span>
        <span class="brand-sep" aria-hidden="true">·</span>
      </div>
    </div>
    <div class="topbar-controls">
      <button type="button" class="tb-weather tb-rain" aria-pressed="false" title="Rain — visuals and sound">
        ${ICON.rain}<span>Rain</span>
      </button>
      <div class="actions">
      <button type="button" class="tb-btn tb-mute" aria-pressed="false" title="Mute all sound">${ICON.sound}<span>Sound</span></button>
      <button type="button" class="tb-btn tb-ambient" aria-pressed="true" title="Street ambience on/off">${ICON.ambient}<span>Ambient</span></button>
      <button type="button" class="tb-btn tb-clear" title="Remove all patakas from the road">${ICON.clear}<span>Clear Road</span></button>
      </div>
    </div>
  `;
  root.appendChild(bar);
  bar.querySelector('.brand-line')!.appendChild(buildCredit('brand-credit'));
  const logo = bar.querySelector<HTMLImageElement>('.logo')!;

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'status');
  tip.innerHTML =
    '<span class="tip-spark"></span>Drag a pataka onto the road and tap it. Hold and move the fuljhadi to light it!';
  root.appendChild(tip);

  const social = buildSocialNav();
  root.appendChild(social);

  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  root.appendChild(toastEl);

  const landing = buildLanding(root);
  landing.root.appendChild(buildSocialNav('landing-social'));

  const rainBtn = bar.querySelector<HTMLButtonElement>('.tb-rain')!;
  const muteBtn = bar.querySelector<HTMLButtonElement>('.tb-mute')!;
  const ambientBtn = bar.querySelector<HTMLButtonElement>('.tb-ambient')!;
  const clearBtn = bar.querySelector<HTMLButtonElement>('.tb-clear')!;

  let toastTimer = 0;
  let tipTimer = 0;

  return {
    rainBtn, muteBtn, ambientBtn, clearBtn, social, landing,
    enterBtn: landing.enterBtn,
    overlay: landing.root,
    startLightsCanvas: landing.lightsCanvas,
    setLogo(img) {
      logo.src = img.url;
      logo.alt = 'Shubh Diwali';
      bar.classList.toggle('logo-fallback', img.isFallback);
    },
    setLoading(text, ready) {
      landing.setStatus(text, ready);
    },
    setMuted(muted) {
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.innerHTML = `${muted ? ICON.muted : ICON.sound}<span>${muted ? 'Muted' : 'Sound'}</span>`;
    },
    setAmbient(on) {
      ambientBtn.setAttribute('aria-pressed', String(on));
      ambientBtn.classList.toggle('off', !on);
    },
    setRain(on) {
      rainBtn.setAttribute('aria-pressed', String(on));
      rainBtn.classList.toggle('on', on);
    },
    showTip() {
      tip.classList.add('show');
      window.clearTimeout(tipTimer);
      tipTimer = window.setTimeout(() => tip.classList.remove('show'), 14000);
    },
    hideTip() {
      window.clearTimeout(tipTimer);
      tip.classList.remove('show');
    },
    toast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2600);
    },
  };
}
