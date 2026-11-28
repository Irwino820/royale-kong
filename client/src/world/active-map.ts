// Runs at the very top of client/src/main.ts (before world/registry.ts evaluates) so POIS, terrain URL,
// textures, atmosphere, and worker messages all initialize for the chosen map.
import { flag } from "../flags";
import { activeMapId, mapInfoOf, parseMapId, setActiveMap, type MapId } from "../../../shared/world/maps";

const STORAGE_KEY = "kr-map";

function resolveBootMap(): MapId {
  const q = flag("arena");
  if (q) {
    const id = parseMapId(q);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
    return id;
  }
  // View / ad-hoc camera captures default to Kong Island unless ?arena=sunburst is explicitly requested
  if (flag("view") || flag("cam")) return "kong-island";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseMapId(saved);
  } catch { /* ignore */ }
  return "kong-island";
}

export const BOOT_MAP: MapId = setActiveMap(resolveBootMap());

/** Switch maps from the Lobby with a clean reload so WebGL resources, workers, and terrain rebuild cleanly. */
export function switchMapAndReload(id: MapId): void {
  if (id === activeMapId()) return;
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  const u = new URL(location.href);
  if (id === "kong-island") u.searchParams.delete("arena");
  else u.searchParams.set("arena", mapInfoOf(id).slug);
  location.assign(u.toString());
}
