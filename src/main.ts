import './styles.css';
import { loadAllImages } from './assets';
import { AudioManager } from './audio/AudioManager';
import { FairyLights } from './atmosphere/FairyLights';
import { portraitQuery, quality } from './config';
import { DragDrop } from './dragDrop';
import { Effects } from './particles/Effects';
import { ParticleSystem } from './particles/ParticleSystem';
import { PATAKAS, PATAKA_BY_KIND } from './patakas';
import { SparklerController } from './patakas/Fuljhadi';
import { PatakaManager } from './patakas/PatakaManager';
import type { World } from './patakas/types';
import { Radio } from './radio/Radio';
import { Scene } from './scene';
import { buildUI } from './ui';
import { Weather } from './weather/Weather';

/** The floating "Tap to light 🔥" tooltip stops showing after this many patakas are lit. */
const HINT_UNTIL_LIT = 3;

async function boot() {
  const app = document.getElementById('app')!;
  const audio = new AudioManager();
  // Download sound files right away; decoding waits for the user gesture.
  audio.prefetch();

  const ui = buildUI(app);
  const images = await loadAllImages((done, total) => ui.setLoading(`Loading art… ${done}/${total}`, false));
  ui.setLogo(images.logo);

  const scene = new Scene(app, images, PATAKAS);
  const startFairy = new FairyLights();
  const START_FAIRY_H = 92;
  let showStartFairy = true;

  const layoutStartFairy = () => {
    const w = window.innerWidth;
    const dpr = quality.dpr;
    const c = ui.startLightsCanvas;
    c.width = Math.round(w * dpr);
    c.height = Math.round(START_FAIRY_H * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${START_FAIRY_H}px`;
    startFairy.layout(w, portraitQuery.matches, 44);
  };
  layoutStartFairy();
  window.addEventListener('pointermove', (e) => {
    startFairy.setPointerNorm((e.clientX / Math.max(1, window.innerWidth)) * 2 - 1);
  }, { passive: true });
  const weather = new Weather(audio);
  weather.onResize(scene.width, scene.height);
  const particles = new ParticleSystem(2500);
  particles.cap = quality.particleCap;
  const fx = new Effects();
  /** Extra multiplier lowered automatically if frame times stay high. */
  let perfScale = 1;

  // `manager` is assigned right below; World.jolt is only called at runtime.
  let manager!: PatakaManager;
  const world: World = {
    particles,
    fx,
    audio,
    get width() { return scene.width; },
    get height() { return scene.height; },
    get roadTop() { return scene.roadTop; },
    get roadBottom() { return scene.roadBottom; },
    get baseSize() { return scene.baseSize; },
    get unit() { return scene.unit; },
    depthScale: (y) => scene.depthScale(y),
    // Taper emission as the pool fills so effects thin out instead of cutting off.
    emission: () => quality.emission * perfScale * Math.min(1, particles.headroom * 1.6),
    shake: (i, d) => scene.shake(i, d),
    jolt: (x, y, r, s, except) => manager.jolt(x, y, r, s, except),
    image: (k) => images[k],
  };
  manager = new PatakaManager(world);
  const sparklers = new SparklerController(world, ui.toast);

  const dragDrop = new DragDrop(scene, manager, sparklers, PATAKA_BY_KIND, images, ui.toast);
  // Start with a neat, easy-to-grab line of diyas on the road.
  const diyaCount = 5;
  const diyaY = scene.roadTop + Math.min(42, (scene.roadBottom - scene.roadTop) * 0.28);
  for (let i = 0; i < diyaCount; i++) {
    const x = scene.width * (0.18 + (i / (diyaCount - 1)) * 0.64);
    manager.place(PATAKA_BY_KIND.diya, x, diyaY, 0);
  }
  scene.addBlocker(ui.social);
  const radio = new Radio(audio, scene.radioBtn, app, {
    toast: ui.toast,
    defaultPos: (w, h) => scene.radioDefault(w, h),
    avoid: () => [ui.social.getBoundingClientRect()],
  });
  scene.onResize((oldW, oldTop, oldBottom) => {
    manager.remap(oldW, oldTop, oldBottom);
    radio.reposition();
    weather.onResize(scene.width, scene.height);
    layoutStartFairy();
  });
  portraitQuery.addEventListener('change', layoutStartFairy);

  /** The "Tap to light" tooltip is a first-time hint: it retires after a few lights. */
  let litCount = 0;
  const onLit = () => {
    litCount++;
    ui.hideTip();
  };
  manager.onLit = onLit;
  sparklers.onLit = onLit;

  const history: ReturnType<PatakaManager['snapshot']>[] = [];
  const future: ReturnType<PatakaManager['snapshot']>[] = [];
  const remember = () => {
    history.push(manager.snapshot());
    if (history.length > 30) history.shift();
    future.length = 0;
  };
  const saveLayout = () => {
    localStorage.setItem('digital-diwali-layout', JSON.stringify({
      items: manager.snapshot(),
      decorations: scene.decorationSnapshot(),
      theme: [...document.documentElement.classList].filter((c) => c.startsWith('theme-'))[0] ?? '',
    }));
    ui.toast('Decoration saved!');
  };
  const loadLayout = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('digital-diwali-layout') ?? 'null');
      if (Array.isArray(saved)) {
        manager.restore(saved, PATAKA_BY_KIND);
      } else if (saved && Array.isArray(saved.items)) {
        manager.restore(saved.items, PATAKA_BY_KIND);
        scene.restoreDecorations(Array.isArray(saved.decorations) ? saved.decorations : []);
        document.documentElement.classList.remove('theme-night', 'theme-royal', 'theme-warm');
        if (saved.theme) document.documentElement.classList.add(saved.theme);
      }
      ui.toast('Decoration loaded!');
    } catch {
      ui.toast('Saved decoration could not be loaded.');
    }
  };
  ui.arrangeBtn.addEventListener('click', () => { remember(); manager.arrangeLine(); ui.toast('Diyas arranged in a line.'); });
  ui.randomBtn.addEventListener('click', () => { remember(); manager.randomArrange(); scene.addDecoration('rangoli'); ui.toast('Random decoration added.'); });
  ui.saveBtn.addEventListener('click', saveLayout);
  ui.loadBtn.addEventListener('click', loadLayout);
  ui.undoBtn.addEventListener('click', () => {
    const previous = history.pop();
    if (!previous) return;
    future.push(manager.snapshot());
    manager.restore(previous, PATAKA_BY_KIND);
  });
  ui.redoBtn.addEventListener('click', () => {
    const next = future.pop();
    if (!next) return;
    history.push(manager.snapshot());
    manager.restore(next, PATAKA_BY_KIND);
  });
  ui.celebrateBtn.addEventListener('click', () => { scene.celebrate(); ui.toast('Happy Diwali! 🎆'); });
  ui.themeBtn.addEventListener('click', () => {
    const themes = ['theme-night', 'theme-royal', 'theme-warm'];
    const current = themes.findIndex((t) => document.documentElement.classList.contains(t));
    document.documentElement.classList.remove(...themes);
    document.documentElement.classList.add(themes[(current + 1) % themes.length]);
  });
  ui.snapBtn.addEventListener('click', () => {
    dragDrop.snapToGrid = !dragDrop.snapToGrid;
    ui.snapBtn.classList.toggle('on', dragDrop.snapToGrid);
    ui.toast(dragDrop.snapToGrid ? 'Grid snapping on.' : 'Grid snapping off.');
  });
  let zoom = 1;
  ui.zoomInBtn.addEventListener('click', () => { zoom = Math.min(1.25, zoom + 0.05); scene.setViewScale(zoom); });
  ui.zoomOutBtn.addEventListener('click', () => { zoom = Math.max(0.85, zoom - 0.05); scene.setViewScale(zoom); });
  for (const button of ui.decorButtons) {
    button.addEventListener('click', () => scene.addDecoration(button.dataset.decoration as 'rangoli' | 'toran' | 'flowers' | 'lantern'));
  }

  ui.rainBtn.addEventListener('click', () => {
    if (!audio.ctx) {
      ui.toast('Enter the gali first, then try weather.');
      return;
    }
    weather.toggleRain();
    ui.setRain(weather.active);
  });

  ui.muteBtn.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    ui.setMuted(audio.muted);
  });
  ui.ambientBtn.addEventListener('click', () => {
    audio.setAmbientEnabled(!audio.ambientEnabled);
    ui.setAmbient(audio.ambientEnabled);
  });
  ui.clearBtn.addEventListener('click', () => {
    if (!manager.items.length && !sparklers.count) {
      ui.toast('The road is already clear.');
      return;
    }
    manager.clear();
    sparklers.clear();
    ui.toast('Road cleared!');
  });

  ui.setLoading('Ready when you are.', true);
  ui.enterBtn.addEventListener('click', () => {
    ui.enterBtn.disabled = true;
    ui.setLoading('Lighting the diyas…', false);
    // Unlock inside the gesture; the landing's exit animation runs in parallel.
    audio.unlock()
      .then(() => audio.startAmbient())
      .catch((err) => console.warn('[audio] Unlock failed; continuing without sound.', err));
    void ui.landing.exit().then(() => {
      showStartFairy = false;
      ui.showTip();
    });
  }, { once: true });

  // Pause audio in background tabs; resume on return.
  document.addEventListener('visibilitychange', () => {
    const ctx = audio.ctx;
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });

  let resizeQueued = false;
  const queueLayout = () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      scene.layout();
    });
  };
  window.addEventListener('resize', queueLayout);
  portraitQuery.addEventListener('change', queueLayout);

  // Main loop with delta time and adaptive quality.
  const ctx = scene.ctx;
  let last = performance.now();
  let avgFrame = 1 / 60;
  let slowFor = 0;
  /** Dev-only: freezes the loop so frames can be stepped/inspected from the console. */
  let debugPaused = false;
  const frame = (now: number) => {
    const raw = Math.max(0, (now - last) / 1000);
    last = now;
    // Clamp so a background-tab pause doesn't produce one giant step.
    const dt = Math.min(raw, 1 / 20);

    avgFrame += (raw - avgFrame) * 0.05;
    if (raw < 0.25) slowFor = avgFrame > 1 / 42 ? slowFor + raw : Math.max(0, slowFor - raw);
    if (slowFor > 2 && perfScale > 0.4) {
      perfScale = Math.max(0.4, perfScale - 0.15);
      particles.cap = Math.max(500, Math.round(particles.cap * 0.8));
      slowFor = 0;
    }
    if (quality.reducedMotion) particles.cap = Math.min(particles.cap, quality.particleCap);

    if (!debugPaused) step(dt);
    requestAnimationFrame(frame);
  };

  function step(dt: number) {
    scene.update(dt);
    manager.update(dt);
    sparklers.update(dt);
    particles.update(dt);
    fx.update(dt);
    weather.update(dt);
    if (showStartFairy && ui.overlay.isConnected) {
      startFairy.update(dt);
      const lc = ui.startLightsCanvas;
      const lctx = lc.getContext('2d')!;
      const dpr = quality.dpr;
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, lc.width / dpr, START_FAIRY_H);
      startFairy.draw(lctx, portraitQuery.matches);
    }
    scene.setHint(litCount < HINT_UNTIL_LIT ? sparklers.hintTarget() ?? manager.hintTarget() : null);

    const dpr = quality.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, scene.width, scene.height);
    scene.drawAtmosphere(ctx);
    manager.draw(ctx);
    sparklers.draw(ctx);
    fx.drawGlows(ctx);
    particles.drawNormal(ctx);
    particles.drawAdditive(ctx);
    fx.drawOverlay(ctx, scene.width, scene.height, Math.max(scene.skyBottom, scene.height * 0.55));
    weather.draw(ctx);
  }
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    Object.assign(window, { __gali: { scene, manager, sparklers, radio, particles, audio, defs: PATAKA_BY_KIND, step, pause: (on: boolean) => (debugPaused = on) } });
  }
}

boot().catch((err) => {
  console.error(err);
  const app = document.getElementById('app');
  if (app) app.innerHTML = `<p class="fatal">Something went wrong while starting the gali. Please reload.</p>`;
});
