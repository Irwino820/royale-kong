// Smart lobby preloader for low-memory devices: warms far impostors, off-main-thread procedural texture workers
// (town, harbor, containers, apron fine tile), baked coast PBR textures and dynamic POI part chunks during idle title/
// lobby time. Keeps zero GPU POI meshes resident (respecting PoiResidency and lowmem budgets) and pauses immediately
// if a match begins so live frames never contend with background work.
import type { Engine } from "./engine/engine";
import { resources } from "./engine/res/scope";
import { workerPool } from "./engine/worker-pool";
import { isSunburst } from "../../shared/world/maps";

export interface LobbyPreloadState {
  stage: string;
  done: boolean;
  totalMs: number;
  stages: Record<string, number>;
}

function idleGap(ms = 120): Promise<void> {
  return new Promise((resolve) => {
    const go = () => {
      const ric = (globalThis as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
      if (ric) ric(() => resolve(), { timeout: 300 });
      else setTimeout(resolve, 0);
    };
    setTimeout(go, ms);
  });
}

let started = false;

export async function startLobbyPreload(
  engine: Engine,
  inMatch: () => boolean,
  warmImpostors: () => Promise<void>,
): Promise<void> {
  if (started) return;
  started = true;
  const tAll = performance.now();
  const state: LobbyPreloadState = { stage: "wait", done: false, totalMs: 0, stages: {} };
  (globalThis as unknown as { __kr?: { lobbyPreload?: LobbyPreloadState } }).__kr && (((globalThis as unknown as { __kr: { lobbyPreload?: LobbyPreloadState } }).__kr).lobbyPreload = state);

  const runStage = async (name: string, fn: () => Promise<unknown>): Promise<boolean> => {
    if (inMatch()) { state.stage = "paused-for-match"; return false; }
    state.stage = name;
    const t0 = performance.now();
    try { await fn(); } catch (e) { console.warn(`[lobby-preload:${name}] skipped`, e); }
    state.stages[name] = Math.round(performance.now() - t0);
    state.totalMs = Math.round(performance.now() - tAll);
    return true;
  };

  // Wait until the game's own deferred prefab/match prewarm finishes so we never contend with title GPU prewarm.
  const kr = (globalThis as unknown as { __kr?: { warmDone?: boolean; prefabWarmP?: Promise<void> } }).__kr;
  if (kr && kr.warmDone !== true && kr.prefabWarmP) {
    try { await kr.prefabWarmP; } catch { /* ignore */ }
  }
  await idleGap(300);

  // 1. Baked far impostors (3 MB, decoded 1/frame) + ktx2 manifest: ready before entering the plane.
  if (!await runStage("impostors", () => Promise.all([
    warmImpostors(),
    import("./engine/ktx2-tex").then((m) => m.warmKtx2Manifest()),
  ]))) return;
  if (isSunburst()) {
    state.stage = "done";
    state.done = true;
    state.totalMs = Math.round(performance.now() - tAll);
    return;
  }
  await idleGap(80);

  // 2. Town kit procedural textures in Web Workers (6 POIs: mango-market, coconut-cove, stilt-town, canopy-line,
  //    the-murk, wreck-bay). Idempotent; stays in CPU cache until a POI actually draws.
  if (!await runStage("town", async () => {
    const { preloadTownTex } = await import("./world/pois/_kit/town-tex");
    await preloadTownTex(engine.renderer, () => engine.afterPaint());
  })) return;
  await idleGap(120);

  // 3. Harbor + container procedural textures in Web Workers + dynamic part chunks (sequenced with match checks so
  //    nothing collides with match start or bursts the main thread).
  if (!await runStage("harbor", async () => {
    const [{ harborMatsAsync }, { containerTexAsync }, { loadParts }, { hasFinePre, setFinePre }] = await Promise.all([
      import("./world/pois/_kit/harbor-materials"),
      import("./world/pois/_kit/containers-tex"),
      import("./world/pois/peel-harbor/parts"),
      import("./world/pois/peel-harbor/apron-fine"),
    ]);
    if (inMatch()) return;
    await harborMatsAsync();
    await engine.afterPaint();
    if (inMatch()) return;
    await containerTexAsync();
    await engine.afterPaint();
    if (inMatch()) return;
    await loadParts();
    await engine.afterPaint();
    if (inMatch()) return;
    if (!hasFinePre() && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
      const fineScope = resources.root.child("lobby-preload-fine");
      try {
        const fp = workerPool(() => fineScope.worker(new Worker(new URL("./world/pois/_kit/harbor-tex.worker.ts", import.meta.url), { type: "module" })), 1);
        await fp.run<{ pk: Uint8Array; nk: Uint8Array }>("fine").then(setFinePre).finally(() => { fp.close(); fineScope.dispose(); });
      } catch { fineScope.dispose(); }
    }
  })) return;
  await idleGap(120);

  // 4. Baked coast PBR textures (2.9 MB .webp on disk — paced 2 sets per frame so capped() canvas resizes never stutter).
  if (!await runStage("coast", async () => {
    const coastTex = await import("./world/pois/_kit/coast-tex");
    await coastTex.preloadBaked((url, srgb, repeat) => engine.assets.texture(url, { srgb, repeat }), {
      batch: 2,
      pause: async () => { await engine.afterPaint(); return !inMatch(); },
    });
  })) return;
  await idleGap(120);

  // 5. Shared jungle noise texture + coplanar solver chunk (banana-temple, the-murk, canopy-line, mist-falls,
  //    coco-caves, ripe-peak).
  if (!await runStage("jungle", async () => {
    const [{ jungleNoiseTex }] = await Promise.all([
      import("./world/pois/_kit/jungle-mat"),
      import("./world/pois/_kit/coplanar-solve"),
    ]);
    jungleNoiseTex();
  })) return;

  state.stage = "done";
  state.done = true;
  state.totalMs = Math.round(performance.now() - tAll);
}
