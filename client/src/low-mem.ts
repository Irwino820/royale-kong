import * as THREE from "three";
import type { Poi } from "../../shared/world/map";
import { Phase } from "../../shared/sim/match";
import { PS } from "../../shared/sim/player";
import type { Engine } from "./engine/engine";
import { isSunburst } from "../../shared/world/maps";
import type { StaticCache } from "./engine/static-cache";
import type { WorldModule } from "./world/module";
import { resources, type Scope } from "./engine/res/scope";
import { flag } from "./flags";
import { isLowMemory } from "./low-mem-device";
import type { Rebuildable } from "./engine/texture-release";
import { rebuildOnRestore } from "./low-mem-restore";

export function lowMemoryDevice(forced: string | null, fullPrepare: boolean): boolean {
  const on = isLowMemory(forced, fullPrepare);
  const kr = (globalThis as unknown as { __kr?: { lowMem?: boolean; streamed?: boolean } }).__kr;
  if (kr) { kr.lowMem = on; if (on) kr.streamed = true; }
  return on;
}

type Session = { game?: { inMatch?: boolean; cm?: { phase: number; pred?: { st: number } } | null }; caster?: { casting?: boolean } };

const VIEW_HALF_H_M = 150;
const OFFSCREEN_RANK_M = 1e6;
let viewBuilds = 0, pickedByView = false;
const view = new THREE.Frustum(), viewProj = new THREE.Matrix4(), poiSphere = new THREE.Sphere();
const LOOKAHEAD_S = 5, AHEAD_MIN_M = 0.01, SAMPLE_MS = 200, STALE_MS = 1000, TELEPORT_MPS = 150, FAST_MPS = 12, FAST_BUILD_GAP_MS = 8000;
const motion = { x: 0, z: 0, at: 0, vx: 0, vz: 0, known: false, builtAt: -Infinity };

function track(camera: THREE.Camera): boolean {
  const e = camera.matrixWorld.elements, now = performance.now(), dt = (now - motion.at) / 1000;
  if (dt * 1000 < SAMPLE_MS) return motion.known;
  const vx = (e[12] - motion.x) / dt, vz = (e[14] - motion.z) / dt;
  const jump = dt * 1000 > STALE_MS || Math.hypot(vx, vz) > TELEPORT_MPS;
  motion.vx = jump ? 0 : motion.known ? (motion.vx + vx) / 2 : vx;
  motion.vz = jump ? 0 : motion.known ? (motion.vz + vz) / 2 : vz;
  motion.known = !jump;
  motion.x = e[12]; motion.z = e[14]; motion.at = now;
  return motion.known;
}

function distM(camera: THREE.Camera, p: Poi): number {
  const e = camera.matrixWorld.elements;
  const here = Math.hypot(e[12] - p.x, e[14] - p.z) - p.r;
  return here <= 0 ? here : Math.max(AHEAD_MIN_M, Math.hypot(e[12] + motion.vx * LOOKAHEAD_S - p.x, e[14] + motion.vz * LOOKAHEAD_S - p.z) - p.r);
}

