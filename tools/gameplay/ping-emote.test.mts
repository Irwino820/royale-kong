// Automated verification for:
//   1. 6 Fortnite-style procedural dances (actors/emotes.ts + KongAnimator integration)
//   2. 3D contextual tactical ping resolver (enemy, wall occlusion, double-tap danger, loot, vehicle, chest, shop, move/clear)
//   3. Trios bot squadmate AI response to human team pings (Match.setTeamPing -> bots.hot.ts)
//   4. Backward-compatible keybind preference migration (OPTIONAL_BINDS includes "emote")
import assert from "node:assert/strict";
import { EMOTES, EMOTE_COUNT, isDanceId } from "../../client/src/actors/emotes";
import { KongAnimator } from "../../client/src/actors/kong-rig";
import type { KongPose } from "../../client/src/actors/api";
import { resolveContextualPing, type PingContext } from "../../client/src/game/tactical-ping";
import { normalizePreferences } from "../../client/src/settings/preferences";
import { StaticWorld } from "../../shared/sim/world";
import { Terrain } from "../../shared/world/terrain";
import { IK, type Chest, type Item } from "../../shared/sim/loot";
import { B, PS, SK, makeInput, makePlayer } from "../../shared/sim/player";
import { stepPlayer } from "../../shared/sim/player.hot";
import { VKind, VS } from "../../shared/sim/vehicle";
import { Match, Phase } from "../../shared/sim/match";
import { S } from "../../shared/sim/bots";
import { botThink } from "../../shared/sim/bots.hot";
import type { Remote, VehRemote } from "../../client/src/game/client";

// ------------------------------------------------------------------ 1. Fortnite dances
{
  assert.equal(EMOTE_COUNT, 6, "expected 6 Fortnite-style dances");
  const anim = new KongAnimator(42);
  const pose: KongPose = {
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
    state: "emote", crouch: false, sprint: false, weapon: null, team: 0, friendly: true, emote: 0,
  };
  const sigs = new Set<string>();
  for (let id = 0; id < EMOTE_COUNT; id++) {
    assert.ok(isDanceId(id));
    pose.emote = id;
    const minV = new Float32Array(anim.pose.length).fill(Infinity);
    const maxV = new Float32Array(anim.pose.length).fill(-Infinity);
    const snap = new Float32Array(anim.pose.length);
    for (let step = 0; step < 120; step++) {
      anim.update(pose, 1 / 60);
      for (let i = 0; i < anim.pose.length; i++) {
        const v = anim.pose[i];
        assert.ok(Number.isFinite(v), `NaN/Inf in dance ${EMOTES[id].name} bone ${i}`);
        if (step >= 18) {
          if (v < minV[i]) minV[i] = v;
          if (v > maxV[i]) maxV[i] = v;
        }
      }
      if (step === 35) snap.set(anim.pose);
    }
    let excursion = 0;
    for (let i = 0; i < anim.pose.length; i++) excursion += maxV[i] - minV[i];
    assert.ok(excursion > 4.0, `dance ${EMOTES[id].name} barely moved (excursion=${excursion.toFixed(2)})`);
    sigs.add(Array.from(snap.slice(0, 24), (v) => v.toFixed(1)).join(","));
  }
  assert.equal(sigs.size, EMOTE_COUNT, "each dance must have a distinct choreography");
  assert.equal(isDanceId(-1), false);
  assert.equal(isDanceId(6), false);
  console.log("PASS  dances (6/6 choreographies finite, rhythmic & distinct)");
}

// ------------------------------------------------------------------ 2. Contextual 3D Tactical Pings
{
  const heights = new Float32Array(129 * 129); // flat ground at y = 0
  const biome = new Uint8Array(129 * 129);
  const terrain = new Terrain(heights, biome);
  // place a solid wall at x=0, z=-20 (4m wide, 6m tall, 1m thick)
  const world = new StaticWorld(terrain, [{ c: [0, 3, -20], h: [2, 3, 0.5], surf: "stone" }]);
  const base = (): PingContext => ({
    camX: 0, camY: 1.7, camZ: 0, dirX: 0, dirY: 0, dirZ: -1,
    world, remotes: [], items: new Map(), chests: [], vehicles: [], stands: [],
    me: 0, myTeam: 0, snapTick: 100, existingMove: null, doubleTap: false,
  });

  // 2a. Enemy visible in front of wall (z = -12)
  const enemy = { id: 1, team: 1, n: 2, lastTick: 100, st: PS.Ground, x: 0.2, y: 0, z: -12 } as unknown as Remote;
  const rEnemy = resolveContextualPing({ ...base(), remotes: [enemy] });
  assert.equal(rEnemy.action, "set");
  assert.equal(rEnemy.kind, "enemy");
  assert.equal(rEnemy.label, "ENEMY SPOTTED");
  assert.equal(rEnemy.color, "#ff3b30");

  // 2b. Enemy hidden behind wall (z = -35) must NOT be pinged through the wall!
  const hiddenEnemy = { id: 2, team: 1, n: 2, lastTick: 100, st: PS.Ground, x: 0, y: 0, z: -35 } as unknown as Remote;
  const rWall = resolveContextualPing({ ...base(), remotes: [hiddenEnemy] });
  assert.equal(rWall.kind, "move", "enemy behind solid wall must not be pinged");
  assert.ok(Math.abs(rWall.z - (-19.5)) < 1.0);

  // 2c. Double-tap on wall -> DANGER HERE
  const rDanger = resolveContextualPing({ ...base(), doubleTap: true });
  assert.equal(rDanger.action, "set");
  assert.equal(rDanger.kind, "danger");
  assert.equal(rDanger.label, "DANGER HERE");

  // 2d. Ground loot (Epic Bamboo Bow, weapon sub=6, rarity=3)
  const items = new Map<number, Item>([[7, { id: 7, kind: IK.Weapon, sub: 6, rarity: 3, count: 1, x: 0, y: 0, z: -10, taken: false }]]);
  const rLoot = resolveContextualPing({ ...base(), dirY: -0.12, items });
  assert.equal(rLoot.kind, "loot");
  assert.ok(rLoot.label.includes("EPIC") && rLoot.label.includes("BOW"), `unexpected loot label: ${rLoot.label}`);
  assert.equal(rLoot.color, "#b45cff");

  // 2e. Vehicle (Helicopter)
  const heli = { id: 0, live: true, n: 2, st: VS.Ok, mine: false, kind: VKind.Heli, x: 0, y: 0, z: -15 } as unknown as VehRemote;
  const rVeh = resolveContextualPing({ ...base(), vehicles: [heli] });
  assert.equal(rVeh.kind, "vehicle");
  assert.equal(rVeh.label, "HELICOPTER");

  // 2f. Supply Drop chest
  const drop: Chest = { id: 9, x: 0, y: 0, z: -14, yaw: 0, rarity: 4, opened: false, poi: -1, supply: 1 };
  const rChest = resolveContextualPing({ ...base(), chests: [drop] });
  assert.equal(rChest.kind, "chest");
  assert.equal(rChest.label, "SUPPLY DROP");

  // 2g. Banana Stand
  const rShop = resolveContextualPing({ ...base(), stands: [{ x: 0, y: 0, z: -14 }] });
  assert.equal(rShop.kind, "shop");
  assert.equal(rShop.label, "BANANA STAND");

  // 2h. Clear existing move marker when pinging nearby
  const rClear = resolveContextualPing({ ...base(), existingMove: { x: 0, z: -19.5 } });
  assert.equal(rClear.action, "clear");

  console.log("PASS  tactical pings (enemy, wall-occlusion, danger, loot, vehicle, supply drop, shop, clear)");
}

