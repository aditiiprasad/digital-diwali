import type { AudioManager } from '../audio/AudioManager';
import { clamp } from '../config';
import { playlist, type Track } from '../data/playlist';
import { YouTubePlayer, type Player, type PlayerEvents } from './players';

const ICONS = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  shuffle:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3l4 4-4 4V8h-2.6l-2.3 2.9-1.3-1.6L13.4 6H17zM3 6h4.6l9.8 12H17v-3l4 4-4 4v-3h-.6L6.6 8H3zm0 12h3.6l2.3-2.9 1.3 1.6L7.6 20H3z"/></svg>',
  repeat:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg>',
};

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const VOLUME_KEY = 'pataka-gali:radio-volume';
const POS_KEY = 'pataka-gali:radio-pos';
const MODE_KEY = 'pataka-gali:radio-mode';
/** Pointer travel (px) below which a press on the radio counts as a click, not a drag. */
const CLICK_SLOP = 6;
const EDGE = 6;

type Repeat = 'off' | 'all' | 'one';
const REPEAT_NEXT: Record<Repeat, Repeat> = { off: 'all', all: 'one', one: 'off' };

export interface RadioOptions {
  toast: (msg: string) => void;
  /** Default top-left (px) for a radio of size w x h when no position is saved. */
  defaultPos: (w: number, h: number) => { x: number; y: number };
  /** Rects the popup should avoid covering (e.g. social links). */
  avoid?: () => DOMRect[];
}

function shuffled(n: number, first: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i).filter((i) => i !== first);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return first >= 0 && first < n ? [first, ...a] : a;
}