function nearModule(pending: string[], camera: THREE.Camera, pois: readonly Poi[], radiusM: number, viewCap: number): string | null {
  const kr = (globalThis as unknown as { __kr?: Session }).__kr;
  const casting = !!kr?.caster?.casting;
  if (!kr?.game?.inMatch && !casting) return null;
  const cm = kr?.game?.cm, phase = cm?.phase ?? Phase.Play, st = cm?.pred?.st;
  // on the plane (and in the warm-up) the build range counts height above the pad and POIs in view may build first; once
  // the player falls or glides both stop and it is the horizontal 5 s lookahead like on foot, so the POI the glide heads
  // for builds as soon as it is within lowmemr and those behind are the first evicted
  const airborne = !casting && phase <= Phase.Plane && st !== PS.Freefall && st !== PS.Glide;
  if (phase !== Phase.Plane) viewBuilds = 0;
  const overview = airborne && phase === Phase.Plane && viewBuilds < viewCap;
  if (overview) view.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const e = camera.matrixWorld.elements;
  if (!track(camera)) return null;
  if (Math.hypot(motion.vx, motion.vz) > FAST_MPS && performance.now() - motion.builtAt < FAST_BUILD_GAP_MS) return null;
  let best: string | null = null, bestD = Infinity;
  const resident = residents?.() ?? [];
  pickedByView = false;
  for (const id of pending) {
    const p = pois.find((x) => `poi:${x.id}` === id);
    if (!p) { pickedByView = false; return id; }
    const d = distM(camera, p);
    const me = { id, d: d + flag("lowmemhyst"), mb: costOf.get(id) ?? UNKNOWN_POI_MB };
    if (evictionsFor([...resident, me]).includes(me)) continue;
    const near = (airborne ? Math.hypot(d, e[13] - (p.padY ?? 0)) : d) < radiusM;
    const seen = overview && view.intersectsSphere(poiSphere.set(poiSphere.center.set(p.x, (p.padY ?? 0) + VIEW_HALF_H_M, p.z), Math.hypot(p.r, VIEW_HALF_H_M)));
    if (!seen && !near) continue;
    const rank = overview && !seen ? d + OFFSCREEN_RANK_M : d;
    if (rank < bestD) { best = id; bestD = rank; pickedByView = !near; }
  }
  return best;
}

export async function nextNearModule(pending: string[], camera: THREE.Camera, pois: readonly Poi[], radiusM: number, viewCap: number): Promise<string> {
  for (;;) {
    const id = nearModule(pending, camera, pois, radiusM, viewCap);
    if (id) { if (pickedByView) viewBuilds++; pending.splice(pending.indexOf(id), 1); return id; }
    await new Promise((r) => setTimeout(r, 250));
  }
}

type Hook = (dt: number, t: number) => void;
type StaticEntry = Parameters<StaticCache["unfreeze"]>[0];
const hooksOf = new Map<string, Hook[]>(), ctxOf = new Map<string, Engine>(), evicted = new Set<string>();
const GEOFREE = flag("geofree");
let restoreHooked = false;

export function moduleCtx(engine: Engine, w: World, id: string): Engine {
  (globalThis as unknown as { __kr: { rebuildModule?: (id: string) => Promise<void> } }).__kr.rebuildModule ??= async (x) => { if (w.modOf.has(x)) await evictStreamed(engine, w, x); const queued = pendingRef.indexOf(x); if (queued >= 0) pendingRef.splice(queued, 1); delete streamMsRef[x]; refreshImpostors(w.modOf); const t0 = performance.now(); await (await w.build(x)).integrated; if (!w.modOf.has(x)) { if (queued >= 0) pendingRef.push(x); return; } streamMsRef[x] = Math.round(performance.now() - t0); refreshImpostors(w.modOf); pollImpostor(w, x); };
  if (GEOFREE && !restoreHooked) {
    restoreHooked = true;
    rebuildOnRestore(engine, w, (x) => ctxOf.has(x), evictStreamed);
  }
  engine.rebuilding = evicted.has(id);
  const known = ctxOf.get(id);
  if (known) return known;
  const hooks: Hook[] = [], bound = new Map<PropertyKey, unknown>();
  const onUpdate = (fn: Hook) => { engine.onUpdate(fn); hooks.push(fn); };
  const ctx = new Proxy(engine, {
    get(t, k) {
      if (k === "onUpdate") return onUpdate;
      const v = Reflect.get(t, k);
      if (typeof v !== "function") return v;
      let b = bound.get(k);
      if (!b) bound.set(k, (b = (v as (...a: unknown[]) => unknown).bind(t)));
      return b;
    },
  });
  hooksOf.set(id, hooks);
  ctxOf.set(id, ctx);
  return ctx;
}