// ------------------------------------------------------------------ 3. Trios Bot AI Ping Response
{
  const heights = new Float32Array(129 * 129).fill(5);
  const biome = new Uint8Array(129 * 129);
  const world = new StaticWorld(new Terrain(heights, biome), []);
  const m = new Match({ seed: 7, mode: "trios", world, humans: [{ id: 0, name: "Human", team: 0 }] });
  m.phase = Phase.Play;
  m.time = 100;
  // find our bot squadmate on team 0
  const mate = m.players.find((p) => p.bot && p.team === 0)!;
  assert.ok(mate, "expected a bot squadmate on team 0");
  const brain = m.brains[mate.id]!;
  mate.st = PS.Ground; mate.grounded = true; mate.x = 10; mate.y = 5; mate.z = 10;
  mate.slots[0] = { kind: SK.Weapon, id: 2, rarity: 2, count: 1, mag: 30 };
  mate.ammo[0] = 90;
  brain.state = S.Loot;
  m.setTeamPing(0, 90, 10, "enemy");
  // advance tick to align with ((m.tick + mate.id) % 12) === 0
  m.tick = (12 - (mate.id % 12)) % 12;
  botThink(m, mate, brain, makeInput());
  assert.equal(brain.state, S.Hunt, "armed trios bot should switch to Hunt on enemy ping");
  assert.ok(Math.hypot(brain.tx - 90, brain.tz - 10) <= 7, "bot hunt target should match pinged enemy coordinates");
  console.log("PASS  trios bot AI response to tactical ping");
}

// ------------------------------------------------------------------ 4. Preferences Migration
{
  const migrated = normalizePreferences({ binds: { fwd: ["KeyW"], back: ["KeyS"], left: ["KeyA"], right: ["KeyD"], jump: ["Space"], crouch: ["KeyC"], sprint: ["ShiftLeft"], reload: ["KeyR"], use: ["KeyE"], map: ["KeyM"], inventory: ["Tab"], glider: ["KeyX"], slots: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"] } });
  assert.deepEqual(migrated.binds.emote, ["KeyH", "KeyY"], "legacy saved preferences should auto-populate emote keybind");
  console.log("PASS  preferences migration (emote default KeyH / KeyY)");
}

// ------------------------------------------------------------------ 5. Redeploy air-fire bug regression
{
  const heights = new Float32Array(129 * 129);
  const biome = new Uint8Array(129 * 129);
  const world = new StaticWorld(new Terrain(heights, biome), []);
  for (const airState of [PS.Freefall, PS.Glide] as const) {
    const p = makePlayer(0, 0, "Tester", false);
    p.x = 0; p.y = 140; p.z = 0; p.vy = -12; p.st = airState; p.active = 0;
    // redeploy shotgun in slot 0 with full mag + reserve shells
    p.slots[0] = { kind: SK.Weapon, id: 3, rarity: 0, count: 1, mag: 6 };
    p.ammo[2] = 24;
    const inp = makeInput();
    inp.buttons = B.FIRE | B.SCOPE;
    for (let k = 0; k < 15; k++) {
      inp.seq++;
      stepPlayer(p, inp, world, 1 / 60);
      assert.equal(p.fired, 0, `must not fire shotgun while in state ${PS[airState]}`);
      assert.equal(p.slots[0].mag, 6, `mag must stay untouched while in state ${PS[airState]}`);
      assert.equal(p.ads, false, "must not ADS in air");
      assert.equal(p.scoped, false, "must not scope in air");
    }
  }
  console.log("PASS  no shooting / ADS while freefalling or gliding after redeploy");
}
