// SUNBURST CANYON — Single-source-of-truth architectural & infrastructure blueprint for all 13 desert POIs.
// Drives BOTH deterministic server/client colliders (`shared/pois/index.ts`) AND the instanced 3D Three.js renderer
// (`client/src/world/pois/sunburst/index.ts`), so every walkable floor, wall, roof, bridge, catwalk, crate, glass
// pane, ladder, and zipline matches its collider 1:1 while rich decorative trim (vigas, cornices, domes, rugs,
// lanterns, banners, shutters, piping, boats, braziers) renders in ultra-fast InstancedMesh batches.
import type { Box, Surface } from "../../world/colliders";
import type { PoiId } from "../../world/map";
import type { Climb } from "../../sim/climb";
import type { HotZone, KitRoomLite, LootSpots } from "../index";
import * as dmath from "../../sim/dmath";

export type DesertMat =
  | "sandstone" | "hieroglyph" | "gold" | "adobe" | "terracotta" | "awning"
  | "timber" | "metal" | "rust" | "solar" | "glass" | "redrock" | "bone"
  | "cactus" | "canvas" | "darkwood" | "glow" | "crate"
  // Rich desert architectural & infrastructure accent materials
  | "turquoise" | "crimson" | "copper" | "iron" | "plaster" | "water" | "rug" | "sandbag" | "fire" | "chrome";

export type PieceShape = "box" | "cyl" | "cone" | "pyramid" | "sphere" | "dome" | "torus";

export interface SunburstPiece {
  shape: PieceShape;
  mat: DesertMat;
  /** world center [x, y, z] */
  x: number; y: number; z: number;
  /** full width (X), height (Y), depth (Z) in metres (for cyl/cone/sphere: w = diameter) */
  w: number; h: number; d: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  /** if false, visual-only (cornices, vigas, rugs, banners, lanterns, awnings, trim) */
  collide?: boolean;
  surf?: Surface;
  noShoot?: boolean;
}

export interface SunburstClearing {
  x: number; z: number; r: number;
}

export interface SunburstZipDef {
  id: string;
  a: [number, number, number];
  b: [number, number, number];
  sag: number;
  ya: number;
  yb: number;
}

/** Optional living animated props owned by each POI (radar dishes, windmills, flames, lighthouse beacon, bobbing boats) */
export interface SunburstAnimProp {
  kind: "radar" | "windmill" | "flame" | "beacon" | "boat";
  x: number; y: number; z: number;
  yaw?: number;
  scale?: number;
}

export interface SunburstPoiData {
  id: PoiId;
  pieces: SunburstPiece[];
  colliders: Box[];
  clearings: SunburstClearing[];
  /** Sculpted 3D saguaro cacti planted via VegApi ("cactus"): [worldX, worldY, worldZ, yaw, scale] */
  cacti: Array<[number, number, number, number, number]>;
  /** Sculpted 3D desert succulents/palms planted via VegApi: [kind, worldX, worldY, worldZ, yaw, scale] */
  flora: Array<["palm" | "prickly-pear", number, number, number, number, number]>;
  /** Animated props built & driven by the client module */
  anims: SunburstAnimProp[];
  LOOT_SPOTS: LootSpots;
  LOOT_HOT: HotZone[];
  INTERIOR_ROOMS: KitRoomLite[];
}

function matSurf(m: DesertMat): Surface {
  switch (m) {
    case "glass": return "glass";
    case "timber": case "darkwood": case "crate": case "awning": case "canvas": case "rug": return "wood";
    case "metal": case "rust": case "solar": case "iron": case "copper": case "chrome": return "metal";
    default: return "stone";
  }
}

type FurnishKind = "house" | "shop" | "saloon" | "lab" | "barracks" | "warehouse" | "shack" | "none";

class PoiBuilder {
  readonly pieces: SunburstPiece[] = [];
  readonly colliders: Box[] = [];
  readonly clearings: SunburstClearing[] = [];
  readonly cacti: Array<[number, number, number, number, number]> = [];
  readonly flora: Array<["palm" | "prickly-pear", number, number, number, number, number]> = [];
  readonly anims: SunburstAnimProp[] = [];
  readonly chests: Array<[number, number, number, number]> = [];
  readonly floor: Array<[number, number, number]> = [];
  readonly hero: number[] = [];
  readonly hot: HotZone[] = [];
  readonly rooms: KitRoomLite[] = [];

  constructor(readonly id: PoiId, readonly ox: number, readonly oy: number, readonly oz: number) {
    this.clearings.push({ x: ox, z: oz, r: 68 });
  }

  private wPos(lx: number, ly: number, lz: number, fyaw = 0): [number, number, number] {
    if (fyaw === 0) return [this.ox + lx, this.oy + ly, this.oz + lz];
    const c = dmath.cos(fyaw), s = dmath.sin(fyaw);
    return [this.ox + lx * c + lz * s, this.oy + ly, this.oz - lx * s + lz * c];
  }

  add(p: {
    shape?: PieceShape; mat: DesertMat;
    lx: number; ly: number; lz: number;
    w: number; h: number; d: number;
    yaw?: number; pitch?: number; roll?: number;
    collide?: boolean; surf?: Surface; noShoot?: boolean;
  }) {
    const x = this.ox + p.lx, y = this.oy + p.ly, z = this.oz + p.lz;
    const shape = p.shape ?? "box";
    const surf = p.surf ?? matSurf(p.mat);
    const collide = p.collide !== false;
    this.pieces.push({ shape, mat: p.mat, x, y, z, w: p.w, h: p.h, d: p.d, yaw: p.yaw, pitch: p.pitch, roll: p.roll, collide, surf, noShoot: p.noShoot });
    if (collide) {
      const b: Box = {
        c: [x, y, z],
        h: [p.w * 0.5, p.h * 0.5, p.d * 0.5],
        surf,
      };
      // StaticWorld Box.yaw uses local X = (cos, +sin), whereas Three.js rotation.y uses (cos, -sin) -> negate yaw!
      if (p.yaw) b.yaw = -p.yaw;
      if (p.pitch) b.pitch = p.pitch;
      if (p.noShoot || surf === "glass") b.noShoot = true;
      if (shape === "cyl") b.round = [p.w * 0.5, p.h * 0.5];
      this.colliders.push(b);
    }
  }

  /** Walkable staircase rising from ly0 to ly1 along local dir (0=+Z, PI=-Z, PI/2=+X, -PI/2=-X) with side handrails */
  stairs(lx: number, ly0: number, lz: number, width: number, run: number, rise: number, yaw = 0, mat: DesertMat = "sandstone", rails = false) {
    const steps = Math.max(2, Math.ceil(rise / 0.36));
    const stepH = rise / steps, stepD = run / steps;
    const c = dmath.cos(yaw), s = dmath.sin(yaw);
    const tx = (u: number, v: number): [number, number] => [lx + u * c + v * s, lz - u * s + v * c];
    for (let i = 0; i < steps; i++) {
      const dist = (i + 0.5) * stepD - run * 0.5;
      const sh = (i + 1) * stepH;
      const [sx, sz] = tx(0, dist);
      this.add({
        mat, lx: sx, ly: ly0 + sh * 0.5, lz: sz,
        w: width, h: sh, d: stepD + 0.08, yaw,
      });
    }
    if (rails) {
      const railMat: DesertMat = mat === "metal" ? "iron" : "darkwood";
      const slopeLen = dmath.hypot(run, rise);
      const pitch = -dmath.atan2(rise, run);
      for (const side of [-1, 1]) {
        const [rx, rz] = tx(side * (width * 0.48), 0);
        this.add({ mat: railMat, lx: rx, ly: ly0 + rise * 0.5 + 0.85, lz: rz, w: 0.1, h: 0.12, d: slopeLen, yaw, pitch, collide: false });
        for (const f of [-0.45, 0, 0.45]) {
          const [px, pz] = tx(side * (width * 0.48), f * run);
          const py = ly0 + (f + 0.5) * rise;
          this.add({ mat: railMat, lx: px, ly: py + 0.45, lz: pz, w: 0.12, h: 0.9, d: 0.12, yaw, collide: false });
        }
      }
    }
  }

  /** Richly detailed enterable desert building: stepped foundation plinth, carved door frame + wooden lintel,
   *  protruding adobe roof rafters (vigas), corner pilasters, cornice trim, framed glass windows with wooden
   *  shutters & fabric awnings, crenellated rooftop merlons, optional dome/pergola/roof-props, and furnished interior! */
  building(o: {
    lx: number; ly?: number; lz: number; w: number; d: number; h: number; yaw?: number;
    wallMat?: DesertMat; roofMat?: DesertMat; trimMat?: DesertMat;
    parapet?: boolean; backDoor?: boolean; glass?: boolean; roofStairs?: boolean;
    dome?: DesertMat; pergola?: boolean; awningFront?: boolean; furnish?: FurnishKind;
    rooftopProp?: "ac" | "tank" | "solar" | "crates" | "none";
    /** Deep retaining foundation plinth extending downward below ly so cliff/lakeside buildings never float */
    foundationDepth?: number;
  }) {
    const ly = o.ly ?? 0;
    const yaw = o.yaw ?? 0;
    const c = dmath.cos(yaw), s = dmath.sin(yaw);
    const wm = o.wallMat ?? "adobe";
    const rm = o.roofMat ?? "sandstone";
    const tm = o.trimMat ?? (wm === "metal" || wm === "rust" ? "iron" : wm === "timber" || wm === "darkwood" ? "darkwood" : "sandstone");
    const wt = 0.38;
    const tx = (u: number, v: number): [number, number] => [o.lx + u * c + v * s, o.lz - u * s + v * c];

    // Stepped stone/timber foundation plinth + solid interior floor slab (plus optional deep retaining plinth)
    const fd = o.foundationDepth ?? 0;
    if (fd > 0.05) {
      const fMat: DesertMat = wm === "redrock" ? "redrock" : tm;
      this.add({ mat: fMat, lx: o.lx, ly: ly - fd * 0.5, lz: o.lz, w: o.w + 0.85, h: fd + 0.12, d: o.d + 0.85, yaw });
    }
    this.add({ mat: tm, lx: o.lx, ly: ly + 0.12, lz: o.lz, w: o.w + 0.55, h: 0.24, d: o.d + 0.55, yaw });
    this.add({ mat: rm, lx: o.lx, ly: ly + 0.18, lz: o.lz, w: o.w + 0.15, h: 0.16, d: o.d + 0.15, yaw, collide: false });

    // 4 Corner architectural pilasters / buttress columns (visual depth!)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const [px, pz] = tx(sx * (o.w * 0.5 - 0.04), sz * (o.d * 0.5 - 0.04));
      this.add({ mat: tm, lx: px, ly: ly + o.h * 0.5, lz: pz, w: 0.52, h: o.h + 0.18, d: 0.52, yaw, collide: false });
    }

    // Front wall (+Z local) with framed 2.5 m wide × 2.9 m tall doorway + lintel + glowing porch lantern!
    const doorW = Math.min(2.6, o.w * 0.36);
    const sideW = (o.w - doorW) * 0.5;
    if (sideW > 0.4) {
      for (const side of [-1, 1]) {
        const [wx, wz] = tx(side * (doorW * 0.5 + sideW * 0.5), o.d * 0.5 - wt * 0.5);
        this.add({ mat: wm, lx: wx, ly: ly + o.h * 0.5, lz: wz, w: sideW, h: o.h, d: wt, yaw });
      }
    }
    const lintelH = Math.max(0.4, o.h - 2.9);
    {
      const [wx, wz] = tx(0, o.d * 0.5 - wt * 0.5);
      this.add({ mat: wm, lx: wx, ly: ly + o.h - lintelH * 0.5, lz: wz, w: doorW, h: lintelH, d: wt, yaw });
      // Decorative wooden/carved doorway frame & lintel + porch wall lantern
      const frameMat: DesertMat = wm === "metal" ? "iron" : "darkwood";
      for (const side of [-1, 1]) {
        const [fx, fz] = tx(side * (doorW * 0.5 + 0.12), o.d * 0.5 + 0.04);
        this.add({ mat: frameMat, lx: fx, ly: ly + 1.48, lz: fz, w: 0.24, h: 2.96, d: 0.22, yaw, collide: false });
      }
      const [lx0, lz0] = tx(0, o.d * 0.5 + 0.08);
      this.add({ mat: frameMat, lx: lx0, ly: ly + 3.04, lz: lz0, w: doorW + 0.65, h: 0.26, d: 0.30, yaw, collide: false });
      const [lanX, lanZ] = tx(doorW * 0.5 + 0.42, o.d * 0.5 + 0.28);
      this.add({ mat: "iron", lx: lanX, ly: ly + 2.85, lz: lanZ, w: 0.14, h: 0.12, d: 0.38, yaw, collide: false });
      this.add({ shape: "sphere", mat: "glow", lx: lanX, ly: ly + 2.66, lz: lanZ, w: 0.26, h: 0.32, d: 0.26, collide: false });
      // Optional striped fabric entry awning over front door
      if (o.awningFront !== false && wm !== "metal" && wm !== "rust" && o.h >= 3.8) {
        const [ax, az] = tx(0, o.d * 0.5 + 1.05);
        this.add({ mat: "awning", lx: ax, ly: ly + 3.25, lz: az, w: Math.min(o.w - 1.2, doorW + 2.4), h: 0.12, d: 2.0, yaw, pitch: 0.22, collide: false });
        for (const side of [-1, 1]) {
          const [px, pz] = tx(side * Math.min(o.w * 0.5 - 0.8, doorW * 0.5 + 1.05), o.d * 0.5 + 1.85);
          this.add({ mat: "darkwood", lx: px, ly: ly + 1.52, lz: pz, w: 0.14, h: 3.04, d: 0.14, yaw, collide: false });
        }
      }
    }

    // Back wall (-Z local): optional rear doorway + frame or solid wall with decorative shutters
    if (o.backDoor && sideW > 0.4) {
      for (const side of [-1, 1]) {
        const [wx, wz] = tx(side * (doorW * 0.5 + sideW * 0.5), -o.d * 0.5 + wt * 0.5);
        this.add({ mat: wm, lx: wx, ly: ly + o.h * 0.5, lz: wz, w: sideW, h: o.h, d: wt, yaw });
      }
      const [wx, wz] = tx(0, -o.d * 0.5 + wt * 0.5);
      this.add({ mat: wm, lx: wx, ly: ly + o.h - lintelH * 0.5, lz: wz, w: doorW, h: lintelH, d: wt, yaw });
      const [lx0, lz0] = tx(0, -o.d * 0.5 - 0.08);
      this.add({ mat: "darkwood", lx: lx0, ly: ly + 3.04, lz: lz0, w: doorW + 0.55, h: 0.24, d: 0.26, yaw, collide: false });
    } else {
      const [wx, wz] = tx(0, -o.d * 0.5 + wt * 0.5);
      this.add({ mat: wm, lx: wx, ly: ly + o.h * 0.5, lz: wz, w: o.w, h: o.h, d: wt, yaw });
    }

    // Side walls (±X local) with optional framed breakable glass windows + shutters + sill ledge!
    // When exterior roofStairs run up the +X wall, keep the +X wall solid so stairs never block or clip a window!
    for (const side of [-1, 1]) {
      const ux = side * (o.w * 0.5 - wt * 0.5);
      if (o.glass && o.d >= 6 && !(o.roofStairs && side === 1)) {
        const winW = Math.min(2.8, o.d * 0.36);
        const pierD = (o.d - winW) * 0.5;
        for (const end of [-1, 1]) {
          const [wx, wz] = tx(ux, end * (winW * 0.5 + pierD * 0.5));
          this.add({ mat: wm, lx: wx, ly: ly + o.h * 0.5, lz: wz, w: wt, h: o.h, d: pierD, yaw });
        }
        const [mx, mz] = tx(ux, 0);
        this.add({ mat: wm, lx: mx, ly: ly + 0.55, lz: mz, w: wt, h: 1.1, d: winW, yaw });
        this.add({ mat: wm, lx: mx, ly: ly + o.h - 0.55, lz: mz, w: wt, h: 1.1, d: winW, yaw });
        const glassH = Math.max(0.9, o.h - 2.2);
        this.add({ mat: "glass", lx: mx, ly: ly + 1.1 + glassH * 0.5, lz: mz, w: 0.08, h: glassH, d: winW, yaw, surf: "glass", noShoot: true });
        // Architectural window sill, lintel & open turquoise/wooden shutters!
        const [ex, ez] = tx(side * (o.w * 0.5 + 0.08), 0);
        this.add({ mat: tm, lx: ex, ly: ly + 1.06, lz: ez, w: 0.24, h: 0.16, d: winW + 0.45, yaw, collide: false });
        this.add({ mat: "darkwood", lx: ex, ly: ly + o.h - 1.04, lz: ez, w: 0.26, h: 0.18, d: winW + 0.55, yaw, collide: false });
        const shutterMat: DesertMat = wm === "metal" || wm === "rust" ? "iron" : wm === "adobe" || wm === "plaster" ? "turquoise" : "darkwood";
        for (const end of [-1, 1]) {
          const [shx, shz] = tx(side * (o.w * 0.5 + 0.07), end * (winW * 0.5 + 0.34));
          this.add({ mat: shutterMat, lx: shx, ly: ly + 1.1 + glassH * 0.5, lz: shz, w: 0.10, h: glassH, d: 0.56, yaw, collide: false });
        }
      } else {
        const [wx, wz] = tx(ux, 0);
        this.add({ mat: wm, lx: wx, ly: ly + o.h * 0.5, lz: wz, w: wt, h: o.h, d: o.d, yaw });
      }
    }

    // Protruding desert wooden roof vigas (rafter beam ends sticking out 0.38 m along ±Z walls!)
    if (wm === "adobe" || wm === "terracotta" || wm === "plaster" || wm === "sandstone") {
      const nVigas = Math.max(3, Math.floor(o.w / 2.2));
      for (let i = 0; i < nVigas; i++) {
        const u = ((i + 0.5) / nVigas - 0.5) * (o.w - 1.4);
        const [vx, vz] = tx(u, 0);
        this.add({ shape: "cyl", mat: "darkwood", lx: vx, ly: ly + o.h - 0.22, lz: vz, w: 0.20, h: o.d + 0.72, d: 0.20, yaw, pitch: Math.PI * 0.5, collide: false });
      }
    }

    // Molded upper cornice overhang + solid roof slab (walkable, occludes sandstorm/rain)
    this.add({ mat: tm, lx: o.lx, ly: ly + o.h + 0.02, lz: o.lz, w: o.w + 0.62, h: 0.22, d: o.d + 0.62, yaw, collide: false });
    this.add({ mat: rm, lx: o.lx, ly: ly + o.h + 0.17, lz: o.lz, w: o.w + 0.3, h: 0.34, d: o.d + 0.3, yaw });

    // Optional desert adobe crenellated rooftop parapet with sculpted merlons!
    const roofTop = ly + o.h + 0.34;
    if (o.parapet) {
      const ph = 0.88, py = roofTop + ph * 0.5;
      const [fx, fz] = tx(0, o.d * 0.5 - 0.16);
      const [bx, bz] = tx(0, -o.d * 0.5 + 0.16);
      const [rx, rz] = tx(o.w * 0.5 - 0.16, 0);
      const [lx2, lz2] = tx(-o.w * 0.5 + 0.16, 0);
      this.add({ mat: wm, lx: fx, ly: py, lz: fz, w: o.w, h: ph, d: 0.3, yaw });
      this.add({ mat: wm, lx: bx, ly: py, lz: bz, w: o.w, h: ph, d: 0.3, yaw });
      if (!o.roofStairs) this.add({ mat: wm, lx: rx, ly: py, lz: rz, w: 0.3, h: ph, d: o.d - 0.6, yaw });
      this.add({ mat: wm, lx: lx2, ly: py, lz: lz2, w: 0.3, h: ph, d: o.d - 0.6, yaw });
      // Decorative crenellated parapet coping blocks along front & back walls
      const nM = Math.max(3, Math.floor(o.w / 2.4));
      for (let i = 0; i < nM; i++) {
        const u = ((i + 0.5) / nM - 0.5) * (o.w - 1.2);
        for (const sz of [-1, 1]) {
          const [mx, mz] = tx(u, sz * (o.d * 0.5 - 0.16));
          this.add({ mat: tm, lx: mx, ly: roofTop + ph + 0.16, lz: mz, w: 0.85, h: 0.32, d: 0.36, yaw, collide: false });
        }
      }
    }

