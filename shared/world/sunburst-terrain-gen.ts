// SUNBURST CANYON — 2400×2400 m Desert Battle Royale Island heightfield, biome map, caravan roads & desert rocks.
// Produces a deterministic TerrainData record encoded to public/assets/terrain/sunburst.bin (KRT5) via
// tools/terrain/bake-sunburst.mts. All POIs honor their padY/pad/blend contract from SUNBURST_POIS.
import { Biome, WORLD } from "./map";
import { SUNBURST_POIS } from "./maps";
import { Simplex2, mulberry32, smoothstep } from "./noise";
import type { RockInstance, TerrainData } from "./terrain-gen";
import * as dmath from "../sim/dmath";

export const SUNBURST_SEED = 4242;

/** Caravan dirt / sandstone roads linking all 12 desert POIs + scenic desert loop */
export const SUNBURST_PATHS: Array<{ pts: Array<[number, number]>; w: number }> = [
  // Outer desert highway ring
  { w: 7.5, pts: [[610, 420], [520, 290], [420, 120], [470, -80], [490, -290], [370, -450], [220, -560]] },
  { w: 7.0, pts: [[220, -560], [60, -520], [-140, -510], [-340, -540], [-440, -560], [-520, -600]] },
  { w: 7.5, pts: [[610, 420], [390, 450], [160, 430], [-40, 470], [-220, 490], [-400, 410], [-540, 290]] },
  { w: 7.0, pts: [[-540, 290], [-650, 130], [-740, -60], [-620, -180], [-420, -240]] },
  // Central spokes into Emerald Oasis & Redrock Canyon
  { w: 6.5, pts: [[420, 120], [230, 80], [115, 50]] },
  { w: 6.5, pts: [[160, 430], [95, 250], [40, 135]] },
  { w: 6.5, pts: [[-420, -240], [-220, -100], [-100, -15]] },
  { w: 6.5, pts: [[-540, 290], [-290, 180], [-115, 90]] },
  { w: 6.0, pts: [[-420, -240], [-220, -310], [-40, -340], [120, -350], [290, -330], [490, -290]] },
  { w: 6.0, pts: [[0, -65], [-25, -200], [-40, -340], [80, -450], [220, -560]] },
  // Mesa Citadel SE switchback ramp road
  { w: 7.5, pts: [[-420, -240], [-430, -390], [-460, -490], [-520, -600]] },
];

/** Center of the iconic Emerald Oasis spring lagoon */
export const OASIS = { x: 0, z: 40, waterR: 58, shoreR: 86, lushR: 132 } as const;

/** Redrock Grand Canyon curving spine (deep carved terracotta gorge with ledges + thermal updraft at (-40, -340)) */
export const CANYON_SPINE: Array<[number, number, number]> = [
  [-320, -430, 32],
  [-195, -395, 38],
  [-90,  -355, 44],
  [-40,  -340, 48],
  [55,   -295, 42],
  [145,  -220, 36],
  [205,  -120, 30],
  [115,  -35,  24],
  [45,    10,  22],
];

/** Dramatic flat-topped red-rock scenic mesas (outside POI pads, pure desert silhouettes) */
export const DESERT_MESAS: Array<{ x: number; z: number; rx: number; rz: number; h: number; yaw: number }> = [
  { x: -165, z: -610, rx: 68, rz: 48, h: 46, yaw: 0.3 },
  { x:  630, z:  -70, rx: 58, rz: 42, h: 42, yaw: -0.4 },
  { x: -720, z: -380, rx: 72, rz: 52, h: 48, yaw: 0.5 },
  { x:  380, z: -680, rx: 64, rz: 45, h: 38, yaw: -0.2 },
  { x: -370, z:  640, rx: 54, rz: 40, h: 34, yaw: 0.6 },
  { x:  310, z:  270, rx: 38, rz: 28, h: 28, yaw: -0.5 },
];

