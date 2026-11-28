// SUNBURST CANYON — Instanced 3D WorldModule factory for all 13 desert POIs.
// Batches static architectural pieces per (shape, material) into `THREE.InstancedMesh` per POI so 300+ detailed
// architectural elements (rafters, cornices, shutters, merlons, domes, arches, rugs, crates, pipes, lanterns, boats)
// render in ~18–26 draw calls at 60 FPS. Also plants VegApi cacti/palms/succulents, builds ziplines with pulley
// trolleys, climbable ladders, the Redrock Canyon Thermal Updraft Geyser, and animated landmarks (radars, windmills,
// braziers/flares, lighthouse beacon).
import * as THREE from "three";
import type { WorldModule } from "../../module";
import type { WorldCtx } from "../../../engine/engine";
import { resources } from "../../../engine/res/scope";
import { SUNBURST_POIS } from "../../../../../shared/world/maps";
import type { PoiId } from "../../../../../shared/world/map";
import {
  SUNBURST_POI_BY_ID,
  SUNBURST_UPDRAFT,
  SUNBURST_ZIPS,
  sunburstLadders,
  type DesertMat,
  type PieceShape,
  type SunburstAnimProp,
  type SunburstPiece,
} from "../../../../../shared/pois/sunburst/index";
import type { VegApi } from "../../veg/api";

type MatMap = Record<DesertMat, THREE.Material>;
let sharedMatsP: Promise<MatMap> | null = null;

// ============================================================================ PROCEDURAL DESERT ACCENT TEXTURES

function makeCanvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = resources.root.texture("tex.world", new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Richly patterned crimson-gold-turquoise Moroccan/Persian desert woven rug texture */
function makeRugTex(): THREE.CanvasTexture {
  return makeCanvasTex(256, 256, (ctx, W, H) => {
    ctx.fillStyle = "#8c1f28";
    ctx.fillRect(0, 0, W, H);
    // Outer cream & gold decorative borders
    ctx.strokeStyle = "#e8be5a";
    ctx.lineWidth = 14;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.strokeStyle = "#1d8a8e";
    ctx.lineWidth = 8;
    ctx.strokeRect(28, 28, W - 56, H - 56);
    ctx.strokeStyle = "#f2dfb2";
    ctx.lineWidth = 3;
    ctx.strokeRect(38, 38, W - 76, H - 76);
    // Central geometric diamond medallion
    ctx.fillStyle = "#167a80";
    ctx.beginPath();
    ctx.moveTo(W * 0.5, 52); ctx.lineTo(W - 52, H * 0.5); ctx.lineTo(W * 0.5, H - 52); ctx.lineTo(52, H * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#f4cb5e";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "#d99d38";
    ctx.beginPath();
    ctx.moveTo(W * 0.5, 86); ctx.lineTo(W - 86, H * 0.5); ctx.lineTo(W * 0.5, H - 86); ctx.lineTo(86, H * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#7a1a22";
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, 22, 0, Math.PI * 2); ctx.fill();
    // Subtle woven textile cross-hatch grain
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H);
  });
}

/** Glazed Moroccan turquoise zellige mosaic ceramic tile texture */
function makeTurquoiseTileTex(): THREE.CanvasTexture {
  return makeCanvasTex(256, 256, (ctx, W, H) => {
    ctx.fillStyle = "#146e78";
    ctx.fillRect(0, 0, W, H);
    const step = 32;
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const alt = ((x / step) + (y / step)) % 2 === 0;
        ctx.fillStyle = alt ? "#1f9da3" : "#17838a";
        ctx.fillRect(x + 2, y + 2, step - 4, step - 4);
        // Inner star diamond glaze highlight
        ctx.fillStyle = alt ? "rgba(180,248,242,0.22)" : "rgba(245,205,95,0.22)";
        ctx.beginPath();
        ctx.moveTo(x + step * 0.5, y + 6);
        ctx.lineTo(x + step - 6, y + step * 0.5);
        ctx.lineTo(x + step * 0.5, y + step - 6);
        ctx.lineTo(x + 6, y + step * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
  });
}

/** Stacked woven burlap military sandbag texture */
function makeSandbagTex(): THREE.CanvasTexture {
  return makeCanvasTex(256, 256, (ctx, W, H) => {
    ctx.fillStyle = "#b89c72";
    ctx.fillRect(0, 0, W, H);
    const rows = 4, cols = 3;
    const rh = H / rows, cw = W / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * cw + off, y = r * rh;
        const g = ctx.createLinearGradient(x, y, x, y + rh);
        g.addColorStop(0, "#d2b88e");
        g.addColorStop(0.55, "#bfa174");
        g.addColorStop(1, "#7c6546");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, cw - 6, rh - 6, 14);
        ctx.fill();
        ctx.strokeStyle = "#5c4a32";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  });
}

async function getDesertMaterials(ctx: WorldCtx): Promise<MatMap> {
  if (sharedMatsP) return sharedMatsP;
  sharedMatsP = (async () => {
    const load = (file: string, srgb: boolean) => ctx.assets.texture(`assets/pois/sunburst/${file}`, { srgb, repeat: true, aniso: true });
    const [hierD, hierN, adobeD, adobeN, awningD, metalD, metalN, timberD, timberN, solarD] = await Promise.all([
      load("hieroglyph.webp", true), load("hieroglyph-n.webp", false),
      load("adobe.webp", true), load("adobe-n.webp", false),
      load("awning.webp", true),
      load("metal-desert.webp", true), load("metal-desert-n.webp", false),
      load("timber-desert.webp", true), load("timber-desert-n.webp", false),
      load("solar-panel.webp", true),
    ]);
    const rugD = makeRugTex();
    const tileD = makeTurquoiseTileTex();
    const bagD = makeSandbagTex();

    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
    return {
      sandstone:  std({ color: 0xe8c488, map: adobeD, normalMap: adobeN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.88, metalness: 0.02 }),
      hieroglyph: std({ color: 0xf4d498, map: hierD, normalMap: hierN, normalScale: new THREE.Vector2(1.0, 1.0), roughness: 0.84, metalness: 0.04 }),
      gold:       std({ color: 0xffca3a, emissive: 0x3b2200, emissiveIntensity: 0.35, roughness: 0.28, metalness: 0.78 }),
      adobe:      std({ color: 0xf0d2a8, map: adobeD, normalMap: adobeN, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.90, metalness: 0.0 }),
      terracotta: std({ color: 0xd97448, map: adobeD, normalMap: adobeN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.86, metalness: 0.02 }),
      awning:     std({ color: 0xffffff, map: awningD, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide }),
      timber:     std({ color: 0xdcb486, map: timberD, normalMap: timberN, normalScale: new THREE.Vector2(0.85, 0.85), roughness: 0.88, metalness: 0.0 }),
      darkwood:   std({ color: 0x7c502e, map: timberD, normalMap: timberN, normalScale: new THREE.Vector2(0.75, 0.75), roughness: 0.90, metalness: 0.0 }),
      crate:      std({ color: 0xc28a4b, map: timberD, normalMap: timberN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.84, metalness: 0.04 }),
      metal:      std({ color: 0xd0d6dc, map: metalD, normalMap: metalN, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.52, metalness: 0.58 }),
      rust:       std({ color: 0xc97448, map: metalD, normalMap: metalN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.76, metalness: 0.35 }),
      solar:      std({ color: 0xffffff, map: solarD, roughness: 0.16, metalness: 0.68, emissive: 0x0b254a, emissiveIntensity: 0.22 }),
      glass:      std({ name: "sunburst:glass", color: 0x9be4f0, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.42 }),
      redrock:    std({ color: 0xc45c36, map: adobeD, normalMap: adobeN, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.92, metalness: 0.0 }),
      bone:       std({ color: 0xf2ead7, map: adobeD, normalMap: adobeN, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.80, metalness: 0.0 }),
      cactus:     std({ color: 0x3b8c42, roughness: 0.78, metalness: 0.0 }),
      canvas:     std({ color: 0xeed9b4, map: adobeD, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide }),
      glow:       std({ color: 0xffe478, emissive: 0xffaa22, emissiveIntensity: 1.65, roughness: 0.25, metalness: 0.1 }),
      // New architectural & infrastructure desert accents
      turquoise:  std({ color: 0xffffff, map: tileD, roughness: 0.28, metalness: 0.14 }),
      crimson:    std({ color: 0xb52b30, map: adobeD, roughness: 0.86, metalness: 0.02, side: THREE.DoubleSide }),
      copper:     std({ color: 0xc87846, map: metalD, normalMap: metalN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.36, metalness: 0.72 }),
      iron:       std({ color: 0x3d4248, map: metalD, normalMap: metalN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.56, metalness: 0.66 }),
      plaster:    std({ color: 0xf7ebd4, map: adobeD, normalMap: adobeN, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.88, metalness: 0.0 }),
      water:      std({ color: 0x2ec8cf, emissive: 0x0b4c56, emissiveIntensity: 0.35, roughness: 0.12, metalness: 0.18, transparent: true, opacity: 0.84 }),
      rug:        std({ color: 0xffffff, map: rugD, roughness: 0.94, metalness: 0.0 }),
      sandbag:    std({ color: 0xffffff, map: bagD, roughness: 0.92, metalness: 0.0 }),
      fire:       std({ color: 0x260a02, emissive: 0xd63600, emissiveIntensity: 0.72, roughness: 0.95, metalness: 0.0 }),
      chrome:     std({ color: 0xe6edf4, roughness: 0.22, metalness: 0.84 }),
    };
  })();
  return sharedMatsP;
}

// Shared unit geometries (scaled per instance — tiny memory footprint!)
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 14);
const UNIT_PYR = new THREE.ConeGeometry(0.7071, 1, 4);
UNIT_PYR.rotateY(Math.PI * 0.25);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 14, 10);
/** Pure upper hemisphere dome (base sits cleanly at y = 0, apex at y = 1) — never pokes through ceilings below! */
const UNIT_DOME = new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
UNIT_DOME.scale(1, 2, 1);
const UNIT_TORUS = new THREE.TorusGeometry(0.5, 0.045, 8, 28);
UNIT_TORUS.rotateX(Math.PI * 0.5); // Horizontal XZ plane natively so (w, h, d) scales circular rings cleanly!

