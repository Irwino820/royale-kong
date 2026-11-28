// MULTI-MAP REGISTRY: Kong Island (original tropical volcano island) + Sunburst Canyon (2400×2400 m desert island).
// Switching the active map mutates `POIS` in place before world/sim construction so every downstream system
// (collision, loot, bots, storm, minimap, HUD, vehicles, mythic weapons) follows automatically without touching
// TLA+-verified state machines.
import { KONG_POIS, POIS, type Poi } from "./map";

export type MapId = "kong-island" | "sunburst-canyon";
export type MapSlug = "kong" | "sunburst";

export interface MapInfo {
  id: MapId;
  slug: MapSlug;
  name: string;
  subtitle: string;
  tagline: string;
  /** relative path under public/ (passed to assetUrl) */
  terrainBin: string;
  /** relative folder under public/ for the 12 terrain splat layers */
  texDir: string;
  /** relative path under public/assets/ui/ for title backdrop */
  titleKeyart: string;
  /** relative path under public/assets/ui/ for lobby map card thumbnail */
  thumb: string;
  /** default atmosphere preset id */
  defaultPreset: "midday" | "desert";
}

export const MAPS: readonly MapInfo[] = [
  {
    id: "kong-island",
    slug: "kong",
    name: "KONG ISLAND",
    subtitle: "Tropical Jungle & Volcano",
    tagline: "Rule the island.",
    terrainBin: "assets/terrain/island.bin",
    texDir: "assets/terrain/tex3",
    titleKeyart: "title/keyart.webp",
    thumb: "maps/thumb-kong-island.webp",
    defaultPreset: "midday",
  },
  {
    id: "sunburst-canyon",
    slug: "sunburst",
    name: "SUNBURST CANYON",
    subtitle: "Desert Dunes, Mesas & Oasis",
    tagline: "Rule the canyon.",
    terrainBin: "assets/terrain/sunburst.bin",
    texDir: "assets/terrain/tex3-sunburst",
    titleKeyart: "maps/keyart-sunburst.webp",
    thumb: "maps/thumb-sunburst-canyon.webp",
    defaultPreset: "desert",
  },
];

/** 12 named desert Battle Royale POIs + lobby-islet (MUST stay last — bots.hot.ts indexes POIS.length - 1) */
export const SUNBURST_POIS: readonly Poi[] = [
  { id: "banana-pyramid",  name: "BANANA PYRAMID",  x: -420, z: -240, r: 175, padY: 24,  pad: 120, blend: 75, refs: [] },
  { id: "emerald-oasis",   name: "EMERALD OASIS",   x:    0, z:   40, r: 165, padY: null, pad: 0,  blend: 0,  refs: [] },
  { id: "sunburst-bazaar", name: "SUNBURST BAZAAR", x:  420, z:  120, r: 175, padY: 14,  pad: 135, blend: 80, refs: [] },
  { id: "redrock-canyon",  name: "REDROCK CANYON",  x:  -40, z: -340, r: 165, padY: null, pad: 0,  blend: 0,  refs: [] },
  { id: "mesa-citadel",    name: "MESA CITADEL",    x: -520, z: -600, r: 155, padY: 56,  pad: 95,  blend: 55, refs: [] },
  { id: "dune-refinery",   name: "DUNE REFINERY",   x:  490, z: -290, r: 170, padY: 16,  pad: 130, blend: 75, refs: [] },
  { id: "skyship-wreck",   name: "SKYSHIP WRECK",   x: -540, z:  290, r: 165, padY: 10,  pad: 125, blend: 75, refs: [] },
  { id: "cactus-gulch",    name: "CACTUS GULCH",    x:  160, z:  430, r: 150, padY: 11,  pad: 115, blend: 70, refs: [] },
  { id: "solar-spire",     name: "SOLAR SPIRE",     x:  220, z: -560, r: 150, padY: 32,  pad: 105, blend: 65, refs: [] },
  { id: "mirage-docks",    name: "MIRAGE DOCKS",    x:  610, z:  420, r: 160, padY: 3.2, pad: 120, blend: 65, refs: [] },
  { id: "scorpion-arch",   name: "SCORPION ARCH",   x: -220, z:  490, r: 135, padY: 22,  pad: 80,  blend: 65, refs: [] },
  { id: "bone-ridge",      name: "BONE RIDGE",      x: -740, z:  -60, r: 140, padY: 18,  pad: 85,  blend: 65, refs: [] },
  { id: "lobby-islet",     name: "SUNBURST ISLET",  x:    0, z: 1020, r:  90, padY: 2.5, pad: 60,  blend: 40, refs: [] },
];

export function parseMapId(raw?: string | null): MapId {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "sunburst" || s === "sunburst-canyon" || s === "desert" || s === "canyon") return "sunburst-canyon";
  return "kong-island";
}

let current: MapId = "kong-island";

export function activeMapId(): MapId { return current; }
export function isSunburst(): boolean { return current === "sunburst-canyon"; }
export function mapInfoOf(id: MapId): MapInfo { return MAPS.find((m) => m.id === id) ?? MAPS[0]; }
export function activeMapInfo(): MapInfo { return mapInfoOf(current); }

/** Switch active map and sync the shared `POIS` array in place. Safe to call in Node, browser boot, or workers. */
export function setActiveMap(id: MapId): MapId {
  current = id;
  const src = id === "sunburst-canyon" ? SUNBURST_POIS : KONG_POIS;
  POIS.splice(0, POIS.length, ...src);
  return current;
}

// Node / server startup hook: honour KR_MAP env var automatically (default remains kong-island)
{
  const envMap = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.KR_MAP;
  if (envMap) setActiveMap(parseMapId(envMap));
}
