// Levels of detail and the device pixel ratio (spec section 3.3).
export type Lod = "tiles" | "chunks" | "far";
export const CHUNK_PX = 512; // a chunk's bitmap: 32 tiles of 16 px
export const CHUNK_KEEP = { desk: 48, phone: 16 } as const; // the chunk bitmaps a painter keeps at most

// The level of detail at a zoom in CSS px per world px (the canvas zoom over the device pixel ratio): stamped tiles from
// 1, chunk bitmaps from 1/4, the far silhouette below 1/4.
export function lodOf(cssZoom: number): Lod {
	if (!(cssZoom > 0)) return "far";
	if (cssZoom >= 1 - 1e-9) return "tiles";
	return cssZoom >= 0.25 - 1e-9 ? "chunks" : "far";
}
// The device pixel ratio the canvases use: 1, 2 or 3, rounded, so whole-number scales stay whole; anything else is 1.
export function deviceRatio(raw: number | undefined): 1 | 2 | 3 {
	if (typeof raw !== "number" || !Number.isFinite(raw)) return 1;
	const r = Math.round(raw);
	return r >= 3 ? 3 : r >= 2 ? 2 : 1;
}
