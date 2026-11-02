/* ------------------------------------------------------------------ */
/* YouTube radio backend                                               */
/* ------------------------------------------------------------------ */

export interface PlayerEvents {
  onPlaying(): void;
  onEnded(): void;
  onError(message: string): void;
}

export interface Player {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  readonly currentTime: number;
  readonly duration: number;
  /** Effective 0..1 volume (already includes mute/duck where relevant). */
  setVolume(v: number): void;
  destroy(): void;
  /** YouTube bypasses Web Audio, so it needs mute/duck applied manually. */
  readonly external: boolean;
}

/* Minimal typings for the bits of the YouTube IFrame API we use. */
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setVolume(v: number): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApi) return ytApi;
  ytApi = new Promise<YTNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('YouTube did not respond (offline or blocked?)')), 10000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      window.clearTimeout(timer);
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('could not reach YouTube'));
    };
    document.head.appendChild(s);
  }).catch((err) => {
    ytApi = null; // allow a retry later
    throw err;
  });
  return ytApi;
}

const YT_ERRORS: Record<number, string> = {
  2: 'invalid video ID',
  5: 'video cannot be played in HTML5',
  100: 'video not found or private',
  101: 'embedding disabled by the owner',
  150: 'embedding disabled by the owner',
};

/** YouTube video through a hidden IFrame player (audio only, from the user's point of view). */
export class YouTubePlayer implements Player {
  readonly external = true;
  private player: YTPlayer | null = null;
  private ready = false;
  private wantPlay = false;
  private volume = 1;
  private mount: HTMLDivElement;
  private destroyed = false;

  constructor(videoId: string, host: HTMLElement, ev: PlayerEvents) {
    this.mount = document.createElement('div');
    host.appendChild(this.mount);
    if (!/^[\w-]{11}$/.test(videoId)) {
      queueMicrotask(() => ev.onError('invalid YouTube video ID'));
      return;
    }
    loadYouTubeApi()
      .then((YT) => {
        if (this.destroyed) return;
        this.player = new YT.Player(this.mount, {
          videoId,
          width: 200,
          height: 200,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0 },
          events: {
            onReady: () => {
              this.ready = true;
              this.player!.setVolume(Math.round(this.volume * 100));
              if (this.wantPlay) this.player!.playVideo();
            },
            onStateChange: (e: { data: number }) => {
              if (e.data === 1) ev.onPlaying();
              else if (e.data === 0) ev.onEnded();
            },
            onError: (e: { data: number }) => ev.onError(YT_ERRORS[e.data] ?? `YouTube error ${e.data}`),
          },
        });
      })
      .catch((err: Error) => {
        if (!this.destroyed) ev.onError(err.message);
      });
  }
  play() {
    this.wantPlay = true;
    if (this.ready) this.player!.playVideo();
  }
  pause() {
    this.wantPlay = false;
    if (this.ready) this.player!.pauseVideo();
  }
  seek(s: number) { if (this.ready) this.player!.seekTo(s, true); }
  get currentTime() { return this.ready ? this.player!.getCurrentTime() || 0 : 0; }
  get duration() { return this.ready ? this.player!.getDuration() || 0 : 0; }
  setVolume(v: number) {
    this.volume = v;
    if (this.ready) this.player!.setVolume(Math.round(v * 100));
  }
  destroy() {
    this.destroyed = true;
    try {
      this.player?.destroy();
    } catch {
      /* iframe already gone */
    }
    this.mount.remove();
  }
}
