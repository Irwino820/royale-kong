// 3D CONTEXTUAL TACTICAL PING RESOLVER & REGISTRY.
// Upgrades Kong Royale's basic map drop marker into a full Apex/Fortnite-style contextual ping system:
//   - Aim at enemy Kong        -> ENEMY SPOTTED (crimson, 18 s, pulsing beacon + minimap diamond)
//   - Double-tap Ping (<420ms) -> DANGER HERE (crimson, 18 s)
//   - Aim at floor weapon/item -> RARITY + ITEM NAME (rarity color, 28 s)
//   - Aim at Supply Drop/Chest -> SUPPLY DROP / CHEST (gold / rarity color, 28 s)
//   - Aim at Tuk-Tuk / Heli    -> TUK-TUK / HELICOPTER (cyan, 25 s)
//   - Aim at Banana Stand      -> BANANA STAND (emerald, 25 s)
//   - Aim at terrain / roof    -> MOVE HERE / POI NAME (persistent dropMarker in yellow / squad color)
import { CONSUMABLES, POIS, RARITIES, WEAPONS } from "../../../shared/world/map";
import { CONSUMABLE_DEFS, WEAPON_DEFS } from "../../../shared/sim/const";
import { IK, type Chest, type Item } from "../../../shared/sim/loot";
import { mythicOf } from "../../../shared/sim/mythic";
import { PS } from "../../../shared/sim/player";
import { VKind, VS } from "../../../shared/sim/vehicle";
import { makeHit, type StaticWorld } from "../../../shared/sim/world";
import type { PingKind } from "../ui/api";
import type { Remote, VehRemote } from "./client";

export const PING_KINDS: readonly PingKind[] = ["move", "enemy", "danger", "loot", "chest", "vehicle", "shop"];
export const isPingKind = (v: unknown): v is PingKind => typeof v === "string" && (PING_KINDS as readonly string[]).includes(v);

export const RARITY_HEX = ["#d0d7e2", "#46d160", "#38b6ff", "#b45cff", "#ffaa22", "#ff3b8d"] as const;

export const PING_COLOR: Record<PingKind, string> = {
  move: "#ffd400",
  enemy: "#ff3b30",
  danger: "#ff3b30",
  loot: "#38b6ff",
  chest: "#ffd400",
  vehicle: "#38d9ff",
  shop: "#46d160",
};

export const PING_TTL_MS: Record<PingKind, number> = {
  move: Infinity,
  enemy: 18_000,
  danger: 18_000,
  loot: 28_000,
  chest: 28_000,
  vehicle: 25_000,
  shop: 25_000,
};

export interface ActivePing {
  id: string;
  pid: number;
  kind: PingKind;
  label: string;
  color: string;
  x: number;
  y: number;
  z: number;
  at: number;
  ttlMs: number;
  mine: boolean;
}

export interface PingResult {
  action: "set" | "clear" | "miss";
  kind: PingKind;
  label: string;
  color: string;
  x: number;
  y: number;
  z: number;
}

const RAY_HIT = makeHit();

/** closest point along ray (ox,oy,oz)+t*(dx,dy,dz) to point (px,py,pz); returns { t, distSq, cosAng } */
function rayProximity(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  px: number, py: number, pz: number,
): { t: number; perp: number; ang: number } {
  const vx = px - ox, vy = py - oy, vz = pz - oz;
  const t = vx * dx + vy * dy + vz * dz;
  if (t <= 0.4) return { t: -1, perp: Infinity, ang: Infinity };
  const cx = vx - dx * t, cy = vy - dy * t, cz = vz - dz * t;
  const perp = Math.hypot(cx, cy, cz);
  return { t, perp, ang: perp / t };
}

function poiNameAt(x: number, z: number): string | null {
  for (let i = 0; i < POIS.length; i++) {
    const q = POIS[i];
    if (q.id === "lobby-islet") continue;
    const dx = x - q.x, dz = z - q.z;
    if (dx * dx + dz * dz < q.r * q.r) return q.name.toUpperCase();
  }
  return null;
}