    // Optional Moroccan/Desert tiled hemisphere dome cupola (sits cleanly on roof drum — NEVER pokes through ceiling!)
    if (o.dome) {
      const dr = Math.min(o.w, o.d) * 0.28;
      this.add({ shape: "cyl", mat: tm, lx: o.lx, ly: roofTop + 0.42, lz: o.lz, w: dr * 2.1, h: 0.84, d: dr * 2.1, collide: false });
      this.add({ shape: "dome", mat: o.dome, lx: o.lx, ly: roofTop + 0.80, lz: o.lz, w: dr * 2.0, h: dr * 0.88, d: dr * 2.0, collide: false });
      this.add({ shape: "cone", mat: "gold", lx: o.lx, ly: roofTop + 0.80 + dr * 0.88 + 0.36, lz: o.lz, w: 0.38, h: 0.9, d: 0.38, collide: false });
    } else if (o.pergola) {
      const pw = o.w * 0.55, pd = o.d * 0.55;
      for (const sx of [-pw * 0.45, pw * 0.45]) for (const sz of [-pd * 0.45, pd * 0.45]) {
        const [px, pz] = tx(sx, sz);
        this.add({ mat: "darkwood", lx: px, ly: roofTop + 1.35, lz: pz, w: 0.18, h: 2.7, d: 0.18, yaw, collide: false });
      }
      this.add({ mat: "awning", lx: o.lx, ly: roofTop + 2.74, lz: o.lz, w: pw + 0.4, h: 0.12, d: pd + 0.4, yaw, collide: false });
    }

    // Rooftop infrastructure details (solar water heater, AC unit, water tank, or tactical crate cover)
    const rProp = o.rooftopProp ?? (wm === "metal" || wm === "rust" ? "ac" : o.dome ? "none" : "tank");
    if (rProp === "tank") {
      const [px, pz] = tx(-o.w * 0.30, -o.d * 0.28);
      this.add({ mat: "iron", lx: px, ly: roofTop + 0.45, lz: pz, w: 1.3, h: 0.9, d: 1.3, yaw, collide: false });
      this.add({ shape: "cyl", mat: "copper", lx: px, ly: roofTop + 1.35, lz: pz, w: 1.15, h: 1.4, d: 1.15, collide: false });
    } else if (rProp === "ac") {
      const [px, pz] = tx(-o.w * 0.28, -o.d * 0.26);
      this.add({ mat: "metal", lx: px, ly: roofTop + 0.55, lz: pz, w: 2.1, h: 1.1, d: 1.5, yaw });
      this.add({ shape: "cyl", mat: "iron", lx: px, ly: roofTop + 1.14, lz: pz, w: 1.0, h: 0.14, d: 1.0, collide: false });
    } else if (rProp === "solar") {
      const [px, pz] = tx(0, -o.d * 0.24);
      this.add({ mat: "solar", lx: px, ly: roofTop + 0.72, lz: pz, w: 3.4, h: 1.8, d: 0.18, yaw, pitch: -0.5, collide: false });
    } else if (rProp === "crates") {
      const [px, pz] = tx(-o.w * 0.25, -o.d * 0.22);
      this.add({ mat: "crate", lx: px, ly: roofTop + 0.65, lz: pz, w: 1.4, h: 1.3, d: 1.4, yaw });
    }

    // Optional exterior sandstone/metal stairs up the +X wall with a flush top landing slab clear of the front parapet!
    if (o.roofStairs) {
      const run = Math.min(o.d - 2.6, o.h * 1.32);
      const vCenter = -0.95;
      const vTop = vCenter + run * 0.5;
      const [sx, sz] = tx(o.w * 0.5 + 1.05, vCenter);
      this.stairs(sx, ly, sz, 1.8, run, o.h + 0.34, yaw, rm, true);
      // Solid top landing deck flush with roofTop bridging seamlessly onto the open +X roof edge
      const [lxTop, lzTop] = tx(o.w * 0.5 + 0.95, vTop + 0.90);
      this.add({ mat: rm, lx: lxTop, ly: ly + o.h + 0.17, lz: lzTop, w: 2.15, h: 0.34, d: 1.9, yaw });
    }

    // Lived-in Interior Furnishings (woven floor rug, counter/table, storage shelves, barrels/crates, interior lantern!)
    const furn = o.furnish ?? (wm === "metal" ? "lab" : wm === "rust" ? "warehouse" : "house");
    if (furn !== "none" && o.w >= 8 && o.d >= 7) {
      // Woven desert rug in room center (house/shop/saloon/barracks)
      if (furn === "house" || furn === "shop" || furn === "saloon" || furn === "barracks") {
        this.add({ mat: "rug", lx: o.lx, ly: ly + 0.28, lz: o.lz, w: Math.min(4.6, o.w * 0.44), h: 0.04, d: Math.min(3.6, o.d * 0.40), yaw, collide: false });
      }
      // Interior warm ceiling lantern
      this.add({ shape: "sphere", mat: "glow", lx: o.lx, ly: ly + o.h - 0.55, lz: o.lz, w: 0.42, h: 0.42, d: 0.42, collide: false });
      if (furn === "saloon") {
        // Long western wooden bar counter along -X wall + liquor shelf + round poker table
        const [bx, bz] = tx(-o.w * 0.28, -o.d * 0.05);
        this.add({ mat: "darkwood", lx: bx, ly: ly + 0.65, lz: bz, w: 1.1, h: 1.15, d: o.d * 0.58, yaw });
        for (const off of [-1.8, 0, 1.8]) {
          const [stx, stz] = tx(-o.w * 0.14, off);
          this.add({ shape: "cyl", mat: "timber", lx: stx, ly: ly + 0.46, lz: stz, w: 0.46, h: 0.68, d: 0.46, collide: false });
        }
        const [tx2, tz2] = tx(o.w * 0.22, -o.d * 0.18);
        this.add({ shape: "cyl", mat: "timber", lx: tx2, ly: ly + 0.62, lz: tz2, w: 1.8, h: 0.92, d: 1.8 });
      } else if (furn === "lab") {
        // Futuristic glowing lab server racks & central holographic console!
        for (const side of [-1, 1]) {
          const [rx, rz] = tx(side * (o.w * 0.34), -o.d * 0.22);
          this.add({ mat: "iron", lx: rx, ly: ly + 1.35, lz: rz, w: 1.2, h: 2.4, d: 2.6, yaw });
          this.add({ mat: "turquoise", lx: rx, ly: ly + 1.65, lz: rz, w: 1.26, h: 0.45, d: 2.2, yaw, collide: false });
        }
        const [cx, cz] = tx(0, -o.d * 0.20);
        this.add({ mat: "metal", lx: cx, ly: ly + 0.68, lz: cz, w: 2.8, h: 1.0, d: 1.2, yaw });
        this.add({ mat: "glow", lx: cx, ly: ly + 1.26, lz: cz, w: 1.8, h: 0.16, d: 0.7, yaw, collide: false });
      } else if (furn === "warehouse") {
        // Stacked shipping crates & steel oil barrels inside corners
        for (const [cx, cz, ch] of [[-o.w * 0.30, -o.d * 0.25, 1.6], [o.w * 0.30, -o.d * 0.24, 1.3]]) {
          const [px, pz] = tx(cx, cz);
          this.add({ mat: "crate", lx: px, ly: ly + ch * 0.5 + 0.2, lz: pz, w: 1.8, h: ch, d: 1.6, yaw });
        }
        const [bx, bz] = tx(o.w * 0.32, o.d * 0.22);
        this.add({ shape: "cyl", mat: "rust", lx: bx, ly: ly + 0.75, lz: bz, w: 0.85, h: 1.15, d: 0.85 });
      } else {
        // House / Shop / Barracks / Shack: merchant counter or dining table + wall shelves + terracotta amphora!
        const [cx, cz] = tx(-o.w * 0.26, -o.d * 0.22);
        this.add({ mat: "timber", lx: cx, ly: ly + 0.62, lz: cz, w: 2.4, h: 0.92, d: 1.0, yaw });
        const [shx, shz] = tx(o.w * 0.34, -o.d * 0.26);
        this.add({ mat: "darkwood", lx: shx, ly: ly + 1.15, lz: shz, w: 1.0, h: 1.95, d: 2.2, yaw });
        const [ax, az] = tx(o.w * 0.30, o.d * 0.26);
        this.add({ shape: "sphere", mat: "terracotta", lx: ax, ly: ly + 0.62, lz: az, w: 0.68, h: 0.92, d: 0.68, collide: false });
      }
    }

    // Register enterable interior room for loot-spots & indoor sandstorm occlusion
    const [rwx, rwy, rwz] = this.wPos(o.lx, ly, o.lz);
    this.rooms.push({
      x: rwx, y: rwy, z: rwz, yaw, w: o.w, d: o.d, h: o.h,
      openings: [{ kind: "door" }, ...(o.backDoor ? [{ kind: "door" }] : []), ...(o.glass ? [{ kind: "window" }] : [])],
    });
  }

  /** Richly stocked desert bazaar market stall / nomad shade tent with woven rug, spice baskets, amphorae & glowing lantern */
  stall(lx: number, ly: number, lz: number, w = 5.4, d = 3.8, yaw = 0, mat: DesertMat = "awning", deckDepth = 0.6) {
    const c = dmath.cos(yaw), s = dmath.sin(yaw);
    const tx = (u: number, v: number): [number, number] => [lx + u * c + v * s, lz - u * s + v * c];
    const postH = 2.96 + deckDepth;
    for (const sx of [-w * 0.45, w * 0.45]) for (const sz of [-d * 0.44, d * 0.44]) {
      const [px, pz] = tx(sx, sz);
      this.add({ shape: "cyl", mat: "darkwood", lx: px, ly: ly + 2.96 - postH * 0.5, lz: pz, w: 0.22, h: postH, d: 0.22 });
    }
    // Optional wooden stilt deck platform when placed on sloped lakeside/canyon banks
    if (deckDepth > 0.8) {
      this.add({ mat: "timber", lx, ly: ly - 0.10, lz, w: w + 0.35, h: 0.24, d: d + 0.35, yaw });
    }
    // Sloped striped canopy + ridge beam + front valance skirt
    this.add({ mat, lx, ly: ly + 3.05, lz, w: w + 0.6, h: 0.16, d: d + 0.6, yaw, pitch: 0.10, collide: false });
    this.add({ mat: "darkwood", lx, ly: ly + 2.92, lz, w: w + 0.4, h: 0.14, d: 0.16, yaw, collide: false });
    const [vx, vz] = tx(0, d * 0.48);
    this.add({ mat: mat === "canvas" ? "crimson" : "terracotta", lx: vx, ly: ly + 2.74, lz: vz, w: w + 0.5, h: 0.34, d: 0.08, yaw, collide: false });
    // Woven merchant rug underneath
    this.add({ mat: "rug", lx, ly: ly + 0.04, lz, w: w * 0.82, h: 0.06, d: d * 0.78, yaw, collide: false });
    // Merchant wooden table + stocked colorful spice crates & clay amphorae + hanging brass lantern!
    const [cx, cz] = tx(0, -d * 0.18);
    this.add({ mat: "timber", lx: cx, ly: ly + 0.48, lz: cz, w: w * 0.72, h: 0.96, d: 0.95, yaw });
    const [g1x, g1z] = tx(-w * 0.20, -d * 0.18);
    const [g2x, g2z] = tx(w * 0.18, -d * 0.16);
    this.add({ mat: "crate", lx: g1x, ly: ly + 1.20, lz: g1z, w: 0.85, h: 0.48, d: 0.68, yaw, collide: false });
    this.add({ shape: "sphere", mat: "turquoise", lx: g2x, ly: ly + 1.22, lz: g2z, w: 0.56, h: 0.66, d: 0.56, collide: false });
    const [ax, az] = tx(w * 0.38, d * 0.18);
    this.add({ shape: "sphere", mat: "terracotta", lx: ax, ly: ly + 0.46, lz: az, w: 0.58, h: 0.86, d: 0.58, collide: false });
    const [lanX, lanZ] = tx(0, d * 0.26);
    this.add({ shape: "sphere", mat: "glow", lx: lanX, ly: ly + 2.55, lz: lanZ, w: 0.30, h: 0.36, d: 0.30, collide: false });
  }

  /** Ornate desert street lamp post with curved iron arm & glowing lantern */
  lampPost(lx: number, ly: number, lz: number, yaw = 0) {
    const c = dmath.cos(yaw), s = dmath.sin(yaw);
    this.add({ shape: "cyl", mat: "sandstone", lx, ly: ly + 0.3, lz, w: 0.55, h: 0.6, d: 0.55, collide: false });
    this.add({ shape: "cyl", mat: "iron", lx, ly: ly + 2.5, lz, w: 0.16, h: 4.4, d: 0.16, collide: false });
    this.add({ mat: "iron", lx: lx + s * 0.42, ly: ly + 4.65, lz: lz + c * 0.42, w: 0.12, h: 0.12, d: 0.9, yaw, collide: false });
    this.add({ shape: "sphere", mat: "glow", lx: lx + s * 0.82, ly: ly + 4.38, lz: lz + c * 0.82, w: 0.42, h: 0.48, d: 0.42, collide: false });
  }

  /** Stone temple / fortress fire brazier with glowing recessed coal bed & procedural GLSL animated flame! */
  brazier(lx: number, ly: number, lz: number, scale = 1) {
    this.add({ shape: "cyl", mat: "sandstone", lx, ly: ly + 0.45 * scale, lz, w: 1.25 * scale, h: 0.9 * scale, d: 1.25 * scale });
    this.add({ shape: "cyl", mat: "copper", lx, ly: ly + 1.02 * scale, lz, w: 1.52 * scale, h: 0.32 * scale, d: 1.52 * scale, collide: false });
    this.add({ shape: "cyl", mat: "iron", lx, ly: ly + 1.18 * scale, lz, w: 1.32 * scale, h: 0.14 * scale, d: 1.32 * scale, collide: false });
    this.add({ shape: "cyl", mat: "fire", lx, ly: ly + 1.24 * scale, lz, w: 1.04 * scale, h: 0.10 * scale, d: 1.04 * scale, collide: false });
    this.anims.push({ kind: "flame", x: this.ox + lx, y: this.oy + ly + 1.22 * scale, z: this.oz + lz, scale: scale * 1.08 });
  }

  /** Tall desert heraldic banner pole with vibrant hanging tapestry flag */
  bannerPole(lx: number, ly: number, lz: number, yaw = 0, flagMat: DesertMat = "crimson", h = 6.2) {
    const c = dmath.cos(yaw), s = dmath.sin(yaw);
    this.add({ shape: "cyl", mat: "darkwood", lx, ly: ly + h * 0.5, lz, w: 0.18, h, d: 0.18, collide: false });
    this.add({ shape: "sphere", mat: "gold", lx, ly: ly + h + 0.14, lz, w: 0.34, h: 0.34, d: 0.34, collide: false });
    this.add({ mat: "darkwood", lx: lx + s * 0.65, ly: ly + h - 0.35, lz: lz + c * 0.65, w: 0.10, h: 0.10, d: 1.35, yaw, collide: false });
    this.add({ mat: flagMat, lx: lx + s * 0.68, ly: ly + h - 1.55, lz: lz + c * 0.68, w: 0.08, h: 2.3, d: 1.15, yaw, collide: false });
    this.add({ mat: "gold", lx: lx + s * 0.68, ly: ly + h - 2.65, lz: lz + c * 0.68, w: 0.10, h: 0.18, d: 1.15, yaw, collide: false });
  }

  /** Ornate stone planter bed with a real lush VegApi palm or prickly-pear inside! */
  planter(lx: number, ly: number, lz: number, kind: "palm" | "prickly-pear" = "palm", scale = 0.72) {
    this.add({ shape: "cyl", mat: "sandstone", lx, ly: ly + 0.42, lz, w: 3.2, h: 0.84, d: 3.2 });
    this.add({ shape: "cyl", mat: "turquoise", lx, ly: ly + 0.86, lz, w: 3.35, h: 0.14, d: 3.35, collide: false });
    this.flora.push([kind, this.ox + lx, this.oy + ly + 0.78, this.oz + lz, (lx * 0.7 + lz * 0.3) % 6.28, scale]);
  }

  /** Tactical wooden shipping crates & barrels cluster (authentic waist-to-chest firefight cover!) */
  crateCluster(lx: number, ly: number, lz: number, yaw = 0, industrial = false) {
    const c = dmath.cos(yaw), s = dmath.sin(yaw);
    const tx = (u: number, v: number): [number, number] => [lx + u * c + v * s, lz - u * s + v * c];
    const m1: DesertMat = industrial ? "rust" : "crate";
    const m2: DesertMat = industrial ? "metal" : "timber";
    this.add({ mat: m1, lx, ly: ly + 0.82, lz, w: 1.85, h: 1.64, d: 1.65, yaw });
    const [x2, z2] = tx(1.55, 0.35);
    this.add({ mat: m2, lx: x2, ly: ly + 0.62, lz: z2, w: 1.35, h: 1.24, d: 1.35, yaw: yaw + 0.35 });
    const [x3, z3] = tx(-0.2, 0.08);
    this.add({ mat: "crate", lx: x3, ly: ly + 2.05, lz: z3, w: 1.05, h: 0.82, d: 1.05, yaw: yaw - 0.4, collide: false });
    const [bx, bz] = tx(-1.45, -0.45);
    this.add({ shape: "cyl", mat: industrial ? "copper" : "darkwood", lx: bx, ly: ly + 0.62, lz: bz, w: 0.82, h: 1.24, d: 0.82 });
  }

  /** Waist-high military sandbag barricade cover */
  sandbagWall(lx: number, ly: number, lz: number, w = 4.2, yaw = 0) {
    this.add({ mat: "sandbag", lx, ly: ly + 0.56, lz, w, h: 1.12, d: 0.92, yaw });
    const c = dmath.cos(yaw), s = dmath.sin(yaw);
    const n = Math.max(2, Math.floor(w / 1.1));
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n - 0.5) * (w - 0.7);
      this.add({ shape: "sphere", mat: "sandbag", lx: lx + u * c, ly: ly + 1.14, lz: lz - u * s, w: 0.95, h: 0.38, d: 0.78, yaw, collide: false });
    }
  }

  /** Grand carved sandstone / redrock desert triumphal archway gate with flanking pillars & banners */
  archGate(lx: number, ly: number, lz: number, span = 12, h = 7.4, yaw = 0, mat: DesertMat = "sandstone") {
    const c = dmath.cos(yaw), s = dmath.sin(yaw);
    const tx = (u: number, v: number): [number, number] => [lx + u * c + v * s, lz - u * s + v * c];
    for (const side of [-1, 1]) {
      const [px, pz] = tx(side * (span * 0.5), 0);
      this.add({ mat, lx: px, ly: ly + h * 0.5, lz: pz, w: 2.6, h, d: 2.8, yaw });
      this.add({ mat: "hieroglyph", lx: px, ly: ly + h + 0.55, lz: pz, w: 3.0, h: 1.1, d: 3.2, yaw, collide: false });
      this.add({ shape: "pyramid", mat: "gold", lx: px, ly: ly + h + 1.55, lz: pz, w: 2.2, h: 1.1, d: 2.2, yaw, collide: false });
      const [bx, bz] = tx(side * (span * 0.5), 1.55);
      this.add({ mat: "crimson", lx: bx, ly: ly + h * 0.58, lz: bz, w: 1.1, h: 3.2, d: 0.12, yaw, collide: false });
    }
    this.add({ mat: "hieroglyph", lx, ly: ly + h + 0.1, lz, w: span + 2.8, h: 1.9, d: 3.0, yaw });
    this.add({ mat: "turquoise", lx, ly: ly + h + 1.18, lz, w: span + 3.2, h: 0.34, d: 3.2, yaw, collide: false });
  }

  /** Overhead draped souk street fabric canopy with grounded corner timber poles spanning bazaar lanes */
  overheadCanopy(lx: number, ly: number, lz: number, w: number, d: number, yaw = 0, mat: DesertMat = "awning") {
    this.add({ mat, lx, ly, lz, w, h: 0.12, d, yaw, collide: false });
    const c = dmath.cos(yaw), s = dmath.sin(yaw);
    const tx = (u: number, v: number): [number, number] => [lx + u * c + v * s, lz - u * s + v * c];
    for (const side of [-1, 1]) {
      const [rx, rz] = tx(side * w * 0.48, 0);
      this.add({ mat: "darkwood", lx: rx, ly: ly - 0.12, lz: rz, w: 0.16, h: 0.16, d: d + 0.5, yaw, collide: false });
      for (const end of [-1, 1]) {
        const [px, pz] = tx(side * w * 0.48, end * (d * 0.46));
        this.add({ shape: "cyl", mat: "darkwood", lx: px, ly: ly * 0.5, lz: pz, w: 0.22, h: ly, d: 0.22, collide: false });
      }
    }
  }

  /** Industrial elevated pipeline segment between two local points */
  pipe(ax: number, ay: number, az: number, bx: number, by: number, bz: number, dia = 0.65, mat: DesertMat = "copper") {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const horiz = dmath.hypot(dx, dz);
    const len = dmath.hypot(horiz, dy);
    if (len < 0.2) return;
    const yaw = dmath.atan2(dx, dz);
    const pitch = Math.PI * 0.5 - dmath.atan2(dy, horiz);
    this.add({ shape: "cyl", mat, lx: (ax + bx) * 0.5, ly: (ay + by) * 0.5, lz: (az + bz) * 0.5, w: dia, h: len, d: dia, yaw, pitch, collide: false });
    // Flange collars near ends
    for (const f of [0.15, 0.5, 0.85]) {
      this.add({ shape: "cyl", mat: "iron", lx: ax + dx * f, ly: ay + dy * f, lz: az + dz * f, w: dia * 1.32, h: 0.22, d: dia * 1.32, yaw, pitch, collide: false });
    }
  }

  /** Sculpted desert wooden dhow boat moored in water beside a pier */
  dhowBoat(lx: number, ly: number, lz: number, yaw = 0, withSail = true) {
    const c = dmath.cos(yaw), s = dmath.sin(yaw);
    const tx = (u: number, v: number): [number, number] => [lx + u * c + v * s, lz - u * s + v * c];
    // Curved hull + bow + stern + deck + cargo crates
    this.add({ mat: "darkwood", lx, ly: ly + 0.25, lz, w: 3.4, h: 1.2, d: 10.5, yaw });
    const [bx, bz] = tx(0, 5.8);
    this.add({ shape: "pyramid", mat: "darkwood", lx: bx, ly: ly + 0.55, lz: bz, w: 3.2, h: 2.2, d: 3.0, yaw, pitch: Math.PI * 0.5, collide: false });
    this.add({ mat: "timber", lx, ly: ly + 0.90, lz, w: 3.0, h: 0.22, d: 9.2, yaw });
    const [cx, cz] = tx(0, -2.2);
    this.add({ mat: "crate", lx: cx, ly: ly + 1.50, lz: cz, w: 1.5, h: 1.0, d: 1.4, yaw, collide: false });
    // Tall timber mast + slanted lateen desert canvas sail!
    if (withSail) {
      const [mx, mz] = tx(0, 0.8);
      this.add({ shape: "cyl", mat: "timber", lx: mx, ly: ly + 5.2, lz: mz, w: 0.28, h: 8.8, d: 0.28, collide: false });
      this.add({ mat: "canvas", lx: mx, ly: ly + 5.8, lz: mz - 0.2, w: 0.12, h: 6.2, d: 5.8, yaw: yaw + 0.18, roll: 0.14, collide: false });
      this.add({ mat: "crimson", lx: mx, ly: ly + 9.4, lz: mz, w: 0.08, h: 0.7, d: 1.8, yaw, collide: false });
    }
  }

  /** Detailed helipad apron with glowing perimeter beacons & golden H mark */
  helipad(lx: number, ly: number, lz: number) {
    this.add({ shape: "cyl", mat: "metal", lx, ly: ly + 0.16, lz, w: 15.5, h: 0.32, d: 15.5 });
    this.add({ shape: "torus", mat: "gold", lx, ly: ly + 0.34, lz, w: 13.8, h: 0.4, d: 13.8, collide: false });
    this.add({ mat: "gold", lx, ly: ly + 0.34, lz, w: 5.0, h: 0.06, d: 1.0, collide: false });
    this.add({ mat: "gold", lx: lx - 2.5, ly: ly + 0.34, lz, w: 1.0, h: 0.06, d: 5.5, collide: false });
    this.add({ mat: "gold", lx: lx + 2.5, ly: ly + 0.34, lz, w: 1.0, h: 0.06, d: 5.5, collide: false });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.add({ shape: "cyl", mat: "glow", lx: lx + dmath.cos(a) * 7.6, ly: ly + 0.42, lz: lz + dmath.sin(a) * 7.6, w: 0.38, h: 0.36, d: 0.38, collide: false });
    }
  }

  /** Sculpted Saguaro cactus planted through VegApi ("cactus") with shared trunk collider */
  saguaro(lx: number, ly: number, lz: number, h = 4.6, yaw = 0) {
    const x = this.ox + lx, y = this.oy + ly, z = this.oz + lz;
    const sc = Math.max(0.65, h / 7.2);
    this.cacti.push([x, y - 0.05, z, yaw, sc]);
    this.colliders.push({
      c: [x, y + h * 0.5, z],
      h: [0.38 * sc, h * 0.5, 0.38 * sc],
      surf: "wood",
      round: [x, z],
    });
  }

  chest(lx: number, ly: number, lz: number, yaw = 0, isHero = false) {
    if (isHero) this.hero.push(this.chests.length);
    this.chests.push([this.ox + lx, this.oy + ly, this.oz + lz, yaw]);
  }
  loot(lx: number, ly: number, lz: number) {
    this.floor.push([this.ox + lx, this.oy + ly, this.oz + lz]);
  }
  hotZone(lx: number, lz: number, r: number, chests = 3, roof = 1) {
    this.hot.push({ x: this.ox + lx, z: this.oz + lz, r, chests, roof });
  }

  finish(): SunburstPoiData {
    return {
      id: this.id,
      pieces: this.pieces,
      colliders: this.colliders,
      clearings: this.clearings,
      cacti: this.cacti,
      flora: this.flora,
      anims: this.anims,
      LOOT_SPOTS: { chests: this.chests, floor: this.floor, ...(this.hero.length ? { hero: this.hero } : {}) },
      LOOT_HOT: this.hot,
      INTERIOR_ROOMS: this.rooms,
    };
  }
}

