// Desert Cacti & Succulents for Sunburst Canyon — sculpted 3D fluted Saguaros, Organ Pipe clusters,
// Prickly Pear (Nopal) paddles with magenta fruits, Golden Barrel clusters, and Desert Agave rosettes.
//
// Trunk silhouettes for tall collidable cacti follow the SHARED shape in `shared/world/veg-scatter.ts` (`cactusShape`),
// so server/client trunk colliders align 1:1 with the rendered fluted columns.
// Built on the exact same instanced LOD0 / LOD1 + Gaussian Splat / Hemi-Octahedral Impostor pipeline as Kong Island's
// trees & palms: thousands of cacti across the 2400 m desert render at 60 FPS with zero popping.
import * as THREE from "three";
import { mulberry32 } from "../../../../../shared/world/noise";
import { cactusShape, type CactusArm } from "../../../../../shared/world/veg-scatter";
import { curveFrames, tube, finalize, mergeAll } from "../geo";
import { foliageMaterial, type FoliageMaterials } from "../foliage-material";
import { tex } from "../paint";
import type { Species, SpeciesPart } from "./types";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ============================================================================ PROCEDURAL PBR CACTUS TEXTURES

interface CactusSkin {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

let skinCache: CactusSkin | null = null;
let padSkinCache: CactusSkin | null = null;
let bloomTexCache: THREE.CanvasTexture | null = null;

function makeNormalFromHeight(H: Float32Array, W: number, Ht: number, strength: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = Ht;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, Ht);
  const d = img.data;
  for (let y = 0; y < Ht; y++) {
    const ym = (y - 1 + Ht) % Ht;
    const yp = (y + 1) % Ht;
    for (let x = 0; x < W; x++) {
      const xm = (x - 1 + W) % W;
      const xp = (x + 1) % W;
      const dx = (H[y * W + xp] - H[y * W + xm]) * strength;
      const dy = (H[yp * W + x] - H[ym * W + x]) * strength;
      let nx = -dx, ny = -dy, nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const k = (y * W + x) * 4;
      d[k] = Math.round((nx * 0.5 + 0.5) * 255);
      d[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[k + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { srgb: false, repeat: true, aniso: 8 });
}

/** Ribbed saguaro skin: 12 vertical pleats with sunlit waxy jade ridges, shaded grooves, horizontal growth mottling,
 *  and pale-cream spine areoles dotted along every rib crest. */
function cactusSkin(): CactusSkin {
  if (skinCache) return skinCache;
  const W = 512, H = 512, RIBS = 12;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const hbuf = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    const v = y / H;
    // Gentle horizontal organic growth bands
    const band = Math.sin(v * Math.PI * 10) * 0.04 + Math.sin(v * Math.PI * 26 + 1.4) * 0.025;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const ribPhase = Math.cos(u * Math.PI * 2 * RIBS);
      // Sharper ridge crests & smooth rounded valleys (authentic pleated saguaro profile)
      const ridge = Math.pow(ribPhase * 0.5 + 0.5, 0.78);
      const fine = Math.sin(u * 97 + v * 53) * Math.cos(v * 83 - u * 41) * 0.025;
      const hVal = ridge * 0.82 + band + fine;
      hbuf[y * W + x] = hVal;

      // Rich stylized desert jade-green: sunlit waxy sage on crests, deep olive-teal in pleats
      const r = clamp01(0.18 + ridge * 0.27 + band * 0.6 + fine);
      const g = clamp01(0.32 + ridge * 0.36 + band * 0.8 + fine);
      const b = clamp01(0.17 + ridge * 0.16 + band * 0.35 + fine * 0.6);
      const k = (y * W + x) * 4;
      d[k] = Math.round(r * 255);
      d[k + 1] = Math.round(g * 255);
      d[k + 2] = Math.round(b * 255);
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Paint crisp pale-ivory areoles & starburst spine needles neatly along every rib crest
  const rnd = mulberry32(9104);
  const rows = 16;
  for (let rib = 0; rib < RIBS; rib++) {
    const cx = (rib / RIBS) * W;
    for (let row = 0; row < rows; row++) {
      const cy = ((row + (rib & 1) * 0.5) / rows) * H;
      const jx = (rnd() - 0.5) * 1.4;
      const jy = (rnd() - 0.5) * 3.0;
      const ax = (cx + jx + W) % W;
      const ay = (cy + jy + H) % H;
      // Radiating pale spines
      ctx.strokeStyle = "rgba(242, 232, 198, 0.72)";
      ctx.lineWidth = 1.1;
      for (let s = 0; s < 5; s++) {
        const a = (s / 5) * Math.PI * 2 + rnd() * 0.45;
        const len = 4.5 + rnd() * 4.2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(a) * len, ay + Math.sin(a) * len);
        ctx.stroke();
      }
      // Fuzzy felt areole cushion dot
      ctx.fillStyle = "rgba(235, 224, 186, 0.92)";
      ctx.beginPath();
      ctx.arc(ax, ay, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(110, 96, 68, 0.55)";
      ctx.beginPath();
      ctx.arc(ax, ay, 0.9, 0, Math.PI * 2);
      ctx.fill();

      // Stamp areole bump into height buffer for normal map pop
      const ix = Math.round(ax), iy = Math.round(ay);
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const dist = Math.hypot(dx, dy);
          if (dist < 3.2) {
            const xx = (ix + dx + W) % W;
            const yy = (iy + dy + H) % H;
            hbuf[yy * W + xx] += (1 - dist / 3.2) * 0.42;
          }
        }
      }
    }
  }

  skinCache = {
    map: tex(c, { srgb: true, repeat: true, aniso: 8 }),
    normalMap: makeNormalFromHeight(hbuf, W, H, 2.4),
  };
  return skinCache;
}

/** Succulent paddle/agave skin: smooth waxy blue-sage desert green with staggered spine areoles. */
function padSkin(): CactusSkin {
  if (padSkinCache) return padSkinCache;
  const W = 256, H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const hbuf = new Float32Array(W * H);

  const g = ctx.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, "#386b3a");
  g.addColorStop(0.5, "#4f8d48");
  g.addColorStop(1, "#6eb059");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Subtle waxy mottling
  const rnd = mulberry32(3371);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 24;
    ctx.fillStyle = rnd() > 0.5 ? "rgba(148, 198, 112, 0.08)" : "rgba(28, 66, 36, 0.08)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Diagonal lattice of nopal areoles & fine pale spines
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const ax = ((col + (row & 1) * 0.5) / 7) * W + (rnd() - 0.5) * 4;
      const ay = ((row + 0.5) / 7) * H + (rnd() - 0.5) * 4;
      ctx.strokeStyle = "rgba(244, 232, 184, 0.78)";
      ctx.lineWidth = 1.0;
      for (let s = 0; s < 4; s++) {
        const a = (s / 4) * Math.PI * 2 + rnd() * 0.6;
        const len = 4 + rnd() * 4;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(a) * len, ay + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.fillStyle = "#c8b37b";
      ctx.beginPath();
      ctx.arc(ax, ay, 2.2, 0, Math.PI * 2);
      ctx.fill();
      const ix = Math.round(ax), iy = Math.round(ay);
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const dist = Math.hypot(dx, dy);
          if (dist < 3) hbuf[((iy + dy + H) % H) * W + ((ix + dx + W) % W)] += (1 - dist / 3) * 0.55;
        }
      }
    }
  }

  padSkinCache = {
    map: tex(c, { srgb: true, repeat: true, aniso: 4 }),
    normalMap: makeNormalFromHeight(hbuf, W, H, 1.8),
  };
  return padSkinCache;
}