export type World = {
  modOf: Map<string, WorldModule>; scopeOf: Map<string, Scope>; rootsOf: Map<string, THREE.Object3D[]>;
  loaded: WorldModule[]; roots: (id: string) => THREE.Object3D[]; report: (where: string, e: unknown) => void; build: (id: string) => Promise<{ integrated: Promise<void> }>;
};

export async function evictStreamed(engine: Engine, w: World, id: string) {
  const m = w.modOf.get(id)!, roots = w.roots(id);
  integratedAt.delete(id); released.delete(id);
  const hooks = new Set(hooksOf.get(id)), u = engine.updates;
  for (let i = u.length - 1; i >= 0; i--) if (hooks.has(u[i])) { u.splice(i, 1); engine.updLabels.splice(i, 1); }
  engine.occlusion.unregister(id);
  const far = engine.far.pois.find((q) => q.id === id);
  if (far && impostors?.has(id)) engine.far.drop(far);
  else if (far?.state === "built") Object.assign(far, { roots: [], sources: [], near: -Infinity, moved: () => true, late: () => false });
  else if (far) engine.far.drop(far);
  const statics = engine.statics;
  for (const r of roots) {
    const e = (r as unknown as Record<string, StaticEntry | undefined>)[statics.rootKey];
    if (e) { statics.unfreeze(e); delete (r as unknown as Record<string, unknown>)[statics.rootKey]; statics.entries.splice(statics.entries.indexOf(e), 1); }
    const cull = engine.cull;
    if (cull.roots.includes(r)) { cull.drop(r); cull.stale.delete(r); cull.touchedAt.delete(r); cull.staleSince.delete(r); }
    r.removeFromParent();
  }
  try { await m.release?.(engine); } catch (e) { w.report(`release:${id}`, e); }
  const freed = disposeUnused(roots, engine.scene);
  try { w.scopeOf.get(id)?.dispose(); } catch (e) { w.report(`release:${id}`, e); }
  for (const map of [w.modOf, w.scopeOf, w.rootsOf, hooksOf, ctxOf]) map.delete(id);
  w.loaded.splice(w.loaded.indexOf(m), 1);
  evicted.add(id);
  const kr = (globalThis as unknown as { __kr: { modules: string[]; evictions?: unknown[] } }).__kr;
  kr.modules = w.loaded.map((x) => x.id);
  (kr.evictions ??= []).push({ id, at: Math.round(performance.now()), ...freed, cold: cold.size });
}

type Resident = { id: string; d: number; mb: number };
const costOf = new Map<string, number>(), building = new Set<string>();
let residents: (() => Resident[]) | null = null;

function costMB(roots: readonly THREE.Object3D[]): number {
  const bufs = new Set<object>(), tex = new Set<THREE.Texture>();
  for (const r of roots) r.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) for (const b of buffersOf(m.geometry)) bufs.add(b);
    if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) texturesOf(x, tex);
  });
  let bytes = 0;
  // (a geofree-released attribute still holds its GPU buffer: count the size it recorded when it dropped its array)
  for (const b of bufs) bytes += (b as { array?: ArrayBufferView | null }).array?.byteLength ?? (b as { releasedBytes?: number }).releasedBytes ?? 0;
  for (const t of tex) { const im = t.image as { width?: number; height?: number } | null; if (im?.width && im.height) bytes += im.width * im.height * 4 * (t.generateMipmaps ? 4 / 3 : 1); }
  return bytes / 1e6;
}

const UNKNOWN_POI_MB = 400;

function over(list: readonly Resident[]): boolean {
  return list.length > flag("lowmemcap") || list.reduce((a, r) => a + r.mb, 0) > flag("lowmembudget");
}

function evictionsFor(list: readonly Resident[]): Resident[] {
  const kept = [...list].sort((a, b) => a.d - b.d), out: Resident[] = [];
  while (kept.length > 1 && kept[kept.length - 1].d > 0 && over(kept)) out.push(kept.pop()!);
  return out;
}