// ============================================================================ BUILD ALL 13 UPGRADED POIs

function buildBananaPyramid(): SunburstPoiData {
  const B = new PoiBuilder("banana-pyramid", -420, 24, -240);
  B.clearings.push({ x: -420, z: -240, r: 108 });
  B.hotZone(0, 0, 56, 5, 2);

  // Monumental base podium with hollow enterable 18×18 m Pharaoh Burial Vault inside!
  const tierH = 3.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    B.add({ mat: "hieroglyph", lx: sx * 18, ly: 3.2, lz: sz * 18, w: 18, h: 6.4, d: 18 });
  }
  for (const sx of [-1, 1]) {
    B.add({ mat: "hieroglyph", lx: sx * 18, ly: 3.2, lz: 0, w: 18, h: 6.4, d: 18 });
  }
  // North & South grand portals with sculpted gold/turquoise architraves & crimson banners!
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      B.add({ mat: "hieroglyph", lx: sx * 6.0, ly: 3.2, lz: sz * 18, w: 6.6, h: 6.4, d: 18 });
      // Portal flanking guardian columns
      B.add({ shape: "cyl", mat: "sandstone", lx: sx * 3.6, ly: 3.2, lz: sz * 27.3, w: 1.5, h: 6.4, d: 1.5, collide: false });
      B.add({ shape: "cyl", mat: "gold", lx: sx * 3.6, ly: 6.1, lz: sz * 27.3, w: 1.9, h: 0.6, d: 1.9, collide: false });
      B.add({ mat: "crimson", lx: sx * 5.6, ly: 3.6, lz: sz * 27.2, w: 1.1, h: 3.6, d: 0.12, collide: false });
    }
    B.add({ mat: "hieroglyph", lx: 0, ly: 5.2, lz: sz * 18, w: 5.6, h: 2.4, d: 18 });
    B.add({ mat: "gold", lx: 0, ly: 6.3, lz: sz * 27.4, w: 9.8, h: 0.65, d: 1.4, collide: false });
    B.add({ mat: "turquoise", lx: 0, ly: 5.8, lz: sz * 27.3, w: 8.6, h: 0.36, d: 1.1, collide: false });
  }

  // Vault interior: Pharaoh Dais, golden sarcophagus lid, royal woven carpets, 4 corner columns & 4 burning braziers!
  B.add({ mat: "sandstone", lx: 0, ly: 0.14, lz: 0, w: 56, h: 0.28, d: 56 });
  B.add({ mat: "rug", lx: 0, ly: 0.30, lz: 0, w: 4.6, h: 0.04, d: 34, collide: false });
  B.add({ mat: "gold", lx: 0, ly: 0.65, lz: 0, w: 6.2, h: 0.75, d: 6.2 });
  B.add({ mat: "turquoise", lx: 0, ly: 1.08, lz: 0, w: 5.6, h: 0.18, d: 5.6, collide: false });
  B.add({ mat: "gold", lx: 0, ly: 1.38, lz: 0, w: 3.4, h: 0.65, d: 3.4 });
  for (const sx of [-6.8, 6.8]) for (const sz of [-6.8, 6.8]) {
    B.add({ shape: "cyl", mat: "hieroglyph", lx: sx, ly: 3.2, lz: sz, w: 1.4, h: 6.2, d: 1.4 });
    B.brazier(sx * 0.68, 0.28, sz * 0.68, 0.75);
  }
  B.add({ mat: "sandstone", lx: 0, ly: 6.65, lz: 0, w: 46, h: 0.5, d: 46 });
  B.rooms.push({ x: -420, y: 24, z: -240, yaw: 0, w: 18, d: 18, h: 6.4, openings: [{ kind: "door" }, { kind: "door" }] });

  // Upper 5 stepped golden pyramid tiers with gilded cornice bands!
  const tiers = [
    { w: 42, y: 6.9, h: tierH },
    { w: 34, y: 10.1, h: tierH },
    { w: 26, y: 13.3, h: tierH },
    { w: 18, y: 16.5, h: tierH },
    { w: 10, y: 19.7, h: tierH },
  ];
  for (const t of tiers) {
    B.add({ mat: "hieroglyph", lx: 0, ly: t.y + t.h * 0.5, lz: 0, w: t.w, h: t.h, d: t.w });
    B.add({ mat: "gold", lx: 0, ly: t.y + t.h - 0.14, lz: 0, w: t.w + 0.35, h: 0.26, d: t.w + 0.35, collide: false });
  }
  // Golden Banana Apex Capstone (compact 6.2 m base leaving wide 1.9 m summit terrace all around!) + blazing summit braziers!
  B.add({ shape: "pyramid", mat: "gold", lx: 0, ly: 25.0, lz: 0, w: 6.2, h: 4.2, d: 6.2 });
  B.add({ shape: "cyl", mat: "gold", lx: 0, ly: 27.1, lz: 0, w: 0.65, h: 0.55, d: 0.65, collide: false });
  B.brazier(4.4, 22.9, 4.4, 0.7);
  B.brazier(-4.4, 22.9, -4.4, 0.7);

  // Monumental climbable grand staircases on East & West flanks (clear EVERY stepped tier from x=±36.2 flush up to summit deck at x=±5!)
  B.stairs(20.6, 0, 0, 5.2, 31.2, 22.95, -Math.PI * 0.5, "sandstone");
  B.stairs(-20.6, 0, 0, 5.2, 31.2, 22.95, Math.PI * 0.5, "sandstone");
  for (const sx of [-1, 1]) {
    B.brazier(sx * 37.4, 0, 3.8, 0.9);
    B.brazier(sx * 37.4, 0, -3.8, 0.9);
  }

  // Twin Sculpted Seated Banana-Sphinx Temple Guardians flanking the grand South avenue (+Z)!
  for (const sx of [-10, 10]) {
    B.add({ mat: "sandstone", lx: sx, ly: 0.6, lz: 37, w: 5.0, h: 1.2, d: 9.2 });
    B.add({ mat: "hieroglyph", lx: sx, ly: 2.3, lz: 36, w: 3.4, h: 2.6, d: 6.2 });
    B.add({ mat: "sandstone", lx: sx, ly: 1.5, lz: 40.5, w: 3.6, h: 1.1, d: 2.4 }); // Paws
    B.add({ shape: "sphere", mat: "gold", lx: sx, ly: 4.2, lz: 38.4, w: 2.6, h: 2.8, d: 2.6, collide: false }); // Royal head
    B.add({ mat: "turquoise", lx: sx, ly: 4.1, lz: 37.8, w: 3.3, h: 2.4, d: 1.6, collide: false }); // Pharaoh nemes headdress!
  }

  // 4 Towering Hieroglyph Obelisks with stepped pedestals, turquoise collars, golden tips & flaming braziers
  for (const [ox, oz] of [[-38, 36], [38, 36], [-38, -36], [38, -36]]) {
    B.add({ mat: "sandstone", lx: ox, ly: 0.7, lz: oz, w: 5.2, h: 1.4, d: 5.2 });
    B.add({ mat: "turquoise", lx: ox, ly: 1.52, lz: oz, w: 3.8, h: 0.28, d: 3.8, collide: false });
    B.add({ mat: "hieroglyph", lx: ox, ly: 7.5, lz: oz, w: 2.6, h: 12.0, d: 2.6 });
    B.add({ shape: "pyramid", mat: "gold", lx: ox, ly: 14.7, lz: oz, w: 2.6, h: 2.4, d: 2.6 });
    B.brazier(ox + (ox > 0 ? -4.2 : 4.2), 0, oz, 0.85);
  }

  // Twin ceremonial guardhouses (domed, furnished!) + archaeological expedition camp + courtyard infrastructure
  B.building({ lx: 48, lz: 12, w: 11, d: 13, h: 4.4, yaw: -Math.PI * 0.5, wallMat: "hieroglyph", trimMat: "sandstone", parapet: true, glass: true, roofStairs: true, dome: "turquoise", furnish: "barracks" });
  B.building({ lx: -48, lz: -12, w: 11, d: 13, h: 4.4, yaw: Math.PI * 0.5, wallMat: "hieroglyph", trimMat: "sandstone", parapet: true, glass: true, roofStairs: true, dome: "gold", furnish: "barracks" });
  B.building({ lx: 0, lz: -50, w: 14, d: 10, h: 4.2, yaw: 0, wallMat: "sandstone", roofMat: "terracotta", parapet: true, backDoor: true, glass: true, pergola: true, furnish: "shop" });
  B.stall(22, 0, 46, 6.2, 4.2, 0, "awning");
  B.stall(-22, 0, 46, 6.2, 4.2, 0, "awning");
  B.stall(46, 0, -24, 5.8, 3.8, -Math.PI * 0.5, "canvas");
  B.stall(-46, 0, 24, 5.8, 3.8, Math.PI * 0.5, "canvas");

  // Ceremonial avenue colonnade pillars, banner poles, palm planters & crate cover!
  B.archGate(0, 0, 62, 13, 7.2, 0, "sandstone");
  for (const sx of [-13, 13]) {
    B.bannerPole(sx, 0, 52, 0, "crimson", 6.5);
    B.planter(sx * 1.4, 0, 32, "palm", 0.72);
    B.lampPost(sx * 0.85, 0, 44, sx > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
  }
  B.crateCluster(36, 0, -10, 0.4);
  B.crateCluster(-36, 0, 10, -0.6);
  B.helipad(58, 0, 42);

  B.chest(0, 1.72, 0, 0, true);
  B.chest(0, 22.95, 3.8, 0, true);
  B.chest(48, 0.3, 12, -Math.PI * 0.5);
  B.chest(-48, 0.3, -12, Math.PI * 0.5);
  B.chest(0, 0.3, -50, 0);
  B.chest(22, 0.3, 46, 0);
  B.chest(-22, 0.3, 46, 0);
  for (const [fx, fy, fz] of [[6, 0.3, 4], [-6, 0.3, -4], [0, 0.3, 30], [0, 0.3, -30], [48, 4.8, 12], [-48, 4.8, -12], [22, 6.95, 22], [-22, 6.95, -22], [0, 4.6, -50]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildEmeraldOasis(): SunburstPoiData {
  // Oasis pool centered at (0, 40): water surface y=0, central island y=1.8, lush shore banks y~4.2 around r=68..98
  const B = new PoiBuilder("emerald-oasis", 0, 0, 40);
  B.clearings.push({ x: 0, z: 40, r: 98 });
  B.hotZone(0, 0, 36, 4, 1);

  // Ornate Central Oasis Island Shrine Pavilion with turquoise tiled terrace, 8 fluted columns, dome cupola & hanging lanterns!
  B.add({ shape: "cyl", mat: "sandstone", lx: 0, ly: -0.6, lz: 0, w: 22, h: 4.4, d: 22 });
  B.add({ shape: "cyl", mat: "turquoise", lx: 0, ly: 1.72, lz: 0, w: 20.4, h: 0.24, d: 20.4, collide: false });
  B.add({ shape: "cyl", mat: "hieroglyph", lx: 0, ly: 2.02, lz: 0, w: 14.5, h: 0.5, d: 14.5 });
  B.add({ shape: "cyl", mat: "rug", lx: 0, ly: 2.30, lz: 0, w: 10.2, h: 0.06, d: 10.2, collide: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cx = dmath.cos(a) * 6.0, cz = dmath.sin(a) * 6.0;
    B.add({ shape: "cyl", mat: "plaster", lx: cx, ly: 4.5, lz: cz, w: 0.72, h: 4.6, d: 0.72 });
    B.add({ shape: "cyl", mat: "gold", lx: cx, ly: 6.72, lz: cz, w: 0.96, h: 0.28, d: 0.96, collide: false });
    if (i % 2 === 0) {
      B.add({ shape: "sphere", mat: "glow", lx: dmath.cos(a) * 5.2, ly: 5.8, lz: dmath.sin(a) * 5.2, w: 0.36, h: 0.42, d: 0.36, collide: false });
    }
  }
  B.add({ shape: "torus", mat: "gold", lx: 0, ly: 6.85, lz: 0, w: 12.6, h: 0.55, d: 12.6, collide: false });
  B.add({ shape: "cone", mat: "awning", lx: 0, ly: 7.9, lz: 0, w: 15.8, h: 2.2, d: 15.8, collide: false });
  B.add({ shape: "dome", mat: "turquoise", lx: 0, ly: 8.85, lz: 0, w: 3.4, h: 1.8, d: 3.4, collide: false });
  B.add({ shape: "cone", mat: "gold", lx: 0, ly: 11.15, lz: 0, w: 0.55, h: 1.2, d: 0.55, collide: false });

  // 4 Timber Pedestrian Pier Bridges spanning cleanly into the dry oasis banks with railing posts & glowing lanterns!
  for (const [bx, bz, bw, bd] of [
    [39, 0, 64, 4.2], [-39, 0, 64, 4.2],
    [0, 39, 4.2, 64], [0, -39, 4.2, 64],
  ]) {
    B.add({ mat: "timber", lx: bx, ly: 2.25, lz: bz, w: bw, h: 0.35, d: bd });
    const alongX = bw > bd;
    // Side low wooden curb trim + spaced lantern posts along both sides of each bridge
    for (const side of [-1.95, 1.95]) {
      B.add({ mat: "darkwood", lx: alongX ? bx : bx + side, ly: 2.54, lz: alongX ? bz + side : bz, w: alongX ? bw : 0.22, h: 0.24, d: alongX ? 0.22 : bd, collide: false });
    }
    for (const off of [-24, -8, 8, 24]) {
      const px = alongX ? bx + off : bx;
      const pz = alongX ? bz : bz + off;
      for (const side of [-1.9, 1.9]) {
        const lx = alongX ? px : px + side;
        const lz = alongX ? pz + side : pz;
        B.add({ shape: "cyl", mat: "darkwood", lx, ly: 0.5, lz, w: 0.48, h: 6.2, d: 0.48, collide: false });
        if (off === -8 || off === 8) {
          B.add({ shape: "sphere", mat: "glow", lx, ly: 3.72, lz, w: 0.34, h: 0.38, d: 0.34, collide: false });
        }
      }
    }
  }
  // 2 Small wooden oasis boats moored gently in the turquoise lagoon!
  B.dhowBoat(24, 0.1, 20, 0.65, false);
  B.dhowBoat(-24, 0.1, -22, -2.4, false);

  // 4 Furnished Lakeside Oasis Villas (East, West, North, South) anchored with deep stone retaining plinths!
  B.building({ lx: 78, ly: 4.4, lz: 18, w: 12, d: 10, h: 4.2, yaw: -Math.PI * 0.5, wallMat: "plaster", trimMat: "sandstone", parapet: true, glass: true, roofStairs: true, dome: "turquoise", furnish: "house", foundationDepth: 3.6 });
  B.building({ lx: -78, ly: 5.0, lz: -18, w: 12, d: 10, h: 4.2, yaw: Math.PI * 0.5, wallMat: "plaster", trimMat: "sandstone", parapet: true, glass: true, roofStairs: true, dome: "turquoise", furnish: "house", foundationDepth: 2.0 });
  B.building({ lx: 22, ly: 4.0, lz: -78, w: 11, d: 9, h: 4.0, yaw: 0, wallMat: "adobe", roofMat: "terracotta", parapet: true, glass: true, pergola: true, furnish: "shop", foundationDepth: 2.4 });
  B.building({ lx: -22, ly: 5.1, lz: 78, w: 11, d: 9, h: 4.0, yaw: Math.PI, wallMat: "adobe", roofMat: "terracotta", parapet: true, glass: true, pergola: true, furnish: "shop", foundationDepth: 2.2 });

  // 6 Vibrant Oasis Beach Stalls grounded cleanly on shoreline stilt decks, plus bridge-mounted banners & lamps!
  B.stall(22, 5.0, 78, 6.8, 4.4, Math.PI, "awning", 1.4);
  B.stall(-22, 5.0, -78, 6.8, 4.4, 0, "awning", 1.4);
  B.stall(56, 4.5, -56, 6.2, 4.2, -0.78, "awning", 2.8);
  B.stall(-56, 2.4, 56, 6.2, 4.2, 2.35, "awning", 2.2);
  B.stall(58, 4.4, 52, 5.8, 4.0, -2.35, "canvas", 2.4);
  B.stall(-58, 2.6, -52, 5.8, 4.0, 0.78, "canvas", 1.8);
  for (const [lx, lz] of [[66, 0], [-66, 0], [0, 66], [0, -66]]) {
    B.bannerPole(lx + (lz === 0 ? 0 : 1.9), 2.4, lz + (lx === 0 ? 0 : 1.9), 0, "turquoise", 5.8);
    B.lampPost(lx - (lz === 0 ? 0 : 1.9), 2.4, lz - (lx === 0 ? 0 : 1.9), 0);
  }
  B.crateCluster(70, 2.9, -14, 0.3);
  B.crateCluster(-70, 1.9, 14, -0.5);

  B.chest(0, 2.32, 0, 0, true);
  B.chest(78, 4.7, 18, -Math.PI * 0.5, true);
  B.chest(-78, 5.3, -18, Math.PI * 0.5);
  B.chest(22, 4.3, -78, 0);
  B.chest(-22, 5.4, 78, Math.PI);
  B.chest(56, 4.8, -56, -0.78);
  for (const [fx, fy, fz] of [[4, 2.32, 3], [-4, 2.32, -3], [78, 9.0, 18], [-78, 9.6, -18], [56, 4.8, -56], [-56, 2.7, 56], [36, 2.5, 0], [-36, 2.5, 0], [22, 8.4, -78]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildSunburstBazaar(): SunburstPoiData {
  const B = new PoiBuilder("sunburst-bazaar", 420, 14, 120);
  B.clearings.push({ x: 420, z: 120, r: 124 });
  B.hotZone(0, 0, 64, 5, 2);

  // Ornate 2-Tier Moroccan Turquoise Fountain Plaza + circular tiled apron + benches + palm planters!
  B.add({ shape: "cyl", mat: "sandstone", lx: 0, ly: 0.12, lz: 0, w: 22, h: 0.24, d: 22, collide: false });
  B.add({ shape: "cyl", mat: "sandstone", lx: 0, ly: 0.50, lz: 0, w: 12.2, h: 1.0, d: 12.2 });
  B.add({ shape: "cyl", mat: "turquoise", lx: 0, ly: 1.02, lz: 0, w: 12.5, h: 0.16, d: 12.5, collide: false });
  B.add({ shape: "cyl", mat: "water", lx: 0, ly: 0.94, lz: 0, w: 10.6, h: 0.12, d: 10.6, collide: false });
  B.add({ shape: "cyl", mat: "hieroglyph", lx: 0, ly: 2.3, lz: 0, w: 2.8, h: 3.6, d: 2.8 });
  B.add({ shape: "cyl", mat: "turquoise", lx: 0, ly: 3.3, lz: 0, w: 5.2, h: 0.55, d: 5.2, collide: false });
  B.add({ shape: "cyl", mat: "gold", lx: 0, ly: 4.5, lz: 0, w: 1.5, h: 1.2, d: 1.5 });
  B.add({ shape: "sphere", mat: "water", lx: 0, ly: 5.2, lz: 0, w: 1.1, h: 1.1, d: 1.1, collide: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    B.planter(dmath.cos(a) * 10.5, 0, dmath.sin(a) * 10.5, "palm", 0.65);
    B.lampPost(dmath.cos(a) * 14.5, 0, dmath.sin(a) * 14.5, -a);
  }

  // Towering 25 m Bazaar Minaret Clocktower (buttressed plinth, vigas, corbelled sniper balcony, turquoise dome & golden spire!)
  B.add({ mat: "sandstone", lx: 0, ly: 1.5, lz: -36, w: 8.6, h: 3.0, d: 8.6 });
  B.add({ mat: "adobe", lx: 0, ly: 10.2, lz: -36, w: 7.2, h: 20.0, d: 7.2 });
  for (const bandY of [6.5, 13.0, 18.8]) {
    B.add({ mat: "turquoise", lx: 0, ly: bandY, lz: -36, w: 7.5, h: 0.45, d: 7.5, collide: false });
    B.add({ mat: "gold", lx: 0, ly: bandY + 0.32, lz: -36, w: 7.6, h: 0.18, d: 7.6, collide: false });
  }
  // Ornate clock faces on 4 sides of upper minaret
  for (const [ox, oz, w, d] of [[0, -32.3, 2.2, 0.18], [0, -39.7, 2.2, 0.18], [3.7, -36, 0.18, 2.2], [-3.7, -36, 0.18, 2.2]]) {
    B.add({ mat: "gold", lx: ox, ly: 16.0, lz: oz, w, h: 2.2, d, collide: false });
    B.add({ mat: "glow", lx: ox, ly: 16.0, lz: oz, w: w * 0.75, h: 1.5, d: d * 1.15, collide: false });
  }
  B.add({ mat: "terracotta", lx: 0, ly: 20.4, lz: -36, w: 9.6, h: 0.7, d: 9.6 }); // Sniper balcony deck!
  for (const [px, pz, pw, pd] of [[0, -31.4, 9.6, 0.35], [0, -40.6, 9.6, 0.35], [4.6, -36, 0.35, 8.8], [-4.6, -36, 0.35, 8.8]]) {
    B.add({ mat: "adobe", lx: px, ly: 21.3, lz: pz, w: pw, h: 1.1, d: pd });
  }
  for (const sx of [-3.6, 3.6]) for (const sz of [-32.4, -39.6]) {
    B.add({ shape: "cyl", mat: "plaster", lx: sx, ly: 22.8, lz: sz, w: 0.55, h: 3.4, d: 0.55, collide: false });
  }
  B.add({ shape: "dome", mat: "turquoise", lx: 0, ly: 24.4, lz: -36, w: 6.4, h: 3.4, d: 6.4, collide: false });
  B.add({ shape: "cone", mat: "gold", lx: 0, ly: 28.9, lz: -36, w: 1.2, h: 2.8, d: 1.2, collide: false });

  // 8 Dense Furnished Multi-Style Souk Houses framing the Bazaar avenues!
  B.building({ lx: -34, lz: -20, w: 14, d: 12, h: 4.6, yaw: Math.PI * 0.5, wallMat: "plaster", trimMat: "sandstone", parapet: true, backDoor: true, glass: true, roofStairs: true, dome: "turquoise", furnish: "shop" });
  B.building({ lx: -34, lz: 20, w: 13, d: 11, h: 4.4, yaw: Math.PI * 0.5, wallMat: "terracotta", parapet: true, backDoor: true, glass: true, roofStairs: true, pergola: true, furnish: "house" });
  B.building({ lx: 34, lz: -20, w: 14, d: 12, h: 4.6, yaw: -Math.PI * 0.5, wallMat: "terracotta", parapet: true, backDoor: true, glass: true, roofStairs: true, dome: "copper", furnish: "shop" });
  B.building({ lx: 34, lz: 20, w: 13, d: 11, h: 4.4, yaw: -Math.PI * 0.5, wallMat: "plaster", trimMat: "sandstone", parapet: true, backDoor: true, glass: true, roofStairs: true, pergola: true, furnish: "house" });
  B.building({ lx: -22, lz: 48, w: 15, d: 11, h: 4.6, yaw: Math.PI, wallMat: "adobe", parapet: true, glass: true, roofStairs: true, dome: "turquoise", furnish: "shop" });
  B.building({ lx: 22, lz: 48, w: 15, d: 11, h: 4.6, yaw: Math.PI, wallMat: "sandstone", parapet: true, glass: true, roofStairs: true, pergola: true, furnish: "house" });
  B.building({ lx: -22, lz: -48, w: 13, d: 10, h: 4.2, yaw: 0, wallMat: "adobe", parapet: true, glass: true, rooftopProp: "crates", furnish: "warehouse" });
  B.building({ lx: 22, lz: -48, w: 13, d: 10, h: 4.2, yaw: 0, wallMat: "plaster", parapet: true, glass: true, rooftopProp: "solar", furnish: "shop" });

  // Overhead draped striped souk canopies & colorful banner ropes spanning the streets!
  B.overheadCanopy(0, 5.4, 24, 24, 5.5, 0, "awning");
  B.overheadCanopy(0, 5.4, 38, 24, 5.5, 0, "crimson");
  B.overheadCanopy(0, 5.4, -22, 24, 5.0, 0, "awning");
  B.overheadCanopy(-22, 5.3, 0, 12, 5.2, Math.PI * 0.5, "turquoise");
  B.overheadCanopy(22, 5.3, 0, 12, 5.2, Math.PI * 0.5, "awning");

  // 10 Densely Stocked Market Stalls lining the Bazaar avenues!
  for (const [sx, sz, syaw, mat] of [
    [-16, -22, Math.PI * 0.5, "awning"], [-16, -8, Math.PI * 0.5, "canvas"], [-16, 12, Math.PI * 0.5, "awning"], [-16, 26, Math.PI * 0.5, "crimson"],
    [16, -22, -Math.PI * 0.5, "crimson"], [16, -8, -Math.PI * 0.5, "awning"], [16, 12, -Math.PI * 0.5, "canvas"], [16, 26, -Math.PI * 0.5, "awning"],
    [-34, 0, Math.PI * 0.5, "awning"], [34, 0, -Math.PI * 0.5, "awning"],
  ] as Array<[number, number, number, DesertMat]>) {
    B.stall(sx, 0, sz, 5.8, 3.6, syaw, mat);
  }

  // Grand Archway Gates on South & West Bazaar entrances + crate cover & banner poles!
  B.archGate(0, 0, 66, 13, 7.2, 0, "sandstone");
  B.archGate(-52, 0, 0, 11, 6.6, Math.PI * 0.5, "sandstone");
  B.crateCluster(-10, 0, 38, 0.3);
  B.crateCluster(10, 0, 38, -0.4);
  B.crateCluster(0, 0, -24, 0.15);
  B.bannerPole(-9, 0, 56, 0, "crimson", 6.0);
  B.bannerPole(9, 0, 56, 0, "turquoise", 6.0);

  B.chest(0, 20.8, -32.8, 0, true);
  B.chest(-34, 0.3, -20, 0, true);
  B.chest(34, 0.3, -20, Math.PI);
  B.chest(-34, 0.3, 20, 0);
  B.chest(34, 0.3, 20, Math.PI);
  B.chest(-22, 0.3, 48, Math.PI);
  B.chest(22, 0.3, 48, Math.PI);
  B.chest(-22, 0.3, -48, 0);
  for (const [fx, fy, fz] of [[-34, 5.0, -20], [34, 5.0, -20], [-16, 0.3, 0], [16, 0.3, 0], [0, 1.0, 6], [0, 0.3, 56], [-22, 5.0, 48], [22, 5.0, 48], [22, 4.6, -48]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildRedrockCanyon(): SunburstPoiData {
  // Gorge centered at (-40, -340): canyon floor y~6.5, rims y~26..30. Features Mining Trestle Bridge + Thermal Updraft Geyser!
  const B = new PoiBuilder("redrock-canyon", -40, 0, -340);
  B.clearings.push({ x: -40, z: -340, r: 98 });
  B.hotZone(0, 0, 58, 4, 1);

  // Sculpted Thermal Updraft Geyser Vent with industrial steam collector pipes & warning beacons!
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    B.add({ mat: "redrock", lx: dmath.cos(a) * 8.4, ly: 7.0, lz: dmath.sin(a) * 8.4, w: 3.2, h: 2.6, d: 2.5, yaw: -a });
    if (i % 2 === 0) {
      B.add({ shape: "cyl", mat: "iron", lx: dmath.cos(a) * 10.6, ly: 7.2, lz: dmath.sin(a) * 10.6, w: 0.32, h: 1.5, d: 0.32, collide: false });
      B.add({ shape: "sphere", mat: "glow", lx: dmath.cos(a) * 10.6, ly: 8.1, lz: dmath.sin(a) * 10.6, w: 0.36, h: 0.36, d: 0.36, collide: false });
    }
  }
  B.add({ shape: "cyl", mat: "glow", lx: 0, ly: 6.1, lz: 0, w: 9.8, h: 0.4, d: 9.8, collide: false });
  B.add({ shape: "torus", mat: "copper", lx: 0, ly: 6.45, lz: 0, w: 11.4, h: 0.65, d: 11.4, collide: false });

  // High-Altitude Timber Mining Trestle Bridge spanning rim-to-rim across the gorge (y = 19.6 m, lz = -59..+77, plugging straight into both ~20 m canyon rims!)
  B.add({ mat: "timber", lx: 18, ly: 19.6, lz: 9, w: 6.6, h: 0.55, d: 136 });
  for (const sx of [-3.1, 3.1]) {
    B.add({ mat: "darkwood", lx: 18 + sx, ly: 20.45, lz: 9, w: 0.35, h: 1.1, d: 130 });
  }
  // Twin iron minecart rails down bridge deck
  for (const rx of [-0.75, 0.75]) {
    B.add({ mat: "iron", lx: 18 + rx, ly: 19.92, lz: 9, w: 0.14, h: 0.10, d: 130, collide: false });
  }
  // Derailed timber & iron mining ore cart mid-bridge (great tactical cover!)
  B.add({ mat: "iron", lx: 17.6, ly: 20.65, lz: -6, w: 1.9, h: 1.35, d: 3.1, yaw: 0.18 });
  B.add({ shape: "sphere", mat: "gold", lx: 17.6, ly: 21.35, lz: -6, w: 1.5, h: 0.75, d: 2.3, yaw: 0.18, collide: false });
  // Cross-braced trestle bents anchored deeply into the gorge floor (down to y = 2.0 m!) & overhead portal gantries with glowing lanterns!
  for (const sz of [-44, -22, 0, 22, 44, 62]) {
    for (const sx of [-3.0, 3.0]) {
      B.add({ mat: "darkwood", lx: 18 + sx, ly: 10.8, lz: sz, w: 0.75, h: 17.6, d: 0.75 });
      B.add({ mat: "darkwood", lx: 18 + sx, ly: 22.7, lz: sz, w: 0.6, h: 5.8, d: 0.6 });
    }
    B.add({ mat: "darkwood", lx: 18, ly: 12.6, lz: sz, w: 7.4, h: 0.42, d: 0.42, roll: 0.68, collide: false });
    B.add({ mat: "darkwood", lx: 18, ly: 12.6, lz: sz, w: 7.4, h: 0.42, d: 0.42, roll: -0.68, collide: false });
    B.add({ mat: "darkwood", lx: 18, ly: 25.6, lz: sz, w: 7.2, h: 0.65, d: 0.65 });
    B.add({ shape: "sphere", mat: "glow", lx: 18, ly: 25.0, lz: sz, w: 0.45, h: 0.45, d: 0.45, collide: false });
  }

  // Twin Fortified Redrock Canyon Rim Watchtowers anchored on solid stone cliffside bastions (North-East & South-West rims, linked by canyon zipline!)
  // North-East Rim Bastion Terrace (top flush at ly = 26.4, masonry sunk down to y = 17.4 — zero gap on cliff slope!)
  B.add({ mat: "redrock", lx: 30, ly: 21.9, lz: -64, w: 20, h: 9.0, d: 14 });
  B.add({ mat: "sandstone", lx: 30, ly: 26.32, lz: -64, w: 20.4, h: 0.22, d: 14.4, collide: false });
  B.building({ lx: 30, ly: 26.4, lz: -66, w: 11, d: 10, h: 4.5, yaw: 0, wallMat: "redrock", roofMat: "timber", parapet: true, glass: true, roofStairs: true, pergola: true, furnish: "barracks", foundationDepth: 2.0 });
  B.sandbagWall(23.5, 26.4, -58.5, 4.6, 0.2);
  B.bannerPole(38.0, 26.4, -58.5, 0, "crimson", 6.5);
  B.stairs(28, 15.6, -50.5, 3.2, 13.0, 10.85, Math.PI, "redrock", true);

  // South-West Rim Bastion Terrace (top flush at ly = 26.4, masonry sunk down to y = 17.4 — zero gap on cliff slope!)
  B.add({ mat: "redrock", lx: -26, ly: 21.9, lz: 54, w: 20, h: 9.0, d: 14 });
  B.add({ mat: "sandstone", lx: -26, ly: 26.32, lz: 54, w: 20.4, h: 0.22, d: 14.4, collide: false });
  B.building({ lx: -26, ly: 26.4, lz: 56, w: 11, d: 10, h: 4.5, yaw: Math.PI, wallMat: "redrock", roofMat: "timber", parapet: true, glass: true, roofStairs: true, pergola: true, furnish: "barracks", foundationDepth: 2.0 });
  B.sandbagWall(-19.5, 26.4, 48.5, 4.6, -0.2);
  B.bannerPole(-34.0, 26.4, 48.5, Math.PI, "crimson", 6.5);
  // Grand canyon stairway climbing directly from the 6.2 m gorge floor (z=+23) up onto the 26.4 m South Bastion!
  B.stairs(-24, 6.0, 35.0, 3.2, 24.0, 20.45, 0, "redrock", true);

  // Rich Canyon Floor Prospector Mining Camp: 2 furnished shacks, framed mineshaft portal, campfire & crates!
  B.building({ lx: -28, ly: 6.6, lz: 6, w: 10, d: 9, h: 4.0, yaw: Math.PI * 0.5, wallMat: "timber", roofMat: "rust", glass: true, furnish: "shack", foundationDepth: 1.4 });
  B.building({ lx: -28, ly: 6.5, lz: -16, w: 9, d: 8, h: 3.8, yaw: Math.PI * 0.5, wallMat: "darkwood", roofMat: "rust", backDoor: true, furnish: "warehouse", foundationDepth: 1.4 });
  // Framed timber mineshaft entrance recessed into West gorge wall
  B.add({ mat: "darkwood", lx: -36, ly: 8.6, lz: -5, w: 1.4, h: 4.8, d: 0.8 });
  B.add({ mat: "darkwood", lx: -36, ly: 8.6, lz: -10, w: 1.4, h: 4.8, d: 0.8 });
  B.add({ mat: "darkwood", lx: -36, ly: 11.2, lz: -7.5, w: 1.8, h: 0.9, d: 6.4 });
  B.add({ mat: "iron", lx: -36.5, ly: 8.4, lz: -7.5, w: 0.5, h: 4.4, d: 4.6 });
  B.crateCluster(-15, 6.2, 14, 0.35, true);
  B.crateCluster(-16, 6.2, -14, -0.4, false);
  B.brazier(-18, 6.2, -3, 0.85);
  B.stall(-16, 6.1, 24, 5.6, 3.8, 0.25, "canvas", 1.2);

  B.chest(18, 20.0, 4, Math.PI * 0.5, true);
  B.chest(30, 26.7, -66, 0, true);
  B.chest(-26, 26.7, 56, Math.PI);
  B.chest(-28, 6.9, 6, Math.PI * 0.5);
  B.chest(-28, 6.8, -16, Math.PI * 0.5);
  for (const [fx, fy, fz] of [[18, 20.0, -24], [18, 20.0, 32], [30, 31.3, -66], [-26, 31.3, 56], [-14, 6.5, 0], [-20, 6.5, -18], [-16, 6.4, 24]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildMesaCitadel(): SunburstPoiData {
  // High-ground 56 m fortified red-rock mesa citadel at (-520, -600)
  const B = new PoiBuilder("mesa-citadel", -520, 56, -600);
  B.clearings.push({ x: -520, z: -600, r: 98 });
  B.hotZone(0, 0, 56, 5, 2);

  // Fortified Crenellated Perimeter Walls (76×76 m) with interior walkable rampart catwalks & merlons!
  const R = 38, wh = 4.6;
  B.add({ mat: "redrock", lx: 0, ly: wh * 0.5, lz: -R, w: R * 2, h: wh, d: 2.6 }); // North wall
  B.add({ mat: "redrock", lx: -R, ly: wh * 0.5, lz: 0, w: 2.6, h: wh, d: R * 2 }); // West wall
  for (const s of [-1, 1]) {
    B.add({ mat: "redrock", lx: s * 21, ly: wh * 0.5, lz: R, w: 34, h: wh, d: 2.6 });
    B.add({ mat: "redrock", lx: R, ly: wh * 0.5, lz: s * 21, w: 2.6, h: wh, d: 34 });
  }
  // Walkable wooden interior rampart catwalks along North & West walls (y = 3.5 m!) + stairs up from courtyard
  B.add({ mat: "timber", lx: 8, ly: 3.5, lz: -R + 2.6, w: 48, h: 0.35, d: 2.8 });
  B.add({ mat: "timber", lx: -R + 2.6, ly: 3.5, lz: 0, w: 2.8, h: 0.35, d: R * 2 - 12 });
  B.stairs(-31.0, 0, 0, 2.2, 6, 3.68, -Math.PI * 0.5, "timber", true);
  // Real sculpted crenellated merlons along all 4 perimeter walls!
  for (let m = -30; m <= 30; m += 4.8) {
    B.add({ mat: "sandstone", lx: m, ly: wh + 0.52, lz: -R, w: 2.2, h: 1.05, d: 2.7, collide: false });
    B.add({ mat: "sandstone", lx: -R, ly: wh + 0.52, lz: m, w: 2.7, h: 1.05, d: 2.2, collide: false });
    if (Math.abs(m) > 7) {
      B.add({ mat: "sandstone", lx: m, ly: wh + 0.52, lz: R, w: 2.2, h: 1.05, d: 2.7, collide: false });
      B.add({ mat: "sandstone", lx: R, ly: wh + 0.52, lz: m, w: 2.7, h: 1.05, d: 2.2, collide: false });
    }
  }
  // Ornate South & East Citadel Gatehouses with archways, banners & flaming braziers!
  B.archGate(0, 0, R, 11, 6.2, 0, "redrock");
  B.archGate(R, 0, 0, 11, 6.2, Math.PI * 0.5, "redrock");
  B.brazier(-8, 0, R + 2.4, 0.9);
  B.brazier(8, 0, R + 2.4, 0.9);

  // 4 Towering Corner Bastions (8.6 m tall with crenellated sniper crowns, banners & braziers + stairs up!)
  for (const [bx, bz] of [[-R, -R], [R, -R], [-R, R], [R, R]]) {
    B.add({ mat: "redrock", lx: bx, ly: 4.2, lz: bz, w: 11.0, h: 8.4, d: 11.0 });
    B.add({ mat: "sandstone", lx: bx, ly: 8.6, lz: bz, w: 12.0, h: 0.45, d: 12.0 });
    for (const dx of [-4.6, 0, 4.6]) {
      B.add({ mat: "sandstone", lx: bx + dx, ly: 9.35, lz: bz + (bz > 0 ? 5.6 : -5.6), w: 2.0, h: 1.1, d: 0.7, collide: false });
      B.add({ mat: "sandstone", lx: bx + (bx > 0 ? 5.6 : -5.6), ly: 9.35, lz: bz + dx, w: 0.7, h: 1.1, d: 2.0, collide: false });
    }
    B.bannerPole(bx + (bx > 0 ? -3.6 : 3.6), 8.8, bz + (bz > 0 ? -3.6 : 3.6), 0, "crimson", 6.2);
    B.brazier(bx + (bx > 0 ? 3.4 : -3.4), 8.8, bz + (bz > 0 ? 3.4 : -3.4), 0.75);
  }
  // Grand bastion stairs climbing cleanly WEST onto NW bastion & EAST onto SE bastion (direct access to zipline!)
  B.stairs(-25.0, 0, -33.5, 2.6, 14, 8.85, -Math.PI * 0.5, "sandstone", true);
  B.stairs(25.0, 0, 33.5, 2.6, 14, 8.85, Math.PI * 0.5, "sandstone", true);

  // Grand Furnished Central Citadel Command Keep (with copper cupola & rotating military radar dish!)
  B.building({ lx: -8, lz: -8, w: 21, d: 16, h: 5.5, yaw: 0, wallMat: "sandstone", roofMat: "redrock", trimMat: "hieroglyph", parapet: true, backDoor: true, glass: true, roofStairs: true, dome: "copper", furnish: "barracks" });
  B.anims.push({ kind: "radar", x: -520 - 15, y: 56 + 6.1, z: -600 - 12, scale: 1.15 });
  // Garrison Barracks + Armory Munitions Depot + Courtyard Sandbag Emplacements & Tents!
  B.building({ lx: -20, lz: 19, w: 13, d: 10, h: 4.2, yaw: Math.PI * 0.5, wallMat: "adobe", parapet: true, glass: true, roofStairs: true, furnish: "barracks" });
  B.building({ lx: 16, lz: 20, w: 11, d: 9, h: 4.0, yaw: Math.PI, wallMat: "terracotta", roofMat: "sandstone", parapet: true, glass: true, furnish: "warehouse" });
  B.stall(-22, 0, -26, 6.2, 4.2, 0.4, "canvas");
  B.sandbagWall(4, 0, 14, 5.2, 0);
  B.sandbagWall(16, 0, 4, 5.0, Math.PI * 0.5);
  B.crateCluster(-2, 0, 22, 0.3, true);
  B.crateCluster(8, 0, -26, -0.25, true);
  B.lampPost(4, 0, 28, 0);
  B.lampPost(-4, 0, 28, 0);
  B.helipad(18, 0, -18);

  B.chest(-8, 0.3, -8, 0, true);
  B.chest(-8, 5.9, -8, 0, true);
  B.chest(-R, 8.85, -R, 0);
  B.chest(R, 8.85, R, Math.PI);
  B.chest(-20, 0.3, 19, Math.PI * 0.5);
  B.chest(16, 0.3, 20, Math.PI);
  for (const [fx, fy, fz] of [[18, 0.4, -10], [-14, 0.3, 0], [10, 0.3, 10], [-R, 8.85, R], [R, 8.85, -R], [0, 0.3, 26], [-20, 4.6, 19]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildDuneRefinery(): SunburstPoiData {
  const B = new PoiBuilder("dune-refinery", 490, 16, -290);
  B.clearings.push({ x: 490, z: -290, r: 118 });
  B.hotZone(0, 0, 60, 4, 2);

  // 4 Industrial Banana-Fuel Storage Silos with steel band rings, dome caps & overhead interconnecting pipe network!
  const silos: Array<[number, number, number, number]> = [
    [-26, -24, 13.5, 12], [-6, -24, 13.5, 12], [-26, 4, 11.5, 10], [-6, 4, 11.5, 10],
  ];
  for (const [sx, sz, sd, sh] of silos) {
    B.add({ shape: "cyl", mat: "metal", lx: sx, ly: sh * 0.5, lz: sz, w: sd, h: sh, d: sd });
    B.add({ shape: "cyl", mat: "rust", lx: sx, ly: sh + 0.2, lz: sz, w: sd + 0.6, h: 0.45, d: sd + 0.6 });
    B.add({ shape: "torus", mat: "gold", lx: sx, ly: sh * 0.35, lz: sz, w: sd + 0.3, h: 0.55, d: sd + 0.3, collide: false });
    B.add({ shape: "torus", mat: "crimson", lx: sx, ly: sh * 0.72, lz: sz, w: sd + 0.3, h: 0.55, d: sd + 0.3, collide: false });
  }
  // Overhead industrial copper & chrome pipelines visibly connecting all silos, derrick & control building!
  B.pipe(-26, 11.5, -24, -6, 11.5, -24, 0.75, "copper");
  B.pipe(-26, 9.6, 4, -6, 9.6, 4, 0.75, "copper");
  B.pipe(-26, 10.6, -24, -26, 10.6, 4, 0.70, "chrome");
  B.pipe(-6, 10.6, -24, -6, 10.6, 4, 0.70, "chrome");
  B.pipe(-6, 8.8, -20, 16, 4.6, -14, 0.65, "copper");
  B.pipe(-26, 8.8, 10, -24, 11.8, 30, 0.65, "rust");

  // Elevated Steel Catwalk Network at y = 10.2 m with iron handrails + steel stairs up!
  B.add({ mat: "metal", lx: -16, ly: 10.2, lz: -10, w: 34, h: 0.36, d: 3.4 });
  B.add({ mat: "metal", lx: -16, ly: 10.2, lz: -10, w: 3.4, h: 0.36, d: 32 });
  for (const sz of [-11.6, -8.4]) B.add({ mat: "iron", lx: -16, ly: 10.95, lz: sz, w: 34, h: 0.14, d: 0.12, collide: false });
  for (const sx of [-17.6, -14.4]) B.add({ mat: "iron", lx: sx, ly: 10.95, lz: -10, w: 0.12, h: 0.14, d: 32, collide: false });
  B.stairs(7.75, 0, -10, 2.4, 13.5, 10.38, -Math.PI * 0.5, "metal", true);

  // Furnished Refinery Control Building (glowing consoles + rotating rooftop radar dish!) & Workshop Hangar
  B.building({ lx: 24, lz: -14, w: 18, d: 13, h: 4.8, yaw: -Math.PI * 0.5, wallMat: "metal", roofMat: "rust", parapet: true, backDoor: true, glass: true, roofStairs: true, rooftopProp: "ac", furnish: "lab" });
  B.anims.push({ kind: "radar", x: 490 + 24, y: 16 + 5.6, z: -290 - 18, scale: 1.25 });
  B.building({ lx: 24, lz: 26, w: 18, d: 14, h: 5.5, yaw: Math.PI, wallMat: "rust", roofMat: "metal", backDoor: true, glass: true, rooftopProp: "solar", furnish: "warehouse" });

  // Towering 24 m Cross-Braced Steel Oil Derrick + Blazing Refinery Flare Stack!
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    B.add({ mat: "rust", lx: -24 + dx, ly: 11.5, lz: 34 + dz, w: 0.7, h: 23, d: 0.7 });
  }
  for (const hy of [6, 17]) {
    B.add({ mat: "iron", lx: -24, ly: hy, lz: 30, w: 8.6, h: 0.35, d: 0.35, roll: 0.55, collide: false });
    B.add({ mat: "iron", lx: -24, ly: hy, lz: 38, w: 8.6, h: 0.35, d: 0.35, roll: -0.55, collide: false });
  }
  B.add({ mat: "metal", lx: -24, ly: 12, lz: 34, w: 9.8, h: 0.42, d: 9.8 });
  B.add({ mat: "gold", lx: -24, ly: 23.0, lz: 34, w: 8.6, h: 1.1, d: 8.6 });
  // Secondary Blazing Oil Flare Stack (20 m chimney with recessed burner nozzle & procedural GLSL fire plume!)
  B.add({ shape: "cyl", mat: "iron", lx: -40, ly: 9.5, lz: 22, w: 2.0, h: 19.0, d: 2.0 });
  B.add({ shape: "cyl", mat: "crimson", lx: -40, ly: 17.5, lz: 22, w: 2.3, h: 1.2, d: 2.3, collide: false });
  B.add({ shape: "cyl", mat: "fire", lx: -40, ly: 19.02, lz: 22, w: 1.65, h: 0.16, d: 1.65, collide: false });
  B.anims.push({ kind: "flame", x: 490 - 40, y: 16 + 18.95, z: -290 + 22, scale: 2.45 });

  // Yellow Steel Yard Gantry Crane + Shipping Containers + Floodlight Masts + Helipad!
  for (const sx of [-10, 10]) {
    B.add({ mat: "gold", lx: sx, ly: 5.5, lz: 18, w: 0.75, h: 11.0, d: 0.75 });
  }
  B.add({ mat: "gold", lx: 0, ly: 11.2, lz: 18, w: 22.0, h: 0.95, d: 1.4 });
  B.add({ mat: "iron", lx: 2, ly: 8.6, lz: 18, w: 0.16, h: 4.4, d: 0.16, collide: false });
  B.add({ mat: "crate", lx: 2, ly: 5.8, lz: 18, w: 3.2, h: 1.8, d: 2.2, collide: false });
  for (const [cx, cz, cyaw, cm] of [
    [0, 34, 0.18, "rust"], [8, 44, -0.1, "turquoise"], [-44, -8, 1.57, "terracotta"], [44, 6, 0, "crimson"], [44, -3, 0, "metal"],
  ] as Array<[number, number, number, DesertMat]>) {
    B.add({ mat: cm, lx: cx, ly: 1.45, lz: cz, w: 6.6, h: 2.9, d: 2.6, yaw: cyaw });
  }
  B.crateCluster(8, 0, 10, 0.2, true);
  B.crateCluster(-12, 0, 28, -0.5, true);
  B.sandbagWall(12, 0, 2, 4.4, 0);
  B.lampPost(14, 0, 4, 0);
  B.lampPost(-14, 0, 22, 0);
  B.helipad(52, 0, 34);

  B.chest(24, 0.3, -14, 0, true);
  B.chest(-16, 10.45, -10, 0, true);
  B.chest(24, 0.3, 26, Math.PI);
  B.chest(-24, 12.3, 34, 0);
  B.chest(-26, 12.5, -24, 0);
  for (const [fx, fy, fz] of [[24, 5.2, -14], [0, 0.3, 18], [-16, 0.3, -10], [8, 0.3, 36], [-6, 12.5, -24], [38, 0.3, -14], [52, 0.4, 28]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildSkyshipWreck(): SunburstPoiData {
  // Colossal crashed cargo Banana Zeppelin half-buried in SW dunes (-540, 290, y=10)
  const B = new PoiBuilder("skyship-wreck", -540, 10, 290);
  B.clearings.push({ x: -540, z: 290, r: 108 });
  B.hotZone(0, 0, 52, 4, 2);

  // Main crashed fuselage floor deck (54 m long × 14 m wide) with inner cargo crates, catwalk ledges & glowing reactor core!
  B.add({ mat: "metal", lx: 0, ly: 0.6, lz: 0, w: 14.5, h: 1.2, d: 54 });
  for (const side of [-1, 1]) {
    B.add({ mat: "iron", lx: side * 6.8, ly: 1.7, lz: 0, w: 0.5, h: 1.1, d: 52 });
  }
  // Glowing cracked Steampunk Banana-Fuel Reactor Core mid-hull!
  B.add({ shape: "cyl", mat: "copper", lx: 0, ly: 2.6, lz: -2, w: 4.4, h: 2.8, d: 4.4 });
  B.add({ shape: "cyl", mat: "glow", lx: 0, ly: 4.6, lz: -2, w: 3.0, h: 2.4, d: 3.0, collide: false });
  B.add({ shape: "torus", mat: "gold", lx: 0, ly: 4.6, lz: -2, w: 4.6, h: 0.5, d: 4.6, collide: false });
  B.anims.push({ kind: "flame", x: -540, y: 10 + 5.8, z: 290 - 2, scale: 1.5 });

  // Colossal arched riveted zeppelin skeleton ribs + longitudinal copper spine keel + torn canvas panels!
  for (const rz of [-22, -14, -6, 2, 10, 18]) {
    for (const side of [-1, 1]) {
      B.add({ mat: "rust", lx: side * 7.2, ly: 5.5, lz: rz, w: 1.1, h: 10.6, d: 1.2, roll: side * 0.22 });
      B.add({ mat: "copper", lx: side * 5.8, ly: 10.4, lz: rz, w: 1.6, h: 0.7, d: 1.4, roll: side * 0.45, collide: false });
    }
    B.add({ mat: "metal", lx: 0, ly: 11.4, lz: rz, w: 12.2, h: 1.1, d: 1.4 });
  }
  B.add({ mat: "copper", lx: 0, ly: 11.9, lz: -2, w: 1.4, h: 0.7, d: 48, collide: false }); // Spine keel
  // Ripped striped zeppelin envelope panels + central roof spine catwalk connecting North & South hull roofs
  B.add({ mat: "canvas", lx: 0, ly: 12.2, lz: -14, w: 13.8, h: 0.4, d: 18 });
  B.add({ mat: "crimson", lx: 0, ly: 12.42, lz: -14, w: 4.2, h: 0.14, d: 18, collide: false });
  B.add({ mat: "metal", lx: 0, ly: 12.2, lz: 0, w: 4.2, h: 0.4, d: 11 });
  B.add({ mat: "canvas", lx: 0, ly: 12.2, lz: 12, w: 13.8, h: 0.4, d: 14 });
  B.add({ mat: "gold", lx: 0, ly: 12.42, lz: 12, w: 3.4, h: 0.14, d: 14, collide: false });

  // Wide unobstructed tailfin ramp at North end (-Z) rising from ground level (z=-45) flush onto hull roof (z=-23), flanked by twin tail stabilizers!
  B.stairs(0, 0, -34, 5.4, 22, 12.4, 0, "metal", true);
  for (const side of [-1, 1]) {
    B.add({ mat: "crimson", lx: side * 6.2, ly: 16.5, lz: -23.5, w: 0.9, h: 8.8, d: 10.5 });
    B.add({ mat: "gold", lx: side * 6.2, ly: 17.4, lz: -23.5, w: 1.1, h: 1.4, d: 9.2, collide: false });
  }

  // Furnished Crashed Command Bridge Cabin at South bow (+Z) anchored solidly into the desert dunes!
  B.building({ lx: 0, ly: 1.2, lz: 28, w: 13, d: 11, h: 4.5, yaw: Math.PI, wallMat: "metal", roofMat: "rust", glass: true, backDoor: true, furnish: "lab", foundationDepth: 1.4 });

  // Twin detached cylindrical turbine engine nacelles with bronze propeller blades & glowing scorched vents!
  for (const [ex, ez, eyaw] of [[-25, -6, 0.35], [26, 12, -0.4]] as Array<[number, number, number]>) {
    B.add({ shape: "cyl", mat: "rust", lx: ex, ly: 2.6, lz: ez, w: 5.8, h: 11.5, d: 5.8, pitch: Math.PI * 0.44, yaw: eyaw });
    B.add({ shape: "torus", mat: "copper", lx: ex, ly: 2.8, lz: ez, w: 6.2, h: 0.45, d: 6.2, yaw: eyaw, collide: false });
    B.add({ mat: "gold", lx: ex, ly: 3.2, lz: ez + 5.2, w: 6.4, h: 0.55, d: 0.22, yaw: eyaw, roll: 0.4, collide: false });
    B.add({ mat: "gold", lx: ex, ly: 3.2, lz: ez + 5.2, w: 6.4, h: 0.55, d: 0.22, yaw: eyaw, roll: -1.15, collide: false });
    B.anims.push({ kind: "flame", x: -540 + ex, y: 10 + 3.2, z: 290 + ez - 4.2, scale: 1.1 });
  }

  // Salvage Expedition Camp flanking the wreck: tents, crates, work floodlights, sandbags & helipad!
  B.stall(-22, 0, 22, 6.6, 4.4, 0.55, "canvas");
  B.stall(24, 0, -18, 6.6, 4.4, -2.5, "awning");
  B.crateCluster(-17, 0, 14, 0.5, true);
  B.crateCluster(18, 0, -10, -0.3, true);
  B.crateCluster(-4, 1.2, -16, 0.2, false);
  B.crateCluster(4, 1.2, 12, -0.4, false);
  B.sandbagWall(-16, 0, 4, 4.8, Math.PI * 0.5);
  B.sandbagWall(16, 0, 20, 4.8, -0.3);
  B.lampPost(-15, 0, 26, 0);
  B.lampPost(15, 0, -24, 0);
  B.helipad(-44, 0, -36);
  B.saguaro(-36, 0, 22, 5.4, 0.4);
  B.saguaro(36, 0, -24, 5.0, 1.8);

  B.chest(0, 1.5, 28, Math.PI, true);
  B.chest(0, 1.3, -8, 0, true);
  B.chest(0, 12.45, -14, 0);
  B.chest(-22, 0.3, 22, 0.55);
  B.chest(24, 0.3, -18, -2.5);
  for (const [fx, fy, fz] of [[0, 1.3, -18], [0, 1.3, 10], [4, 1.3, 0], [-4, 1.3, 14], [0, 12.45, 12], [-22, 0.3, -16], [22, 0.3, 20], [-44, 0.4, -30]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildCactusGulch(): SunburstPoiData {
  // Classic Desert Frontier Western Town at (160, 430, y=11)
  const B = new PoiBuilder("cactus-gulch", 160, 11, 430);
  B.clearings.push({ x: 160, z: 430, r: 100 });
  B.hotZone(0, 0, 50, 4, 1);

  // Raised wooden frontier boardwalks lining BOTH sides of Main Street!
  for (const sx of [-11.5, 11.5]) {
    B.add({ mat: "timber", lx: sx, ly: 0.16, lz: 6, w: 3.4, h: 0.32, d: 52 });
    for (const sz of [-16, -2, 12, 26]) {
      B.lampPost(sx + (sx > 0 ? -1.4 : 1.4), 0.32, sz, sx > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
    }
  }

  // Iconic 2-Story Banana Saloon (covered balcony porch, crimson false-front pediment, furnished bar & poker tables!)
  B.building({ lx: -21, lz: -6, w: 14, d: 13, h: 4.8, yaw: Math.PI * 0.5, wallMat: "timber", roofMat: "darkwood", backDoor: true, glass: true, roofStairs: true, awningFront: false, furnish: "saloon" });
  B.add({ mat: "timber", lx: -12.4, ly: 5.0, lz: -6, w: 3.6, h: 0.32, d: 14.2 }); // Upper balcony porch
  for (const sz of [-12.5, -8.2, -3.8, 0.5]) {
    B.add({ mat: "darkwood", lx: -10.8, ly: 2.5, lz: sz, w: 0.24, h: 5.0, d: 0.24 });
    B.add({ mat: "darkwood", lx: -10.8, ly: 5.65, lz: sz, w: 0.18, h: 1.1, d: 0.18, collide: false });
  }
  B.add({ mat: "darkwood", lx: -10.8, ly: 6.15, lz: -6, w: 0.18, h: 0.16, d: 13.6, collide: false });
  // Iconic western stepped false-front facade with gilded saloon sign!
  B.add({ mat: "terracotta", lx: -14.2, ly: 6.8, lz: -6, w: 0.6, h: 3.6, d: 14.8 });
  B.add({ mat: "crimson", lx: -13.8, ly: 7.4, lz: -6, w: 0.25, h: 1.5, d: 9.6, collide: false });
  B.add({ mat: "gold", lx: -13.6, ly: 7.4, lz: -6, w: 0.15, h: 0.55, d: 7.6, collide: false });

  // Sheriff Office & Jailhouse (across Main Street, with iron jail bars!)
  B.building({ lx: 21, lz: -8, w: 12, d: 10, h: 4.3, yaw: -Math.PI * 0.5, wallMat: "adobe", roofMat: "timber", parapet: true, glass: true, roofStairs: true, furnish: "barracks" });
  B.add({ mat: "sandstone", lx: 15.6, ly: 5.8, lz: -8, w: 0.55, h: 2.2, d: 11.2, collide: false }); // Sheriff false-front
  // General Store + Frontier Bank + Stables
  B.building({ lx: 21, lz: 18, w: 12, d: 11, h: 4.2, yaw: -Math.PI * 0.5, wallMat: "timber", roofMat: "rust", backDoor: true, glass: true, roofStairs: true, furnish: "shop" });
  B.building({ lx: -21, lz: 20, w: 12, d: 10, h: 4.0, yaw: Math.PI * 0.5, wallMat: "darkwood", roofMat: "timber", backDoor: true, furnish: "warehouse" });
  B.building({ lx: -24, lz: -30, w: 11, d: 10, h: 4.2, yaw: 0, wallMat: "sandstone", trimMat: "hieroglyph", parapet: true, glass: true, furnish: "shop" });

  // Classic Frontier Covered Stagecoach / Supply Wagon parked on Main Street!
  B.add({ mat: "darkwood", lx: 2.5, ly: 1.15, lz: 12, w: 2.5, h: 1.0, d: 4.8, yaw: 0.12 });
  B.add({ shape: "cyl", mat: "canvas", lx: 2.5, ly: 2.25, lz: 12, w: 2.4, h: 4.5, d: 2.4, yaw: 0.12, pitch: Math.PI * 0.5, collide: false });
  for (const wx of [-1.35, 1.35]) for (const wz of [-1.6, 1.6]) {
    B.add({ shape: "torus", mat: "darkwood", lx: 2.5 + wx, ly: 0.72, lz: 12 + wz, w: 1.35, h: 0.36, d: 1.35, roll: Math.PI * 0.5, collide: false });
  }

  // Climbable Frontier Water Tower (16 m sniper perch with cross-bracing & metal barrel bands!)
  for (const [wx, wz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) {
    B.add({ mat: "darkwood", lx: wx, ly: 5.5, lz: -34 + wz, w: 0.55, h: 11.0, d: 0.55 });
  }
  B.add({ mat: "darkwood", lx: 0, ly: 5.5, lz: -31.6, w: 6.4, h: 0.28, d: 0.28, roll: 0.78, collide: false });
  B.add({ mat: "darkwood", lx: 0, ly: 5.5, lz: -36.4, w: 6.4, h: 0.28, d: 0.28, roll: -0.78, collide: false });
  B.add({ mat: "timber", lx: 0, ly: 11.1, lz: -34, w: 7.6, h: 0.4, d: 7.6 });
  B.add({ shape: "cyl", mat: "timber", lx: 0, ly: 13.6, lz: -34, w: 5.8, h: 4.8, d: 5.8 });
  for (const by of [12.3, 13.7, 15.1]) {
    B.add({ shape: "torus", mat: "iron", lx: 0, ly: by, lz: -34, w: 5.95, h: 0.35, d: 5.95, collide: false });
  }
  B.add({ shape: "cone", mat: "rust", lx: 0, ly: 17.0, lz: -34, w: 6.6, h: 2.2, d: 6.6, collide: false });

  // Tall Spinning Frontier Windmill beside the stables!
  for (const [wx, wz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    B.add({ mat: "iron", lx: 28 + wx * 0.7, ly: 6.5, lz: -32 + wz * 0.7, w: 0.26, h: 13.0, d: 0.26, roll: wx * 0.04, pitch: -wz * 0.04, collide: false });
  }
  B.anims.push({ kind: "windmill", x: 160 + 28, y: 11 + 13.0, z: 430 - 32, yaw: 0.4, scale: 1.15 });

  // Wooden corral fences, water trough, market stalls, crate cover & Saguaro grove!
  B.add({ mat: "darkwood", lx: 0, ly: 0.65, lz: 35, w: 20, h: 1.3, d: 0.35 });
  B.add({ mat: "timber", lx: 10, ly: 0.45, lz: 32, w: 3.4, h: 0.85, d: 1.2 });
  B.add({ mat: "water", lx: 10, ly: 0.86, lz: 32, w: 3.0, h: 0.08, d: 0.9, collide: false });
  B.stall(-2, 0, -18, 5.8, 3.8, 0, "awning");
  B.crateCluster(-9, 0, 26, 0.3);
  B.crateCluster(9, 0, -18, -0.4);
  for (const [cx, cz, h, yaw] of [[-38, -24, 5.6, 0.2], [38, -28, 5.2, 1.4], [-36, 36, 5.4, 2.5], [38, 34, 4.9, 0.8], [-18, 40, 5.8, 1.9]]) {
    B.saguaro(cx, 0, cz, h, yaw);
  }

  B.chest(-21, 0.3, -6, Math.PI * 0.5, true);
  B.chest(0, 11.35, -31.5, 0, true);
  B.chest(21, 0.3, -8, -Math.PI * 0.5);
  B.chest(21, 0.3, 18, -Math.PI * 0.5);
  B.chest(-21, 0.3, 20, Math.PI * 0.5);
  B.chest(-24, 0.3, -30, 0);
  for (const [fx, fy, fz] of [[-21, 5.2, -6], [21, 4.7, -8], [0, 0.3, 0], [0, 0.3, 18], [-12, 5.2, -6], [10, 0.3, -24], [21, 4.6, 18]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildSolarSpire(): SunburstPoiData {
  // Futuristic desert solar-thermal array at (220, -560, y=32)
  const B = new PoiBuilder("solar-spire", 220, 32, -560);
  B.clearings.push({ x: 220, z: -560, r: 98 });
  B.hotZone(0, 0, 52, 4, 2);

  // Towering 35 m Central Solar Collector Spire with fluted structural ribs, molten-gold receiver & safety rails!
  B.add({ shape: "cyl", mat: "sandstone", lx: 0, ly: 1.0, lz: 0, w: 16.5, h: 2.0, d: 16.5 });
  B.add({ shape: "cyl", mat: "metal", lx: 0, ly: 15.0, lz: 0, w: 6.4, h: 28.0, d: 6.4 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    B.add({ mat: "chrome", lx: dmath.cos(a) * 3.4, ly: 15.0, lz: dmath.sin(a) * 3.4, w: 0.55, h: 27.0, d: 1.1, yaw: -a, collide: false });
  }
  B.add({ shape: "cyl", mat: "glow", lx: 0, ly: 31.2, lz: 0, w: 7.6, h: 5.8, d: 7.6 });
  for (const ry of [29.2, 31.4, 33.6]) {
    B.add({ shape: "torus", mat: "gold", lx: 0, ly: ry, lz: 0, w: 8.2, h: 0.55, d: 8.2, collide: false });
  }
  B.add({ shape: "cyl", mat: "gold", lx: 0, ly: 34.6, lz: 0, w: 8.4, h: 0.9, d: 8.4 });
  B.add({ shape: "cone", mat: "chrome", lx: 0, ly: 36.8, lz: 0, w: 1.4, h: 3.6, d: 1.4, collide: false });

  // Elevated circular observation deck at y = 9.8 m with safety torus rail + radial stairs flush onto deck edge!
  B.add({ shape: "cyl", mat: "metal", lx: 0, ly: 9.8, lz: 0, w: 17.0, h: 0.48, d: 17.0 });
  B.add({ shape: "torus", mat: "iron", lx: 0, ly: 10.85, lz: 0, w: 16.6, h: 0.35, d: 16.6, collide: false });
  B.stairs(15.5, 0, 0, 2.6, 14, 10.04, -Math.PI * 0.5, "metal", true);

  // Glowing power conduits radiating from central spire out to the heliostat rings & research lab!
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    B.pipe(dmath.cos(a) * 8, 0.35, dmath.sin(a) * 8, dmath.cos(a) * 44, 0.35, dmath.sin(a) * 44, 0.45, "copper");
  }

  // 16 Gleaming Angled Solar-Mirror Heliostats on concrete plinths with chrome frames & hydraulic pistons!
  for (const [rad, count] of [[28, 8], [46, 8]] as Array<[number, number]>) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (rad > 35 ? Math.PI / 8 : 0);
      if (Math.abs(dmath.cos(a) * rad) < 16 && dmath.sin(a) * rad > 22) continue;
      const mx = dmath.cos(a) * rad, mz = dmath.sin(a) * rad;
      B.add({ shape: "cyl", mat: "sandstone", lx: mx, ly: 0.25, lz: mz, w: 2.2, h: 0.5, d: 2.2, collide: false });
      B.add({ shape: "cyl", mat: "metal", lx: mx, ly: 1.5, lz: mz, w: 0.72, h: 2.8, d: 0.72 });
      B.add({ mat: "chrome", lx: mx, ly: 3.1, lz: mz, w: 6.5, h: 4.1, d: 0.16, yaw: -a + Math.PI * 0.5, pitch: -0.45, collide: false });
      B.add({ mat: "solar", lx: mx, ly: 3.16, lz: mz, w: 6.2, h: 3.8, d: 0.28, yaw: -a + Math.PI * 0.5, pitch: -0.45 });
    }
  }

  // Furnished Glass-Walled Research Lab (with rooftop rotating radar dish!) + Power Transformer Substation + Helipad!
  B.building({ lx: 0, lz: 40, w: 19, d: 12, h: 4.8, yaw: Math.PI, wallMat: "metal", roofMat: "sandstone", trimMat: "chrome", parapet: true, backDoor: true, glass: true, roofStairs: true, rooftopProp: "solar", furnish: "lab" });
  B.anims.push({ kind: "radar", x: 220 - 6, y: 32 + 5.7, z: -560 + 40, scale: 1.25 });
  B.building({ lx: -34, lz: 32, w: 11, d: 9, h: 4.2, yaw: 0.5, wallMat: "plaster", roofMat: "metal", parapet: true, glass: true, rooftopProp: "ac", furnish: "warehouse" });
  // Glowing Copper Transformer Coils beside substation
  for (const ox of [-22, -18, -14]) {
    B.add({ shape: "cyl", mat: "copper", lx: ox, ly: 1.5, lz: 38, w: 1.6, h: 3.0, d: 1.6 });
    B.add({ shape: "torus", mat: "glow", lx: ox, ly: 2.4, lz: 38, w: 1.9, h: 0.35, d: 1.9, collide: false });
  }
  B.crateCluster(18, 0, 36, 0.2, true);
  B.lampPost(11, 0, 32, 0);
  B.lampPost(-11, 0, 32, 0);
  B.helipad(40, 0, 28);

  B.chest(0, 10.1, 6.2, 0, true);
  B.chest(0, 0.3, 40, Math.PI, true);
  B.chest(0, 5.2, 40, Math.PI);
  B.chest(-34, 0.3, 32, 0.5);
  B.chest(28, 0.3, -28, 0);
  for (const [fx, fy, fz] of [[0, 10.1, -6.2], [8, 0.3, 40], [-8, 0.3, 40], [32, 0.3, 28], [-22, 0.3, -22], [22, 0.3, -22], [-34, 4.6, 32]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildMirageDocks(): SunburstPoiData {
  // Coastal Desert Trading Port at (610, 420, y=3.2) overlooking SE Mirage Bay (ocean opens to the SOUTH +Z / SE!)
  const B = new PoiBuilder("mirage-docks", 610, 3.2, 420);
  B.clearings.push({ x: 610, z: 420, r: 108 });
  B.hotZone(0, 0, 56, 4, 1);

  // Sandstone Seawall Quay + Coping Rim along South ocean front + Two Long Timber Piers jutting SOUTH (+Z) over turquoise water!
  B.add({ mat: "sandstone", lx: 0, ly: -0.4, lz: 0, w: 70, h: 3.8, d: 54 });
  B.add({ mat: "hieroglyph", lx: 0, ly: 1.65, lz: 26.6, w: 70, h: 0.45, d: 1.2, collide: false });
  // Twin long timber piers extending SOUTH from lz = 26 out to lz = 94 over deep Mirage Bay ocean water (h = -4..-11 m!)
  B.add({ mat: "timber", lx: 4, ly: 1.2, lz: 60, w: 7.8, h: 0.48, d: 68 });
  B.add({ mat: "timber", lx: 30, ly: 1.2, lz: 60, w: 7.8, h: 0.48, d: 68 });
  for (const pz of [36, 52, 68, 84, 92]) for (const px of [0.6, 7.4, 26.6, 33.4]) {
    B.add({ shape: "cyl", mat: "darkwood", lx: px, ly: -3.2, lz: pz, w: 0.72, h: 9.8, d: 0.72 });
    if (pz === 52 || pz === 84) {
      B.add({ shape: "cyl", mat: "iron", lx: px, ly: 1.85, lz: pz, w: 0.42, h: 0.5, d: 0.42, collide: false });
    }
  }
  B.lampPost(0.6, 1.44, 46, Math.PI * 0.5);
  B.lampPost(0.6, 1.44, 78, Math.PI * 0.5);
  B.lampPost(33.4, 1.44, 46, -Math.PI * 0.5);
  B.lampPost(33.4, 1.44, 78, -Math.PI * 0.5);

  // 2 Moored Wooden Desert Dhow Sailboats floating directly in deep turquoise bay water (y = 0, ly = -3.2) beside the piers!
  B.dhowBoat(17, -3.15, 76, 0.08, true);
  B.dhowBoat(44, -3.15, 68, -0.14, true);

  // Tall Harbour Cargo Crane perched on South quay edge hoisting a crate over the water!
  B.add({ mat: "iron", lx: 17, ly: 2.1, lz: 22, w: 4.8, h: 1.2, d: 4.8 });
  B.add({ mat: "gold", lx: 17, ly: 7.4, lz: 22, w: 2.2, h: 9.8, d: 2.2 });
  B.add({ mat: "gold", lx: 17, ly: 12.6, lz: 29, w: 1.4, h: 1.1, d: 18.0, pitch: -0.16, collide: false });
  B.add({ mat: "iron", lx: 17, ly: 9.4, lz: 36, w: 0.18, h: 7.6, d: 0.18, collide: false });
  B.add({ mat: "crate", lx: 17, ly: 4.6, lz: 36, w: 2.6, h: 2.2, d: 3.0, collide: false });

  // Furnished Port Warehouse + Domed Customs House + 25 m Striped Desert Lighthouse!
  B.building({ lx: -14, ly: 1.5, lz: -8, w: 20, d: 14, h: 5.2, yaw: Math.PI * 0.5, wallMat: "adobe", roofMat: "terracotta", parapet: true, backDoor: true, glass: true, roofStairs: true, rooftopProp: "crates", furnish: "warehouse" });
  B.building({ lx: -16, ly: 1.5, lz: 15, w: 13, d: 10, h: 4.4, yaw: 0, wallMat: "plaster", trimMat: "sandstone", parapet: true, glass: true, dome: "turquoise", furnish: "shop" });

  // Striped Desert Lighthouse on East quay point (alternating plaster/crimson bands, iron gallery, glowing lantern & golden cupola!)
  B.add({ shape: "cyl", mat: "sandstone", lx: 22, ly: 2.6, lz: -18, w: 8.0, h: 2.4, d: 8.0 });
  B.add({ shape: "cyl", mat: "plaster", lx: 22, ly: 9.2, lz: -18, w: 6.4, h: 16.0, d: 6.4 });
  for (const by of [6.0, 10.6, 15.2]) {
    B.add({ shape: "cyl", mat: "crimson", lx: 22, ly: by, lz: -18, w: 6.52, h: 2.0, d: 6.52, collide: false });
  }
  B.add({ shape: "cyl", mat: "terracotta", lx: 22, ly: 17.5, lz: -18, w: 7.8, h: 1.0, d: 7.8 });
  B.add({ shape: "torus", mat: "iron", lx: 22, ly: 18.8, lz: -18, w: 7.6, h: 0.35, d: 7.6, collide: false });
  B.add({ shape: "cyl", mat: "glow", lx: 22, ly: 19.6, lz: -18, w: 4.8, h: 3.2, d: 4.8 });
  B.add({ shape: "cone", mat: "gold", lx: 22, ly: 22.8, lz: -18, w: 6.4, h: 3.0, d: 6.4, collide: false });
  B.anims.push({ kind: "beacon", x: 610 + 22, y: 3.2 + 19.6, z: 420 - 18, scale: 1.0 });

  // Coastal market stalls, crate clusters, palm planter, banners & helipad!
  B.stall(10, 1.5, 4, 6.5, 4.2, 0, "awning");
  B.stall(10, 1.5, -10, 6.2, 4.0, 0, "turquoise");
  B.crateCluster(-2, 1.5, 19, 0.2, true);
  B.crateCluster(4, 1.44, 62, 0.1, false);
  B.crateCluster(30, 1.44, 72, -0.3, false);
  B.planter(-2, 1.5, 6, "palm", 0.72);
  B.bannerPole(-4, 1.5, 25, 0, "turquoise", 6.2);
  B.bannerPole(32, 1.5, 25, 0, "crimson", 6.2);
  B.helipad(-40, 0, -32);

  B.chest(-14, 1.8, -8, Math.PI * 0.5, true);
  B.chest(4, 1.6, 88, Math.PI, true);
  B.chest(30, 1.6, 88, Math.PI);
  B.chest(-16, 1.8, 15, 0);
  B.chest(10, 1.8, 4, 0);
  B.chest(17, -2.05, 76, 0); // Bonus chest right on the floating dhow sailboat deck!
  for (const [fx, fy, fz] of [[-14, 7.1, -8], [22, 1.8, -11], [4, 1.6, 52], [30, 1.6, 52], [0, 1.8, 12], [-22, 1.8, 15], [-40, 0.4, -26]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildScorpionArch(): SunburstPoiData {
  // Colossal natural red-sandstone desert arch + Rich Nomad Oasis Caravan Camp underneath (-220, 490, y=22)
  const B = new PoiBuilder("scorpion-arch", -220, 22, 490);
  B.clearings.push({ x: -220, z: 490, r: 84 });
  B.hotZone(0, 0, 44, 3, 1);

  // Giant Stratified Natural Red-Rock Arch (44 m span, 17.5 m tall, stepped rock flanks + nomad sniper perch on crown!)
  B.add({ mat: "redrock", lx: -20, ly: 7.5, lz: 0, w: 12.5, h: 15, d: 13.5 });
  B.add({ mat: "redrock", lx: 20, ly: 7.5, lz: 0, w: 12.5, h: 15, d: 13.5 });
  B.add({ mat: "terracotta", lx: -21, ly: 3.5, lz: 0, w: 14.5, h: 4.5, d: 15.0, collide: false });
  B.add({ mat: "terracotta", lx: 21, ly: 3.5, lz: 0, w: 14.5, h: 4.5, d: 15.0, collide: false });
  B.add({ mat: "redrock", lx: -12, ly: 13.8, lz: 0, w: 11, h: 4.5, d: 10.5, roll: 0.22, collide: false });
  B.add({ mat: "redrock", lx: 12, ly: 13.8, lz: 0, w: 11, h: 4.5, d: 10.5, roll: -0.22, collide: false });
  B.add({ mat: "redrock", lx: 0, ly: 15.8, lz: 0, w: 20.5, h: 3.4, d: 9.8 }); // Sniper crown deck at y = 17.5 m!
  // Nomad timber lookout deck, shade canopy, sandbags & heraldic banners atop the arch crown!
  B.add({ mat: "timber", lx: 0, ly: 17.6, lz: 0, w: 11.0, h: 0.28, d: 6.4 });
  B.sandbagWall(0, 17.7, 2.8, 6.2, 0);
  B.sandbagWall(0, 17.7, -2.8, 6.2, 0);
  B.bannerPole(-6.5, 17.5, 0, 0, "crimson", 5.2);
  B.bannerPole(6.5, 17.5, 0, 0, "turquoise", 5.2);
  // Natural stepped rock ramps up BOTH flanks flush onto the 15 m arch pillars + inner rock steps onto the 17.5 m crown!
  B.stairs(-37.25, 0, 0, 4.8, 22, 15.05, Math.PI * 0.5, "redrock");
  B.stairs(37.25, 0, 0, 4.8, 22, 15.05, -Math.PI * 0.5, "redrock");
  B.stairs(-12.75, 15.0, 0, 4.8, 5.0, 2.65, Math.PI * 0.5, "redrock");
  B.stairs(12.75, 15.0, 0, 4.8, 5.0, 2.65, -Math.PI * 0.5, "redrock");

  // Bustling Nomad Caravan Camp sheltered under & around the arch: 6 vibrant tents, woven rugs, blazing stone campfire, wagon & crates!
  B.stall(-7, 0, 11, 6.6, 4.8, 0.35, "awning");
  B.stall(8, 0, -11, 6.6, 4.8, -2.7, "crimson");
  B.stall(-11, 0, -15, 5.8, 4.2, 2.2, "canvas");
  B.stall(12, 0, 15, 5.8, 4.2, -0.8, "turquoise");
  B.stall(-22, 0, 22, 6.0, 4.2, 0.7, "awning");
  B.stall(22, 0, -22, 6.0, 4.2, -2.4, "canvas");
  // Blazing central nomad stone campfire + sitting timber logs + woven carpets!
  B.brazier(0, 0, 0, 1.25);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    B.add({ shape: "cyl", mat: "darkwood", lx: dmath.cos(a) * 3.4, ly: 0.32, lz: dmath.sin(a) * 3.4, w: 0.55, h: 2.4, d: 0.55, yaw: -a, pitch: Math.PI * 0.5 });
  }
  B.crateCluster(0, 0, 18, 0.2);
  B.crateCluster(0, 0, -19, -0.5);
  B.planter(-16, 0, 14, "prickly-pear", 1.1);
  B.planter(16, 0, -14, "prickly-pear", 1.1);
  B.saguaro(-28, 0, 24, 5.6, 0.6);
  B.saguaro(28, 0, -24, 5.2, 2.0);

  B.chest(0, 17.8, 0, 0, true);
  B.chest(-7, 0.3, 11, 0, true);
  B.chest(8, 0.3, -11, Math.PI);
  B.chest(12, 0.3, 15, -0.8);
  B.chest(-22, 0.3, 22, 0.7);
  for (const [fx, fy, fz] of [[-12, 15.6, 0], [12, 15.6, 0], [0, 0.3, 5], [-11, 0.3, -15], [20, 15.1, 0], [-20, 15.1, 0], [22, 0.3, -22]]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildBoneRidge(): SunburstPoiData {
  // Colossal Bleached Desert Leviathan Skeleton & Full-Scale Paleontology Expedition Outpost at (-740, -60, y=18)
  const B = new PoiBuilder("bone-ridge", -740, 18, -60);
  B.clearings.push({ x: -740, z: -60, r: 98 });
  B.hotZone(0, 0, 56, 5, 2);

  // ── 1. MONUMENTAL SCULPTED LEVIATHAN SKELETON (88 m nose-to-tail!) ─────────────────────────────────────
  // 9 Smoothly Arching 3-Segment Anatomical Ribcage Ribs (endpoint-to-endpoint curving inward!) + Spine Vertebrae & Neural Fin Spines!
  for (let i = 0; i < 9; i++) {
    const rz = -24 + i * 6;
    const archScale = 1 - Math.abs(i - 4) * 0.085;
    const R = 11.4 * archScale;
    const H = 13.6 * archScale;
    // Trace 4 anatomical rib curve waypoints [x, y] from desert floor arching smoothly up & INWARD over the spine!
    const pts: Array<[number, number]> = [
      [R * 0.90, 0.0],
      [R * 1.04, H * 0.36],
      [R * 0.78, H * 0.74],
      [R * 0.22, H * 0.96],
    ];
    for (const side of [-1, 1]) {
      for (let s = 0; s < 3; s++) {
        const [x0, y0] = pts[s];
        const [x1, y1] = pts[s + 1];
        const dx = (x1 - x0) * side;
        const dy = y1 - y0;
        const len = dmath.hypot(dx, dy) + 0.55;
        // Three.js rotation.z (+roll) rotates local +Y toward -X -> roll = -atan2(dx, dy) aligns +Y along (dx, dy)!
        const roll = -dmath.atan2(dx, dy);
        const thick = 1.48 - s * 0.18;
        B.add({
          mat: "bone",
          lx: side * (x0 + x1) * 0.5,
          ly: (y0 + y1) * 0.5,
          lz: rz,
          w: thick,
          h: len,
          d: thick + 0.12,
          roll,
          collide: s < 2,
        });
      }
      // Costal rib-head joint knob anchoring rib base toward spine
      B.add({ shape: "sphere", mat: "bone", lx: side * 2.5, ly: 1.55, lz: rz, w: 1.5, h: 1.4, d: 1.5, collide: false });
    }
    // Sculpted Vertebra Centrum Drum + Lateral Wing Processes + Tall Serrated Dorsal Neural Spine!
    B.add({ shape: "cyl", mat: "bone", lx: 0, ly: 1.65, lz: rz, w: 3.4 * archScale + 0.8, h: 3.2, d: 3.4 * archScale + 0.8, pitch: Math.PI * 0.5 });
    B.add({ mat: "bone", lx: 0, ly: 1.65, lz: rz, w: 5.6 * archScale, h: 1.1, d: 1.4, collide: false });
    B.add({ mat: "bone", lx: 0, ly: 3.6 + archScale * 0.9, lz: rz, w: 0.95, h: 2.2 + archScale * 1.4, d: 1.75, pitch: 0.18, collide: false });
  }
  // Neck Cervical Vertebrae bridging ribcage to the giant skull (lz = -29)
  B.add({ shape: "cyl", mat: "bone", lx: 0, ly: 2.1, lz: -29.2, w: 4.2, h: 3.8, d: 4.2, pitch: Math.PI * 0.5 });
  B.add({ mat: "bone", lx: 0, ly: 4.4, lz: -29.2, w: 1.1, h: 2.6, d: 2.0, collide: false });

  // Colossal Open-Jaw Horned Fanged Leviathan Skull (lz = -33..-50 — walkable mouth vault with Hero Chest inside!)
  for (const side of [-1, 1]) {
    // Rear cranium cheeks (leaving central 6.4 m wide × 4.2 m tall walkable mouth cavern open!)
    B.add({ mat: "bone", lx: side * 4.8, ly: 3.3, lz: -36.5, w: 3.0, h: 6.6, d: 8.6 });
    // Sculpted zygomatic cheek arch & prominent brow ridge framing forward-facing deep eye sockets!
    B.add({ mat: "bone", lx: side * 5.2, ly: 7.4, lz: -39.2, w: 2.6, h: 1.5, d: 4.8, yaw: -side * 0.25, collide: false });
    B.add({ mat: "darkwood", lx: side * 4.2, ly: 6.1, lz: -40.8, w: 2.4, h: 2.0, d: 1.4, yaw: -side * 0.32, collide: false });
    // Sculpted horn collar + smoothly joined 2-segment curved giant bull-dragon horns arching outward & skyward!
    B.add({ shape: "cyl", mat: "bone", lx: side * 6.8, ly: 8.4, lz: -34.2, w: 2.5, h: 5.2, d: 2.5, roll: -side * 0.92, pitch: -0.22, collide: false });
    B.add({ shape: "sphere", mat: "bone", lx: side * 8.7, ly: 9.85, lz: -34.7, w: 2.4, h: 2.4, d: 2.4, collide: false });
    B.add({ shape: "cone", mat: "bone", lx: side * 9.88, ly: 12.78, lz: -33.86, w: 2.25, h: 6.8, d: 2.25, roll: -side * 0.40, pitch: 0.25, collide: false });
    // Hinged lower jaw rami resting on the sand framing the open cavern
    B.add({ mat: "bone", lx: side * 4.2, ly: 0.85, lz: -42.5, w: 1.55, h: 1.7, d: 11.2, yaw: side * 0.16 });
  }
  // Tapered Sculpted Upper Cranium Dome + Angled Snout Bridge + Upturned Nasal Horn!
  B.add({ mat: "bone", lx: 0, ly: 7.5, lz: -36.2, w: 11.6, h: 2.8, d: 8.8 });
  B.add({ mat: "bone", lx: 0, ly: 8.6, lz: -35.8, w: 7.6, h: 1.4, d: 7.2, collide: false }); // Dorsal skull crest
  B.add({ mat: "bone", lx: 0, ly: 5.8, lz: -43.5, w: 7.2, h: 2.4, d: 7.6, pitch: 0.16 });
  B.add({ mat: "bone", lx: 0, ly: 4.6, lz: -48.0, w: 5.0, h: 1.75, d: 3.6, collide: false }); // Tapered snout tip
  B.add({ shape: "cone", mat: "bone", lx: 0, ly: 7.5, lz: -46.2, w: 1.9, h: 4.4, d: 1.9, pitch: -0.26, collide: false }); // Nasal horn
  B.add({ mat: "darkwood", lx: -1.15, ly: 5.25, lz: -49.6, w: 0.9, h: 0.75, d: 0.45, collide: false }); // Nostrils
  B.add({ mat: "darkwood", lx: 1.15, ly: 5.25, lz: -49.6, w: 0.9, h: 0.75, d: 0.45, collide: false });
  // Front lower jaw chin bone + interior illuminated stone altar pedestal for the Skull Hero Chest!
  B.add({ mat: "bone", lx: 0, ly: 0.72, lz: -48.0, w: 5.8, h: 1.44, d: 2.2 });
  B.add({ mat: "sandstone", lx: 0, ly: 0.55, lz: -40.5, w: 3.4, h: 1.1, d: 3.0 });
  B.add({ shape: "sphere", mat: "glow", lx: 0, ly: 5.2, lz: -39.5, w: 0.55, h: 0.55, d: 0.55, collide: false }); // Expedition cave lamp inside skull!
  // 14 Sculpted Ivory Fangs (upper jaw downward + lower jaw upward!)
  for (const [fx, fz, fh] of [
    [-3.2, -41.8, 1.9], [3.2, -41.8, 1.9], [-2.8, -44.8, 2.2], [2.8, -44.8, 2.2],
    [-2.0, -47.4, 1.8], [2.0, -47.4, 1.8], [0, -48.6, 1.5],
  ]) {
    B.add({ shape: "cone", mat: "bone", lx: fx, ly: 4.1 - fh * 0.35, lz: fz, w: 0.68, h: fh, d: 0.68, roll: Math.PI, collide: false });
    B.add({ shape: "cone", mat: "bone", lx: fx * 0.92, ly: 1.65 + fh * 0.25, lz: fz + 0.5, w: 0.58, h: fh * 0.78, d: 0.58, collide: false });
  }

  // Winged Pelvic Hip Crest (lz = +28) + Sweeping Articulated Curved Tail (lz = +31..+49) with Spiked Tail Club!
  for (const side of [-1, 1]) {
    B.add({ mat: "bone", lx: side * 5.2, ly: 3.0, lz: 28.5, w: 5.4, h: 5.8, d: 2.4, yaw: side * 0.35, roll: -side * 0.28 });
  }
  const tailPts: Array<[number, number, number, number]> = [
    [1.2, 32.5, 3.0, 0.22], [3.4, 36.2, 2.5, 0.42], [6.4, 39.6, 2.1, 0.62],
    [9.8, 42.6, 1.8, 0.78], [13.2, 45.2, 1.4, 0.88], [16.2, 47.4, 1.15, 0.95],
  ];
  for (const [tx, tz, ts, tyaw] of tailPts) {
    B.add({ shape: "cyl", mat: "bone", lx: tx, ly: ts * 0.46, lz: tz, w: ts, h: 2.6, d: ts, yaw: tyaw, pitch: Math.PI * 0.5 });
    B.add({ mat: "bone", lx: tx, ly: ts * 0.95 + 0.5, lz: tz, w: 0.55, h: ts * 0.75, d: 1.1, yaw: tyaw, collide: false });
  }
  // Spiked Leviathan Tail Club at (+18.2, +49.0)
  B.add({ shape: "sphere", mat: "bone", lx: 18.2, ly: 1.45, lz: 49.0, w: 3.4, h: 2.6, d: 3.8, yaw: 0.95 });
  for (const [sx, sy, sz, pitch, roll] of [
    [19.8, 2.1, 49.8, 0.4, -0.8], [17.4, 2.6, 48.2, -0.3, 0.4], [19.0, 1.5, 50.8, 0.9, -0.3], [16.5, 1.7, 49.8, 0.5, 0.8],
  ]) {
    B.add({ shape: "cone", mat: "bone", lx: sx, ly: sy, lz: sz, w: 0.85, h: 2.6, d: 0.85, pitch, roll, collide: false });
  }

  // Half-Buried Giant Femur Limb Bone (West trench) + Excavated Giant 3-Talon Fossil Claw Pit (South-East)!
  B.add({ shape: "cyl", mat: "bone", lx: -21, ly: 1.05, lz: 26, w: 1.45, h: 9.2, d: 1.45, yaw: 0.58, pitch: Math.PI * 0.5 });
  B.add({ shape: "sphere", mat: "bone", lx: -23.5, ly: 1.35, lz: 22.2, w: 2.6, h: 2.2, d: 2.4, collide: false });
  B.add({ shape: "sphere", mat: "bone", lx: -18.5, ly: 1.25, lz: 29.8, w: 2.4, h: 2.1, d: 2.3, collide: false });
  // South-East roped fossil claw excavation pit (+22, +36) with 3 curved giant talons & wooden hazard barricade!
  B.add({ mat: "redrock", lx: 22, ly: 0.14, lz: 36, w: 9.4, h: 0.28, d: 8.6, collide: false });
  for (const [cx, cz, cyaw] of [[19.5, 34.5, -0.45], [22.0, 35.8, 0.0], [24.5, 34.5, 0.45]]) {
    B.add({ shape: "cone", mat: "bone", lx: cx, ly: 1.75, lz: cz, w: 1.25, h: 4.0, d: 1.25, yaw: cyaw, pitch: 0.35 });
  }
  for (const [fx, fz, fw, fd] of [[22, 31.2, 10.2, 0.24], [22, 40.8, 10.2, 0.24], [16.9, 36, 0.24, 9.6], [27.1, 36, 0.24, 9.6]]) {
    B.add({ mat: "darkwood", lx: fx, ly: 0.95, lz: fz, w: fw, h: 0.16, d: fd, collide: false });
  }
  for (const sx of [16.9, 27.1]) for (const sz of [31.2, 40.8]) {
    B.add({ mat: "darkwood", lx: sx, ly: 0.65, lz: sz, w: 0.28, h: 1.3, d: 0.28 });
  }

  // ── 2. DUAL EXCAVATION GANTRIES + OVERHEAD CROSS-RIBCAGE INSPECTION BRIDGE ─────────────────────────────
  // East Gantry Deck (lx=16, lz=-18, top=4.38 -> matches skyship-bones zipline landing [-724, 22.4, -78]!)
  B.add({ mat: "timber", lx: 16, ly: 4.2, lz: -18, w: 5.4, h: 0.36, d: 20 });
  for (const sz of [-27, -21, -15, -9]) {
    for (const sx of [13.5, 18.5]) B.add({ mat: "darkwood", lx: sx, ly: 2.1, lz: sz, w: 0.38, h: 4.2, d: 0.38 });
  }
  B.add({ mat: "darkwood", lx: 18.5, ly: 5.1, lz: -18, w: 0.16, h: 0.16, d: 20, collide: false });
  B.stairs(16, 0, -4, 2.4, 8, 4.38, Math.PI, "timber", true);

  // Mirror West Gantry Deck (lx=-16, lz=-18, top=4.38) + West Access Staircase!
  B.add({ mat: "timber", lx: -16, ly: 4.2, lz: -18, w: 5.4, h: 0.36, d: 20 });
  for (const sz of [-27, -21, -15, -9]) {
    for (const sx of [-18.5, -13.5]) B.add({ mat: "darkwood", lx: sx, ly: 2.1, lz: sz, w: 0.38, h: 4.2, d: 0.38 });
  }
  B.add({ mat: "darkwood", lx: -18.5, ly: 5.1, lz: -18, w: 0.16, h: 0.16, d: 20, collide: false });
  B.stairs(-16, 0, -4, 2.4, 8, 4.38, Math.PI, "timber", true);

  // Elevated Steel & Timber Cross-Ribcage Inspection Bridge threading cleanly between Rib #2 (-18) & Rib #3 (-12) at lz = -15!
  B.add({ mat: "metal", lx: 0, ly: 5.8, lz: -15, w: 21.6, h: 0.36, d: 3.0 });
  for (const sz of [-16.4, -13.6]) {
    B.add({ mat: "iron", lx: 0, ly: 6.75, lz: sz, w: 21.6, h: 0.14, d: 0.14, collide: false });
    for (const sx of [-9, -3, 3, 9]) {
      B.add({ mat: "iron", lx: sx, ly: 6.32, lz: sz, w: 0.14, h: 0.9, d: 0.14, collide: false });
    }
  }
  for (const sx of [-7.5, 7.5]) {
    B.add({ mat: "iron", lx: sx, ly: 2.9, lz: -15, w: 0.42, h: 5.8, d: 0.42 });
  }
  B.add({ shape: "sphere", mat: "glow", lx: 0, ly: 7.2, lz: -16.4, w: 0.42, h: 0.42, d: 0.42, collide: false });
  B.add({ shape: "sphere", mat: "glow", lx: 0, ly: 7.2, lz: -13.6, w: 0.42, h: 0.42, d: 0.42, collide: false });
  // Smooth staircases linking BOTH East & West Gantries (4.38 m) up onto the Cross-Ribcage Bridge (5.98 m)!
  B.stairs(12.05, 4.38, -15, 2.4, 2.6, 1.60, -Math.PI * 0.5, "metal", true);
  B.stairs(-12.05, 4.38, -15, 2.4, 2.6, 1.60, Math.PI * 0.5, "metal", true);

  // ── 3. TWO WORKING FOSSIL LIFTING CRANES + PARKED EXPEDITION DIG TRUCK + CAMP WATER TOWER ─────────────
  // West A-Frame Fossil Hoist lifting a strapped giant femur bone over the West trench!
  B.add({ mat: "darkwood", lx: -16, ly: 4.5, lz: 17, w: 0.48, h: 9.2, d: 0.48, roll: 0.22, collide: false });
  B.add({ mat: "darkwood", lx: -8, ly: 4.5, lz: 17, w: 0.48, h: 9.2, d: 0.48, roll: -0.22, collide: false });
  B.add({ mat: "iron", lx: -12, ly: 8.8, lz: 17, w: 8.8, h: 0.48, d: 0.48, collide: false });
  B.add({ mat: "iron", lx: -12, ly: 6.4, lz: 17, w: 0.14, h: 4.6, d: 0.14, collide: false });
  B.add({ shape: "cyl", mat: "bone", lx: -12, ly: 3.6, lz: 17, w: 1.0, h: 5.4, d: 1.0, roll: Math.PI * 0.5, collide: false });
  B.add({ mat: "gold", lx: -12, ly: 3.6, lz: 17, w: 0.45, h: 1.2, d: 1.2, collide: false });

  // North Skull Excavation Jib Crane with boom aligned straight over its cable & suspended specimen crate!
  B.add({ mat: "iron", lx: -15.5, ly: 0.5, lz: -38.0, w: 3.4, h: 1.0, d: 3.4 });
  B.add({ mat: "gold", lx: -15.5, ly: 5.4, lz: -38.0, w: 1.35, h: 9.0, d: 1.35 });
  B.add({ mat: "gold", lx: -15.5, ly: 9.8, lz: -42.5, w: 1.0, h: 0.85, d: 10.2, collide: false });
  B.add({ mat: "iron", lx: -15.5, ly: 6.7, lz: -46.8, w: 0.16, h: 5.6, d: 0.16, collide: false });
  B.add({ mat: "crate", lx: -15.5, ly: 3.1, lz: -46.8, w: 2.2, h: 1.8, d: 2.2, yaw: 0.25, collide: false });

  // Parked Paleontology Expedition Flatbed Dig Truck (-30, -28) loaded with excavated fossil bones & crates!
  {
    const tx0 = -30, tz0 = -28, ty = 0.35;
    const c = dmath.cos(ty), s = dmath.sin(ty);
    const tp = (u: number, v: number): [number, number] => [tx0 + u * c + v * s, tz0 - u * s + v * c];
    // Steel chassis & flatbed deck
    B.add({ mat: "iron", lx: tx0, ly: 0.85, lz: tz0, w: 3.4, h: 0.55, d: 8.2, yaw: ty });
    B.add({ mat: "timber", lx: tx0, ly: 1.25, lz: tz0, w: 3.5, h: 0.25, d: 8.0, yaw: ty });
    // Cab at front (+Z local) with desert terracotta body, tinted windshield & roof lightbar!
    const [cx, cz] = tp(0, 2.35);
    B.add({ mat: "terracotta", lx: cx, ly: 2.25, lz: cz, w: 3.3, h: 1.85, d: 2.9, yaw: ty });
    const [wx, wz] = tp(0, 3.82);
    B.add({ mat: "glass", lx: wx, ly: 2.45, lz: wz, w: 2.7, h: 0.95, d: 0.14, yaw: ty, surf: "glass", noShoot: true });
    B.add({ mat: "glow", lx: cx, ly: 3.32, lz: cz, w: 2.0, h: 0.24, d: 0.36, yaw: ty, collide: false });
    // Headlights & front steel bumper
    const [bx, bz] = tp(0, 4.15);
    B.add({ mat: "iron", lx: bx, ly: 0.95, lz: bz, w: 3.5, h: 0.45, d: 0.45, yaw: ty, collide: false });
    for (const side of [-1.2, 1.2]) {
      const [hx, hz] = tp(side, 3.92);
      B.add({ shape: "sphere", mat: "glow", lx: hx, ly: 1.5, lz: hz, w: 0.42, h: 0.42, d: 0.32, collide: false });
    }
    // 4 Rugged off-road wheels with chrome hubs
    for (const sx of [-1.75, 1.75]) for (const sz of [-2.4, 2.4]) {
      const [wlx, wlz] = tp(sx, sz);
      B.add({ shape: "cyl", mat: "iron", lx: wlx, ly: 0.72, lz: wlz, w: 1.44, h: 0.56, d: 1.44, yaw: ty, roll: Math.PI * 0.5, collide: false });
      B.add({ shape: "cyl", mat: "chrome", lx: wlx, ly: 0.72, lz: wlz, w: 0.65, h: 0.62, d: 0.65, yaw: ty, roll: Math.PI * 0.5, collide: false });
    }
    // Cargo flatbed: wooden side rails, shipping crate & excavated rib bone!
    const [rgx, rgz] = tp(-0.6, -1.6);
    B.add({ mat: "crate", lx: rgx, ly: 2.0, lz: rgz, w: 1.5, h: 1.25, d: 1.8, yaw: ty });
    const [bnx, bnz] = tp(0.8, -1.5);
    B.add({ shape: "cyl", mat: "bone", lx: bnx, ly: 1.85, lz: bnz, w: 0.62, h: 4.0, d: 0.62, yaw: ty, pitch: Math.PI * 0.5, collide: false });
  }

  // Elevated Copper Camp Water Tank Tower (+41, +26) feeding the Field Lab back wall (clear of roofStairs!)
  for (const [wx, wz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) {
    B.add({ mat: "darkwood", lx: 41 + wx, ly: 3.4, lz: 26 + wz, w: 0.42, h: 6.8, d: 0.42 });
  }
  B.add({ mat: "timber", lx: 41, ly: 6.9, lz: 26, w: 5.4, h: 0.36, d: 5.4 });
  B.add({ shape: "cyl", mat: "copper", lx: 41, ly: 8.9, lz: 26, w: 4.2, h: 3.6, d: 4.2 });
  B.add({ shape: "torus", mat: "iron", lx: 41, ly: 8.1, lz: 26, w: 4.35, h: 0.28, d: 4.35, collide: false });
  B.add({ shape: "torus", mat: "iron", lx: 41, ly: 9.7, lz: 26, w: 4.35, h: 0.28, d: 4.35, collide: false });
  B.add({ shape: "cone", mat: "rust", lx: 41, ly: 11.45, lz: 26, w: 4.8, h: 1.6, d: 4.8, collide: false });
  B.pipe(41, 7.0, 24, 39.2, 3.8, 8, 0.45, "copper");

  // Portable Diesel Camp Generator (+23, -8) feeding copper power conduit to the East Gantry!
  B.add({ mat: "gold", lx: 23, ly: 0.95, lz: -8, w: 2.2, h: 1.5, d: 3.2 });
  B.add({ mat: "iron", lx: 23, ly: 1.85, lz: -8, w: 1.8, h: 0.35, d: 2.6, collide: false });
  B.pipe(22, 0.6, -8, 17, 4.0, -14, 0.25, "copper");

  // ── 4. THREE FURNISHED EXPEDITION BUILDINGS + FOUR SORTING TENTS + CAMP PROPS ──────────────────────────
  // 1) High-Tech Field Analysis Lab (with solar panels & live rotating satellite radar dish!)
  B.building({ lx: 34, lz: 4, w: 13, d: 11, h: 4.4, yaw: -Math.PI * 0.5, wallMat: "metal", roofMat: "sandstone", trimMat: "chrome", parapet: true, backDoor: true, glass: true, roofStairs: true, rooftopProp: "solar", furnish: "lab" });
  B.anims.push({ kind: "radar", x: -740 + 34, y: 18 + 5.2, z: -60 + 8, scale: 1.1 });
  // 2) Fossil Specimen Packing Warehouse
  B.building({ lx: 33, lz: -24, w: 11, d: 10, h: 4.2, yaw: -Math.PI * 0.5, wallMat: "plaster", roofMat: "rust", backDoor: true, glass: true, roofStairs: true, rooftopProp: "crates", furnish: "warehouse" });
  // 3) Excavators' Camp Bunkhouse overlooking the South-West trench
  B.building({ lx: -36, lz: 20, w: 12, d: 10, h: 4.2, yaw: Math.PI * 0.5, wallMat: "timber", roofMat: "canvas", glass: true, roofStairs: true, pergola: true, furnish: "barracks" });

  // 4 Shaded Fossil Sorting & Survey Tents + Outdoor Specimen Prep Tables!
  B.stall(-27, 0, -12, 7.2, 4.8, Math.PI * 0.5, "canvas");
  B.stall(-27, 0, 5, 7.2, 4.8, Math.PI * 0.5, "awning");
  B.stall(18, 0, -40, 6.4, 4.4, -0.45, "turquoise");
  B.stall(-10, 0, 38, 6.8, 4.6, 0.15, "awning");
  // Outdoor fossil display examination table beside North-East survey tent
  B.add({ mat: "timber", lx: 11, ly: 0.55, lz: -36, w: 3.2, h: 1.0, d: 1.6, yaw: -0.3 });
  B.add({ shape: "cyl", mat: "bone", lx: 11, ly: 1.28, lz: -36, w: 0.52, h: 2.2, d: 0.52, yaw: -0.3, roll: Math.PI * 0.5, collide: false });

  // Tactical Cover, Expedition Banners, Floodlight Masts, Campfires, Planters, Helipad & Saguaros!
  // (Leaves Banana Stand courtyard spot [+16, +20] wide open!)
  B.crateCluster(-20, 0, -24, 0.3, false);
  B.crateCluster(10, 0, 11, -0.4, true);
  B.crateCluster(22, 0, -24, 0.25, true);
  B.crateCluster(-20, 0, 36, -0.3, false);
  B.crateCluster(6, 0, 32, 0.5, true);
  B.sandbagWall(-14, 0, 6, 4.6, Math.PI * 0.5);
  B.sandbagWall(14, 0, 2, 4.6, Math.PI * 0.5);
  B.sandbagWall(-16, 0, -30, 4.4, 0.45);
  B.sandbagWall(12, 0, -28, 4.4, -0.35);

  // 2 Blazing Campfires with sitting logs
  B.brazier(-24, 0, 31, 0.95);
  B.brazier(26, 0, 26, 0.90);
  for (const [bx, bz] of [[-24, 31], [26, 26]]) {
    B.add({ shape: "cyl", mat: "darkwood", lx: bx + 2.4, ly: 0.3, lz: bz, w: 0.5, h: 2.2, d: 0.5, pitch: Math.PI * 0.5 });
    B.add({ shape: "cyl", mat: "darkwood", lx: bx, ly: 0.3, lz: bz - 2.4, w: 0.5, h: 2.2, d: 0.5, roll: Math.PI * 0.5 });
  }

  // 6 Excavation Floodlight Masts & 4 Expedition Heraldic Banner Poles
  for (const [lx, lz, lyaw] of [[14, -2, -1.57], [-14, -2, 1.57], [12, -46, 0], [-12, -46, 0], [0, 31, 3.14], [25, 16, -1.57]]) {
    B.lampPost(lx, 0, lz, lyaw);
  }
  B.bannerPole(9.5, 0, -48, 0, "turquoise", 6.4);
  B.bannerPole(-11.5, 0, -49, 0, "crimson", 6.4);
  B.bannerPole(27, 0, 14, 0, "turquoise", 6.0);
  B.bannerPole(-27, 0, 16, 0, "crimson", 6.0);
  B.planter(25, 0, -14, "prickly-pear", 1.15);
  B.planter(-28, 0, 14, "prickly-pear", 1.15);
  B.helipad(-44, 0, -42);
  for (const [cx, cz, ch, cy] of [
    [-46, 6, 5.8, 0.4], [-44, 38, 5.4, 1.7], [46, 18, 5.6, 2.3],
    [44, -38, 5.2, 0.9], [32, 46, 5.5, 2.8], [-22, -48, 5.0, 1.2],
  ]) {
    B.saguaro(cx, 0, cz, ch, cy);
  }

  // 7 Chests (2 Hero + 5 Standard) + 11 Floor Loot Spots across every elevation!
  B.chest(0, 1.12, -40.5, 0, true);             // Hero Chest inside the Leviathan's open fanged jaws!
  B.chest(34, 0.3, 4, -Math.PI * 0.5, true);    // Hero Chest in Field Paleontology Lab
  B.chest(0, 6.02, -15, 0);                     // Cross-Ribcage Inspection Bridge sniper chest!
  B.chest(16, 4.45, -22, 0);                    // East Gantry Zipline Deck
  B.chest(33, 0.3, -24, -Math.PI * 0.5);        // Specimen Packing Warehouse
  B.chest(-36, 0.3, 20, Math.PI * 0.5);         // Camp Bunkhouse
  B.chest(-27, 0.3, -12, Math.PI * 0.5);        // West Fossil Sorting Tent
  for (const [fx, fy, fz] of [
    [0, 3.3, -6], [0, 3.3, 12], [-16, 4.45, -20], [34, 4.8, 4], [33, 4.6, -24],
    [-36, 4.6, 20], [-27, 0.3, 5], [18, 0.3, -40], [-10, 0.3, 38], [22, 0.3, 36], [-44, 0.4, -38],
  ]) B.loot(fx, fy, fz);
  return B.finish();
}

function buildSunburstIslet(): SunburstPoiData {
  // Warmup Desert Sandbar Islet at (0, 1020, y=2.5): dead-flat 2.50 m sandbar for r <= 62 m!
  // Keeps warmup spawn zones (lz ≈ -78..-60) and central arena (lx ∈ [-18,+18], lz ∈ [-30,+26]) wide open!
  const B = new PoiBuilder("lobby-islet", 0, 2.5, 1020);
  B.clearings.push({ x: 0, z: 1020, r: 74 });

  // Twin Carved Desert Obelisks deeply rooted (-0.6 m into sand!) with golden tips & flaming braziers flanking the warmup arena
  for (const [ox, oz] of [[-28, -26], [28, -26]]) {
    B.add({ mat: "sandstone", lx: ox, ly: 0.35, lz: oz, w: 3.6, h: 1.9, d: 3.6 });
    B.add({ mat: "turquoise", lx: ox, ly: 1.38, lz: oz, w: 2.8, h: 0.24, d: 2.8, collide: false });
    B.add({ mat: "hieroglyph", lx: ox, ly: 4.5, lz: oz, w: 2.2, h: 6.4, d: 2.2 });
    B.add({ shape: "pyramid", mat: "gold", lx: ox, ly: 8.6, lz: oz, w: 2.2, h: 1.8, d: 2.2 });
    B.brazier(ox + (ox > 0 ? -3.2 : 3.2), 0, oz, 0.85);
  }
  // Twin Grounded Desert Bazaar Stalls flanking East & West sides of the flat warmup plaza
  B.stall(-26, 0, -8, 6.2, 4.2, Math.PI * 0.42, "awning");
  B.stall(26, 0, -8, 6.2, 4.2, -Math.PI * 0.42, "turquoise");
  // Grand carved desert triumphal arch framing the North approach onto the flat sandbar
  B.archGate(0, 0, -40, 11, 6.6, 0, "sandstone");
  B.lampPost(-8.5, 0, -40, 0);
  B.lampPost(8.5, 0, -40, 0);
  // Ceremonial desert banners, tactical warmup crate cover & framing Saguaro grove (all on flat 2.50 m sand!)
  B.bannerPole(-14, 0, -34, 0, "crimson", 5.8);
  B.bannerPole(14, 0, -34, 0, "turquoise", 5.8);
  B.crateCluster(-22, 0, 14, 0.4);
  B.crateCluster(22, 0, 12, -0.3);
  B.saguaro(-34, 0, -10, 5.2, 0.5);
  B.saguaro(34, 0, -12, 5.5, 2.1);
  B.saguaro(-24, 0, 26, 4.6, 1.3);
  B.saguaro(26, 0, 24, 4.9, 2.8);
  return B.finish();
}

export const SUNBURST_POIS_DATA: readonly SunburstPoiData[] = [
  buildBananaPyramid(),
  buildEmeraldOasis(),
  buildSunburstBazaar(),
  buildRedrockCanyon(),
  buildMesaCitadel(),
  buildDuneRefinery(),
  buildSkyshipWreck(),
  buildCactusGulch(),
  buildSolarSpire(),
  buildMirageDocks(),
  buildScorpionArch(),
  buildBoneRidge(),
  buildSunburstIslet(),
];

export const SUNBURST_POI_BY_ID: Record<string, SunburstPoiData> = Object.fromEntries(SUNBURST_POIS_DATA.map((p) => [p.id, p]));

export const SUNBURST_COLLIDERS: Box[] = SUNBURST_POIS_DATA.flatMap((p) => p.colliders);
export const SUNBURST_CLEARINGS: SunburstClearing[] = SUNBURST_POIS_DATA.flatMap((p) => p.clearings);

/** 6 Thrilling Desert Canyon, Mesa, Bazaar & Skyship Ziplines (shared by server/client prediction + client cable renderer) */
export const SUNBURST_ZIPS: readonly SunburstZipDef[] = [
  // 1. Redrock Canyon North-East Bastion Watchtower express zip across gorge to South-West Bastion Watchtower!
  { id: "canyon-cross", a: [-10, 34.04, -402.2], b: [-66, 34.04, -287.8], sag: 1.6, ya: 31.24, yb: 31.24 },
  // 2. Mesa Citadel SE Bastion express drop down onto Banana Pyramid North summit terrace!
  { id: "mesa-pyramid", a: [-482, 67.6, -562], b: [-420, 49.7, -244.2], sag: 2.8, ya: 64.8, yb: 46.9 },
  // 3. Dune Refinery Silo Catwalk across onto Solar Spire observation deck!
  { id: "refinery-solar", a: [474, 29.2, -300], b: [225.6, 44.84, -555.8], sag: 3.0, ya: 26.2, yb: 42.04 },
  // 4. Emerald Oasis East Villa roof across lagoon to West Villa roof!
  { id: "oasis-glide", a: [78, 11.74, 53.5], b: [-78, 12.34, 26.5], sag: 1.8, ya: 8.94, yb: 9.54 },
  // 5. Sunburst Bazaar Minaret Balcony express zip down to Emerald Oasis East Villa!
  { id: "bazaar-oasis", a: [420, 37.6, 84], b: [78, 11.74, 53.5], sag: 3.2, ya: 34.8, yb: 8.94 },
  // 6. Skyship Wreck Roof across the western dunes to Bone Ridge East Gantry Deck!
  { id: "skyship-bones", a: [-540, 25.4, 276], b: [-724, 25.2, -78], sag: 3.4, ya: 22.6, yb: 22.4 },
];

/** Desert Thermal Geyser Updraft in Redrock Canyon (-40, -340): launches gliders high above the gorge! */
export const SUNBURST_UPDRAFT = {
  x: -40, z: -340,
  floor: 6.2, lip: 28, top: 215,
  rFloor: 5.5, rLip: 14, rAbove: 17,
  v: 42, edge: 3.5, fade: 40, kick: 16,
} as const;

/** Climbable Ladders on Sunburst Canyon landmarks (Minaret, Water Tower, Lighthouse, Refinery Derrick) */
export function sunburstLadders(): Climb[] {
  const mk = (x: number, z: number, y0: number, y1: number, nx: number, nz: number): Climb => ({
    kind: 0, x, z, y0, y1, nx, nz, ex: -nx, ez: -nz, off: 0.45, hw: 0.55,
  });
  return [
    // Sunburst Bazaar Minaret South face (14 -> 34.5 m!)
    mk(420, 120 - 36 + 3.65, 14, 34.5, 0, 1),
    // Cactus Gulch Water Tower South face (11 -> 22.3 m!)
    mk(160, 430 - 34 + 2.75, 11, 22.3, 0, 1),
    // Mirage Docks Lighthouse South face (4.7 -> 20.9 m!)
    mk(610 + 22, 420 - 18 + 3.25, 4.7, 20.9, 0, 1),
    // Dune Refinery Derrick East face (16 -> 28.2 m!)
    mk(490 - 24 + 4.3, -290 + 34, 16, 28.2, 1, 0),
  ];
}

/** Desert Tuk-Tuk Parking Ranks across Sunburst Canyon */
export const SUNBURST_TUK_RANKS: ReadonlyArray<readonly [PoiId, number, number, number, number?]> = [
  ["sunburst-bazaar", 0, 74, 0, 0],
  ["sunburst-bazaar", -58, 0, 1.57, 0],
  ["dune-refinery", 50, -10, 0, 0],
  ["dune-refinery", -10, 56, 1.57, 0],
  ["cactus-gulch", 0, -54, 0, 0],
  ["cactus-gulch", 44, 0, 1.57, 0],
  ["mirage-docks", -42, 0, 1.57, 0],
  ["banana-pyramid", 0, 56, 0, 0],
  ["skyship-wreck", 36, 36, 0.8, 0],
  ["solar-spire", 0, 62, 0, 0],
  ["bone-ridge", 44, -20, 1.2, 0],
];

/** Desert Helipads across Sunburst Canyon */
export const SUNBURST_HELIPADS: ReadonlyArray<readonly [PoiId, number, number, number]> = [
  ["mesa-citadel", 18, -18, 0.6],
  ["solar-spire", 40, 28, -0.5],
  ["dune-refinery", 52, 34, 2.2],
  ["mirage-docks", -40, -32, -1.0],
  ["banana-pyramid", 58, 42, 0.9],
  ["skyship-wreck", -44, -36, 1.5],
];

/** Curated ground-level courtyard/plaza Banana Stand spots per named Sunburst POI: local [dx, dz, yaw].
 *  Guarantees every desert shop sits on flat, wide-open, easily reachable ground (never atop a pyramid apex, skull, or tower!). */
export const SUNBURST_STAND_SPOTS: Readonly<Record<string, readonly [number, number, number]>> = {
  "banana-pyramid": [0, 46, Math.PI],
  "emerald-oasis": [0, 78, Math.PI],
  "sunburst-bazaar": [0, 16, Math.PI],
  "redrock-canyon": [-12, 10, Math.PI * 0.5],
  "mesa-citadel": [6, 4, -0.6],
  "dune-refinery": [6, -2, -0.5],
  "skyship-wreck": [18, 26, -0.8],
  "cactus-gulch": [-4, 24, 0],
  "solar-spire": [0, 24, Math.PI],
  "mirage-docks": [0, 14, 0],
  "scorpion-arch": [0, 26, Math.PI],
  "bone-ridge": [16, 20, -0.8],
};
