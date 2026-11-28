// End-to-end verification of SUNBURST CANYON (2400×2400 m desert map):
// terrain decode, all 13 POIs & colliders, breakable glass, ladders, ziplines, canyon thermal updraft,
// desert Tuk-Tuks & Helipads, loot spots, 12 Desert Mythics, and a live headless Battle Royale match!
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { POIS } from "../../shared/world/map";
import { setActiveMap, SUNBURST_POIS } from "../../shared/world/maps";
import { Terrain } from "../../shared/world/terrain";
import { decodeTerrainFile } from "../../shared/world/terrain-gen";
import { buildStaticWorld } from "../../shared/sim/static-world";
import { SUNBURST_POIS_DATA, SUNBURST_POI_BY_ID } from "../../shared/pois/sunburst/index";
import { lootSpots } from "../../shared/sim/loot-spots";
import { fleetSpots, isletSpots } from "../../shared/sim/tuk-spots";
import { heliPads, heliIslet } from "../../shared/sim/heli-spots";
import { activeZipLines, stepZip, zipAttach, ZIP, ZIP_ST, type ZipRider } from "../../shared/sim/zipline";
import { inUpdraft, updraftLift, UPDRAFT } from "../../shared/sim/updraft";
import { mythicIndexOfPoi, MYTHICS } from "../../shared/sim/mythic";
import { hotDropPoi } from "../../shared/sim/events-dyn";
import { Match, Phase } from "../../shared/sim/match";
import { glassPanes } from "../../shared/sim/glass";
import { bananaStands } from "../../shared/sim/economy";
import { makePlayer, makeInput, PS, B as BTN } from "../../shared/sim/player";
import { stepPlayer } from "../../shared/sim/player.hot";
import { DT } from "../../shared/sim/const";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// 1. Activate Sunburst Canyon & load baked sunburst.bin
setActiveMap("sunburst-canyon");
assert.equal(POIS.length, 13, "Sunburst Canyon should have 13 POIs (12 named + lobby-islet)");
assert.equal(POIS[POIS.length - 1].id, "lobby-islet", "lobby-islet must remain last in POIS");

const binPath = path.join(root, "public/assets/terrain/sunburst.bin");
const raw = fs.readFileSync(binPath);
const td = decodeTerrainFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
assert.equal(td.res, 1201, "expected 1201×1201 terrain grid");
const terrain = new Terrain(td.heights, td.biome);

// Verify Emerald Oasis water basin is underwater and Mesa Citadel plateau is at 56 m
assert.ok(terrain.height(0, 40) < -1.5, `Emerald Oasis center should be underwater, got ${terrain.height(0, 40)}`);
assert.ok(Math.abs(terrain.height(-520, -600) - 56) < 0.1, `Mesa Citadel pad should be 56 m, got ${terrain.height(-520, -600)}`);
assert.ok(Math.abs(terrain.height(-420, -240) - 24) < 0.1, `Banana Pyramid pad should be 24 m, got ${terrain.height(-420, -240)}`);

// 2. Build deterministic StaticWorld + loot + vehicles + traversal
const { world, boxes, hash, climbs } = await buildStaticWorld(terrain, td);
assert.ok(boxes.length > 500, `expected >500 static colliders on Sunburst Canyon, got ${boxes.length}`);
assert.ok(hash !== 0, "worldHash must be non-zero");
assert.ok(climbs.length >= 4, `expected ≥4 climbable desert ladders, got ${climbs.length}`);
const panes = glassPanes(world);
assert.ok(panes.n >= 20, `expected ≥20 breakable glass panes, got ${panes.n}`);
console.log(`PASS  sunburst static world (${boxes.length} boxes, ${climbs.length} ladders, ${panes.n} glass panes, hash ${hash.toString(16)})`);