/** Vibrant waxy desert blossom & prickly-pear tuna texture (vertex color tints cream/gold/coral/magenta). */
function bloomTex(): THREE.CanvasTexture {
  if (bloomTexCache) return bloomTexCache;
  const W = 128, H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(W * 0.5, H * 0.5, 6, W * 0.5, H * 0.5, W * 0.52);
  g.addColorStop(0, "#fff2a8");
  g.addColorStop(0.45, "#ffffff");
  g.addColorStop(1, "#d8c8b8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  bloomTexCache = tex(c, { srgb: true, repeat: false, aniso: 4 });
  return bloomTexCache;
}

// ============================================================================ SHARED CACTUS MATERIALS

interface CactusMats {
  saguaro: FoliageMaterials;
  succulent: FoliageMaterials;
  bloom: FoliageMaterials;
}
let cachedMats: CactusMats | null = null;

function materials(): CactusMats {
  if (cachedMats) return cachedMats;
  const sk = cactusSkin();
  const pd = padSkin();
  const bl = bloomTex();
  cachedMats = {
    // Opaque matte-waxy desert cactus column (no translucency/alphaTest → early-Z + zero grazing specular spike)
    saguaro: foliageMaterial({
      map: sk.map,
      normalMap: sk.normalMap,
      normalScale: 1.0,
      color: new THREE.Color(1.04, 1.07, 0.94),
      roughness: 0.78,
      specK: 0.35,
      height: 8.5,
      sway: 0.04,
      flutter: 0,
      envMapIntensity: 0.42,
      fill: 0.24,
      wrap: 0.32,
      shadowLift: 0.36,
      doubleSide: false,
    }),
    // Opaque plump waxy succulent paddles / barrel globes / agave rosettes
    succulent: foliageMaterial({
      map: pd.map,
      normalMap: pd.normalMap,
      normalScale: 0.85,
      color: new THREE.Color(1.03, 1.06, 0.96),
      roughness: 0.72,
      specK: 0.38,
      height: 2.2,
      sway: 0.03,
      flutter: 0,
      envMapIntensity: 0.44,
      fill: 0.26,
      wrap: 0.36,
      shadowLift: 0.40,
      doubleSide: false,
    }),
    // Vibrant opaque desert blossoms & crimson prickly-pear fruits (tunas)
    bloom: foliageMaterial({
      map: bl,
      color: 0xffffff,
      roughness: 0.54,
      specK: 0.4,
      height: 8.5,
      sway: 0.04,
      flutter: 0,
      envMapIntensity: 0.48,
      fill: 0.42,
      wrap: 0.48,
      shadowLift: 0.55,
      doubleSide: false,
    }),
  };
  return cachedMats;
}

// ============================================================================ SCULPTED FLUTED COLUMN HELPER

/** Builds a fluted cactus stem or curving elbow arm with rounded dome tip, pinched base collar (for arms)
 *  or corked woody desert root base (for main trunks), and per-rib crevice AO baked into vertex color. */
function buildFlutedColumn(
  pts: THREE.Vector3[],
  opts: {
    baseR: number;
    tipR: number;
    ribs: number;
    radial: number;
    segs: number;
    isArm?: boolean;
    bend?: number;
    phase?: number;
    tone?: [number, number, number];
  },
): THREE.BufferGeometry {
  const frames = curveFrames(pts, opts.segs, 0.5);
  const ribs = opts.ribs;
  const ribAmp = opts.radial >= 20 ? 0.13 : 0.10;
  const tone = opts.tone ?? [1, 1, 1];

  return tube(frames, {
    radial: opts.radial,
    uRepeat: 1,
    v: (_t, d) => d * 0.52,
    radius: (t, ang) => {
      // Base taper / flare
      let r: number;
      if (opts.isArm) {
        // Pinched organic joint where the arm sprouts from the trunk, swelling cleanly along the upright shaft
        const pinch = 0.58 + 0.42 * smooth(0.0, 0.22, t);
        const swell = 1.0 + 0.12 * Math.sin(smooth(0.18, 0.88, t) * Math.PI);
        r = (opts.baseR * (1 - t) + opts.tipR * t) * pinch * swell;
      } else {
        // Main column: slight woody root collar flare near y=0, graceful barrel swell mid-height
        const rootFlare = 1.0 + 0.14 * Math.pow(1 - smooth(0.0, 0.14, t), 2);
        const swell = 1.0 + 0.10 * Math.sin(smooth(0.08, 0.88, t) * Math.PI);
        r = (opts.baseR * (1 - t) + opts.tipR * t) * rootFlare * swell;
      }
      // Smooth hemispherical dome cap over the last 11 % of arc length (no flat cylinder tops!)
      if (t > 0.89) {
        const u = clamp01((t - 0.89) / 0.11);
        const dome = Math.sqrt(Math.max(0.008, 1 - u * u));
        r *= dome;
      }
      // True 3D geometric flutes fading gently into the apex dimple
      const fluteFade = 1 - smooth(0.92, 1.0, t);
      const flute = 1 + ribAmp * fluteFade * Math.cos(ang * ribs);
      return r * flute;
    },
    color: (t, ang) => {
      const flute = Math.cos(ang * ribs);
      // Strong crevice AO in each vertical pleat so ribs pop crisply at every distance & in impostors
      const ribShade = 0.80 + 0.23 * (flute * 0.5 + 0.5);
      // Slight dusty woody corking near ground root collar on main stems
      const cork = opts.isArm ? 0 : (1 - smooth(0.03, 0.16, t));
      const tipSun = 1.0 + 0.12 * smooth(0.78, 1.0, t);
      const cr = (tone[0] * (1 - cork * 0.12) + cork * 0.20) * ribShade * tipSun;
      const cg = (tone[1] * (1 - cork * 0.22) + cork * 0.11) * ribShade * tipSun;
      const cb = (tone[2] * (1 - cork * 0.28) + cork * 0.06) * ribShade * tipSun;
      return [cr, cg, cb];
    },
    bend: (t) => (opts.bend ?? 0.35) * t * t,
    phase: opts.phase ?? 0,
    capTop: true,
  });
}

/** Builds a smooth sweeping U-curved elbow arm starting slightly inside the main stem at `arm.y0`. */
function armCurvePoints(stemPts: THREE.Vector3[], arm: CactusArm): THREE.Vector3[] {
  // Interpolate trunk center at arm.y0
  let ax = 0, az = 0;
  for (let i = 1; i < stemPts.length; i++) {
    const a = stemPts[i - 1], b = stemPts[i];
    if (arm.y0 >= a.y && arm.y0 <= b.y) {
      const f = (arm.y0 - a.y) / Math.max(1e-5, b.y - a.y);
      ax = a.x + (b.x - a.x) * f;
      az = a.z + (b.z - a.z) * f;
      break;
    }
  }
  const dx = Math.cos(arm.ang), dz = -Math.sin(arm.ang);
  const reach = arm.reach;
  const dip = arm.dip;
  const rise = arm.rise;
  return [
    new THREE.Vector3(ax + dx * 0.08, arm.y0, az + dz * 0.08),
    new THREE.Vector3(ax + dx * (reach * 0.45), arm.y0 - dip * 0.55, az + dz * (reach * 0.45)),
    new THREE.Vector3(ax + dx * (reach * 0.85), arm.y0 - dip * 0.35, az + dz * (reach * 0.85)),
    new THREE.Vector3(ax + dx * reach, arm.y0 + rise * 0.16, az + dz * reach),
    new THREE.Vector3(ax + dx * (reach * 1.03), arm.y0 + rise * 0.56, az + dz * (reach * 1.03)),
    new THREE.Vector3(ax + dx * (reach * 0.99), arm.y0 + rise, az + dz * (reach * 0.99)),
  ];
}

/** Small sculpted cluster of desert cactus crown blossoms at `tip` (warm creamy-gold or coral-magenta petals). */
function crownBlossoms(tip: THREE.Vector3, r: number, count: number, color: [number, number, number], rnd: () => number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.45;
    const rad = r * (0.24 + rnd() * 0.26);
    const sz = 0.075 + rnd() * 0.038;
    const g = new THREE.DodecahedronGeometry(sz, 0);
    g.scale(1.0, 0.78, 1.0);
    g.rotateY(a);
    g.translate(tip.x + Math.cos(a) * rad, tip.y - 0.06 + rnd() * 0.04, tip.z - Math.sin(a) * rad);
    const bright = 0.90 + rnd() * 0.14;
    out.push(finalize(g, { color: [color[0] * bright, color[1] * bright, color[2] * bright], bend: 0.32, phase: rnd() * 6.28 }));
  }
  return out;
}

