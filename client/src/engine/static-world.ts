// The static collision world for prediction / the offline host, built in a Web Worker that the boot starts at t = 0
// (it cost 1.8-2 s of main thread at the start of the game stage). Same recipe as the server
// (shared/sim/static-world.ts); the worker's terrain hash must equal the page's, else the page builds in-thread.
import type { Terrain } from "../../../shared/world/terrain";
import type { RockKeep, TerrainData } from "../../../shared/world/terrain-gen";
import type { Box } from "../../../shared/world/colliders";
import type { StaticWorld } from "../../../shared/sim/world";
import type { Climb } from "../../../shared/sim/climb";
import type { SpotSet } from "../../../shared/sim/loot-spots";
import { assetUrl } from "./assets";
import { flag } from "../flags";

interface WorkerResult { ok: boolean; boxes?: Box[]; hash?: number; climbs?: Climb[]; terrainHash?: number; ms?: number; error?: string }
export interface SpotsWorkerResult { ok: boolean; hash?: number; set?: SpotSet; worldMs?: number; spotsMs?: number; error?: string }
type Msg = ({ kind: "keep"; ok: true; keep: RockKeep[] }) | ({ kind: "world" } & WorkerResult) | ({ kind: "spots" } & SpotsWorkerResult) | { kind: "error"; ok: false; error: string };
let job: Promise<WorkerResult> | null = null;
let keepJob: Promise<RockKeep[] | null> | null = null;
let spotsJob: Promise<SpotsWorkerResult> | null = null;

/** start the single boot worker (computes live POI rock keep-outs, builds StaticWorld, then optionally lootSpots on the same world; idempotent). */
export function startStaticWorld() {
  if (job) return;
  const wantSpots = !flag("nolootworker");
  let resK!: (r: RockKeep[] | null) => void, resW!: (r: WorkerResult) => void, resS!: (r: SpotsWorkerResult) => void;
  keepJob = new Promise<RockKeep[] | null>((r) => { resK = r; });
  job = new Promise<WorkerResult>((r) => { resW = r; });
  spotsJob = wantSpots ? new Promise<SpotsWorkerResult>((r) => { resS = r; }) : null;
  try {
    const w = new Worker(new URL("./static-world.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<Msg>) => {
      const d = ev.data;
      if (d.kind === "keep") { resK(d.keep); }
      else if (d.kind === "world") { resW(d); if (!wantSpots) w.terminate(); }
      else if (d.kind === "spots") { resS(d); w.terminate(); }
      else { resK(null); resW(d); resS?.(d); w.terminate(); }
    };
    w.onerror = (e) => { const err = { ok: false, error: String(e.message || e) }; resK(null); resW(err); resS?.(err); w.terminate(); };
    w.postMessage({ url: new URL(assetUrl("assets/terrain/island.bin"), location.href).href, spots: wantSpots });
  } catch (e) {
    const err = { ok: false, error: String(e) };
    resK(null); resW(err); resS?.(err);
  }
}

/** live POI rock keep-outs from the boot worker (null if worker not started or failed → load.ts falls back to dynamic import) */
export function rockKeeps(): Promise<RockKeep[] | null> {
  const p = keepJob;
  keepJob = null;
  return p ?? Promise.resolve(null);
}

/** consume the loot-spots result produced by the static-world worker (null if ?nolootworker or not started) */
export function takeLootSpotsJob(): Promise<SpotsWorkerResult> | null {
  const p = spotsJob;
  spotsJob = null;
  return p;
}

/** the static world: the worker's result when it matches this page's terrain, else built in-thread */
export async function staticWorld(terrain: Terrain, td: TerrainData): Promise<{ world: StaticWorld; boxes: Box[]; hash: number }> {
  const kr = (globalThis as unknown as { __kr?: Record<string, unknown> }).__kr;
  const r = job ? await job : null;
  job = null;   // (the settled promise held the worker's ~490 k collider objects for the whole session)
  if (r?.ok && r.boxes && r.hash !== undefined && (td.hash === undefined || r.terrainHash === td.hash)) {
    const [{ StaticWorld }, { buildRoads }] = await Promise.all([
      import("../../../shared/sim/world"),
      import("../../../shared/sim/roads"),
    ]);
    const t0 = performance.now();
    const world = new StaticWorld(terrain, r.boxes);
    world.climbs = r.climbs ?? [];
    // (the paved ground the terrain's biome map does not know — ~4 ms: without it the driver's prediction and the offline
    // host drove the runway and the town's streets on grass grip while the server drove them as road)
    world.roads = buildRoads(terrain);
    if (kr) kr.staticWorld = { worker: true, workerMs: r.ms, gridMs: Math.round(performance.now() - t0), boxes: r.boxes.length };
    return { world, boxes: r.boxes, hash: r.hash };
  }
  if (r && !r.ok) console.warn("[static-world] worker failed, building in-thread:", r.error);
  const { buildStaticWorld } = await import("../../../shared/sim/static-world");
  const t0 = performance.now();
  const out = await buildStaticWorld(terrain, td);
  if (kr) kr.staticWorld = { worker: false, ms: Math.round(performance.now() - t0), boxes: out.boxes.length };
  return out;
}
