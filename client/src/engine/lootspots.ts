// The loot-spot worker bridge: delegates to the unified static-world worker (static-world.ts) so island.bin and
// StaticWorld are built once off the main thread, and lazily imports shared/sim/loot-spots so the 2.5 MB POI layout /
// JSON graph stays out of the initial boot JS download.
import type { StaticWorld } from "../../../shared/sim/world";
import { startStaticWorld, takeLootSpotsJob } from "./static-world";

/** start the shared boot worker (idempotent; ?nolootworker disables the loot-spots phase) */
export function startLootSpotsWorker() {
  startStaticWorld();
}

/** when the worker's set is for THIS world (same static-world hash), hand it to shared/sim/loot-spots (no in-thread build) */
export function adoptWorkerLootSpots(world: StaticWorld, worldHash: number) {
  const job = takeLootSpotsJob();
  if (!job) return;
  const kr = (globalThis as unknown as { __kr?: Record<string, unknown> }).__kr;
  void job.then(async (r) => {
    if (r.ok && r.set && r.hash === worldHash) {
      const { adoptLootSpots } = await import("../../../shared/sim/loot-spots");
      adoptLootSpots(world, r.set);
      if (kr) kr.lootWorker = { adopted: true, worldMs: r.worldMs, spotsMs: r.spotsMs, at: Math.round(performance.now()) };
    } else {
      if (kr) kr.lootWorker = { adopted: false, why: r.ok ? `hash ${r.hash} != ${worldHash}` : r.error };
      if (!r.ok) console.warn("[loot-spots worker]", r.error);
    }
  });
}
