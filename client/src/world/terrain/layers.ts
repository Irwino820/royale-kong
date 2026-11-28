// Terrain splat layers (pure data — no DOM / asset imports, so node tools can use the splat rules too).
// Order here == layer index in the shader and data.ts. Textures: public/assets/terrain/tex3/<id>/{diff,nor,arm}.webp.
export interface Layer {
  id: string;
  /** metres per texture repeat */
  tile: number;
  /** albedo multiplier (applied in the shader, linear) */
  tint: [number, number, number];
  /** extra saturation (0 = none) */
  sat: number;
  /** roughness multiplier */
  rough: number;
  /** normal strength 0..1 (mix from the geometric normal) */
  nrm: number;
  /** triplanar on slopes (rock faces) */
  tri: boolean;
  /** how much of the arm-map AO is pre-multiplied into the albedo (0 = none): low for sand + paths so they stay bright */
  ao: number;
}

export const LAYERS: Layer[] = [
  { id: "sand",   tile: 3.4, tint: [1.06, 1.0, 0.9],   sat: 0.05, rough: 1.0, nrm: 0.5,  tri: false, ao: 0.15 },
  // grass: the texture is lime (111,157,27) → the target art's EMERALD meadow (~(115,142,42) in sun; a lighter
  // (161,178,66) read lime-yellow and, from the air, as pale discs against the jungle)
  { id: "grass",  tile: 3.2, tint: [0.62, 0.68, 0.22], sat: -0.3, rough: 1.0, nrm: 0.7, tri: false, ao: 0.4 },
  { id: "jungle", tile: 3.8, tint: [0.98, 1.0, 0.9],   sat: 0.05, rough: 1.0, nrm: 0.8,  tri: false, ao: 0.45 },
  // path: the texture is orange (224,160,78) → worn tan dirt (~(185,150,95)), distinct from grass AND from sand
  { id: "path",   tile: 3.4, tint: [0.8, 1.13, 1.2], sat: -0.12, rough: 1.0, nrm: 0.65, tri: false, ao: 0.2 },
  // cliff: bedded sandstone with blocky joints (tex3 v3, (213,173,121)) → pale tan (~(207,185,145)), never orange
  // (pale, low saturation: the target art's sunlit sandstone measures (210,171,123); (164,108,50)
  // reads as a dark saturated orange, with shaded faces at (80,43,12) where the target art's are grey-tan)
  { id: "cliff",  tile: 9.0, tint: [0.9, 0.84, 0.74],  sat: -0.3, rough: 1.0, nrm: 0.9, tri: true,  ao: 0.4 },
  // grey granite: warmer, more contrast (cracks darker via AO) — flat low-contrast grey read as wet cement from the air
  { id: "rock",   tile: 6.0, tint: [0.92, 0.9, 0.8],   sat: 0.08, rough: 1.0, nrm: 0.95, tri: true,  ao: 0.7 },
  // cinder: darker (the target art's lava field reads near-black (25,25,34) with glossy highlights)
  // (glossy near-black with a cool cast — the target art's lava field reads (34,37,49) on screen, not
  // (60,57,54) matte grey-brown)
  // (the target art's field measures (33..70) with wet-looking sheen)
  { id: "cinder", tile: 3.6, tint: [0.34, 0.36, 0.44], sat: 0.0,  rough: 0.45, nrm: 0.85, tri: false, ao: 0.4 },
  { id: "farm",   tile: 29.6, tint: [0.78, 0.9, 0.58], sat: 0.1,  rough: 1.0, nrm: 0.85, tri: false, ao: 0.35 },
  { id: "lava",   tile: 9.0, tint: [1.0, 1.0, 1.0],    sat: 0.0,  rough: 1.0, nrm: 0.9,  tri: false, ao: 0.4 },
  { id: "mud",    tile: 4.5, tint: [1.0, 0.98, 0.92],  sat: 0.0,  rough: 1.0, nrm: 0.6,  tri: false, ao: 0.3 },
  { id: "reef",   tile: 9.0, tint: [0.5, 0.56, 0.5],   sat: 0.2,  rough: 1.0, nrm: 0.5,  tri: false, ao: 0.4 },
  { id: "basalt", tile: 5.5, tint: [1.0, 1.0, 1.0],    sat: 0.0,  rough: 1.0, nrm: 0.9,  tri: true,  ao: 0.45 },
];
import { isSunburst } from "../../../../shared/world/maps";

export const SUNBURST_LAYERS: Layer[] = [
  { id: "sand",   tile: 4.5, tint: [1.04, 1.00, 0.93], sat: 0.08,  rough: 0.92, nrm: 0.65, tri: false, ao: 0.16 },
  { id: "grass",  tile: 4.2, tint: [1.00, 0.96, 0.90], sat: 0.04,  rough: 0.95, nrm: 0.72, tri: false, ao: 0.25 },
  { id: "jungle", tile: 3.6, tint: [0.82, 0.96, 0.68], sat: 0.14,  rough: 0.88, nrm: 0.70, tri: false, ao: 0.35 },
  { id: "path",   tile: 3.8, tint: [0.98, 0.92, 0.84], sat: 0.06,  rough: 0.94, nrm: 0.70, tri: false, ao: 0.22 },
  { id: "cliff",  tile: 9.5, tint: [1.04, 0.94, 0.84], sat: 0.10,  rough: 0.90, nrm: 0.95, tri: true,  ao: 0.42 },
  { id: "rock",   tile: 6.5, tint: [1.02, 0.92, 0.82], sat: 0.08,  rough: 0.92, nrm: 0.95, tri: true,  ao: 0.48 },
  { id: "cinder", tile: 5.5, tint: [0.98, 0.88, 0.80], sat: 0.08,  rough: 0.88, nrm: 0.90, tri: true,  ao: 0.42 },
  { id: "farm",   tile: 5.2, tint: [1.00, 0.96, 0.90], sat: 0.02,  rough: 0.86, nrm: 0.80, tri: false, ao: 0.28 },
  { id: "lava",   tile: 5.0, tint: [1.02, 0.98, 0.92], sat: 0.02,  rough: 0.92, nrm: 0.65, tri: false, ao: 0.20 },
  { id: "mud",    tile: 4.6, tint: [1.00, 0.96, 0.88], sat: 0.02,  rough: 0.94, nrm: 0.88, tri: false, ao: 0.38 },
  { id: "reef",   tile: 8.0, tint: [0.88, 1.00, 0.96], sat: 0.14,  rough: 0.85, nrm: 0.50, tri: false, ao: 0.20 },
  { id: "basalt", tile: 6.5, tint: [1.00, 0.90, 0.82], sat: 0.08,  rough: 0.88, nrm: 0.92, tri: true,  ao: 0.45 },
];
export const activeLayers = (): Layer[] => (isSunburst() ? SUNBURST_LAYERS : LAYERS);
export const LAYER_COUNT = LAYERS.length;
export const layerIndex = (id: string) => { const i = LAYERS.findIndex((l) => l.id === id); if (i < 0) throw new Error("terrain layer " + id); return i; };
