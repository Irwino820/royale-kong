// Builds the static collision world's boxes (and, when requested, the canonical loot spots + indoor nav graph) OFF the
// main thread in ONE worker: fetches/decodes island.bin and runs buildStaticWorld ONCE instead of twice across two
// duplicate ~1 MB worker bundles. Immediately posts the live POI rock keep-outs (so the main thread's boot bundle
// never needs to import shared/pois), then posts the world boxes as soon as ready (never waiting on lootSpots()).
import { decodeTerrainFile } from "../../../shared/world/terrain-gen";
import { setActiveMap, type MapId } from "../../../shared/world/maps";
import { Terrain } from "../../../shared/world/terrain";
import { buildStaticWorld } from "../../../shared/sim/static-world";
import { lootSpots } from "../../../shared/sim/loot-spots";
import { poiRockKeeps } from "../../../shared/world/rock-keeps";

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (ev: MessageEvent<{ url: string; mapId?: MapId; spots?: boolean }>) => {
  try {
    const t0 = performance.now();
    if (ev.data.mapId) setActiveMap(ev.data.mapId);
    // Kick off island.bin fetch in parallel with computing live POI rock keep-outs (needs no terrain file)
    const fetchP = fetch(ev.data.url, { cache: "no-cache" });
    post({ kind: "keep", ok: true, keep: poiRockKeeps() });
    const r = await fetchP;
    if (!r.ok) throw new Error(`island.bin ${r.status}`);
    const td = decodeTerrainFile(await r.arrayBuffer());
    const terrain = new Terrain(td.heights, td.biome);
    const { world, boxes, hash, climbs } = await buildStaticWorld(terrain, td);
    const t1 = performance.now();
    const worldMs = Math.round(t1 - t0);
    post({ kind: "world", ok: true, boxes, hash, climbs, terrainHash: td.hash, ms: worldMs });
    if (ev.data.spots) {
      const set = lootSpots(world);
      post({ kind: "spots", ok: true, hash, set, worldMs, spotsMs: Math.round(performance.now() - t1) });
    }
  } catch (e) {
    post({ kind: "error", ok: false, error: String(e instanceof Error ? e.stack || e.message : e) });
  }
};