export interface PingContext {
  camX: number; camY: number; camZ: number;
  dirX: number; dirY: number; dirZ: number;
  world: StaticWorld;
  remotes: readonly Remote[];
  items: ReadonlyMap<number, Item>;
  chests: readonly Chest[];
  vehicles: readonly VehRemote[];
  stands: ReadonlyArray<{ x: number; y: number; z: number }>;
  me: number;
  myTeam: number;
  snapTick: number;
  existingMove: { x: number; z: number } | null;
  doubleTap: boolean;
}

/** Contextual 3D ping under the player's crosshair. */
export function resolveContextualPing(c: PingContext): PingResult {
  const { camX, camY, camZ, dirX, dirY, dirZ, world } = c;
  world.raycast(camX, camY, camZ, dirX, dirY, dirZ, 3000, RAY_HIT, false);
  const maxT = RAY_HIT.hit ? RAY_HIT.t : 3000;

  // 1. Enemy Kong under crosshair (highest combat priority, up to 340 m, never behind a wall)
  {
    let best: Remote | null = null, bestScore = Infinity;
    for (let i = 0; i < c.remotes.length; i++) {
      const r = c.remotes[i];
      if (r.n === 0 || r.id === c.me || r.team === c.myTeam) continue;
      if (r.st === PS.Dead || r.st === PS.Spectate || r.st === PS.Plane) continue;
      if (c.snapTick - r.lastTick > 90) continue;
      const pr = rayProximity(camX, camY, camZ, dirX, dirY, dirZ, r.x, r.y + 1.05, r.z);
      if (pr.t < 1 || pr.t > Math.min(340, maxT + 2.2)) continue;
      // generous cone (0.062 rad ≈ 3.5°) or 1.4 m direct body radius
      if (pr.ang > 0.062 && pr.perp > 1.4) continue;
      const score = pr.ang + pr.t * 0.00005;
      if (score < bestScore) { bestScore = score; best = r; }
    }
    if (best) {
      return {
        action: "set", kind: "enemy", label: "ENEMY SPOTTED", color: PING_COLOR.enemy,
        x: best.x, y: best.y + 1.9, z: best.z,
      };
    }
  }

  // 2. Double-tap always flags DANGER HERE on the aimed surface
  if (c.doubleTap && RAY_HIT.hit) {
    return {
      action: "set", kind: "danger", label: "DANGER HERE", color: PING_COLOR.danger,
      x: camX + dirX * RAY_HIT.t, y: camY + dirY * RAY_HIT.t + 0.35, z: camZ + dirZ * RAY_HIT.t,
    };
  }

  // 3. Ground Loot Item under crosshair (up to 48 m)
  {
    let best: Item | null = null, bestScore = Infinity;
    for (const it of c.items.values()) {
      if (it.taken || it.kind === IK.Ammo || it.kind === IK.Cash) continue;
      const pr = rayProximity(camX, camY, camZ, dirX, dirY, dirZ, it.x, it.y + 0.45, it.z);
      if (pr.t < 0.8 || pr.t > Math.min(48, maxT + 1.5)) continue;
      if (pr.ang > 0.072 && pr.perp > 0.85) continue;
      const score = pr.ang * 1.4 + pr.perp * 0.04;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    if (best) {
      const myth = best.kind === IK.Weapon ? mythicOf(best.rarity) : null;
      const rarIdx = Math.max(0, Math.min(5, best.rarity));
      const rarName = (RARITIES[Math.min(4, rarIdx)] ?? "rare").toUpperCase();
      let label: string;
      let color: string = RARITY_HEX[rarIdx] ?? PING_COLOR.loot;
      if (best.kind === IK.Weapon) {
        const wn = WEAPON_DEFS[WEAPONS[best.sub]]?.name?.toUpperCase() ?? "WEAPON";
        label = myth ? `MYTHIC · ${myth.name.toUpperCase()}` : `${rarName} · ${wn}`;
        if (myth) color = myth.color;
      } else {
        const cn = CONSUMABLE_DEFS[CONSUMABLES[best.sub]]?.name?.toUpperCase() ?? "ITEM";
        label = cn;
      }
      return { action: "set", kind: "loot", label, color, x: best.x, y: best.y + 0.75, z: best.z };
    }
  }

  // 4. Live Vehicle under crosshair (up to 180 m)
  {
    let best: VehRemote | null = null, bestScore = Infinity;
    for (let i = 0; i < c.vehicles.length; i++) {
      const v = c.vehicles[i];
      if (!v.live || v.n === 0 || v.st === VS.Gone || v.st === VS.Wreck || v.mine) continue;
      const pr = rayProximity(camX, camY, camZ, dirX, dirY, dirZ, v.x, v.y + 1.25, v.z);
      if (pr.t < 1.5 || pr.t > Math.min(180, maxT + 3.0)) continue;
      if (pr.ang > 0.06 && pr.perp > 2.2) continue;
      if (pr.ang < bestScore) { bestScore = pr.ang; best = v; }
    }
    if (best) {
      return {
        action: "set", kind: "vehicle", label: best.kind === VKind.Heli ? "HELICOPTER" : "TUK-TUK",
        color: PING_COLOR.vehicle, x: best.x, y: best.y + 2.0, z: best.z,
      };
    }
  }

  // 5. Unopened Supply Drop or Chest (up to 130 m)
  {
    let best: Chest | null = null, bestScore = Infinity;
    for (let i = 0; i < c.chests.length; i++) {
      const ch = c.chests[i];
      if (ch.opened || ch.box) continue;
      const pr = rayProximity(camX, camY, camZ, dirX, dirY, dirZ, ch.x, ch.y + 0.65, ch.z);
      if (pr.t < 1 || pr.t > Math.min(ch.supply ? 260 : 110, maxT + 2.0)) continue;
      const maxPerp = ch.supply ? 2.4 : 1.3;
      if (pr.ang > 0.065 && pr.perp > maxPerp) continue;
      if (pr.ang < bestScore) { bestScore = pr.ang; best = ch; }
    }
    if (best) {
      const color = best.supply ? "#ffd400" : (RARITY_HEX[Math.max(0, Math.min(4, best.rarity))] ?? "#ffd400");
      const label = best.supply ? "SUPPLY DROP" : best.rarity >= 3 ? `${(RARITIES[best.rarity] ?? "epic").toUpperCase()} CHEST` : "CHEST";
      return { action: "set", kind: "chest", label, color, x: best.x, y: best.y + 1.2, z: best.z };
    }
  }

  // 6. Banana Stand (up to 120 m)
  {
    let best: { x: number; y: number; z: number } | null = null, bestScore = Infinity;
    for (let i = 0; i < c.stands.length; i++) {
      const st = c.stands[i];
      const pr = rayProximity(camX, camY, camZ, dirX, dirY, dirZ, st.x, st.y + 1.5, st.z);
      if (pr.t < 1.5 || pr.t > Math.min(120, maxT + 2.5)) continue;
      if (pr.ang > 0.065 && pr.perp > 2.2) continue;
      if (pr.ang < bestScore) { bestScore = pr.ang; best = st; }
    }
    if (best) {
      return { action: "set", kind: "shop", label: "BANANA STAND", color: PING_COLOR.shop, x: best.x, y: best.y + 2.4, z: best.z };
    }
  }

  // 7. Terrain / structure move marker (or clear if pinging near own existing move marker)
  if (!RAY_HIT.hit) {
    return { action: "miss", kind: "move", label: "", color: PING_COLOR.move, x: 0, y: 0, z: 0 };
  }
  const hx = camX + dirX * RAY_HIT.t;
  const hy = camY + dirY * RAY_HIT.t;
  const hz = camZ + dirZ * RAY_HIT.t;
  if (c.existingMove && Math.hypot(c.existingMove.x - hx, c.existingMove.z - hz) < 22) {
    return { action: "clear", kind: "move", label: "", color: PING_COLOR.move, x: hx, y: hy, z: hz };
  }
  const poi = poiNameAt(hx, hz);
  return {
    action: "set", kind: "move", label: poi ?? "MOVE HERE", color: PING_COLOR.move,
    x: hx, y: hy + 0.5, z: hz,
  };
}