const overlaps = (a: DOMRect, b: { left: number; top: number; right: number; bottom: number }) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export class Radio {
  private popup: HTMLDivElement;
  private ytHost: HTMLDivElement;
  private titleEl: HTMLSpanElement;
  private artistEl: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private bar: HTMLDivElement;
  private progress: HTMLDivElement;
  private curEl: HTMLSpanElement;
  private durEl: HTMLSpanElement;
  private playBtn: HTMLButtonElement;
  private countEl: HTMLSpanElement;
  private volInput: HTMLInputElement;
  private shuffleBtn: HTMLButtonElement;
  private repeatBtn: HTMLButtonElement;
  private listEl: HTMLDivElement;
  private rows: HTMLButtonElement[] = [];

  /** Wraps the prop + mini dock; positioned on screen. */
  private wrap: HTMLDivElement;
  private dock: HTMLDivElement;
  private dockPlay: HTMLButtonElement;
  private dockRepeat: HTMLButtonElement;
  private dockTitle: HTMLSpanElement;

  private player: Player | null = null;
  /** Index into `playlist` of the current track. */
  private index = 0;
  /** Play order (indices into `playlist`) and our position in it. */
  private order: number[];
  private pos = 0;
  private shuffle = false;
  private repeat: Repeat = 'all';
  private playing = false;
  private volume: number;
  private failures = 0;
  /** Incremented per track load so callbacks from old players are ignored. */
  private loadId = 0;
  private ytDuck = 1;
  /** Fraction of the duck recovered per 200ms tick. */
  private duckRecovery = 1;
  private skipTimer = 0;

  /** Radio position as fractions of the viewport (null = default spot). */
  private posFrac: { x: number; y: number } | null = null;
  private drag: { id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;

  constructor(
    private audio: AudioManager,
    private button: HTMLButtonElement,
    root: HTMLElement,
    private opts: RadioOptions,
  ) {
    this.volume = Number(localStorage.getItem(VOLUME_KEY) ?? 0.6);
    if (!Number.isFinite(this.volume)) this.volume = 0.6;
    try {
      const mode = JSON.parse(localStorage.getItem(MODE_KEY) ?? '{}') as { shuffle?: boolean; repeat?: Repeat };
      this.shuffle = mode.shuffle === true;
      if (mode.repeat && mode.repeat in REPEAT_NEXT) this.repeat = mode.repeat;
      const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { x: number; y: number } | null;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) this.posFrac = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) };
    } catch {
      /* corrupt storage — use defaults */
    }
    this.order = this.shuffle ? shuffled(playlist.length, 0) : playlist.map((_, i) => i);

    const parent = button.parentNode!;
    this.wrap = document.createElement('div');
    this.wrap.className = 'radio-wrap';
    parent.insertBefore(this.wrap, button);
    this.wrap.appendChild(button);

    this.dock = document.createElement('div');
    this.dock.className = 'radio-dock';
    this.dock.setAttribute('aria-label', 'Gali Radio — quick controls');
    this.dock.innerHTML = `
      <div class="rd-head">
        <span class="rd-led" aria-hidden="true"></span>
        <span class="rd-brand">GALI RADIO</span>
        <button type="button" class="rd-more" aria-label="Open full radio panel">⋯</button>
      </div>
      <div class="rd-title" aria-live="polite"><span></span></div>
      <div class="rd-controls">
        <button type="button" class="rd-prev" aria-label="Previous track">${ICONS.prev}</button>
        <button type="button" class="rd-play" aria-label="Play">${ICONS.play}</button>
        <button type="button" class="rd-next" aria-label="Next track">${ICONS.next}</button>
        <button type="button" class="rd-repeat" aria-label="Repeat">${ICONS.repeat}<b>1</b></button>
      </div>
    `;
    this.wrap.appendChild(this.dock);
    this.dockPlay = this.dock.querySelector('.rd-play')!;
    this.dockRepeat = this.dock.querySelector('.rd-repeat')!;
    this.dockTitle = this.dock.querySelector('.rd-title span')!;
    this.dock.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.dock.querySelector<HTMLButtonElement>('.rd-more')!.addEventListener('click', () => this.toggleOpen(true));
    this.dockPlay.addEventListener('click', () => this.togglePlay());
    this.dock.querySelector<HTMLButtonElement>('.rd-next')!.addEventListener('click', () => this.step(1));
    this.dock.querySelector<HTMLButtonElement>('.rd-prev')!.addEventListener('click', () => this.prev());
    this.dockRepeat.addEventListener('click', () => {
      this.repeat = REPEAT_NEXT[this.repeat];
      this.saveModes();
      this.renderModes();
    });

    this.popup = document.createElement('div');
    this.popup.className = 'radio-popup';
    this.popup.hidden = true;
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-label', 'Gali Radio');
    this.popup.innerHTML = `
      <div class="rp-head">
        <span class="rp-brand"><span class="rp-led"></span>GALI RADIO · 91.1 FM</span>
        <button class="rp-close" type="button" aria-label="Close radio">×</button>
      </div>
      <div class="rp-display">
        <div class="rp-title"><span></span></div>
        <div class="rp-artist"></div>
        <div class="rp-status" aria-live="polite"></div>
      </div>
      <div class="rp-progress" role="slider" aria-label="Seek" tabindex="0"><div class="rp-bar"></div></div>
      <div class="rp-time"><span class="rp-cur">0:00</span><span class="rp-count"></span><span class="rp-dur">0:00</span></div>
      <div class="rp-controls">
        <button type="button" class="rp-mode rp-shuffle" aria-label="Shuffle">${ICONS.shuffle}</button>
        <button type="button" class="rp-prev" aria-label="Previous track">${ICONS.prev}</button>
        <button type="button" class="rp-play" aria-label="Play">${ICONS.play}</button>
        <button type="button" class="rp-next" aria-label="Next track">${ICONS.next}</button>
        <button type="button" class="rp-mode rp-repeat">${ICONS.repeat}<b>1</b></button>
      </div>
      <label class="rp-vol"><span>VOL</span><input type="range" min="0" max="1" step="0.01" aria-label="Radio volume" /></label>
      <div class="rp-list" role="list" aria-label="Tracks"></div>
    `;
    root.appendChild(this.popup);

    this.ytHost = document.createElement('div');
    this.ytHost.className = 'yt-host';
    this.ytHost.setAttribute('aria-hidden', 'true');
    root.appendChild(this.ytHost);

    const q = <T extends HTMLElement>(sel: string) => this.popup.querySelector(sel) as T;
    this.titleEl = q('.rp-title span');
    this.artistEl = q('.rp-artist');
    this.statusEl = q('.rp-status');
    this.progress = q('.rp-progress');
    this.bar = q('.rp-bar');
    this.curEl = q('.rp-cur');
    this.durEl = q('.rp-dur');
    this.countEl = q('.rp-count');
    this.playBtn = q('.rp-play');
    this.volInput = q('.rp-vol input');
    this.shuffleBtn = q('.rp-shuffle');
    this.repeatBtn = q('.rp-repeat');
    this.listEl = q('.rp-list');
    this.volInput.value = String(this.volume);
    this.buildList();
    this.renderModes();

    this.bindDrag();
    q<HTMLButtonElement>('.rp-close').addEventListener('click', () => this.toggleOpen(false));
    this.playBtn.addEventListener('click', () => this.togglePlay());
    q<HTMLButtonElement>('.rp-next').addEventListener('click', () => this.step(1));
    q<HTMLButtonElement>('.rp-prev').addEventListener('click', () => this.prev());
    this.shuffleBtn.addEventListener('click', () => this.setShuffle(!this.shuffle));
    this.repeatBtn.addEventListener('click', () => {
      this.repeat = REPEAT_NEXT[this.repeat];
      this.saveModes();
      this.renderModes();
    });
    this.volInput.addEventListener('input', () => {
      this.volume = Number(this.volInput.value);
      localStorage.setItem(VOLUME_KEY, String(this.volume));
      this.applyVolume();
    });
    this.progress.addEventListener('pointerdown', (e) => this.seekFromPointer(e));
    this.progress.addEventListener('keydown', (e) => {
      if (!this.player) return;
      if (e.key === 'ArrowRight') this.player.seek(this.player.currentTime + 5);
      if (e.key === 'ArrowLeft') this.player.seek(Math.max(0, this.player.currentTime - 5));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.popup.hidden) this.toggleOpen(false);
    });
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (!this.popup.hidden && !this.popup.contains(t) && !this.wrap.contains(t)) this.toggleOpen(false);
    });

    // Explosions duck the music bus via Web Audio; YouTube needs it done by hand.
    audio.onDuck((factor, hold) => {
      this.ytDuck = factor;
      this.duckRecovery = 1 / Math.max(0.3, hold);
      this.applyVolume();
    });
    audio.onStateChange(() => this.applyVolume());

    window.setInterval(() => this.tick(), 200);
    this.renderTrack();
    this.reposition();
  }

  /* ---------------- Dragging & placement ---------------- */

  private bindDrag() {
    const b = this.button;
    b.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const r = b.getBoundingClientRect();
      this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false };
      b.setPointerCapture(e.pointerId);
    });
    b.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < CLICK_SLOP) return;
      d.moved = true;
      b.classList.add('dragging');
      this.moveTo(e.clientX - d.ox, e.clientY - d.oy);
    });
    const finish = (e: PointerEvent, cancelled: boolean) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      b.classList.remove('dragging');
      if (d.moved) {
        // Read the untransformed position (the rect would include the lift effect).
        const x = parseFloat(this.wrap.style.left) || 0, y = parseFloat(this.wrap.style.top) || 0;
        this.posFrac = { x: x / window.innerWidth, y: y / window.innerHeight };
        localStorage.setItem(POS_KEY, JSON.stringify(this.posFrac));
      } else if (!cancelled) {
        this.toggleOpen();
      }
    };
    b.addEventListener('pointerup', (e) => finish(e, false));
    b.addEventListener('pointercancel', (e) => finish(e, true));
    b.addEventListener('lostpointercapture', (e) => finish(e, true));
    // Pointer clicks are handled in pointerup; this catches keyboard activation (Enter/Space).
    b.addEventListener('click', (e) => {
      if (e.detail === 0) this.toggleOpen();
    });
  }

  /** Places the radio's top-left at (x, y), clamped inside the viewport. */
  private moveTo(x: number, y: number) {
    const w = this.wrap.offsetWidth, h = this.wrap.offsetHeight;
    const cx = clamp(x, EDGE, Math.max(EDGE, window.innerWidth - w - EDGE));
    const cy = clamp(y, EDGE, Math.max(EDGE, window.innerHeight - h - EDGE));
    this.wrap.style.left = `${cx.toFixed(1)}px`;
    this.wrap.style.top = `${cy.toFixed(1)}px`;
    if (!this.popup.hidden) this.placePopup();
  }

  /** Re-applies the saved (or default) position; call on resize. */
  reposition() {
    const w = this.wrap.offsetWidth, h = this.wrap.offsetHeight;
    const p = this.posFrac
      ? { x: this.posFrac.x * window.innerWidth, y: this.posFrac.y * window.innerHeight }
      : this.opts.defaultPos(w, h);
    this.moveTo(p.x, p.y);
  }

  /**
   * Puts the popup next to the radio: above, then below, right, left — the first
   * spot that fits on screen without covering avoided UI. Falls back to clamping.
   */
  private placePopup() {
    const r = this.wrap.getBoundingClientRect();
    const pw = this.popup.offsetWidth, ph = this.popup.offsetHeight;
    const W = window.innerWidth, H = window.innerHeight, gap = 10;
    const cx = r.left + r.width / 2 - pw / 2;
    const cy = r.top + r.height / 2 - ph / 2;
    const candidates = [
      { x: cx, y: r.top - ph - gap },
      { x: cx, y: r.bottom + gap },
      { x: r.right + gap, y: cy },
      { x: r.left - pw - gap, y: cy },
    ];
    const avoid = this.opts.avoid?.() ?? [];
    const fits = (x: number, y: number) =>
      y >= EDGE && y + ph <= H - EDGE && x + pw > 0 && x < W &&
      !avoid.some((a) => overlaps(a, { left: x, top: y, right: x + pw, bottom: y + ph }));
    // Horizontal overflow is fine to clamp for above/below; vertical overflow is not.
    const clampX = (x: number) => clamp(x, EDGE, Math.max(EDGE, W - pw - EDGE));
    const clampY = (y: number) => clamp(y, EDGE, Math.max(EDGE, H - ph - EDGE));
    let spot = candidates.map((c, i) => (i < 2 ? { x: clampX(c.x), y: c.y } : { x: c.x, y: clampY(c.y) }))
      .find((c) => c.x >= EDGE && c.x + pw <= W - EDGE && fits(c.x, c.y));
    // Nothing fits cleanly (tiny screens): take whichever of above/below has more room.
    spot ??= { x: clampX(cx), y: clampY(r.top > H - r.bottom ? r.top - ph - gap : r.bottom + gap) };
    this.popup.style.left = `${spot.x.toFixed(0)}px`;
    this.popup.style.top = `${spot.y.toFixed(0)}px`;
  }

  private toggleOpen(force?: boolean) {
    const open = force ?? this.popup.hidden;
    this.popup.hidden = !open;
    this.dock.hidden = open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) {
      this.placePopup();
      this.tick();
      this.rows[this.index]?.scrollIntoView({ block: 'nearest' });
    }
  }

  /* ---------------- Track list & modes ---------------- */

  private buildList() {
    const head = document.createElement('div');
    head.className = 'rp-group';
    head.textContent = 'Classic Bollywood Diwali';
    this.listEl.appendChild(head);
    playlist.forEach((t, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'rp-track';
      row.setAttribute('role', 'listitem');
      row.innerHTML = `<span class="rp-t"></span><span class="rp-a"></span>`;
      row.querySelector('.rp-t')!.textContent = t.title;
      row.querySelector('.rp-a')!.textContent = `${t.artist} · YouTube`;
      row.addEventListener('click', () => {
        this.failures = 0;
        this.pos = Math.max(0, this.order.indexOf(i));
        this.load(i, true);
      });
      this.rows[i] = row;
      this.listEl.appendChild(row);
    });
  }

  private setShuffle(on: boolean) {
    this.shuffle = on;
    // Keep the current track; the rest of the order is reshuffled (or restored).
    this.order = on ? shuffled(playlist.length, this.index) : playlist.map((_, i) => i);
    this.pos = Math.max(0, this.order.indexOf(this.index));
    this.saveModes();
    this.renderModes();
  }

  private saveModes() {
    localStorage.setItem(MODE_KEY, JSON.stringify({ shuffle: this.shuffle, repeat: this.repeat }));
  }

  private renderModes() {
    this.shuffleBtn.setAttribute('aria-pressed', String(this.shuffle));
    this.shuffleBtn.title = this.shuffle ? 'Shuffle: on' : 'Shuffle: off';
    const label = { off: 'Repeat: off', all: 'Repeat: all', one: 'Repeat: one' }[this.repeat];
    this.repeatBtn.setAttribute('aria-label', label);
    this.repeatBtn.title = label;
    this.repeatBtn.dataset.mode = this.repeat;
    this.dockRepeat.setAttribute('aria-label', label);
    this.dockRepeat.title = label;
    this.dockRepeat.dataset.mode = this.repeat;
  }

  /* ---------------- Playback ---------------- */

  private renderTrack(status = '') {
    const t = playlist[this.index];
    this.titleEl.textContent = t?.title ?? 'No tracks';
    this.titleEl.parentElement!.classList.toggle('scroll', (t?.title.length ?? 0) > 26);
    this.artistEl.textContent = t ? `${t.artist} · YouTube` : '';
    this.countEl.textContent = playlist.length ? `${this.pos + 1} / ${playlist.length}` : '';
    this.statusEl.textContent = status;
    this.rows.forEach((row, i) => {
      const cur = i === this.index;
      row.classList.toggle('current', cur);
      if (cur) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    if (!this.popup.hidden) this.rows[this.index]?.scrollIntoView({ block: 'nearest' });
    this.dockTitle.textContent = t?.title ?? 'Tap play for music';
    this.dock.classList.toggle('on', this.playing);
  }

  private setPlaying(on: boolean) {
    this.playing = on;
    this.playBtn.innerHTML = on ? ICONS.pause : ICONS.play;
    this.playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    this.dockPlay.innerHTML = on ? ICONS.pause : ICONS.play;
    this.dockPlay.setAttribute('aria-label', on ? 'Pause' : 'Play');
    this.button.classList.toggle('playing', on);
    this.popup.classList.toggle('on', on);
    this.dock.classList.toggle('on', on);
  }

  private createPlayer(track: Track, ev: PlayerEvents): Player | string {
    if (!this.audio.ctx) return 'audio is not unlocked yet';
    if (!/^[\w-]{11}$/.test(track.ytId)) return 'invalid YouTube video ID';
    return new YouTubePlayer(track.ytId, this.ytHost, ev);
  }

  private load(index: number, autoplay: boolean) {
    window.clearTimeout(this.skipTimer);
    this.player?.destroy();
    this.player = null;
    if (!playlist.length) {
      this.renderTrack('Playlist is empty — edit src/data/playlist.ts');
      return;
    }
    this.index = (index + playlist.length) % playlist.length;
    const id = ++this.loadId;
    const track = playlist[this.index];
    this.renderTrack(autoplay ? 'Tuning…' : '');

    const ev: PlayerEvents = {
      onPlaying: () => {
        if (id !== this.loadId) return;
        this.failures = 0;
        this.statusEl.textContent = '';
      },
      onEnded: () => {
        if (id === this.loadId) this.advance(false);
      },
      onError: (msg) => {
        if (id === this.loadId) this.fail(msg);
      },
    };
    const result = this.createPlayer(track, ev);
    if (typeof result === 'string') {
      this.fail(result, 350);
      return;
    }
    this.player = result;
    this.applyVolume();
    if (autoplay) {
      this.player.play();
      this.setPlaying(true);
    }
  }

  /**
   * Moves `dir` steps through the play order. `wrap` = loop around the ends
   * (manual skips and error skips always wrap; auto-advance only with repeat-all).
   * Returns false when the end of the list was reached without wrapping.
   */
  private move(dir: number, wrap: boolean): boolean {
    const n = this.order.length;
    let next = this.pos + dir;
    if (next >= n || next < 0) {
      if (!wrap) return false;
      next = (next + n) % n;
      // A fresh shuffle per lap, without repeating the last track first.
      if (this.shuffle && dir > 0) {
        this.order = shuffled(n, -1);
        if (n > 1 && this.order[0] === this.index) this.order.push(this.order.shift()!);
        next = 0;
      }
    }
    this.pos = next;
    return true;
  }

  /** Called when a track finishes on its own. */
  private advance(fromError: boolean) {
    if (!fromError && this.repeat === 'one') {
      this.load(this.index, true);
      return;
    }
    if (this.move(1, fromError || this.repeat !== 'off')) {
      this.load(this.order[this.pos], true);
    } else {
      // Repeat off and the list is done: rewind to the start, stopped.
      this.pos = 0;
      this.setPlaying(false);
      this.load(this.order[0], false);
    }
  }

  /** Skip broken tracks automatically, but stop if the whole list is unplayable. */
  private fail(msg: string, skipDelay = 1400) {
    const title = playlist[this.index]?.title ?? 'track';
    console.warn(`[radio] "${title}": ${msg}`);
    this.failures++;
    if (this.failures >= playlist.length) {
      this.failures = 0;
      this.player?.destroy();
      this.player = null;
      this.setPlaying(false);
      this.renderTrack('No playable tracks. Add YouTube IDs in src/data/playlist.ts');
      this.opts.toast('Radio: no playable tracks yet');
      return;
    }
    this.statusEl.textContent = `Can't play (${msg}) — skipping…`;
    if (this.playing) this.opts.toast(`Skipped “${title}” — ${msg}`);
    const id = this.loadId;
    this.skipTimer = window.setTimeout(() => {
      if (id === this.loadId && this.playing) this.advance(true);
    }, skipDelay);
  }

  private togglePlay() {
    if (this.playing) {
      this.player?.pause();
      this.setPlaying(false);
      return;
    }
    if (!this.player) {
      this.load(this.index, true);
    } else {
      this.player.play();
      this.setPlaying(true);
    }
  }

  private step(dir: number) {
    this.failures = 0;
    this.move(dir, true);
    this.load(this.order[this.pos], this.playing || !this.player);
  }

  private prev() {
    if (this.player && this.player.currentTime > 3) this.player.seek(0);
    else this.step(-1);
  }

  private seekFromPointer(e: PointerEvent) {
    if (!this.player || !this.player.duration) return;
    const r = this.progress.getBoundingClientRect();
    const f = clamp((e.clientX - r.left) / r.width, 0, 1);
    this.player.seek(f * this.player.duration);
    this.tick();
  }

  private applyVolume() {
    if (!this.player) return;
    const v = this.player.external ? this.volume * this.ytDuck * (this.audio.muted ? 0 : 1) : this.volume;
    this.player.setVolume(v);
  }

  private tick() {
    if (this.ytDuck < 1) {
      this.ytDuck = Math.min(1, this.ytDuck + 0.2 * this.duckRecovery);
      this.applyVolume();
    }
    if (this.popup.hidden) return;
    const cur = this.player?.currentTime ?? 0;
    const dur = this.player?.duration ?? 0;
    this.bar.style.width = dur ? `${(cur / dur) * 100}%` : '0%';
    this.curEl.textContent = fmt(cur);
    this.durEl.textContent = fmt(dur);
    this.progress.setAttribute('aria-valuenow', String(Math.round(cur)));
    this.progress.setAttribute('aria-valuemax', String(Math.round(dur)));
  }
}