/** Sculpted ribbed golden barrel cactus globe (used both solo in clusters and as companion at hero saguaro foot). */
function buildBarrelGlobe(cx: number, cy: number, cz: number, rx: number, ry: number, segs: number, ribs: number): { body: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  const g = new THREE.SphereGeometry(1, segs, Math.max(8, Math.round(segs * 0.6)));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const eq = Math.sqrt(Math.max(0, 1 - y * y));
    // Deep barrel accordion pleats around the equator, tapering smoothly at the top & bottom
    const flute = Math.cos(ang * ribs);
    const rMod = 1 + 0.15 * eq * flute;
    // Slightly flattened pumpkin-like desert barrel silhouette + sunken root
    const py = y * ry + cy + ry * 0.78;
    pos.setXYZ(i, cx + x * rx * rMod, py, cz + z * rx * rMod);
    const ribShade = 0.76 + 0.28 * (flute * 0.5 + 0.5);
    const topGold = smooth(0.45, 1.0, y);
    col[i * 3] = (0.88 + topGold * 0.35) * ribShade;
    col[i * 3 + 1] = (1.02 + topGold * 0.16) * ribShade;
    col[i * 3 + 2] = (0.76 - topGold * 0.22) * ribShade;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const body = finalize(g, { bend: 0.04 });

  // Fuzzy golden-yellow woolly spine crown sitting in the apex dimple
  const cr = new THREE.CylinderGeometry(rx * 0.34, rx * 0.22, ry * 0.16, Math.max(8, segs >> 1));
  cr.translate(cx, cy + ry * 1.73, cz);
  const crown = finalize(cr, { color: [1.18, 0.96, 0.34], bend: 0.05 });
  return { body, crown };
}