// 3. Ziplines (+30% speed verification), Thermal Updraft, Vehicles, Mythics & Hot Drop
const zips = activeZipLines();
assert.equal(zips.length, 6, "expected 6 Sunburst Canyon ziplines");
assert.ok(ZIP.VMIN >= 8.4 && ZIP.VMAX >= 32.4, `expected +30% faster zipline speeds, got VMIN=${ZIP.VMIN} VMAX=${ZIP.VMAX}`);
{
  // Verify a real downhill ride on the Mesa Citadel -> Banana Pyramid zipline reaches +30% faster speeds cleanly!
  const L = zips[1];
  const rider: ZipRider = {
    st: 0, x: L.ax, y: L.ya + 0.1, z: L.az, vx: 0, vy: 0, vz: 0,
    grounded: true, crouch: false, sprint: false, slope: false, swim: false, scoped: false,
    coyote: 0, jumpBuf: 0, airT: 0, fallV: 0,
  };
  assert.equal(zipAttach(rider), true, "rider should attach to Mesa -> Pyramid zipline pole");
  assert.equal(rider.st, ZIP_ST);
  let maxSpd = 0;
  for (let i = 0; i < 2400 && rider.st === ZIP_ST; i++) {
    stepZip(rider, 0, DT, 1, 2);
    maxSpd = Math.max(maxSpd, Math.hypot(rider.vx, rider.vy, rider.vz));
  }
  assert.ok(maxSpd > 11.5, `expected fast downhill zip speed > 11.5 m/s, got ${maxSpd.toFixed(2)}`);
  assert.equal(rider.st, 0, "rider should arrive cleanly at far zipline pole");
}
assert.equal(UPDRAFT.x, -40);
assert.equal(UPDRAFT.z, -340);
assert.equal(inUpdraft(-40, 12, -340), true, "Redrock Canyon floor should trigger thermal updraft");
assert.ok(updraftLift(-40, 20, -340) > 0.8, "Thermal updraft should provide strong vertical lift");

const tuks = fleetSpots(world, 42);
const helis = heliPads(world, 42);
assert.ok(tuks.length >= 6, `expected ≥6 desert Tuk-Tuks, got ${tuks.length}`);
assert.ok(helis.length >= 2, `expected ≥2 desert Helipads, got ${helis.length}`);
assert.ok(isletSpots(world).length >= 1, "Sunburst warmup islet should have a Tuk-Tuk");
assert.ok(heliIslet(world).length >= 1, "Sunburst warmup islet should have a Helicopter");

for (let i = 0; i < SUNBURST_POIS.length - 1; i++) {
  const mk = mythicIndexOfPoi(i);
  assert.ok(mk >= 16 && mk < MYTHICS.length, `POI ${SUNBURST_POIS[i].id} missing desert mythic`);
}
const hd = hotDropPoi(42);
assert.ok(hd >= 0 && hd < SUNBURST_POIS.length - 1, `invalid hotDropPoi ${hd}`);

const ls = lootSpots(world);
assert.ok(ls.spots.length >= 150, `expected ≥150 canonical desert loot spots, got ${ls.spots.length}`);