const IMPOSTOR_MAGIC = "KRFI", IMPOSTOR_HEADER_B = 40, INTEGRATED_POLL_MS = 100, INTEGRATED_POLL_MAX_MS = 300_000, IMPOSTOR_HOLD_MS = 1000;
let impostors: Map<string, THREE.Mesh> | null = null, streamMsRef: Record<string, number> = {}, pendingRef: string[] = [];
let impMats: THREE.Material[] | null = null, impMatsBehind: THREE.Material[] | null = null;
let revealingRef: (id: string) => boolean = () => false;
const integratedAt = new Map<string, number>(), released = new Set<string>();

/** a built POI keeps its impostor until its model has dissolved in (engine/cull.ts reveal), and for at least
 *  IMPOSTOR_HOLD_MS: the dissolve steps by a frame dt clamped at 0.1 s, so under about 9 fps a wall-clock hold alone
 *  ended at 18-30% reveal and the location blinked; the floor covers a model whose dissolve is unavailable.
 *  Once released it stays hidden until the POI is evicted: a later HLOD reveal of the near sources is not a new build */
function held(id: string, now: number): boolean {
  if (released.has(id)) return false;
  const at = integratedAt.get(id);
  if (at === undefined || now - at < IMPOSTOR_HOLD_MS || revealingRef(id)) return true;
  released.add(id);
  return false;
}

/** refresh the impostors until `id`'s may hide, its build fails, or INTEGRATED_POLL_MAX_MS passes */
function pollImpostor(w: World, id: string) {
  const until = performance.now() + INTEGRATED_POLL_MAX_MS;
  const t = setInterval(() => {
    refreshImpostors(w.modOf);
    const failed = streamMsRef[id] !== undefined && !w.modOf.has(id);
    if (!failed && held(id, performance.now()) && performance.now() < until) return;
    clearInterval(t);
  }, INTEGRATED_POLL_MS);
}