// ============================================================================ TALL COLLIDABLE CACTUS SPECIES (5 VARIANTS)

export function buildCactus(variant: number): Species {
  const v = ((variant % 5) + 5) % 5;
  const m = materials();
  const shape = cactusShape(v);
  const rnd = mulberry32(4100 + v * 37);

  const buildTier = (hi: boolean): { body: THREE.BufferGeometry; blooms: THREE.BufferGeometry } => {
    const bodyParts: THREE.BufferGeometry[] = [];
    const bloomParts: THREE.BufferGeometry[] = [];
    const radial = hi ? 24 : 12;
    const ribs = hi ? 12 : 6;
    const mainSegs = hi ? 16 : 9;
    const armSegs = hi ? 12 : 7;

    // Slight variant tone differences (warm Sonoran sage vs rich emerald jade)
    const tone: [number, number, number] =
      v === 1 ? [0.94, 1.04, 0.90]
      : v === 3 ? [0.88, 1.02, 0.96]
      : v === 4 ? [1.02, 1.04, 0.86]
      : [0.98, 1.06, 0.92];

    const bloomColor: [number, number, number] =
      v === 3 ? [1.15, 0.56, 0.44] // Organ pipe warm coral-pink blossoms
      : v === 1 ? [1.16, 0.96, 0.58] // Golden-cream blossoms
      : [1.15, 1.12, 0.88]; // Classic creamy-white saguaro flowers

    if (v === 3) {
      // Variant 3: Organ Pipe Candelabra — 5 graceful curving fluted stems bursting from one base!
      for (let s = 0; s < shape.stems.length; s++) {
        const st = shape.stems[s];
        const pts = st.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
        bodyParts.push(buildFlutedColumn(pts, {
          baseR: st.r0, tipR: st.r0 * 0.84, ribs: hi ? 10 : 6, radial: hi ? 20 : 10, segs: hi ? 13 : 7,
          bend: 0.4, phase: s * 1.1, tone,
        }));
        if (hi) {
          const tip = pts[pts.length - 1];
          bloomParts.push(...crownBlossoms(tip, st.r0 * 0.85, 3, bloomColor, rnd));
        }
      }
    } else {
      // Main sculpted saguaro column
      const mainPts = shape.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
      bodyParts.push(buildFlutedColumn(mainPts, {
        baseR: shape.r0, tipR: shape.r0 * 0.82, ribs, radial, segs: mainSegs, bend: 0.32, phase: v * 0.9, tone,
      }));
      if (hi) {
        bloomParts.push(...crownBlossoms(mainPts[mainPts.length - 1], shape.r0 * 0.85, 5, bloomColor, rnd));
      }

      // Sweeping U-curved elbow arms
      for (let a = 0; a < shape.arms.length; a++) {
        const arm = shape.arms[a];
        const aPts = armCurvePoints(mainPts, arm);
        bodyParts.push(buildFlutedColumn(aPts, {
          baseR: arm.r, tipR: arm.r * 0.84, ribs: hi ? 10 : 6, radial: hi ? 20 : 10, segs: armSegs,
          isArm: true, bend: 0.45, phase: a * 1.7 + v, tone,
        }));
        if (hi && a < 3) {
          bloomParts.push(...crownBlossoms(aPts[aPts.length - 1], arm.r * 0.8, 3, bloomColor, rnd));
        }
      }

      // Extra organic desert companion detail:
      // v2 gets a sturdy baby pup shoot at its base; v4 gets a golden barrel nestled by its roots!
      if (v === 2) {
        const pupPts = [
          new THREE.Vector3(0.45, -0.3, 0.22),
          new THREE.Vector3(0.68, 0.65, 0.34),
          new THREE.Vector3(0.76, 1.55, 0.38),
          new THREE.Vector3(0.78, 2.25, 0.39),
        ];
        bodyParts.push(buildFlutedColumn(pupPts, {
          baseR: 0.24, tipR: 0.20, ribs: hi ? 10 : 6, radial: hi ? 16 : 8, segs: hi ? 8 : 5,
          bend: 0.2, phase: 2.3, tone,
        }));
      } else if (v === 4) {
        const bg = buildBarrelGlobe(0.86, -0.05, 0.48, 0.48, 0.44, hi ? 20 : 10, hi ? 12 : 6);
        bodyParts.push(bg.body);
        bloomParts.push(bg.crown);
      }
    }

    return {
      body: mergeAll(bodyParts),
      blooms: bloomParts.length ? mergeAll(bloomParts) : new THREE.BufferGeometry(),
    };
  };

  const t0 = buildTier(true);
  const t1 = buildTier(false);
  const parts: SpeciesPart[] = [
    { name: "saguaro", mats: m.saguaro, lod0: t0.body, lod1: t1.body, shadow: true },
  ];
  if (t0.blooms.attributes.position && t0.blooms.attributes.position.count > 0) {
    // Keep a small blossom cap on LOD1 too (or minimal triangle) so LOD0/LOD1 part indices stay identical
    const b1 = t1.blooms.attributes.position && t1.blooms.attributes.position.count > 0 ? t1.blooms : t0.blooms;
    parts.push({ name: "bloom", mats: m.bloom, lod0: t0.blooms, lod1: b1, shadow: false });
  }

  const h = shape.h;
  const radius = Math.max(1.8, shape.reach + 0.6);
  const center = new THREE.Vector3(0, h * 0.48, 0);
  const boundR = Math.hypot(radius, h * 0.54);
  return {
    id: `cactus:${v}`,
    kind: "cactus",
    variant: v,
    parts,
    height: h,
    radius,
    center,
    boundR,
    lod0: 55,
    lod1: 160,
    impostor: true,
    shadow: true,
  };
}