// 3b. Verify ALL 12 Banana Stands spawn at easily reachable ground level (never atop pyramid apex, skull, or bastion roof!)
const stands = bananaStands(world);
assert.equal(stands.length, 12, `expected 12 Sunburst Banana Stands, got ${stands.length}`);
for (const s of stands) {
  const p = POIS[s.poi];
  const gh = terrain.height(s.x, s.z);
  assert.ok(Math.abs(s.y - gh) < 2.2, `Banana Stand at ${p.id} is too high above ground: y=${s.y.toFixed(2)} terrain=${gh.toFixed(2)}`);
}
// 3b2. Verify ZERO floating buildings/obelisks across ALL 13 Sunburst POIs!
// Every interior room must either sit directly on terrain OR be anchored by a solid foundation/bastion collider underneath all 4 corners.
for (const poi of SUNBURST_POIS_DATA) {
  for (const r of poi.INTERIOR_ROOMS) {
    const cy = Math.cos(r.yaw), sy = Math.sin(r.yaw);
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) {
      const cx = r.x + sx * r.w * cy + sz * r.d * sy;
      const cz = r.z - sx * r.w * sy + sz * r.d * cy;
      const gh = terrain.height(cx, cz);
      const gap = r.y - gh;
      if (gap <= 0.35) continue;
      // Check if a solid foundation/bastion collider covers this corner down into the terrain!
      const supported = poi.colliders.some((b) =>
        Math.abs(b.c[0] - cx) <= b.h[0] + 0.6 &&
        Math.abs(b.c[2] - cz) <= b.h[2] + 0.6 &&
        b.c[1] + b.h[1] >= r.y - 0.15 &&
        b.c[1] - b.h[1] <= gh + 0.35
      );
      assert.ok(supported, `FLOATING building corner in ${poi.id} at (${cx.toFixed(1)}, ${cz.toFixed(1)}): floor y=${r.y.toFixed(2)}, terrain=${gh.toFixed(2)}, gap=${gap.toFixed(2)}`);
    }
  }
}
// Verify Lobby Islet obelisks, stalls & arch gate all sit solidly grounded on the 2.50 m sandbar!
{
  const isletPoi = SUNBURST_POI_BY_ID["lobby-islet"];
  for (const pc of isletPoi.pieces) {
    if (pc.mat === "hieroglyph" || pc.mat === "sandstone") {
      const bottom = pc.y - pc.h * 0.5;
      const gh = terrain.height(pc.x, pc.z);
      if (bottom <= gh + 0.35) continue;
      // Upper shaft / architrave must rest directly on a grounded pedestal or pillar collider below it!
      const onSupport = isletPoi.colliders.some((b) =>
        Math.abs(b.c[0] - pc.x) <= b.h[0] + pc.w * 0.5 &&
        Math.abs(b.c[2] - pc.z) <= b.h[2] + pc.d * 0.5 &&
        b.c[1] + b.h[1] >= bottom - 0.3 &&
        b.c[1] - b.h[1] <= gh + 0.35
      );
      assert.ok(onSupport, `FLOATING lobby-islet stone piece (${pc.mat}) at (${pc.x.toFixed(1)}, ${pc.z.toFixed(1)}): bottom=${bottom.toFixed(2)} > terrain=${gh.toFixed(2)}`);
    }
  }
}
// Verify Bone Ridge 2.0 rich detail counts (sculpted skeleton + excavation outpost)
assert.ok(SUNBURST_POI_BY_ID["bone-ridge"].pieces.length >= 260, `expected rich Bone Ridge 2.0 (>=260 pieces), got ${SUNBURST_POI_BY_ID["bone-ridge"].pieces.length}`);
console.log(`PASS  sunburst grounding & Bone Ridge 2.0 (${SUNBURST_POI_BY_ID["bone-ridge"].pieces.length} pieces, 0 floating buildings/obelisks)`);
console.log(`PASS  sunburst traversal, stands & loot (${zips.length} zips, ${stands.length} ground stands, ${tuks.length} tuks, ${helis.length} helis, ${ls.spots.length} loot spots)`);