function distSeg(x: number, z: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const u = l2 > 1e-6 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return [dmath.hypot(x - ax - dx * u, z - az - dz * u), u];
}

function canyonDist(x: number, z: number): { d: number; w: number } {
  let bestD = 1e9, bestW = 36;
  for (let i = 0; i + 1 < CANYON_SPINE.length; i++) {
    const a = CANYON_SPINE[i], b = CANYON_SPINE[i + 1];
    const [d, u] = distSeg(x, z, a[0], a[1], b[0], b[1]);
    if (d < bestD) { bestD = d; bestW = a[2] + (b[2] - a[2]) * u; }
  }
  return { d: bestD, w: bestW };
}

function pathField(x: number, z: number): number {
  let best = 0;
  for (const p of SUNBURST_PATHS) {
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      const [d] = distSeg(x, z, ax, az, bx, bz);
      if (d < p.w + 4) {
        const v = 1 - smoothstep(p.w * 0.52, p.w + 3.2, d);
        if (v > best) best = v;
      }
    }
  }
  return best;
}

/** Generate Sunburst Canyon's 1201×1201 deterministic heightfield + biomes + coast + path mask */
export function generateSunburstTerrain(): TerrainData {
  const H = WORLD.HALF, C = WORLD.CELL;
  const res = Math.round((2 * H) / C) + 1;
  const N = res * res;
  const heights = new Float32Array(N);
  const biome = new Uint8Array(N);
  const coast = new Int8Array(N);
  const path = new Uint8Array(N);

  const n1 = new Simplex2(SUNBURST_SEED + 11);
  const n2 = new Simplex2(SUNBURST_SEED + 37);
  const n3 = new Simplex2(SUNBURST_SEED + 91);
  const nDune = new Simplex2(SUNBURST_SEED + 173);

  // Island outline: organic desert continent ~920 m mean radius + scenic Mirage Bay SE + offshore Sunburst Islet (0, 1020)
  const islandMask = (x: number, z: number): number => {
    const cx = x * 0.96, cz = (z + 25) * 1.04;
    const ang = dmath.atan2(cz, cx);
    const r = dmath.hypot(cx, cz);
    const outline = 885
      + 95 * dmath.cos(ang * 2 - 0.5)
      + 68 * dmath.sin(ang * 3 + 0.9)
      + 42 * dmath.cos(ang * 5 - 1.1)
      + 70 * n1.noise(x * 0.0014, z * 0.0014);
    // Carve scenic coastal Mirage Harbor bay at SE (around 660, 500)
    const bayD = dmath.hypot(x - 710, z - 510);
    const bayCarve = bayD < 210 ? (1 - smoothstep(45, 210, bayD)) * 135 : 0;
    // Carve northern fjord notch at (-120, -830)
    const nBayD = dmath.hypot(x + 120, z + 860);
    const nBayCarve = nBayD < 220 ? (1 - smoothstep(50, 220, nBayD)) * 140 : 0;
    return outline - bayCarve - nBayCarve - r;
  };

  for (let i = 0; i < res; i++) {
    const z = -H + i * C;
    for (let j = 0; j < res; j++) {
      const x = -H + j * C;
      const k = i * res + j;

      // 1. Main desert continent vs ocean
      const dMain = islandMask(x, z);
      // 2. Offshore Warmup Sunburst Islet at (0, 1020)
      const dIslet = 92 + 12 * n2.noise(x * 0.02, z * 0.02) - dmath.hypot(x, z - 1020);
      const landDist = Math.max(dMain, dIslet);

      let h: number;
      if (landDist <= -120) {
        h = -22 + n1.noise(x * 0.004, z * 0.004) * 4;
      } else if (landDist <= 0) {
        // Gentle turquoise sandy continental shelf sloping to beach
        const t = smoothstep(-120, 0, landDist);
        h = -22 * (1 - t) + (-0.15) * t + n2.noise(x * 0.012, z * 0.012) * 0.6 * (1 - t);
      } else {
        // Inland rise: golden dunes + undulating sandstone plateaus
        const inland = smoothstep(0, 185, landDist);
        const shelf = 1.4 + inland * 15.5;
        const macro = n1.fbm(x * 0.0016, z * 0.0016, 4) * 14.0 * inland;
        // Sculpted sweeping wind-blown Sahara sand dunes (oriented SW->NE)
        const du = (x * 0.78 + z * 0.62) * 0.024 + nDune.noise(x * 0.005, z * 0.005) * 2.2;
        const duneCrest = (1 - Math.abs(dmath.sin(du))) * 4.8 * smoothstep(25, 160, landDist);
        const micro = n3.fbm(x * 0.012, z * 0.012, 3) * 1.4;
        h = shelf + macro + duneCrest + micro;

        // Higher red-rock canyon highland plateau in the north/northwest
        const northPlate = smoothstep(140, -520, z) * smoothstep(550, -320, x);
        h += northPlate * 18.0 * inland;

        // Dramatic sculpted flat-topped Redrock Mesas
        for (const m of DESERT_MESAS) {
          const dx = x - m.x, dz = z - m.z;
          const cy = dmath.cos(m.yaw), sy = dmath.sin(m.yaw);
          const lx = (dx * cy + dz * sy) / m.rx, lz = (-dx * sy + dz * cy) / m.rz;
          const r = dmath.hypot(lx, lz) + n2.noise(x * 0.014, z * 0.014) * 0.14;
          if (r < 1.55) {
            // Stepped red-rock strata cliff rising to flat table top
            const rise = 1 - smoothstep(0.68, 1.45, r);
            const terrace = rise > 0.25 && rise < 0.72 ? rise - 0.05 * dmath.sin(rise * 18) : rise;
            const target = m.h + n3.noise(x * 0.02, z * 0.02) * 0.7;
            if (target > h) h = h + (target - h) * Math.max(0, Math.min(1, terrace));
          }
        }

        // Redrock Grand Canyon gorge carve (deep terraced canyon with flat drivable floor!)
        const can = canyonDist(x, z);
        if (can.d < can.w + 55) {
          const warp = n2.noise(x * 0.016, z * 0.016) * 8;
          const dc = Math.max(0, can.d + warp);
          const cut = 1 - smoothstep(can.w * 0.42, can.w + 46, dc);
          // Terraced canyon wall shelf mid-way down
          const floorY = 6.2 + n3.noise(x * 0.015, z * 0.015) * 1.0;
          if (h > floorY) h = h + (floorY - h) * cut;
        }
      }

      // 3. Central Emerald Oasis Lagoon (carved spring basin at y = -2.8 m with sandy gently sloped banks)
      const oD = dmath.hypot(x - OASIS.x, z - OASIS.z) + n2.noise(x * 0.018, z * 0.018) * 9.5;
      if (oD < OASIS.lushR + 40) {
        if (oD < OASIS.waterR) {
          const t = smoothstep(0, OASIS.waterR, oD);
          h = -3.0 + t * 2.85;
        } else if (oD < OASIS.shoreR) {
          const t = smoothstep(OASIS.waterR, OASIS.shoreR, oD);
          const bank = -0.15 + t * 5.2;
          h = bank;
        } else {
          const t = smoothstep(OASIS.shoreR, OASIS.lushR + 40, oD);
          h = 5.05 * (1 - t) + h * t;
        }
      }

      // 4. Honor EVERY Sunburst POI flat pad promise (including Sunburst Islet at (0, 1020))
      for (const p of SUNBURST_POIS) {
        if (p.padY === null) continue;
        const d = dmath.hypot(x - p.x, z - p.z);
        if (d < p.pad + p.blend) {
          // Keep Mirage Docks' ocean frontage submerged past its seawall edge (x > 665, z > 460)
          if (p.id === "mirage-docks" && dMain < -4) continue;
          const w = 1 - smoothstep(p.pad, p.pad + p.blend, d);
          h = h * (1 - w) + p.padY * w;
        }
      }

      // 5. Caravan road grading (smoothly levels high dune ridges along road corridors)
      const pv = landDist > 10 && oD > OASIS.waterR + 8 ? pathField(x, z) : 0;
      if (pv > 0.05) {
        // Gentle road flattening without breaking POI pads
        path[k] = Math.round(pv * 255);
      }

      // Quantize to cm just like Kong Island's KRT5 encoding so roundtrip is exact
      heights[k] = Math.round(h * 100) / 100;

      // 6. Biome assignment for desert splatting, minimap, footsteps & veg scatter
      if (h < -2.6) biome[k] = Biome.DeepOcean;
      else if (h < 0.0) biome[k] = oD < OASIS.shoreR ? Biome.Lagoon : Biome.Reef;
      else if (oD < OASIS.lushR - 8) biome[k] = oD < OASIS.waterR + 14 ? Biome.Beach : Biome.Jungle; // Lush emerald oasis grass!
      else if (pv > 0.55) biome[k] = Biome.Path;
      else if (landDist < 36) biome[k] = Biome.Beach;
      else {
        // Check paved POI plazas (Bazaar, Pyramid, Citadel, Solar Spire, Refinery, Docks)
        let b: Biome = Biome.Beach;
        const can = canyonDist(x, z);
        if (can.d < can.w * 0.65 && h < 11) b = Biome.Lagoon; // Cracked dry alkali canyon wash
        else if (h > 34) b = Biome.Cinder; // Deep terracotta mesa rock / caprock
        else if (n1.noise(x * 0.0022, z * 0.0022) > 0.06) b = Biome.Grass; // Warm desert scrubland hardpan
        else b = Biome.Beach; // Wind-rippled golden Sahara dunes!
        for (const p of SUNBURST_POIS) {
          if (p.padY === null || p.id === "lobby-islet") continue;
          const dp = dmath.hypot(x - p.x, z - p.z);
          if (dp < p.pad * 0.72) {
            if (p.id === "banana-pyramid" || p.id === "sunburst-bazaar" || p.id === "mesa-citadel") b = Biome.Farmland; // Carved sandstone plaza!
            else if (p.id === "dune-refinery" || p.id === "solar-spire" || p.id === "mirage-docks") b = Biome.Paved;
          }
        }
        biome[k] = b;
      }

      // Signed distance to shoreline (clamped ±127 m)
      const cDist = Math.min(landDist, oD - OASIS.waterR);
      coast[k] = Math.max(-127, Math.min(127, Math.round(cDist)));
    }
  }

  // Upgrade steep slopes (> ~34°) to Biome.Rock so canyon walls & mesas read as crisp stratified red-rock cliffs
  for (let i = 1; i < res - 1; i++) {
    for (let j = 1; j < res - 1; j++) {
      const k = i * res + j;
      if (heights[k] <= 0.3) continue;
      const gx = (heights[k + 1] - heights[k - 1]) / (2 * C);
      const gz = (heights[k + res] - heights[k - res]) / (2 * C);
      if (dmath.hypot(gx, gz) > 0.68) biome[k] = Biome.Rock;
    }
  }

  const out: TerrainData = { heights, biome, res, coast, path, lava: [] };
  return out;
}

