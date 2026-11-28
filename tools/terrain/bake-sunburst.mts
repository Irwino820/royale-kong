// Bake Sunburst Canyon: node --import tsx tools/terrain/bake-sunburst.mts [--check]
// Writes public/assets/terrain/sunburst.bin (KRT5) and verifies all 13 Sunburst POI pads + roundtrip hash.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setActiveMap, SUNBURST_POIS } from "../../shared/world/maps";
import { WORLD } from "../../shared/world/map";
import { Terrain } from "../../shared/world/terrain";
import { encodeTerrainFile, decodeTerrainFile, terrainHash, terrainRockColliders } from "../../shared/world/terrain-gen";
import { generateSunburstTerrain, sunburstTerrainRocks } from "../../shared/world/sunburst-terrain-gen";

setActiveMap("sunburst-canyon");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outFile = path.join(root, "public/assets/terrain/sunburst.bin");
const t0 = performance.now();
const t = generateSunburstTerrain();
t.keep = (await import("../../shared/world/rock-keeps")).poiRockKeeps();
t.hash = terrainHash(t);
console.log("sunburst generate ms", Math.round(performance.now() - t0), "res", t.res, "hash", t.hash!.toString(16));

let max = -1e9, min = 1e9, land = 0;
for (let k = 0; k < t.heights.length; k++) { const h = t.heights[k]; if (h > max) max = h; if (h < min) min = h; if (h >= 0) land++; }
console.log(`h range ${min.toFixed(1)}..${max.toFixed(1)} m, land ${(land * WORLD.CELL * WORLD.CELL / 1e6).toFixed(2)} km²`);

const terr = new Terrain(t.heights, t.biome);
for (const p of SUNBURST_POIS) {
  if (p.padY === null) continue;
  let worst = 0;
  for (let a = 0; a < 24; a++) for (let r = 0; r <= p.pad * 0.88; r += p.pad * 0.16) {
    const hh = terr.height(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
    if (hh < 0) continue;
    const d = Math.abs(hh - p.padY);
    if (d > worst) worst = d;
  }
  if (worst > 0.05) console.log(`PAD WARNING ${p.id}: max dev ${worst.toFixed(2)} m from padY ${p.padY}`);
}
const rocks = sunburstTerrainRocks(t);
console.log("desert rocks:", rocks.length, "colliders:", terrainRockColliders(rocks).length);

const buf = encodeTerrainFile(t);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, Buffer.from(buf));
const back = decodeTerrainFile(buf);
let err = 0, bd = 0;
for (let k = 0; k < back.heights.length; k++) {
  err = Math.max(err, Math.abs(back.heights[k] - t.heights[k]));
  if (back.biome[k] !== t.biome[k] || back.path[k] !== t.path[k] || back.coast[k] !== t.coast[k]) bd++;
}
if (err !== 0 || bd !== 0 || back.hash !== t.hash) { console.error("ROUNDTRIP MISMATCH", err, bd); process.exit(1); }
console.log("wrote public/assets/terrain/sunburst.bin", (buf.byteLength / 1e6).toFixed(2), "MB, roundtrip exact, hash", back.hash!.toString(16));
