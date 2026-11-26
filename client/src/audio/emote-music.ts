// PROCEDURAL WEBAUDIO EMOTE MUSIC SYNTHESIZER.
// Zero external audio files: synthesizes 6 catchy, upbeat Fortnite-style dance grooves locked to each
// dance's exact BPM (actors/emotes.ts EMOTES). Uses a look-ahead WebAudio 16th-note scheduler, respects
// master / radio volume preferences, supports smooth fade-out on cancel, and scales with spatial distance.
import { EMOTES, type DanceId } from "../actors/emotes";
import { preferences } from "../settings/preferences";

interface TrackSpec {
  bpm: number;
  /** 16-step MIDI note bass pattern (0 = rest) */
  bass: readonly number[];
  /** 16-step MIDI note lead melody (0 = rest) */
  lead: readonly number[];
  /** 16-step kick pattern (1 = hit) */
  kick: readonly number[];
  /** 16-step clap/snare pattern (1 = hit) */
  clap: readonly number[];
  /** 16-step hi-hat pattern (1 = closed, 2 = open) */
  hat: readonly number[];
  leadWave: OscillatorType;
  bassWave: OscillatorType;
}

const TRACKS: readonly TrackSpec[] = [
  // 0: THE FLOSS (120 BPM) — bouncy electro-pop synth groove
  {
    bpm: EMOTES[0].bpm, leadWave: "square", bassWave: "sawtooth",
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat:  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2, 0],
    bass: [45, 0, 57, 0, 45, 0, 55, 0, 48, 0, 60, 0, 50, 0, 55, 52],
    lead: [69, 0, 72, 0, 76, 0, 72, 74, 76, 0, 79, 0, 76, 0, 74, 72],
  },
  // 1: TAKE THE L (128 BPM) — mischievous bouncy brass/polka hop
  {
    bpm: EMOTES[1].bpm, leadWave: "sawtooth", bassWave: "triangle",
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    clap: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    hat:  [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 2, 0],
    bass: [43, 0, 50, 0, 43, 0, 50, 0, 46, 0, 53, 0, 48, 0, 50, 0],
    lead: [67, 70, 74, 0, 72, 70, 67, 0, 70, 74, 77, 0, 76, 74, 72, 70],
  },
  // 2: BANANA BOOGIE / DEFAULT DANCE (108 BPM) — iconic 90s funk clap + slap bass!
  {
    bpm: EMOTES[2].bpm, leadWave: "triangle", bassWave: "sawtooth",
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat:  [1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 2, 0],
    bass: [40, 0, 40, 43, 0, 45, 47, 0, 40, 0, 43, 0, 47, 45, 43, 0],
    lead: [64, 0, 67, 69, 0, 71, 69, 67, 64, 0, 71, 0, 74, 71, 67, 69],
  },
  // 3: JUNGLE JUSTICE (132 BPM) — hyper rave/club bounce!
  {
    bpm: EMOTES[3].bpm, leadWave: "square", bassWave: "sawtooth",
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1],
    clap: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0],
    hat:  [1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 1, 2, 1],
    bass: [41, 41, 53, 0, 43, 43, 55, 0, 45, 45, 57, 0, 48, 0, 55, 53],
    lead: [72, 77, 76, 72, 74, 79, 77, 74, 76, 81, 79, 76, 79, 77, 76, 74],
  },
  // 4: KONGBOT (124 BPM) — electro-funk vocoder arpeggio
  {
    bpm: EMOTES[4].bpm, leadWave: "sawtooth", bassWave: "square",
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat:  [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 2, 0, 1, 1, 1, 1],
    bass: [38, 0, 50, 38, 0, 45, 48, 0, 38, 0, 50, 41, 0, 45, 43, 0],
    lead: [62, 65, 69, 62, 74, 0, 72, 69, 65, 69, 72, 65, 76, 74, 72, 69],
  },
  // 5: CROWN FLEX (116 BPM) — tropical marimba + booming taiko victory fanfare
  {
    bpm: EMOTES[5].bpm, leadWave: "sine", bassWave: "triangle",
    kick: [1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    hat:  [0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 1, 2],
    bass: [48, 0, 55, 0, 48, 0, 52, 55, 53, 0, 60, 0, 55, 0, 59, 55],
    lead: [72, 0, 76, 79, 84, 0, 79, 76, 77, 0, 81, 84, 86, 0, 84, 79],
  },
];

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class EmoteMusic {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private timer = 0;
  private activeId: DanceId | -1 = -1;
  private step = 0;
  private nextT = 0;
  private spatialGain = 1;
  private unsub: (() => void) | null = null;

  constructor(private readonly getCtx?: () => BaseAudioContext | null) {
    this.unsub = preferences.subscribe(() => this.syncGain());
  }

  private ensure(): boolean {
    const ext = this.getCtx?.();
    if (!this.ctx) {
      if (ext && typeof (ext as AudioContext).resume === "function") this.ctx = ext as AudioContext;
      else if (typeof AudioContext !== "undefined") this.ctx = new AudioContext();
      else return false;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    if (!this.bus) {
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(this.ctx.destination);
    }
    if (!this.noiseBuf) {
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      let s = 0x1234567;
      for (let i = 0; i < len; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = (s / 0xffffffff) * 2 - 1; }
      this.noiseBuf = b;
    }
    return true;
  }

  private targetGain(): number {
    const p = preferences.value;
    const vol = p.master * Math.max(p.radio, p.ui * 0.55);
    return Math.max(0, Math.min(0.42, vol * 0.34 * this.spatialGain));
  }

  private syncGain() {
    if (!this.ctx || !this.bus || this.activeId < 0) return;
    const now = this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(this.targetGain(), now, 0.04);
  }

  /** Start playing looping dance track `id` (0..5). `gain` = spatial attenuation 0..1. */
  start(id: DanceId, gain = 1) {
    this.spatialGain = Math.max(0, Math.min(1, gain));
    if (this.activeId === id) { this.syncGain(); return; }
    if (!this.ensure() || !this.ctx || !this.bus) return;
    this.activeId = id;
    this.step = 0;
    const now = this.ctx.currentTime;
    this.nextT = now + 0.03;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(Math.max(0.0001, this.bus.gain.value), now);
    this.bus.gain.linearRampToValueAtTime(this.targetGain(), now + 0.08);
    if (!this.timer) this.timer = window.setInterval(() => this.pump(), 25);
    this.pump();
  }

  setGain(gain: number) {
    this.spatialGain = Math.max(0, Math.min(1, gain));
    this.syncGain();
  }

  stop() {
    if (this.activeId < 0) return;
    this.activeId = -1;
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    if (this.ctx && this.bus) {
      const now = this.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(now);
      this.bus.gain.setValueAtTime(this.bus.gain.value, now);
      this.bus.gain.linearRampToValueAtTime(0, now + 0.1);
    }
  }

  dispose() {
    this.stop();
    this.unsub?.();
    this.unsub = null;
    if (this.bus) { try { this.bus.disconnect(); } catch { /* ignore */ } this.bus = null; }
  }

  private pump() {
    if (this.activeId < 0 || !this.ctx || !this.bus) return;
    if (this.ctx.state === "suspended") return;
    const tr = TRACKS[this.activeId];
    const stepS = 60 / tr.bpm / 4; // 16th note
    const horizon = this.ctx.currentTime + 0.14;
    if (this.nextT < this.ctx.currentTime - 0.1) this.nextT = this.ctx.currentTime + 0.02;
    while (this.nextT < horizon) {
      this.scheduleStep(tr, this.step & 15, this.nextT, stepS);
      this.step++;
      this.nextT += stepS;
    }
  }

  private scheduleStep(tr: TrackSpec, s: number, t: number, stepS: number) {
    const ctx = this.ctx!, bus = this.bus!;
    if (tr.kick[s]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(145, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(bus);
      o.start(t); o.stop(t + 0.17);
    }
    if (tr.clap[s] && this.noiseBuf) {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noiseBuf;
      f.type = "bandpass"; f.frequency.setValueAtTime(1600, t); f.Q.value = 1.4;
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(f); f.connect(g); g.connect(bus);
      src.start(t); src.stop(t + 0.13);
    }
    if (tr.hat[s] && this.noiseBuf) {
      const open = tr.hat[s] === 2;
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.noiseBuf;
      f.type = "highpass"; f.frequency.setValueAtTime(6500, t);
      g.gain.setValueAtTime(open ? 0.24 : 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.14 : 0.045));
      src.connect(f); f.connect(g); g.connect(bus);
      src.start(t); src.stop(t + (open ? 0.15 : 0.055));
    }
    const bn = tr.bass[s];
    if (bn) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = tr.bassWave;
      o.frequency.setValueAtTime(midiHz(bn), t);
      f.type = "lowpass"; f.frequency.setValueAtTime(680, t); f.frequency.exponentialRampToValueAtTime(220, t + stepS * 1.2);
      g.gain.setValueAtTime(0.38, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + stepS * 1.45);
      o.connect(f); f.connect(g); g.connect(bus);
      o.start(t); o.stop(t + stepS * 1.5);
    }
    const ln = tr.lead[s];
    if (ln) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = tr.leadWave;
      o.frequency.setValueAtTime(midiHz(ln), t);
      f.type = "lowpass"; f.frequency.setValueAtTime(2800, t); f.frequency.exponentialRampToValueAtTime(950, t + stepS * 1.1);
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + stepS * 1.35);
      o.connect(f); f.connect(g); g.connect(bus);
      o.start(t); o.stop(t + stepS * 1.4);
    }
  }
}