function unitGeo(shape: PieceShape): THREE.BufferGeometry {
  switch (shape) {
    case "cyl": return UNIT_CYL;
    case "cone": return UNIT_CONE;
    case "pyramid": return UNIT_PYR;
    case "sphere": return UNIT_SPHERE;
    case "dome": return UNIT_DOME;
    case "torus": return UNIT_TORUS;
    default: return UNIT_BOX;
  }
}

// ============================================================================ PROCEDURAL STYLIZED GLSL FIRE SHADER

const FLAME_TIME = { value: 0 };
const FLAME_CARD_GEO = (() => {
  const g = new THREE.PlaneGeometry(1.18, 1.75, 4, 8);
  g.translate(0, 0.82, 0); // Base hugs coal bed cleanly at y = 0
  return g;
})();
const EMBER_GEO = new THREE.PlaneGeometry(0.11, 0.11);

const FLAME_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vec3 wOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vSeed = fract(sin(dot(wOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453) * 20.0;
  vec3 p = position;
  float h = clamp(uv.y, 0.0, 1.0);
  // Gentle organic heat-plume sway increasing toward the licking tips
  float sway = sin(uTime * 5.2 + vSeed + h * 4.5) * 0.09 + sin(uTime * 9.7 + vSeed * 1.7 - h * 6.0) * 0.045;
  p.x += sway * h * h;
  p.z += cos(uTime * 4.6 + vSeed * 1.3 + h * 3.8) * 0.06 * h * h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vSeed;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  return vnoise(p) * 0.56 + vnoise(p * 2.07 + 13.7) * 0.29 + vnoise(p * 4.19 - 7.3) * 0.15;
}

void main() {
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  float t = uTime;

  // Dual-speed upward scrolling fire turbulence
  float n1 = fbm(vec2(x * 1.9 + vSeed, y * 2.4 - t * 3.1));
  float n2 = fbm(vec2(x * 3.4 - vSeed * 0.7, y * 4.2 - t * 5.2));
  float turb = n1 * 0.65 + n2 * 0.35;

  // Teardrop profile: broad glowing base hugging brazier bowl, tapering to forked flickering tips
  float width = mix(0.88, 0.10, pow(y, 0.78)) * (0.85 + 0.32 * sin(y * 3.14159));
  float warpX = x + (turb - 0.5) * (0.28 + 0.92 * y);
  float dist = abs(warpX) / max(width, 0.04);

  // Shape field: smooth hot flame core with jagged roaring upper tongues
  float shape = (1.0 - dist * dist) - y * 0.72 + (turb - 0.38) * (0.55 + 0.65 * y);
  // Crisp soft base rounding so the bottom never looks like a flat quad cut
  shape *= smoothstep(0.0, 0.13, y) * (1.0 - smoothstep(0.84, 1.0, y));
  if (shape < 0.06) discard;

  float heat = clamp(shape * 1.35 + (1.0 - y) * 0.30, 0.0, 1.0);
  float alpha = smoothstep(0.06, 0.30, shape);

  // Rich saturated linear HDR palette (zero sky-blue contamination → vivid orange-gold, NEVER pastel pink!)
  vec3 colTip  = vec3(0.95, 0.04, 0.001);  // Deep fiery crimson-red outer tongues
  vec3 colMid  = vec3(1.45, 0.28, 0.005);  // Vivid roaring flame orange
  vec3 colGold = vec3(1.85, 0.92, 0.03);   // Blazing golden yellow inner body
  vec3 colCore = vec3(2.25, 1.72, 0.38);   // Incandescent pale-gold heart at coal base

  vec3 col = mix(colTip, colMid, smoothstep(0.08, 0.42, heat));
  col = mix(col, colGold, smoothstep(0.38, 0.74, heat));
  col = mix(col, colCore, smoothstep(0.72, 0.98, heat) * (1.0 - y * 0.65));

  gl_FragColor = vec4(col, alpha * 0.94);
}
`;

let sharedFlameMat: THREE.ShaderMaterial | null = null;
let sharedEmberMat: THREE.MeshBasicMaterial | null = null;
function getFlameMaterial(): THREE.ShaderMaterial {
  if (!sharedFlameMat) {
    sharedFlameMat = new THREE.ShaderMaterial({
      name: "sunburst:flame",
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: { uTime: FLAME_TIME },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  return sharedFlameMat;
}
function getEmberMaterial(): THREE.MeshBasicMaterial {
  if (!sharedEmberMat) {
    sharedEmberMat = new THREE.MeshBasicMaterial({
      color: 0xffb830,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }
  return sharedEmberMat;
}

/** Batch all static POI pieces per (shape, material) into InstancedMeshes (~18-28 draw calls per POI instead of 300+!).
 *  Breakable glass panes stay as individual cloned-geometry Meshes so GlassFx can shatter, hide & restore each pane! */
function buildInstancedPieces(pieces: SunburstPiece[], mats: MatMap, group: THREE.Group) {
  const buckets = new Map<string, { shape: PieceShape; mat: DesertMat; items: SunburstPiece[] }>();
  for (const p of pieces) {
    const k = `${p.shape}|${p.mat}`;
    let b = buckets.get(k);
    if (!b) { b = { shape: p.shape, mat: p.mat, items: [] }; buckets.set(k, b); }
    b.items.push(p);
  }
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const eul = new THREE.Euler(0, 0, 0, "YXZ");

  for (const b of buckets.values()) {
    const geo = unitGeo(b.shape);
    const mat = mats[b.mat];
    const isEmissiveOrGlass = b.mat === "glass" || b.mat === "glow" || b.mat === "fire" || b.mat === "water";
    // GlassFx scans plain Meshes (skips InstancedMesh) and collapses broken pane triangles on each pane's own geometry.
    if (b.mat === "glass" || b.items.length === 1) {
      for (const p of b.items) {
        const mesh = new THREE.Mesh(b.mat === "glass" ? geo.clone() : geo, mat);
        mesh.position.set(p.x, p.y, p.z);
        mesh.scale.set(p.w, p.h, p.d);
        if (p.yaw || p.pitch || p.roll) mesh.rotation.set(p.pitch ?? 0, p.yaw ?? 0, p.roll ?? 0, "YXZ");
        mesh.castShadow = !isEmissiveOrGlass && (p.w * p.h * p.d > 0.35);
        mesh.receiveShadow = !isEmissiveOrGlass;
        if (b.mat === "glass") mesh.userData.castShadow = false;
        group.add(mesh);
      }
      continue;
    }
    const inst = new THREE.InstancedMesh(geo, mat, b.items.length);
    let anyBig = false;
    for (let i = 0; i < b.items.length; i++) {
      const p = b.items[i];
      pos.set(p.x, p.y, p.z);
      if (p.yaw || p.pitch || p.roll) {
        eul.set(p.pitch ?? 0, p.yaw ?? 0, p.roll ?? 0, "YXZ");
        quat.setFromEuler(eul);
      } else {
        quat.identity();
      }
      scl.set(p.w, p.h, p.d);
      m4.compose(pos, quat, scl);
      inst.setMatrixAt(i, m4);
      if (p.w * p.h * p.d > 0.35) anyBig = true;
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = !isEmissiveOrGlass && anyBig;
    inst.receiveShadow = !isEmissiveOrGlass;
    group.add(inst);
  }
}

// ============================================================================ ZIPLINES, LADDERS, UPDRAFT & ANIMATED PROPS

function buildZipVisuals(group: THREE.Group, mats: MatMap, poiX: number, poiZ: number, poiR: number) {
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x26211d, roughness: 0.55, metalness: 0.72 });
  for (const z of SUNBURST_ZIPS) {
    if (Math.hypot(z.a[0] - poiX, z.a[2] - poiZ) > poiR + 75) continue;
    const dx = z.b[0] - z.a[0], dz = z.b[2] - z.a[2];
    const lh = Math.hypot(dx, dz) || 1;
    const ux = dx / lh, uz = dz / lh;
    const zipYaw = Math.atan2(-uz, ux) + Math.PI * 0.5;

    for (const [endIdx, [pt, deckY]] of ([[z.a, z.ya], [z.b, z.yb]] as const).entries()) {
      const dir = endIdx === 0 ? 1 : -1;
      const h = Math.max(2.8, pt[1] - deckY + 0.6);
      // Sturdy steel anchor mast + base flange + yellow pulley winch housing + hanging T-bar!
      const pole = new THREE.Mesh(UNIT_CYL, mats.iron);
      pole.position.set(pt[0], deckY + h * 0.5, pt[2]);
      pole.scale.set(0.36, h, 0.36);
      pole.castShadow = true;
      group.add(pole);

      const base = new THREE.Mesh(UNIT_CYL, mats.metal);
      base.position.set(pt[0], deckY + 0.14, pt[2]);
      base.scale.set(0.85, 0.28, 0.85);
      group.add(base);

      const winch = new THREE.Mesh(UNIT_BOX, mats.gold);
      winch.position.set(pt[0], pt[1] + 0.12, pt[2]);
      winch.scale.set(0.56, 0.44, 0.72);
      winch.rotation.y = zipYaw;
      group.add(winch);

      const beacon = new THREE.Mesh(UNIT_SPHERE, mats.glow);
      beacon.position.set(pt[0], pt[1] + 0.52, pt[2]);
      beacon.scale.set(0.36, 0.36, 0.36);
      group.add(beacon);

      // Hanging yellow/iron T-bar trolley ready for pickup (matches render.ts zipHull!)
      const hx = pt[0] + dir * ux * 0.6, hz = pt[2] + dir * uz * 0.6;
      const hy = pt[1] - 0.05 - 4 * z.sag * (0.6 / lh);
      const rod = new THREE.Mesh(UNIT_CYL, mats.iron);
      rod.position.set(hx, hy - 0.5, hz);
      rod.scale.set(0.06, 1.0, 0.06);
      group.add(rod);
      const bar = new THREE.Mesh(UNIT_CYL, mats.gold);
      bar.position.set(hx, hy - 1.02, hz);
      bar.scale.set(0.11, 0.66, 0.11);
      bar.rotation.set(0, zipYaw, Math.PI * 0.5, "YXZ");
      group.add(bar);
    }

    // Parabolic cable tube matching shared/sim/zipline.ts 1:1
    const pts: THREE.Vector3[] = [];
    const N = 26;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = z.a[0] + (z.b[0] - z.a[0]) * t;
      const y = z.a[1] + (z.b[1] - z.a[1]) * t - 4 * z.sag * t * (1 - t);
      const zz = z.a[2] + (z.b[2] - z.a[2]) * t;
      pts.push(new THREE.Vector3(x, y, zz));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.08, 6, false), cableMat);
    group.add(tube);
  }
}

function buildLadderVisuals(group: THREE.Group, mats: MatMap, poiX: number, poiZ: number, poiR: number) {
  for (const lad of sunburstLadders()) {
    if (Math.hypot(lad.x - poiX, lad.z - poiZ) > poiR + 25) continue;
    const h = lad.y1 - lad.y0;
    const yaw = Math.atan2(lad.nx, lad.nz);
    const ladG = new THREE.Group();
    ladG.position.set(lad.x + lad.nx * 0.14, lad.y0, lad.z + lad.nz * 0.14);
    ladG.rotation.y = yaw;
    for (const rx of [-0.32, 0.32]) {
      const rail = new THREE.Mesh(UNIT_BOX, mats.darkwood);
      rail.position.set(rx, h * 0.5, 0);
      rail.scale.set(0.08, h, 0.08);
      rail.castShadow = true;
      ladG.add(rail);
    }
    const rungs = Math.floor(h / 0.42);
    for (let i = 1; i <= rungs; i++) {
      const rung = new THREE.Mesh(UNIT_BOX, mats.gold);
      rung.position.set(0, i * 0.42, 0);
      rung.scale.set(0.68, 0.06, 0.06);
      ladG.add(rung);
    }
    group.add(ladG);
  }
}

function buildThermalUpdraftFx(ctx: WorldCtx, group: THREE.Group) {
  const U = SUNBURST_UPDRAFT;
  const rings: THREE.Mesh[] = [];
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffe4a0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ringGeo = new THREE.CylinderGeometry(1, 0.85, 3.2, 20, 1, true);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ringGeo, ringMat);
    m.position.set(U.x, U.floor + i * 14, U.z);
    group.add(m);
    rings.push(m);
  }
  ctx.onUpdate((_dt: number, t: number) => {
    for (let i = 0; i < rings.length; i++) {
      const ph = ((t * 0.45 + i / rings.length) % 1 + 1) % 1;
      const y = U.floor + ph * 86;
      const r = U.rFloor + (U.rAbove - U.rFloor) * Math.min(1, ph * 1.4);
      rings[i].position.y = y;
      rings[i].scale.set(r * 0.85, 1 + ph * 1.6, r * 0.85);
      rings[i].rotation.y = t * (1.2 + i * 0.15);
    }
  });
}

function buildAnimatedProps(ctx: WorldCtx, group: THREE.Group, anims: SunburstAnimProp[], mats: MatMap) {
  if (!anims.length) return;
  const radars: THREE.Object3D[] = [];
  const windmills: THREE.Object3D[] = [];
  const embers: Array<{ mesh: THREE.Mesh; ox: number; oy: number; oz: number; sc: number; ph: number }> = [];
  let hasFlames = false;
  const beacons: THREE.Object3D[] = [];

  for (let idx = 0; idx < anims.length; idx++) {
    const a = anims[idx];
    const sc = a.scale ?? 1;
    if (a.kind === "radar") {
      // Rotating military/refinery steel radar dish atop pedestal
      const ped = new THREE.Mesh(UNIT_CYL, mats.iron);
      ped.position.set(a.x, a.y + 0.6 * sc, a.z);
      ped.scale.set(0.6 * sc, 1.2 * sc, 0.6 * sc);
      group.add(ped);

      const head = new THREE.Group();
      head.position.set(a.x, a.y + 1.4 * sc, a.z);
      const dish = new THREE.Mesh(UNIT_CONE, mats.chrome);
      dish.scale.set(3.2 * sc, 1.1 * sc, 3.2 * sc);
      dish.rotation.x = Math.PI * 0.35;
      head.add(dish);
      const rim = new THREE.Mesh(UNIT_TORUS, mats.gold);
      rim.scale.set(3.2 * sc, 0.45 * sc, 3.2 * sc);
      rim.position.set(0, 0.25 * sc, 0.35 * sc);
      rim.rotation.x = Math.PI * 0.35;
      head.add(rim);
      const needle = new THREE.Mesh(UNIT_CYL, mats.crimson);
      needle.scale.set(0.14 * sc, 1.8 * sc, 0.14 * sc);
      needle.position.set(0, 0.45 * sc, 0.75 * sc);
      needle.rotation.x = Math.PI * 0.35;
      head.add(needle);
      group.add(head);
      radars.push(head);
    } else if (a.kind === "windmill") {
      // Classic 10-blade western spinning desert farm windmill!
      const root = new THREE.Group();
      root.position.set(a.x, a.y, a.z);
      root.rotation.y = a.yaw ?? 0;
      const tail = new THREE.Mesh(UNIT_BOX, mats.crimson);
      tail.position.set(0, 0, -2.4 * sc);
      tail.scale.set(0.14 * sc, 1.2 * sc, 2.2 * sc);
      root.add(tail);
      const hub = new THREE.Group();
      hub.position.set(0, 0, 0.65 * sc);
      const center = new THREE.Mesh(UNIT_CYL, mats.iron);
      center.scale.set(0.75 * sc, 0.45 * sc, 0.75 * sc);
      center.rotation.x = Math.PI * 0.5;
      hub.add(center);
      const ring = new THREE.Mesh(UNIT_TORUS, mats.iron);
      ring.scale.set(4.6 * sc, 0.4 * sc, 4.6 * sc);
      ring.rotation.x = Math.PI * 0.5;
      hub.add(ring);
      for (let b = 0; b < 10; b++) {
        const ang = (b / 10) * Math.PI * 2;
        const blade = new THREE.Mesh(UNIT_BOX, b % 2 === 0 ? mats.metal : mats.rust);
        blade.position.set(Math.cos(ang) * 1.45 * sc, Math.sin(ang) * 1.45 * sc, 0);
        blade.scale.set(2.1 * sc, 0.48 * sc, 0.08 * sc);
        blade.rotation.set(0.28, 0, ang);
        hub.add(blade);
      }
      root.add(hub);
      group.add(root);
      windmills.push(hub);
    } else if (a.kind === "flame") {
      hasFlames = true;
      const fMat = getFlameMaterial();
      const eMat = getEmberMaterial();
      const fG = new THREE.Group();
      fG.position.set(a.x, a.y, a.z);
      fG.scale.setScalar(sc);
      // 3 intersecting procedural GLSL animated flame cards (0°, 60°, 120°) for rich 360° volumetric tongues!
      for (let c = 0; c < 3; c++) {
        const card = new THREE.Mesh(FLAME_CARD_GEO, fMat);
        card.rotation.y = (c / 3) * Math.PI + (idx * 0.47);
        card.castShadow = false;
        card.receiveShadow = false;
        card.userData.castShadow = false;
        card.renderOrder = 6;
        fG.add(card);
      }
      group.add(fG);
      // 3 rising glowing ember sparks drifting upward from each brazier/flare
      for (let e = 0; e < 3; e++) {
        const em = new THREE.Mesh(EMBER_GEO, eMat);
        em.castShadow = false;
        em.receiveShadow = false;
        em.userData.castShadow = false;
        em.renderOrder = 7;
        em.scale.setScalar(sc);
        group.add(em);
        embers.push({ mesh: em, ox: a.x, oy: a.y + 0.15 * sc, oz: a.z, sc, ph: idx * 2.13 + e * 2.094 });
      }
    } else if (a.kind === "beacon") {
      const bG = new THREE.Group();
      bG.position.set(a.x, a.y, a.z);
      const prism = new THREE.Mesh(UNIT_BOX, mats.glow);
      prism.scale.set(3.2 * sc, 1.6 * sc, 1.1 * sc);
      bG.add(prism);
      group.add(bG);
      beacons.push(bG);
    }
  }

  ctx.onUpdate((_dt: number, t: number) => {
    if (hasFlames) FLAME_TIME.value = t;
    for (let i = 0; i < radars.length; i++) radars[i].rotation.y = t * 0.65 + i;
    for (let i = 0; i < windmills.length; i++) windmills[i].rotation.z = -t * 1.15;
    for (let i = 0; i < beacons.length; i++) beacons[i].rotation.y = t * 0.9;
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      const life = ((t * 0.72 + e.ph * 0.37) % 1 + 1) % 1;
      const sway = Math.sin(t * 4.2 + e.ph) * 0.28 * e.sc * life;
      const swayZ = Math.cos(t * 3.7 + e.ph * 1.4) * 0.28 * e.sc * life;
      e.mesh.position.set(e.ox + sway, e.oy + life * 2.15 * e.sc, e.oz + swayZ);
      const s = e.sc * (1.0 - life) * (0.65 + 0.35 * Math.sin(t * 14 + e.ph));
      e.mesh.scale.set(s, s * 1.35, s);
      e.mesh.rotation.y = t * 2.5 + e.ph;
    }
  });
}

// ============================================================================ MODULE FACTORY

export function makeSunburstPoiModule(id: PoiId): WorldModule {
  const meta = SUNBURST_POIS.find((p) => p.id === id);
  const cx = meta?.x ?? 0, cz = meta?.z ?? 0, cr = meta?.r ?? 120;
  return {
    id: `poi:${id}`,
    views: id === "banana-pyramid" ? {
      "sunburst-aerial": { pos: [80, 720, 960], target: [-40, 20, -120], fov: 44 },
      "sunburst-pyramid": { pos: [-310, 56, -130], target: [-420, 32, -240], fov: 50 },
      "sunburst-oasis": { pos: [95, 38, 140], target: [0, 6, 40], fov: 50 },
      "sunburst-bazaar": { pos: [420, 42, 205], target: [420, 20, 110], fov: 52 },
      "sunburst-citadel": { pos: [-445, 92, -525], target: [-520, 62, -600], fov: 52 },
      "sunburst-refinery": { pos: [565, 52, -210], target: [490, 24, -290], fov: 52 },
      "sunburst-gulch": { pos: [160, 32, 505], target: [160, 17, 425], fov: 52 },
      "sunburst-docks": { pos: [705, 42, 545], target: [624, 8, 460], fov: 52 },
      "sunburst-skyship": { pos: [-470, 42, 360], target: [-540, 18, 290], fov: 52 },
      "sunburst-redrock": { pos: [-95, 38, -280], target: [-30, 16, -345], fov: 56 },
      "sunburst-bones": { pos: [-678, 42, 10], target: [-740, 22, -62], fov: 54 },
      "sunburst-cactus": { pos: [-190, 2.6, 220], target: [-240, 4.5, 160], fov: 56, rel: true },
    } : {},
    async build(ctx) {
      const data = SUNBURST_POI_BY_ID[id];
      if (!data) return;
      const mats = await getDesertMaterials(ctx);
      const group = new THREE.Group();
      group.name = `sunburst-${id}`;

      buildInstancedPieces(data.pieces, mats, group);

      // Plant sculpted VegApi cacti & planter palms/succulents!
      const veg = ctx.shared.get("veg") as VegApi | undefined;
      if (veg) {
        if (data.cacti.length) {
          const transforms = data.cacti.map(([x, y, z, yaw, sc]) =>
            new THREE.Matrix4().compose(
              new THREE.Vector3(x, y, z),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
              new THREE.Vector3(sc, sc, sc),
            ),
          );
          veg.plant("cactus", transforms);
        }
        if (data.flora.length) {
          const byKind = new Map<"palm" | "prickly-pear", THREE.Matrix4[]>();
          for (const [kind, x, y, z, yaw, sc] of data.flora) {
            let list = byKind.get(kind);
            if (!list) { list = []; byKind.set(kind, list); }
            list.push(new THREE.Matrix4().compose(
              new THREE.Vector3(x, y, z),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
              new THREE.Vector3(sc, sc, sc),
            ));
          }
          for (const [k, list] of byKind) veg.plant(k, list);
        }
      }

      buildZipVisuals(group, mats, cx, cz, cr);
      buildLadderVisuals(group, mats, cx, cz, cr);
      buildAnimatedProps(ctx, group, data.anims, mats);
      if (id === "redrock-canyon") buildThermalUpdraftFx(ctx, group);
      ctx.scene.add(group);
    },
  };
}
