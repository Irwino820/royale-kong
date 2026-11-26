// FORTNITE-STYLE EMOTES & DANCES for Kong Royale.
// Six full-body procedural choreographies authored on Kong's 16-bone skeleton (actors/kong-rig.ts):
//   +X up-bones (spine/chest/head/ROOT) = lean forward; +X limbs = swing forward (shoulder +2.6 = overhead,
//   elbow +1.4 = bend forearm up, hip +1.0 = thigh up, knee -1.4 = bend knee); -Z on R limb = abduct outward
//   (+Z on L limb = abduct outward; RS mirrors Y and Z automatically).
// All 6 dances loop seamlessly on their BPM grid and sync with audio/emote-music.ts.
import type { BoneName, FaceExpr, Pose } from "./kong-rig";

export type DanceId = 0 | 1 | 2 | 3 | 4 | 5;

export interface EmoteDef {
  id: DanceId;
  key: "floss" | "take-l" | "boogie" | "justice" | "kongbot" | "crown";
  name: string;
  tag: string;
  bpm: number;
  color: string;
  rarity: "uncommon" | "rare" | "epic" | "legendary";
  expr: FaceExpr;
}

export const EMOTES: readonly EmoteDef[] = [
  { id: 0, key: "floss", name: "THE FLOSS", tag: "CLASSIC SWING", bpm: 120, color: "#38d9ff", rarity: "rare", expr: "victory" },
  { id: 1, key: "take-l", name: "TAKE THE L", tag: "TAUNT HOP", bpm: 128, color: "#ff4d6d", rarity: "epic", expr: "victory" },
  { id: 2, key: "boogie", name: "BANANA BOOGIE", tag: "DEFAULT GROOVE", bpm: 108, color: "#ffd400", rarity: "uncommon", expr: "victory" },
  { id: 3, key: "justice", name: "JUNGLE JUSTICE", tag: "HYPER BOUNCE", bpm: 132, color: "#ff8a2a", rarity: "epic", expr: "wow" },
  { id: 4, key: "kongbot", name: "KONGBOT", tag: "ELECTRO POP", bpm: 124, color: "#b45cff", rarity: "rare", expr: "fierce" },
  { id: 5, key: "crown", name: "CROWN FLEX", tag: "ROYAL KONG", bpm: 116, color: "#46d160", rarity: "legendary", expr: "fierce" },
];

export const EMOTE_COUNT = EMOTES.length;
export const isDanceId = (v: unknown): v is DanceId => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < EMOTE_COUNT;

export interface DanceWriter {
  R(p: Pose, b: BoneName, x: number, y?: number, z?: number): void;
  RS(p: Pose, base: "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle", x: number, y?: number, z?: number): void;
  H(p: Pose, x: number, y: number, z: number): void;
  ROOT(p: Pose, pitch: number, roll?: number): void;
  stance(p: Pose, w: number): void;
}

const TAU = Math.PI * 2;
const PI = Math.PI;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => x * x * (3 - 2 * x);
/** snappy robot-style quantization: holds near integer steps then snaps quickly */
const snapWave = (u: number) => {
  const f = u - Math.floor(u);
  const s = smooth(clamp01((f - 0.12) / 0.28));
  return Math.floor(u) + s;
};

