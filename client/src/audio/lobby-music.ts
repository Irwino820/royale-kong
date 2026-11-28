// LOBBY THEME MUSIC PLAYER — plays the seamlessly-looping tropical jungle soundtrack ("Banana Beatdown")
// in the Title / Lobby / Wardrobe screens, with smooth fades, browser autoplay-gesture unlock, Wardrobe
// dance-emote ducking, tab-visibility pause, and live master × lobby-music volume control.
import { preferences } from "../settings/preferences";

/** Peak gain at master=1, music=1 so the lobby soundtrack sits warmly behind UI clicks & hero voice */
const MAX_GAIN = 0.56;
/** Multiplier while a Wardrobe dance emote preview is playing */
const DUCK_MULT = 0.08;

function pickAudioExt(): "ogg" | "m4a" {
  if (typeof Audio === "undefined") return "ogg";
  const probe = new Audio();
  // Opus in OGG is supported across Chrome, Firefox, Edge, and modern Safari; fallback to AAC M4A
  if (probe.canPlayType('audio/ogg; codecs="opus"')) return "ogg";
  return "m4a";
}

export class LobbyMusic {
  private el: HTMLAudioElement | null = null;
  private active = false;
  private ducked = false;
  private unlocked = false;
  private curVol = 0;
  private rampTimer = 0;
  private unsub: (() => void) | null = null;
  private onGesture: (() => void) | null = null;
  private onVis: (() => void) | null = null;

  constructor(private readonly enabled = true) {
    if (!enabled || typeof Audio === "undefined") return;
    this.unsub = preferences.subscribe(() => this.refresh());
    this.onVis = () => this.refresh();
    document.addEventListener("visibilitychange", this.onVis);
    this.onGesture = () => this.unlock();
    window.addEventListener("pointerdown", this.onGesture, { capture: true, passive: true });
    window.addEventListener("keydown", this.onGesture, { capture: true, passive: true });
    window.addEventListener("touchstart", this.onGesture, { capture: true, passive: true });
  }

  private ensureEl(): HTMLAudioElement | null {
    if (!this.enabled || typeof Audio === "undefined") return null;
    if (this.el) return this.el;
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
    const el = new Audio(`${base}assets/audio/kr/music/lobby-jungle.${pickAudioExt()}`);
    el.loop = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    el.volume = 0;
    this.el = el;
    return el;
  }

  private targetVol(): number {
    if (!this.active || document.hidden) return 0;
    const p = preferences.value;
    const v = p.master * p.music * MAX_GAIN * (this.ducked ? DUCK_MULT : 1);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }

  /** Called automatically on first user gesture (or explicitly from UI clicks) to satisfy browser autoplay policy. */
  unlock(): void {
    if (!this.enabled) return;
    this.unlocked = true;
    if (this.onGesture) {
      window.removeEventListener("pointerdown", this.onGesture, { capture: true });
      window.removeEventListener("keydown", this.onGesture, { capture: true });
      window.removeEventListener("touchstart", this.onGesture, { capture: true });
      this.onGesture = null;
    }
    this.refresh();
  }

  /** True while on the lobby/title screen; false while in a live match or caster view. */
  setActive(on: boolean): void {
    if (this.active === on) return;
    this.active = on;
    this.refresh();
  }

  /** Temporarily duck the lobby theme while previewing a Wardrobe dance emote. */
  setDucked(duck: boolean): void {
    if (this.ducked === duck) return;
    this.ducked = duck;
    this.refresh();
  }

  /** Diagnostics / testing snapshot. */
  state(): { active: boolean; ducked: boolean; playing: boolean; volume: number; target: number; src: string } {
    return {
      active: this.active,
      ducked: this.ducked,
      playing: !!this.el && !this.el.paused,
      volume: +this.curVol.toFixed(3),
      target: +this.targetVol().toFixed(3),
      src: this.el?.currentSrc || this.el?.src || "",
    };
  }

  private refresh(): void {
    if (!this.enabled) return;
    const want = this.targetVol();
    if (want > 0.001) {
      const el = this.ensureEl();
      if (el && el.paused) {
        const p = el.play();
        if (p && typeof p.catch === "function") {
          p.then(() => { this.unlocked = true; }).catch(() => {
            // Autoplay blocked until first gesture — gesture listener will retry seamlessly.
            this.unlocked = false;
          });
        }
      }
    }
    if (!this.rampTimer && this.el) {
      this.rampTimer = window.setInterval(() => this.stepRamp(), 30);
    }
  }

  private stepRamp(): void {
    const el = this.el;
    if (!el) { clearInterval(this.rampTimer); this.rampTimer = 0; return; }
    const want = this.targetVol();
    // Fade in gently (~0.9 s), fade out / duck crisply (~0.35 s)
    const rate = want > this.curVol ? 0.055 : 0.14;
    const diff = want - this.curVol;
    if (Math.abs(diff) < 0.003) {
      this.curVol = want;
      el.volume = want;
      if (want <= 0.0005 && !el.paused) el.pause();
      clearInterval(this.rampTimer);
      this.rampTimer = 0;
    } else {
      this.curVol += diff * rate;
      el.volume = Math.max(0, Math.min(1, this.curVol));
    }
    // Keep trying on resume once unlocked
    if (want > 0.001 && this.unlocked && el.paused) {
      void el.play().catch(() => {});
    }
  }

  dispose(): void {
    if (this.rampTimer) { clearInterval(this.rampTimer); this.rampTimer = 0; }
    this.unsub?.(); this.unsub = null;
    if (this.onVis) { document.removeEventListener("visibilitychange", this.onVis); this.onVis = null; }
    if (this.onGesture) {
      window.removeEventListener("pointerdown", this.onGesture, { capture: true });
      window.removeEventListener("keydown", this.onGesture, { capture: true });
      window.removeEventListener("touchstart", this.onGesture, { capture: true });
      this.onGesture = null;
    }
    if (this.el) {
      try { this.el.pause(); this.el.src = ""; } catch { /* ignore */ }
      this.el = null;
    }
  }
}
