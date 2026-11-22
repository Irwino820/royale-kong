// GPU-compressed .ktx2 path of Assets.texture(): loads a source's GPU-compressed .ktx2 copy (baked by
// tools/textures/ktx2.mts and listed in public/assets/ktx2.json) instead of the webp/jpg. Default loads the shipped
// mix (UASTC normal maps, ETC1S for the rest); ?ktx2=etc1s swaps in ETC1S normal maps, ?ktx2=0 disables it.
import * as THREE from "three";
import { flag } from "../flags";
import { assetUrl } from "./assets";
import { CAP_PX } from "./tex-cap";
import { releaseAfterUpload } from "./texture-release";

const ETC1S = flag("ktx2") === "etc1s";
const SOURCE_EXT = /\.(webp|jpe?g|png)$/i;
let listed: Promise<{ sources: Set<string>; etc1s: Set<string> }> | null = null;

function manifest(): Promise<{ sources: Set<string>; etc1s: Set<string> }> {
  return (listed ??= fetch(assetUrl("assets/ktx2.json"))
    .then((r) => r.json() as Promise<{ sources?: string[]; etc1s?: string[] }>)
    .then((m) => ({ sources: new Set(m.sources ?? []), etc1s: new Set(m.etc1s ?? []) }))
    .catch(() => ({ sources: new Set<string>(), etc1s: new Set<string>() })));
}

/** Pre-fetch the tiny ktx2 manifest during lobby idle time so the first POI texture hits it without a round trip. */
export function warmKtx2Manifest(): Promise<void> {
  return manifest().then(() => {});
}

/** the compressed texture for a source path, or null when ktx2.json doesn't list one; mips above poicap are skipped */
export async function ktx2Texture(path: string, load: (ktx2Path: string) => Promise<THREE.CompressedTexture>): Promise<THREE.CompressedTexture | null> {
  const key = path.replace(/^\//, ""), m = await manifest();
  if (!m.sources.has(key)) return null;
  const file = path.replace(SOURCE_EXT, ETC1S && m.etc1s.has(key) ? ".etc1s.ktx2" : ".ktx2");
  const capped = async () => {
    const t = await load(file);
    const m = t.mipmaps;
    let k = 0;
    while (CAP_PX > 0 && k < m.length - 1 && Math.max(m[k].width, m[k].height) > CAP_PX) k++;
    if (k) { t.mipmaps = m.slice(k); t.image = { width: m[k].width, height: m[k].height }; }
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  };
  // A context restore refills the existing level objects rather than swapping the array: shareTexture clones hold the
  // same objects, and restoreAll runs every hook before the next frame, so the clones upload the restored pixels too.
  const t = releaseAfterUpload(await capped(), async () => { const f = await capped(); f.mipmaps.forEach((x, i) => { t.mipmaps[i].data = x.data; }); return f.image; });
  return t;
}