function decodeImpostor(buf: ArrayBuffer): THREE.BufferGeometry {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== IMPOSTOR_MAGIC) throw new Error("not a far impostor");
  const n = dv.getUint32(8, true), ni = dv.getUint32(12, true);
  const lo = [0, 1, 2].map((c) => dv.getFloat32(16 + c * 4, true)), size = [0, 1, 2].map((c) => dv.getFloat32(28 + c * 4, true));
  const q = new Uint16Array(buf, IMPOSTOR_HEADER_B, n * 3), pos = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) pos[i] = lo[i % 3] + (q[i] / 65535) * size[i % 3];
  const colOff = IMPOSTOR_HEADER_B + Math.ceil((n * 6) / 4) * 4, rgba = new Uint8Array(buf, colOff, n * 4), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) col[i * 3 + c] = Math.pow(rgba[i * 4 + c] / 255, 2.2);
  const idxOff = colOff + n * 4;
  const rawIdx = n > 65535 ? new Uint32Array(buf, idxOff, ni) : new Uint16Array(buf.slice(idxOff, idxOff + ni * 2));
  const nTri = (ni / 3) | 0;
  // Separate strictly downward-facing flat undersides (ny < -0.95 -> FrontSide, so box/container/building/runway
  // bottoms backface-cull from the plane and skydive instead of z-fighting the aprons/terraces they sit on, while
  // still rendering if viewed from below), thin upward-facing overlays (0.5-8 cm above a larger flat slab, e.g.
  // harbor soil patches, resort pools, swamp boardwalks -> stronger polygonOffset), and smaller lower slabs sitting
  // 0.5-8 cm beneath a larger overlapping slab (e.g. cnvs-lab concrete under gravel -> gentler polygonOffset).
  const triKind = new Uint8Array(nTri); // 0 = base (DoubleSide), 1 = flat UP, 2 = flat DN (FrontSide), 3 = UP overlay, 4 = UP underlay
  const triY = new Float32Array(nTri);
  const buckets = new Map<number, { y: number; area: number; minX: number; maxX: number; minZ: number; maxZ: number }>();
  for (let t = 0; t < nTri; t++) {
    const a = rawIdx[t * 3], b = rawIdx[t * 3 + 1], c = rawIdx[t * 3 + 2];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-6) continue;
    const nny = ny / len;
    if (nny < -0.95) { triKind[t] = 2; continue; }
    if (nny > 0.95) {
      triKind[t] = 1;
      const y = (ay + by + cy) / 3, area = 0.5 * len;
      triY[t] = y;
      if (area > 0.01) {
        const bk = Math.round(y * 100);
        let cur = buckets.get(bk);
        if (!cur) buckets.set(bk, (cur = { y: bk / 100, area: 0, minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 }));
        cur.area += area;
        if (ax < cur.minX) cur.minX = ax; if (bx < cur.minX) cur.minX = bx; if (cx < cur.minX) cur.minX = cx;
        if (ax > cur.maxX) cur.maxX = ax; if (bx > cur.maxX) cur.maxX = bx; if (cx > cur.maxX) cur.maxX = cx;
        if (az < cur.minZ) cur.minZ = az; if (bz < cur.minZ) cur.minZ = bz; if (cz < cur.minZ) cur.minZ = cz;
        if (az > cur.maxZ) cur.maxZ = az; if (bz > cur.maxZ) cur.maxZ = bz; if (cz > cur.maxZ) cur.maxZ = cz;
      }
    }
  }
  const bigUp = [...buckets.values()].filter((b) => b.area > 200);
  if (bigUp.length) {
    for (let t = 0; t < nTri; t++) {
      if (triKind[t] !== 1) continue;
      const y = triY[t], myArea = buckets.get(Math.round(y * 100))?.area ?? 0;
      const a = rawIdx[t * 3], b = rawIdx[t * 3 + 1], c = rawIdx[t * 3 + 2];
      const minX = Math.min(pos[a * 3], pos[b * 3], pos[c * 3]), maxX = Math.max(pos[a * 3], pos[b * 3], pos[c * 3]);
      const minZ = Math.min(pos[a * 3 + 2], pos[b * 3 + 2], pos[c * 3 + 2]), maxZ = Math.max(pos[a * 3 + 2], pos[b * 3 + 2], pos[c * 3 + 2]);
      let under = false;
      for (let i = 0; i < bigUp.length; i++) {
        const ref = bigUp[i];
        if (ref.area <= myArea * 1.1 || maxX <= ref.minX || minX >= ref.maxX || maxZ <= ref.minZ || minZ >= ref.maxZ) continue;
        const dy = y - ref.y;
        if (dy > 0.005 && dy <= 0.08) { triKind[t] = 3; under = false; break; }
        if (dy < -0.005 && dy >= -0.08) under = true;
      }
      if (under && triKind[t] === 1) triKind[t] = 4;
    }
  }
  let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
  for (let t = 0; t < nTri; t++) { const k = triKind[t]; if (k === 2) c1++; else if (k === 3) c2++; else if (k === 4) c3++; else c0++; }
  const outIdx = n > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let p0 = 0, p1 = c0 * 3, p2 = (c0 + c1) * 3, p3 = (c0 + c1 + c2) * 3;
  for (let t = 0; t < nTri; t++) {
    const k = triKind[t], dst = k === 2 ? p1 : k === 3 ? p2 : k === 4 ? p3 : p0;
    outIdx[dst] = rawIdx[t * 3]; outIdx[dst + 1] = rawIdx[t * 3 + 1]; outIdx[dst + 2] = rawIdx[t * 3 + 2];
    if (k === 2) p1 += 3; else if (k === 3) p2 += 3; else if (k === 4) p3 += 3; else p0 += 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(outIdx, 1));
  g.clearGroups();
  if (c0) g.addGroup(0, c0 * 3, 0);
  if (c1) g.addGroup(c0 * 3, c1 * 3, 1);
  if (c2) g.addGroup((c0 + c1) * 3, c2 * 3, 2);
  if (c3) g.addGroup((c0 + c1 + c2) * 3, c3 * 3, 3);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