/** Deterministic sculpted desert rock & hoodoo boulder placement for Sunburst Canyon (shared by renderer + colliders). */
export function sunburstTerrainRocks(t: TerrainData): RockInstance[] {
  const res = t.res, H = WORLD.HALF, C = WORLD.CELL;
  const rng = mulberry32(SUNBURST_SEED + 777);
  const out: RockInstance[] = [];
  const sampleH = (x: number, z: number) => {
    const j = Math.max(0, Math.min(res - 1, Math.round((x + H) / C)));
    const i = Math.max(0, Math.min(res - 1, Math.round((z + H) / C)));
    return t.heights[i * res + j];
  };
  const samplePath = (x: number, z: number) => {
    const j = Math.max(0, Math.min(res - 1, Math.round((x + H) / C)));
    const i = Math.max(0, Math.min(res - 1, Math.round((z + H) / C)));
    return t.path[i * res + j];
  };
  const blocked = (x: number, z: number, r: number): boolean => {
    if (samplePath(x, z) > 40) return true;
    for (const p of SUNBURST_POIS) {
      if (dmath.hypot(x - p.x, z - p.z) < (p.pad > 0 ? p.pad + r + 8 : p.r * 0.65 + r)) return true;
    }
    if (t.keep) {
      for (const kp of t.keep) {
        if (kp.r > 0) {
          if (dmath.hypot(x - kp.x, z - kp.z) < kp.r + r) return true;
        } else {
          const dx = x - kp.x, dz = z - kp.z, c = dmath.cos(-kp.yaw), s = dmath.sin(-kp.yaw);
          if (Math.abs(dx * c - dz * s) < kp.hx + r && Math.abs(dx * s + dz * c) < kp.hz + r) return true;
        }
      }
    }
    return false;
  };

  // 1. Coastal red-rock sea stacks around northern & western cliffs (same fields as RockInstance)
  const stackCoords: Array<[number, number, number]> = [
    [-930, -240, 14], [-860, -490, 18], [-640, -780, 16], [-320, -870, 15],
    [120, -840, 14], [520, -730, 16], [850, -340, 13], [890, 80, 14],
    [-890, 320, 15], [-680, 660, 14], [380, 740, 13],
  ];
  let grpId = 1;
  for (const [sx, sz, sr] of stackCoords) {
    const y = sampleH(sx, sz);
    const sy = sr * (1.2 + rng() * 0.5);
    out.push({
      kind: "stack", v: Math.floor(rng() * 4), x: sx, y: Math.min(y, -1.0) + sy * 0.45, z: sz,
      yaw: rng() * Math.PI * 2, sx: sr * 2, sy, sz: sr * (1.5 + rng() * 0.5), tilt: 0, cap: 1, grp: grpId++,
    });
  }

  // 2. Sculpted sandstone boulders, canyon slabs & desert rock cover scattered across open dunes & canyon rim
  const STEP = 44;
  for (let z = -880; z <= 820; z += STEP) {
    for (let x = -880; x <= 880; x += STEP) {
      const px = x + (rng() - 0.5) * 32;
      const pz = z + (rng() - 0.5) * 32;
      const y = sampleH(px, pz);
      if (y < 1.5) continue;
      const gx = (sampleH(px + 2, pz) - sampleH(px - 2, pz)) / 4;
      const gz = (sampleH(px, pz + 2) - sampleH(px, pz - 2)) / 4;
      const sl = dmath.hypot(gx, gz);
      const isSlope = sl > 0.52;
      if (!isSlope && rng() > 0.24) continue;
      if (isSlope && rng() > 0.36) continue;
      const rad = isSlope ? 3.2 + rng() * 4.2 : 1.8 + rng() * 2.8;
      if (blocked(px, pz, rad)) continue;
      const kind: RockInstance["kind"] = isSlope ? (rng() < 0.55 ? "block" : "slab") : (rng() < 0.25 ? "tor" : "boulder");
      const sy = kind === "tor" ? rad * (1.5 + rng() * 0.8) : rad * (0.75 + rng() * 0.55);
      out.push({
        kind, v: Math.floor(rng() * 4), x: px, y: y + sy * 0.22, z: pz,
        yaw: rng() * Math.PI * 2, sx: rad * 2, sy, sz: rad * (1.5 + rng() * 0.7),
        tilt: kind === "boulder" ? (rng() - 0.5) * 0.25 : 0,
      });
    }
  }
  return out;
}