/** Apply Fortnite-style dance `id` (0..5) into `p` at weight `w` and elapsed time `t` (seconds). */
export function applyDance(id: number, p: Pose, w: number, t: number, wr: DanceWriter) {
  const def = EMOTES[id] ?? EMOTES[0];
  const beat = t * (def.bpm / 60); // quarter-note beats
  const { R, RS, H, ROOT, stance } = wr;

  switch (id) {
    // ------------------------------------------------------------------ 0: THE FLOSS (120 BPM)
    // Hips swing crisply left-right on every beat; both straight arms counter-swing together across the body
    // alternating IN FRONT of the hips and BEHIND the back (4-beat cycle: Front-R -> Back-L -> Front-R -> Front-L).
    case 0: {
      const ph = beat * PI;
      const sway = Math.sin(ph);           // +1 right, -1 left
      const bounce = Math.abs(Math.cos(ph));
      // 4-beat arm front/back pattern: beats 0..1 front, 1..2 back, 2..3 front, 3..4 front (classic Floss cadence)
      const bar = ((beat % 4) + 4) % 4;
      const behind = bar >= 1 && bar < 2 ? smooth(Math.sin(((bar - 1) * PI))) : 0;
      const armSide = -sway; // arms swing opposite to hips!
      const armFwd = behind > 0.01 ? -0.58 * behind : 0.44;
      stance(p, w * 0.45);
      // hips & waist sway dramatically
      H(p, 0.14 * sway * w, (-0.06 + 0.04 * bounce) * w, 0);
      R(p, "hips", 0, 0.22 * sway * w, -0.22 * sway * w);
      R(p, "spine", 0.08 * w, -0.26 * sway * w, 0.24 * sway * w);
      R(p, "chest", 0.04 * w, -0.18 * sway * w, 0.12 * sway * w);
      R(p, "head", -0.12 * w, 0.26 * sway * w, -0.16 * sway * w);
      // straight arms sweeping left-right together around the hips
      const zR = -0.35 - 0.72 * armSide; // when armSide > 0 (right), R abducts (-Z), L crosses front/back (-Z)
      const zL = 0.35 - 0.72 * armSide;  // when armSide < 0 (left), L abducts (+Z), R crosses (+Z)
      R(p, "shoulderR", (armFwd + 0.12 * Math.abs(armSide)) * w, -0.22 * armSide * w, zR * w);
      R(p, "shoulderL", (armFwd + 0.12 * Math.abs(armSide)) * w, -0.22 * armSide * w, zL * w);
      R(p, "elbowR", 0.22 * w, 0, 0.08 * w);
      R(p, "elbowL", 0.22 * w, 0, -0.08 * w);
      RS(p, "wrist", 0.15 * w);
      // knees planted & bouncing to the groove
      R(p, "hipR", (0.14 - 0.14 * sway) * w, 0, (-0.18 - 0.08 * sway) * w);
      R(p, "hipL", (0.14 + 0.14 * sway) * w, 0, (0.18 - 0.08 * sway) * w);
      R(p, "kneeR", (-0.34 - 0.22 * (1 - bounce)) * w);
      R(p, "kneeL", (-0.34 - 0.22 * (1 - bounce)) * w);
      RS(p, "ankle", 0.18 * w);
      return;
    }

    // ------------------------------------------------------------------ 1: TAKE THE L (128 BPM)
    // Iconic L-hand raised to forehead, left hand on hip, alternating bouncy high kicks left/right!
    case 1: {
      const ph = beat * PI;
      const step = Math.sin(ph);           // >0 = right leg kicks, <0 = left leg kicks
      const kickR = Math.max(0, step);
      const kickL = Math.max(0, -step);
      const hop = Math.abs(Math.sin(ph * 2));
      stance(p, w * 0.25);
      // bouncy hop & cheeky lean back
      H(p, -0.08 * step * w, (0.04 + 0.13 * hop) * w, 0);
      ROOT(p, -0.10 * w, 0.12 * step * w);
      R(p, "hips", 0, -0.28 * step * w, 0.14 * step * w);
      R(p, "spine", -0.08 * w, 0.22 * step * w, -0.18 * step * w);
      R(p, "chest", -0.08 * w, 0.14 * step * w, -0.08 * step * w);
      R(p, "head", -0.12 * w, -0.14 * step * w, 0.22 * Math.cos(ph) * w);
      // RIGHT ARM: raised high to forehead holding the "L" sign!
      R(p, "shoulderR", (2.15 + 0.10 * hop) * w, -0.25 * w, -0.35 * w);
      R(p, "elbowR", (1.45 + 0.08 * Math.sin(ph * 2)) * w, 0.45 * w, 0.45 * w);
      R(p, "wristR", -0.35 * w, 0.25 * w, -0.2 * w);
      // LEFT ARM: sassily planted on the hip
      R(p, "shoulderL", 0.18 * w, 0.35 * w, 0.85 * w);
      R(p, "elbowL", 1.55 * w, -0.45 * w, -0.55 * w);
      R(p, "wristL", -0.35 * w);
      // LEGS: high alternating side-front kicks!
      R(p, "hipR", (1.32 * kickR - 0.15 * kickL) * w, 0.22 * kickR * w, (-0.36 * kickR - 0.1 * kickL) * w);
      R(p, "kneeR", (-0.30 * kickR - 0.58 * kickL) * w);
      R(p, "ankleR", (0.35 * kickR + 0.22 * kickL) * w);
      R(p, "hipL", (1.32 * kickL - 0.15 * kickR) * w, -0.22 * kickL * w, (0.36 * kickL + 0.1 * kickR) * w);
      R(p, "kneeL", (-0.30 * kickL - 0.58 * kickR) * w);
      R(p, "ankleL", (0.35 * kickL + 0.22 * kickR) * w);
      return;
    }

    // ------------------------------------------------------------------ 2: BANANA BOOGIE / DEFAULT DANCE (108 BPM)
    // 8-beat iconic routine:
    //   Beats 0..1.5: Big chest CLAP + squat bounce
    //   Beats 1.5..4: Alternating arm-swings + funky hip step-out left/right
    //   Beats 4..6.5: Double shoulder-pop wave + groove walk in place
    //   Beats 6.5..8: Heroic double finger-point pose & spin-reset!
    case 2: {
      const bar = ((beat % 8) + 8) % 8;
      const bounce = Math.abs(Math.sin(beat * PI));
      stance(p, w * 0.35);
      if (bar < 1.5) {
        // PHASE 1: iconic double CLAP in front of the chest!
        const clap = Math.sin(clamp01(bar / 0.75) * PI);
        const clap2 = bar > 0.75 ? Math.sin(clamp01((bar - 0.75) / 0.75) * PI) : 0;
        const c = Math.max(clap, clap2);
        H(p, 0, (-0.12 + 0.08 * c) * w, 0);
        R(p, "spine", (0.14 - 0.08 * c) * w);
        R(p, "head", (-0.12 + 0.14 * c) * w, 0.18 * (bar > 0.75 ? -1 : 1) * w);
        RS(p, "shoulder", (1.15 + 0.15 * c) * w, 0.25 * c * w, (-0.65 + 1.05 * c) * w);
        RS(p, "elbow", (1.25 + 0.35 * c) * w, -0.4 * c * w, 0.2 * w);
        RS(p, "hip", 0.25 * w, 0, -0.18 * w); RS(p, "knee", (-0.52 - 0.18 * (1 - c)) * w); RS(p, "ankle", 0.25 * w);
      } else if (bar < 4.5) {
        // PHASE 2: funky side-step + alternating hip/arm pump!
        const u = (bar - 1.5) * PI;
        const s = Math.sin(u), c = Math.cos(u);
        H(p, 0.16 * s * w, (-0.08 + 0.08 * Math.abs(c)) * w, 0);
        R(p, "hips", 0, 0.32 * s * w, -0.18 * s * w);
        R(p, "spine", 0.06 * w, -0.22 * s * w, 0.16 * s * w);
        R(p, "chest", -0.04 * w, -0.18 * s * w, 0.1 * c * w);
        R(p, "head", -0.1 * w, 0.24 * s * w, -0.18 * s * w);
        R(p, "shoulderR", (1.1 + 0.8 * s) * w, 0, (-0.65 - 0.55 * c) * w);
        R(p, "shoulderL", (1.1 - 0.8 * s) * w, 0, (0.65 - 0.55 * c) * w);
        R(p, "elbowR", (1.15 - 0.35 * s) * w); R(p, "elbowL", (1.15 + 0.35 * s) * w);
        R(p, "hipR", (0.55 * Math.max(0, s) + 0.1) * w, 0, -0.25 * w);
        R(p, "hipL", (0.55 * Math.max(0, -s) + 0.1) * w, 0, 0.25 * w);
        R(p, "kneeR", (-0.35 - 0.55 * Math.max(0, s)) * w);
        R(p, "kneeL", (-0.35 - 0.55 * Math.max(0, -s)) * w);
      } else if (bar < 6.5) {
        // PHASE 3: groovy double shoulder wave + strut
        const u = (bar - 4.5) * PI * 1.5;
        const s = Math.sin(u), c = Math.cos(u);
        H(p, 0.1 * c * w, (-0.04 + 0.07 * bounce) * w, 0);
        R(p, "hips", 0, 0.28 * c * w, 0.14 * s * w);
        R(p, "spine", -0.05 * w, -0.25 * c * w, -0.18 * s * w);
        R(p, "chest", 0.05 * w, 0.2 * s * w, 0.15 * c * w);
        R(p, "head", -0.12 * w, -0.22 * c * w, 0.16 * s * w);
        R(p, "shoulderR", (0.4 + 0.9 * Math.max(0, s)) * w, 0, (-1.1 - 0.35 * c) * w);
        R(p, "shoulderL", (0.4 + 0.9 * Math.max(0, -s)) * w, 0, (1.1 - 0.35 * c) * w);
        RS(p, "elbow", (1.5 + 0.3 * bounce) * w);
        R(p, "hipR", (0.35 * s) * w, 0, -0.22 * w); R(p, "hipL", (-0.35 * s) * w, 0, 0.22 * w);
        RS(p, "knee", (-0.42 - 0.2 * bounce) * w);
      } else {
        // PHASE 4: iconic double-point slide finish!
        const k = smooth(clamp01((bar - 6.5) / 0.45));
        const hold = 1 - smooth(clamp01((bar - 7.6) / 0.4));
        const a = k * hold;
        H(p, 0.18 * a * w, -0.12 * a * w, 0);
        ROOT(p, -0.14 * a * w, -0.12 * a * w);
        R(p, "hips", 0, -0.35 * a * w);
        R(p, "spine", 0, 0.38 * a * w, -0.16 * a * w);
        R(p, "chest", 0, 0.28 * a * w);
        R(p, "head", -0.18 * a * w, -0.35 * a * w, 0.14 * a * w);
        // both arms point diagonally up-right like a disco star!
        R(p, "shoulderR", 2.05 * a * w, -0.35 * a * w, -0.85 * a * w);
        R(p, "elbowR", 0.18 * a * w);
        R(p, "shoulderL", 1.35 * a * w, 0.45 * a * w, -0.65 * a * w);
        R(p, "elbowL", 0.32 * a * w);
        R(p, "hipR", 0.45 * a * w, 0, -0.35 * a * w); R(p, "kneeR", -0.75 * a * w);
        R(p, "hipL", -0.15 * a * w, 0, 0.35 * a * w); R(p, "kneeL", -0.35 * a * w);
      }
      return;
    }

    // ------------------------------------------------------------------ 3: JUNGLE JUSTICE / ORANGE JUSTICE (132 BPM)
    // High-energy deep knee pumps + leaning way back + rapid clapping elbows & alternating overhead arm swings!
    case 3: {
      const ph = beat * PI;
      const s = Math.sin(ph), c = Math.cos(ph);
      const pump = Math.sin(ph * 2); // double-time bounce!
      const alt = Math.sin(ph * 0.5); // switches overhead/low arms every 2 beats
      stance(p, w * 0.2);
      // deep wide squat bounce & dramatic lean-back
      H(p, 0.12 * s * w, (-0.18 + 0.14 * Math.abs(c)) * w, 0.05 * w);
      ROOT(p, (-0.18 - 0.08 * pump) * w, 0.12 * s * w);
      R(p, "hips", 0, 0.25 * s * w, -0.16 * s * w);
      R(p, "spine", (-0.16 + 0.14 * pump) * w, -0.2 * s * w, 0.14 * s * w);
      R(p, "chest", (-0.12 + 0.16 * pump) * w, 0.16 * c * w);
      R(p, "head", (0.14 - 0.18 * pump) * w, 0.24 * s * w, -0.22 * c * w);
      // wide explosive flapping arms: snapping together in front then flinging wide overhead!
      const open = 0.5 + 0.5 * c;
      const highR = alt >= 0 ? 1 : 0.35, highL = alt < 0 ? 1 : 0.35;
      R(p, "shoulderR", ((0.65 + 1.55 * open * highR) + 0.3 * pump) * w, (0.3 - 0.5 * open) * w, (-0.25 - 1.25 * open) * w);
      R(p, "shoulderL", ((0.65 + 1.55 * open * highL) + 0.3 * pump) * w, (-0.3 + 0.5 * open) * w, (0.25 + 1.25 * open) * w);
      R(p, "elbowR", (1.65 - 0.95 * open) * w, 0, 0.3 * w);
      R(p, "elbowL", (1.65 - 0.95 * open) * w, 0, -0.3 * w);
      // wide-stance alternating knee drops!
      R(p, "hipR", (0.55 + 0.38 * Math.max(0, s)) * w, 0, (-0.42 - 0.12 * open) * w);
      R(p, "hipL", (0.55 + 0.38 * Math.max(0, -s)) * w, 0, (0.42 + 0.12 * open) * w);
      R(p, "kneeR", (-0.95 - 0.45 * Math.max(0, -s)) * w);
      R(p, "kneeL", (-0.95 - 0.45 * Math.max(0, s)) * w);
      RS(p, "ankle", 0.35 * w);
      return;
    }

    // ------------------------------------------------------------------ 4: KONGBOT / ELECTRO POP-LOCK (124 BPM)
    // Sharp mechanical 90-degree robot snaps + alternating power-dab + chest isolation!
    case 4: {
      const q = snapWave(beat); // quantized snappy beats!
      const ph = q * PI;
      const s = Math.sin(ph), c = Math.cos(ph);
      const bar = ((q % 4) + 4) % 4;
      const dab = bar >= 3 ? smooth(clamp01((bar - 3) * 2.5)) : 0;
      stance(p, w * 0.25);
      H(p, 0.08 * s * w, (-0.08 + 0.06 * Math.abs(c)) * w, 0);
      R(p, "hips", 0, 0.24 * c * w, -0.1 * s * w);
      R(p, "spine", (0.06 + 0.12 * dab) * w, -0.32 * c * w, 0.15 * s * w);
      R(p, "chest", 0, 0.25 * s * w);
      // snappy robotic head ticks, tucking into elbow on the power dab!
      R(p, "head", (0.35 * dab - 0.08) * w, (0.42 * s - 0.55 * dab) * w, (0.28 * c - 0.25 * dab) * w);
      if (dab > 0.05) {
        // POWER DAB on beat 4!
        R(p, "shoulderR", (1.85 * dab) * w, -0.25 * dab * w, (-1.45 * dab) * w);
        R(p, "elbowR", 0.12 * w);
        R(p, "shoulderL", (1.25 * dab) * w, 0.65 * dab * w, (-0.65 * dab) * w);
        R(p, "elbowL", (1.85 * dab) * w, -0.5 * dab * w);
      } else {
        // crisp 90-degree robot arms alternating up/down & side/front
        R(p, "shoulderR", (0.95 + 0.85 * s) * w, 0, (-0.75 - 0.55 * c) * w);
        R(p, "elbowR", (1.55 - 0.25 * s) * w, 0, 0.15 * w);
        R(p, "shoulderL", (0.95 - 0.85 * s) * w, 0, (0.75 - 0.55 * c) * w);
        R(p, "elbowL", (1.55 + 0.25 * s) * w, 0, -0.15 * w);
      }
      RS(p, "wrist", 0.4 * c * w);
      // robotic alternating knee lock
      R(p, "hipR", (0.28 * Math.max(0, s) + 0.1) * w, 0, -0.22 * w);
      R(p, "hipL", (0.28 * Math.max(0, -s) + 0.1) * w, 0, 0.22 * w);
      R(p, "kneeR", (-0.55 * Math.max(0, s) - 0.18) * w);
      R(p, "kneeL", (-0.55 * Math.max(0, -s) - 0.18) * w);
      return;
    }

    // ------------------------------------------------------------------ 5: CROWN FLEX / ROYAL KONG (116 BPM)
    // True Gorilla celebration: rapid double chest-drum beats -> massive double-bicep roar -> sky-point bounce!
    case 5:
    default: {
      const bar = ((beat % 8) + 8) % 8;
      const bounce = Math.abs(Math.sin(beat * PI));
      stance(p, w * 0.3);
      if (bar < 3.5) {
        // GORILLA CHEST BEAT (rapid alternating fists pounding the chest!)
        const drum = Math.sin(beat * TAU * 1.5);
        const rHit = Math.max(0, drum), lHit = Math.max(0, -drum);
        H(p, 0, (-0.12 + 0.06 * bounce) * w, 0);
        R(p, "spine", -0.14 * w, 0.1 * drum * w);
        R(p, "chest", (-0.14 + 0.08 * Math.abs(drum)) * w, 0.12 * drum * w);
        R(p, "head", -0.28 * w, 0.14 * Math.sin(beat * PI) * w);
        R(p, "shoulderR", (0.85 + 0.45 * rHit) * w, (0.2 + 0.45 * rHit) * w, (-0.85 + 0.85 * rHit) * w);
        R(p, "elbowR", (1.45 + 0.65 * rHit) * w, -0.35 * rHit * w);
        R(p, "shoulderL", (0.85 + 0.45 * lHit) * w, (-0.2 - 0.45 * lHit) * w, (0.85 - 0.85 * lHit) * w);
        R(p, "elbowL", (1.45 + 0.65 * lHit) * w, 0.35 * lHit * w);
        RS(p, "hip", 0.26 * w, 0, -0.26 * w); RS(p, "knee", (-0.58 - 0.16 * bounce) * w); RS(p, "ankle", 0.25 * w);
      } else if (bar < 6.0) {
        // MASSIVE DOUBLE-BICEP FLEX + swagger side-to-side twist!
        const sw = Math.sin((bar - 3.5) * PI);
        H(p, 0.06 * sw * w, (-0.06 + 0.07 * bounce) * w, 0);
        ROOT(p, -0.12 * w, 0.06 * sw * w);
        R(p, "hips", 0, 0.24 * sw * w);
        R(p, "spine", -0.14 * w, -0.18 * sw * w);
        R(p, "chest", -0.18 * w, 0.22 * sw * w);
        R(p, "head", -0.22 * w, 0.35 * sw * w, 0.1 * sw * w);
        RS(p, "shoulder", (0.35 + 0.15 * bounce) * w, -0.2 * w, (-1.52 - 0.1 * bounce) * w);
        RS(p, "elbow", (2.15 + 0.15 * bounce) * w, 0, 0.25 * w);
        RS(p, "wrist", 0.45 * w);
        RS(p, "hip", 0.16 * w, 0, -0.24 * w); RS(p, "knee", (-0.36 - 0.12 * bounce) * w);
      } else {
        // VICTORY SKY-REACH & HOP!
        const hop = Math.sin(((bar - 6.0) / 2.0) * PI);
        H(p, 0, (0.16 * hop) * w, 0);
        R(p, "spine", -0.2 * hop * w);
        R(p, "head", -0.35 * hop * w, 0.15 * Math.sin(beat * PI) * w);
        RS(p, "shoulder", (2.55 + 0.2 * Math.sin(beat * TAU)) * w, 0, -0.45 * w);
        RS(p, "elbow", 0.2 * w);
        R(p, "hipR", (0.45 * hop) * w, 0, -0.22 * w); R(p, "kneeR", (-0.85 * hop - 0.15) * w);
        R(p, "hipL", (0.25 * hop) * w, 0, 0.22 * w); R(p, "kneeL", (-0.55 * hop - 0.15) * w);
      }
      return;
    }
  }
}