async function loadImpostors(engine: Engine, w: World, out: Map<string, THREE.Mesh>) {
  if (isSunburst()) return;
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") + "/assets/far/";
  const scope = resources.root.child("far-impostors");
  // (double-sided for base geometry because the bake merges leaf cards and cliff shells drawn DoubleSide at the POI;
  // group 1 uses FrontSide for strictly downward-facing undersides so box/container/building bottoms never z-fight from
  // above; group 2/3 form a strict 3-tier polygonOffset ladder for thin overlays and underlays; matBehind yields on reveal)
  const matBase = scope.material(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
  const matFront = scope.material(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
  const matOverlay = scope.material(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -14 }));
  const matUnderlay = scope.material(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 }));
  const matBehind = scope.material(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }));
  const matFrontBehind = scope.material(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }));
  const mats: THREE.Material[] = [matBase, matFront, matOverlay, matUnderlay];
  const matsBehind: THREE.Material[] = [matBehind, matFrontBehind, matBehind, matBehind];
  impMats = mats; impMatsBehind = matsBehind;
  const group = new THREE.Group();
  group.name = "far-merge-impostors";
  engine.scene.add(group);
  const index = (await (await fetch(base + "index.json")).json()) as { pois: Record<string, unknown> };
  const ids = Object.keys(index.pois);
  // Fetch all .bin files in parallel over the network, then decode 1 per frame so 15 decodeImpostor() calls never
  // stack into a ~380 ms main-thread freeze. Pre-compile both impMats and impMatsBehind asynchronously once the first
  // mesh is created so the first POI reveal never compiles |lambert shaders synchronously on a live frame.
  const fetches = ids.map((id) => fetch(base + id + ".bin").then((r) => r.arrayBuffer()).then((buf) => ({ id, buf }), (e) => { w.report("far-impostor:" + id, e); return null; }));
  let compiledBehind = false;
  for (const p of fetches) {
    const item = await p;
    if (!item) continue;
    try {
      const g = scope.geometry("geo.world", decodeImpostor(item.buf));
      const mesh = new THREE.Mesh(g, mats);
      mesh.name = "far-impostor:" + item.id;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      out.set("poi:" + item.id, mesh);
      refreshImpostors(w.modOf);
      const far = engine.far.pois.find((q) => q.id === "poi:" + item.id);
      if (far && !w.modOf.has("poi:" + item.id)) engine.far.drop(far);
      if (!compiledBehind) {
        compiledBehind = true;
        const dummy = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), matsBehind);
        void engine.compileObjects([mesh, dummy], false).finally(() => dummy.geometry.dispose());
      }
    } catch (e) { w.report("far-impostor:" + item.id, e); }
    await engine.afterPaint();
  }
}

/** __kr.showImpostors() on a view-camera page (?view / ?cam, no streaming): every POI the page did not build draws its
 *  baked far impostor and every built one hides it, so tools/performance/visual.mts compares an impostor with its POI
 *  from one camera */
export async function showImpostors(engine: Engine, w: World) {
  const shown = new Map<string, THREE.Mesh>();
  await loadImpostors(engine, w, shown);
  for (const [id, mesh] of shown) mesh.visible = !w.modOf.has(id);
}

let impostorLoadP: Promise<void> | null = null;
/** Start loading the baked far impostors while the player is still in the lobby so they are ready before the plane. */
export function warmImpostors(engine: Engine, w: World): Promise<void> {
  if (!flag("farimp")) return Promise.resolve();
  if (!impostors) {
    impostors = new Map();
    impostorLoadP = loadImpostors(engine, w, impostors).catch((e) => w.report("far-impostors", e));
  }
  return impostorLoadP ?? Promise.resolve();
}

