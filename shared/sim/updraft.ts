// THE VOLCANO UPDRAFT: the summit crater of
// Ripe Peak vents a column of hot air. Walk, jump, fall or glide into it and it throws you up to redeploy height with the
// glider open — glide anywhere on the island from there (a redeploy). It also
// means nobody is stuck in the crater any more: dropping into the bowl throws you back out instead of trapping you.
// Pure deterministic math on the baked summit (shared/pois/jungle-baked.json): the server and every client prediction
// lift the same kong the same way (shared/sim/player.ts stepAir / stepPlayer). No allocations.
import { layout } from "../pois/ripe-peak";
import { PEAK_C } from "../pois/jungle-layout";
import { SUNBURST_UPDRAFT } from "../pois/sunburst/index";
import { isSunburst } from "../world/maps";

const S = layout.summit;
const KONG_UPDRAFT = {
  x: PEAK_C.x, z: PEAK_C.z,
  floor: S.floor, lip: S.y1,
  top: S.y1 + 245,
  rFloor: 4.6, rLip: 13, rAbove: 15,
  v: 44, edge: 3, fade: 45,
  kick: 16,
};
const activeU = () => (isSunburst() ? SUNBURST_UPDRAFT : KONG_UPDRAFT);
export const UPDRAFT = {
  get x() { return activeU().x; },
  get z() { return activeU().z; },
  get floor() { return activeU().floor; },
  get lip() { return activeU().lip; },
  get top() { return activeU().top; },
  get rFloor() { return activeU().rFloor; },
  get rLip() { return activeU().rLip; },
  get rAbove() { return activeU().rAbove; },
  get v() { return activeU().v; },
  get edge() { return activeU().edge; },
  get fade() { return activeU().fade; },
  get kick() { return activeU().kick; },
};

/** column radius at height y */
export function updraftR(y: number): number {
  const U = UPDRAFT;
  if (y <= U.floor) return U.rFloor;
  if (y <= U.lip) return U.rFloor + (U.rLip - U.rFloor) * ((y - U.floor) / (U.lip - U.floor));
  return U.rLip + (U.rAbove - U.rLip) * Math.min(1, (y - U.lip) / 40);
}

/** lift 0..1 at a body whose FEET are at (x, y, z): 1 in the core, a soft radial edge, fading out under the top */
export function updraftLift(x: number, y: number, z: number): number {
  const U = UPDRAFT;
  if (y < U.floor - 1.5 || y > U.top) return 0;
  const dx = x - U.x, dz = z - U.z, d2 = dx * dx + dz * dz, rr = updraftR(y) + U.edge;
  if (d2 > rr * rr) return 0;
  const d = Math.sqrt(d2), r = updraftR(y);
  const radial = d <= r ? 1 : 1 - (d - r) / U.edge;
  const vert = Math.min(1, (U.top - y) / U.fade);
  return radial * vert;
}

/** inside the vent's column at all (the trigger for a kong on foot): within the core radius, under the top */
export function inUpdraft(x: number, y: number, z: number): boolean {
  const U = UPDRAFT;
  if (y < U.floor - 1.5 || y > U.top - U.fade) return false;
  const dx = x - U.x, dz = z - U.z, r = updraftR(y);
  return dx * dx + dz * dz <= r * r;
}