// 3c. Real physics walkability check: walk a Kong capsule from bottom to top of EVERY major Sunburst staircase!
function walkStairTest(label: string, x0: number, y0: number, z0: number, x1: number, z1: number, minTopY: number) {
  const p = makePlayer(1, 0, "tester", false);
  p.st = PS.Ground; p.x = x0; p.y = y0 + 0.05; p.z = z0; p.grounded = true;
  const inp = makeInput();
  let maxY = p.y;
  for (let tick = 0; tick < 600; tick++) {
    const dx = x1 - p.x, dz = z1 - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.8 && p.y >= minTopY) break;
    // Note: in player.hot.ts forward (mz=+1) moves along (-sin(yaw), -cos(yaw))
    inp.yaw = Math.atan2(-dx, -dz);
    inp.mx = 0; inp.mz = 1; inp.buttons = BTN.SPRINT;
    stepPlayer(p, inp, world, DT);
    if (p.y > maxY) maxY = p.y;
  }
  assert.ok(maxY >= minTopY, `staircase "${label}" blocked! reached maxY=${maxY.toFixed(2)} (pos=${p.x.toFixed(1)},${p.y.toFixed(2)},${p.z.toFixed(1)}) < target ${minTopY}`);
}
walkStairTest("Banana Pyramid East", -420 + 38.5, 24, -240, -420 + 4.4, -240, 46.8);
walkStairTest("Banana Pyramid West", -420 - 38.5, 24, -240, -420 - 4.4, -240, 46.8);
walkStairTest("Mesa Citadel NW Bastion", -520 - 16, 56, -600 - 33.5, -520 - 34, -600 - 33.5, 64.6);
walkStairTest("Mesa Citadel SE Bastion", -520 + 16, 56, -600 + 33.5, -520 + 34, -600 + 33.5, 64.6);
walkStairTest("Mesa Citadel West Rampart", -520 - 27.5, 56, -600, -520 - 35.5, -600, 59.5);
walkStairTest("Dune Refinery Catwalk", 490 + 15.8, 16, -290 - 10, 490 - 1, -290 - 10, 26.2);
walkStairTest("Solar Spire Deck", 220 + 24, 32, -560, 220 + 6.5, -560, 41.9);
walkStairTest("Skyship Wreck Ramp", -540, 10, 290 - 47, -540, 290 - 20, 22.2);
walkStairTest("Scorpion Arch West Crown", -220 - 50, 22, 490, -220 - 6, 490, 39.4);
walkStairTest("Scorpion Arch East Crown", -220 + 50, 22, 490, -220 + 6, 490, 39.4);
walkStairTest("Bone Ridge East Gantry", -740 + 16, 18, -60 + 1, -740 + 16, -60 - 12, 22.2);
walkStairTest("Bone Ridge West Gantry", -740 - 16, 18, -60 + 1, -740 - 16, -60 - 12, 22.2);
walkStairTest("Bone Ridge East -> Ribcage Bridge", -740 + 15.2, 22.38, -60 - 15, -740 + 4, -60 - 15, 23.85);
walkStairTest("Bone Ridge West -> Ribcage Bridge", -740 - 15.2, 22.38, -60 - 15, -740 - 4, -60 - 15, 23.85);
walkStairTest("Redrock North Bastion Stairs", -40 + 28, terrain.height(-40 + 28, -340 - 43), -340 - 43, -40 + 28, -340 - 59, 26.2);
walkStairTest("Redrock South Bastion Stairs", -40 - 24, terrain.height(-40 - 24, -340 + 21), -340 + 21, -40 - 24, -340 + 49, 26.2);
walkStairTest("Redrock Bridge South Rim Walk-On", -40 + 18, terrain.height(-40 + 18, -340 + 79), -340 + 79, -40 + 18, -340 + 68, 19.7);
// Building exterior roofStairs (Mesa Citadel Keep: lx=-8, lz=-8, w=21, d=16, h=5.5, yaw=0 -> +X wall at x=-520+3.55)
walkStairTest("Building roofStairs (Citadel Keep)", -520 + 3.55, 56, -600 - 14.5, -520 + 3.55, -600 - 3.8, 61.6);
console.log("PASS  sunburst staircase physics walkability (18/18 staircases climbed to top)");

// 4. Headless Battle Royale Match simulation on Sunburst Canyon!
const match = new Match({ seed: 42, mode: "trios", world, warmupS: 2, humans: [] });
match.startNow();
let sawPlane = false, sawPlay = false;
const totalTicks = Math.round(95 / DT);
for (let t = 0; t < totalTicks; t++) {
  match.ev.reset();
  match.step(DT);
  if (match.phase === Phase.Plane) sawPlane = true;
  if (match.phase === Phase.Play) sawPlay = true;
}
assert.ok(sawPlane, "match never entered Plane phase");
assert.ok(sawPlay, "match never entered Play phase");
let finiteOk = true, armed = 0;
for (const p of match.players) {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) finiteOk = false;
  if (p.slots.some((s) => s.kind === 1)) armed++;
}
assert.ok(finiteOk, "found non-finite player coordinates during Sunburst Canyon match");
assert.ok(armed >= 20, `expected ≥20 armed bots after landing on Sunburst Canyon, got ${armed}`);
console.log(`PASS  sunburst headless match (phase=${match.phase}, armed=${armed}/${match.players.length}, chests=${match.chests.length}, vehs=${match.vehs.list.length})`);

// 5. Switch back to Kong Island cleanly
setActiveMap("kong-island");
assert.equal(POIS.length, 17, "switching back to kong-island must restore 17 POIs");
console.log("PASS  map switch roundtrip (sunburst-canyon -> kong-island)");