function refreshImpostors(modOf: ReadonlyMap<string, unknown>) {
  if (!impostors) return;
  const now = performance.now();
  for (const [id, mesh] of impostors) {
    if (!modOf.has(id)) { integratedAt.delete(id); released.delete(id); }
    else if (streamMsRef[id] !== undefined && !integratedAt.has(id)) integratedAt.set(id, now);
    const show = held(id, now);
    mesh.visible = show;
    if (show && impMats && impMatsBehind) mesh.material = integratedAt.has(id) ? impMatsBehind : impMats;
  }
}

let trimming = Promise.resolve();

export function trimStreamed(engine: Engine, w: World, incoming: string | null, pending: string[], streamMs: Record<string, number>, pois: readonly Poi[]) {
  residents ??= () => {
    const list: Resident[] = [];
    for (const id of w.modOf.keys()) {
      if (!id.startsWith("poi:")) continue;
      const live = streamMs[id] !== undefined;
      if (live) building.delete(id);
      else if (!building.has(id)) continue;
      const p = pois.find((x) => `poi:${x.id}` === id);
      let mb = costOf.get(id);
      if (mb === undefined && live) costOf.set(id, (mb = costMB(w.roots(id))));
      list.push({ id, d: !live ? -Infinity : p ? distM(engine.camera, p) : 0, mb: mb ?? UNKNOWN_POI_MB });
    }
    return list;
  };
  if (!impostors && flag("farimp")) { impostors = new Map(); void loadImpostors(engine, w, impostors).catch((e) => w.report("far-impostors", e)); }
  streamMsRef = streamMs;
  pendingRef = pending;
  revealingRef = (id) => engine.cull.revealing(w.roots(id));
  return (trimming = trimming.then(async () => {
    refreshImpostors(w.modOf);
    for (;;) {
      const list = residents!();
      if (incoming) list.push({ id: incoming, d: -Infinity, mb: costOf.get(incoming) ?? UNKNOWN_POI_MB });
      const victim = evictionsFor(list)[0];
      if (!victim) break;
      await evictStreamed(engine, w, victim.id);
      refreshImpostors(w.modOf);
      pending.push(victim.id);
      delete streamMs[victim.id];
    }
    if (incoming) { building.add(incoming); motion.builtAt = performance.now(); }
    if (incoming && impostors) pollImpostor(w, incoming);
  }).catch((e) => w.report("lowmem-trim", e)));
}

type Disposable = { dispose(): void };

/** Sources an eviction left without pixels on either side: their CPU copy was dropped after upload (releaseAfterUpload)
 *  and their GPU copy was disposed. Module-level caches (Assets, pbr sets, coast sets) still hand these textures to the
 *  next build, so the source holds a 1x1 placeholder that three allocates without uploading until warmTextures fetches
 *  the pixels back before that build integrates. A cold texture drawn before that has 1x1 GPU storage, which three
 *  never resizes in place, so warm() disposes each texture before the full-size upload. */
const cold = new Map<Rebuildable, Set<THREE.Texture>>(), warming = new Map<Rebuildable, Promise<void>>();
/** A failed fetch (after the asset loader's own retries) tries again this many times, 1, 2, 4 and 8 s apart, while the
 *  source is still cold, so a texture drawn cold through a network blip does not stay black for the rest of the visit. */
const WARM_RETRIES = 4, WARM_RETRY_MS = 1000;

function warm(s: Rebuildable, tries = 0): Promise<void> {
  let p = warming.get(s);
  if (!p) warming.set(s, (p = (async () => {
    const data = await s.rebuild!();
    const ts = cold.get(s);
    if (!ts) return;
    cold.delete(s);
    s.data = data; s.dataReady = true;
    for (const t of ts) { t.dispose(); s.arm!(t, s.rebuild); t.needsUpdate = true; }
  })().catch(() => { if (tries < WARM_RETRIES) setTimeout(() => { if (cold.has(s)) void warm(s, tries + 1); }, WARM_RETRY_MS * 2 ** tries); }).finally(() => warming.delete(s))));
  return p;
}