// ============================================================================ LOW DESERT SUCCULENTS (3 VARIANTS)

/** Builds one sculpted plump obovate Nopal (Prickly Pear) cactus paddle pivoted at its base neck. */
function makeNopalPaddle(w: number, h: number, thick: number, segs: number, tone: [number, number, number]): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.5, segs, Math.max(6, Math.round(segs * 0.7)));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // y in [-0.5, 0.5] -> u in [0, 1]; obovate paddle is narrower at the neck (u=0) and broad toward u=0.68
    const u = y + 0.5;
    const widthCurve = 0.48 + 0.68 * Math.sin(Math.pow(u, 0.72) * Math.PI * 0.85);
    const thickCurve = 1.0 - 0.35 * smooth(0.65, 1.0, u);
    pos.setXYZ(i, x * w * widthCurve, u * h, z * thick * thickCurve);
    const edgeRim = 0.88 + 0.20 * smooth(0.25, 0.95, u);
    col[i * 3] = tone[0] * edgeRim;
    col[i * 3 + 1] = tone[1] * edgeRim;
    col[i * 3 + 2] = tone[2] * edgeRim;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return finalize(g, { bend: (_i, p) => 0.12 * clamp01(p.y / h) });
}

export function buildPricklyPear(variant: number): Species {
  const v = ((variant % 3) + 3) % 3;
  const m = materials();
  const rnd = mulberry32(6200 + v * 53);

  const buildTier = (hi: boolean): { body: THREE.BufferGeometry; blooms: THREE.BufferGeometry } => {
    const bodyParts: THREE.BufferGeometry[] = [];
    const bloomParts: THREE.BufferGeometry[] = [];

    if (v === 0) {
      // Variant 0: Sculpted Nopal / Prickly Pear — branching tiers of plump fleshy paddles + magenta tunas & yellow blooms!
      const segs = hi ? 12 : 7;
      const baseCount = 4;
      for (let b = 0; b < baseCount; b++) {
        const ba = (b / baseCount) * Math.PI * 2 + (rnd() - 0.5) * 0.45;
        const bw = 0.52 + rnd() * 0.14;
        const bh = 0.70 + rnd() * 0.16;
        const bTilt = 0.25 + rnd() * 0.22;
        const bx = Math.cos(ba) * 0.24, bz = -Math.sin(ba) * 0.24;
        const p1 = makeNopalPaddle(bw, bh, 0.17, segs, [0.84, 0.96, 0.80]);
        const m1 = new THREE.Matrix4().compose(
          new THREE.Vector3(bx, -0.08, bz),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(bTilt, ba + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.2, "YXZ")),
          new THREE.Vector3(1, 1, 1),
        );
        p1.applyMatrix4(m1);
        bodyParts.push(p1);

        // Compute top rim of tier-1 paddle in local space to sprout 2-3 tier-2 paddles
        const top1 = new THREE.Vector3(0, bh * 0.88, 0).applyMatrix4(m1);
        const kids = hi ? 2 + (b % 2) : 2;
        for (let k = 0; k < kids; k++) {
          const side = kids === 1 ? 0 : (k / (kids - 1) - 0.5) * 1.1;
          const kw = 0.44 + rnd() * 0.12;
          const kh = 0.62 + rnd() * 0.14;
          const p2 = makeNopalPaddle(kw, kh, 0.14, segs, [0.96, 1.08, 0.86]);
          const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            bTilt + 0.1 + (rnd() - 0.5) * 0.35,
            ba + side * 0.9 + (rnd() - 0.5) * 0.4,
            side * 0.42,
            "YXZ",
          ));
          const m2 = new THREE.Matrix4().compose(top1, q2, new THREE.Vector3(1, 1, 1));
          p2.applyMatrix4(m2);
          bodyParts.push(p2);

          // Top tier-2 paddle with bright ruby-magenta tunas (prickly pear fruits) or golden-yellow cactus bloom!
          const top2 = new THREE.Vector3(0, kh * 0.95, 0).applyMatrix4(m2);
          const isFlower = rnd() < 0.35;
          const fg = isFlower ? new THREE.DodecahedronGeometry(0.11, 0) : new THREE.SphereGeometry(0.085, 7, 6);
          if (!isFlower) fg.scale(0.85, 1.35, 0.85);
          fg.translate(top2.x, top2.y + 0.03, top2.z);
          const fcol: [number, number, number] = isFlower ? [1.22, 1.02, 0.18] : [1.18, 0.22, 0.42];
          bloomParts.push(finalize(fg, { color: fcol, bend: 0.18 }));

          // Occasional 3rd-tier young paddle for rich organic asymmetry
          if (hi && k === 0 && (b & 1) === 0) {
            const p3 = makeNopalPaddle(0.36, 0.48, 0.12, 8, [1.05, 1.15, 0.88]);
            const m3 = new THREE.Matrix4().compose(
              top2,
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0.18, ba + 0.4, (rnd() - 0.5) * 0.5, "YXZ")),
              new THREE.Vector3(1, 1, 1),
            );
            p3.applyMatrix4(m3);
            bodyParts.push(p3);
          }
        }
      }
    } else if (v === 1) {
      // Variant 1: Golden Barrel Cactus Cluster — 1 hero ribbed globe + 3 nestled desert pups with golden crowns!
      const segs = hi ? 24 : 12;
      const ribs = hi ? 14 : 7;
      const specs: Array<[number, number, number, number]> = [
        [0.0, 0.0, 0.68, 0.62],
        [0.82, 0.34, 0.44, 0.42],
        [-0.72, 0.46, 0.48, 0.46],
        [-0.22, -0.78, 0.38, 0.36],
      ];
      for (const [gx, gz, rx, ry] of specs) {
        const bg = buildBarrelGlobe(gx, -0.06, gz, rx, ry, segs, ribs);
        bodyParts.push(bg.body);
        bloomParts.push(bg.crown);
      }
    } else {
      // Variant 2: Sculpted Desert Agave / Century Plant — 22 thick curved blue-sage sword leaves in a Fibonacci rosette!
      const nLeaves = hi ? 22 : 12;
      for (let i = 0; i < nLeaves; i++) {
        const frac = i / nLeaves; // 0 = inner upright heart, 1 = outer sweeping rosette blades
        const ang = i * 2.39996323;
        const len = 0.72 + frac * 1.05;
        const pitch = 0.22 + frac * 0.92;
        const dx = Math.cos(ang), dz = -Math.sin(ang);
        const pts = [
          new THREE.Vector3(dx * 0.08, 0.02, dz * 0.08),
          new THREE.Vector3(dx * len * 0.38, Math.cos(pitch) * len * 0.45 + 0.12, dz * len * 0.38),
          new THREE.Vector3(dx * len * 0.76, Math.cos(pitch) * len * 0.68 + 0.08, dz * len * 0.76),
          new THREE.Vector3(dx * len, Math.max(0.08, Math.cos(pitch) * len * 0.62 - frac * 0.12), dz * len),
        ];
        const frames = curveFrames(pts, hi ? 6 : 4, 0.5);
        // Sculpted fleshy V-trough triangular sword blade tapering to a sharp terminal spine
        const g = tube(frames, {
          radial: hi ? 6 : 4,
          radius: (t, a) => {
            const w = (0.14 - frac * 0.02) * (1 - Math.pow(t, 1.4) * 0.92);
            // Flatten vertically so each agave leaf is a broad thick fleshy sword
            const flat = 0.45 + 0.55 * Math.abs(Math.cos(a));
            return Math.max(0.012, w * flat);
          },
          color: (t) => {
            // Powdery blue-sage desert agave with dark maroon-brown terminal spine tip
            const tip = smooth(0.84, 1.0, t);
            return [
              (0.76 + t * 0.12) * (1 - tip * 0.35),
              (1.06 + t * 0.08) * (1 - tip * 0.55),
              (1.04 + t * 0.10) * (1 - tip * 0.58),
            ];
          },
          bend: (t) => 0.08 * t,
          phase: i * 0.4,
          capTop: true,
        });
        bodyParts.push(g);
      }
      // Small bright cream desert flower stalk bud emerging from center of the rosette
      const bud = new THREE.ConeGeometry(0.14, 0.45, 7);
      bud.translate(0, 0.55, 0);
      bloomParts.push(finalize(bud, { color: [1.14, 1.04, 0.52], bend: 0.06 }));
    }

    return {
      body: mergeAll(bodyParts),
      blooms: bloomParts.length ? mergeAll(bloomParts) : new THREE.BufferGeometry(),
    };
  };

  const t0 = buildTier(true);
  const t1 = buildTier(false);
  const parts: SpeciesPart[] = [
    { name: "succulent", mats: m.succulent, lod0: t0.body, lod1: t1.body, shadow: false },
  ];
  if (t0.blooms.attributes.position && t0.blooms.attributes.position.count > 0) {
    const b1 = t1.blooms.attributes.position && t1.blooms.attributes.position.count > 0 ? t1.blooms : t0.blooms;
    parts.push({ name: "bloom", mats: m.bloom, lod0: t0.blooms, lod1: b1, shadow: false });
  }

  const h = v === 0 ? 1.9 : v === 1 ? 1.4 : 1.5;
  const radius = v === 0 ? 1.35 : v === 1 ? 1.3 : 1.6;
  const center = new THREE.Vector3(0, h * 0.45, 0);
  const boundR = Math.hypot(radius, h * 0.55);
  return {
    id: `prickly-pear:${v}`,
    kind: "prickly-pear",
    variant: v,
    parts,
    height: h,
    radius,
    center,
    boundR,
    lod0: 34,
    lod1: 105,
    impostor: true,
    shadow: false,
  };
}