/** Fetch back the pixels of every cold texture under these roots before they are drawn (a rebuilt POI reuses cached
 *  textures). Never throws: a texture whose fetch failed stays cold and fetches again when it is drawn. */
export async function warmTextures(roots: readonly THREE.Object3D[]): Promise<void> {
  if (!cold.size) return;
  const tex = new Set<THREE.Texture>(), wait: Promise<void>[] = [];
  for (const r of roots) r.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) for (const x of Array.isArray(m) ? m : [m]) texturesOf(x, tex); });
  for (const t of tex) if (cold.has(t.source)) wait.push(warm(t.source));
  await Promise.all(wait);
}

type Geo = THREE.BufferGeometry;

function texturesOf(m: THREE.Material, out: Set<THREE.Texture>) {
  for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) out.add(v as THREE.Texture);
  // uniforms of a ShaderMaterial, and those an onBeforeCompile patch keeps in userData (jungle-mat's jungleUniforms)
  for (const u of [(m as THREE.ShaderMaterial).uniforms, ...Object.values(m.userData)] as Array<Record<string, { value?: THREE.Texture | null } | null> | null>) {
    if (u && typeof u === "object") for (const k in u) { const v = u[k]?.value; if (v?.isTexture) out.add(v); }
  }
}

function buffersOf(g: Geo): Array<object> {
  const out: object[] = [];
  for (const a of Object.values(g.attributes)) out.push((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? (a as THREE.InterleavedBufferAttribute).data : a);
  if (g.index) out.push(g.index);
  return out;
}

export function disposeUnused(roots: readonly THREE.Object3D[], scene: THREE.Object3D): { geometries: number; materials: number; textures: number } {
  const geos = new Set<Geo>(), mats = new Set<THREE.Material>(), owners: Disposable[] = [];
  for (const r of roots) r.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.InstancedMesh).isInstancedMesh || (o as unknown as { isBatchedMesh?: boolean }).isBatchedMesh) owners.push(o as unknown as Disposable);
    if (m.geometry && !(o as unknown as { isBatchedMesh?: boolean }).isBatchedMesh) geos.add(m.geometry);
    if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
  });
  const keepBuf = new Set<object>(), keepMat = new Set<THREE.Material>(), keepTex = new Set<THREE.Texture>(), keepSrc = new Set<THREE.Texture["source"]>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) for (const b of buffersOf(m.geometry)) keepBuf.add(b);
    if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) keepMat.add(x);
  });
  for (const m of keepMat) texturesOf(m, keepTex);
  for (const t of keepTex) keepSrc.add(t.source);
  for (const o of owners) o.dispose();
  let geometries = owners.length, materials = 0, textures = 0;
  for (const g of geos) if (!buffersOf(g).some((b) => keepBuf.has(b))) { g.dispose(); geometries++; }
  const tex = new Set<THREE.Texture>();
  for (const m of mats) if (!keepMat.has(m)) { texturesOf(m, tex); m.dispose(); materials++; }
  for (const t of tex) {
    if (keepTex.has(t)) continue;
    const s = t.source as Rebuildable, px = s.data as { data?: unknown } | null;
    if (px !== null && px.data !== null) { t.dispose(); textures++; continue; }
    if (!s.arm || keepSrc.has(s) || (t as THREE.CompressedTexture).isCompressedTexture) continue;
    let ts = cold.get(s);
    if (!ts) { cold.set(s, (ts = new Set())); s.data = { width: 1, height: 1, depth: 1, data: null }; s.dataReady = false; }
    ts.add(t);
    t.onUpdate = () => { const kr = (globalThis as unknown as { __kr: { coldDraws?: number } }).__kr; kr.coldDraws = (kr.coldDraws ?? 0) + 1; void warm(s); };
    t.dispose(); textures++;
  }
  return { geometries, materials, textures };
}
