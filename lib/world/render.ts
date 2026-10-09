// The village renderer (spec 2). It draws onto a Painter, so the same code draws to a canvas in the browser
// (canvas-painter.ts) and to plain pixels in the tests (pixel-painter.ts). Drawing order is in drawWorld.
import type { Look } from "./actor";
import { GROUND_Y, TILE, WORLD_W, type Block } from "./blueprints/types";
import { toScreen, zoomAt, type Camera, type View } from "./camera";
import { FACE_AT, FACE_CELLS, FACE_H, FACE_W, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex } from "./osmo-sprite";
import { PALETTE } from "./palette";
import { colours, rasterize, type Bitmap, type Colours, type Grid } from "./raster";
import { CLOUDS, cloudX, hslCss, PARALLAX, type Sky, type Star } from "./sky";
import { TILE_IDS, TILES, tileIndex, type TileId } from "./tiles";

export type Sheet = "tiles" | "sprite" | "faces";
export const CELL: Readonly<Record<Sheet, { w: number; h: number }>> = {
	tiles: { w: TILE, h: TILE },
	sprite: { w: FRAME_W, h: FRAME_H },
	faces: { w: FACE_W, h: FACE_H },
};
export type Art = { grids: Readonly<Record<Sheet, readonly Grid[]>>; colours: Colours };
// The drawn art with his scarf in the mood's first aura colour.
export function artFor(scarf: string): Art {
	return {
		grids: { tiles: TILE_IDS.map((id) => TILES[id]), sprite: FRAME_NAMES.map((n) => FRAMES[n]), faces: FACE_CELLS },
		colours: colours({ Z: scarf }),
	};
}
export const sheetBitmap = (art: Art, sheet: Sheet, scale: number): Bitmap =>
	rasterize(art.grids[sheet], CELL[sheet].w, CELL[sheet].h, scale, art.colours);

// What the renderer draws with. Coordinates are whole canvas pixels; stamp draws cell `cell` of a sheet at `scale`
// with its top-left at (x, y), mirrored left to right when flip is set.
export interface Painter {
	readonly w: number;
	readonly h: number;
	clear(): void;
	gradient(top: string, bottom: string): void;
	rect(x: number, y: number, w: number, h: number, color: string, alpha: number): void;
	stamp(sheet: Sheet, cell: number, x: number, y: number, scale: number, alpha: number, flip: boolean): void;
}

export type SkyScene = { sky: Sky; stars: readonly Star[] };
export type WorldScene = {
	camera: Camera;
	view: View;
	now: number; // the camera's clock
	clock: number; // the clouds' clock
	ground: readonly Block[]; // the island, always drawn
	laid: readonly Block[]; // the castle so far, in laying order
	ghost: Block | null; // the next block, drawn faint
	him: { x: number; look: Look };
};
export const GHOST_ALPHA = 0.3;

export function drawSky(p: Painter, s: SkyScene): void {
	p.gradient(hslCss(s.sky.top), hslCss(s.sky.bottom));
	if (s.sky.stars <= 0) return;
	for (const star of s.stars) {
		const size = star.big ? 2 : 1;
		p.rect(Math.round(star.fx * p.w), Math.round(star.fy * p.h), size, size, PALETTE.p, s.sky.stars * (star.big ? 1 : 0.7));
	}
}

export function drawWorld(p: Painter, s: WorldScene): void {
	p.clear();
	const z = zoomAt(s.camera, s.now);
	const size = TILE * z;
	const seen = (x: number, y: number, w: number, h: number) => x + w > 0 && y + h > 0 && x < p.w && y < p.h;
	const tile = (id: TileId, wx: number, wy: number, alpha: number, parallax = 1) => {
		const at = toScreen(s.camera, s.view, s.now, wx, wy, parallax);
		if (seen(at.x, at.y, size, size)) p.stamp("tiles", tileIndex(id), at.x, at.y, z, alpha, false);
	};
	// 1. clouds: the far layer, then the near one, each with its parallax. cloud-m's top row is empty, so a cloud-top
	// above it sits one pixel lower to close the gap.
	for (const layer of [0, 1] as const) {
		for (const c of CLOUDS) {
			if (c.layer !== layer) continue;
			const x = cloudX(c, s.clock, WORLD_W * TILE);
			for (const part of c.parts) {
				const sink = part.tile === "cloud-top" ? 1 : 0;
				tile(part.tile, x + part.dx, c.y + part.dy + sink, 1, PARALLAX[layer]);
			}
		}
	}
	// 2. the island, 3. the castle so far, 4. the next block, faint
	for (const b of s.ground) tile(b.tile, b.x * TILE, b.y * TILE, 1);
	for (const b of s.laid) tile(b.tile, b.x * TILE, b.y * TILE, 1);
	if (s.ghost) tile(s.ghost.tile, s.ghost.x * TILE, s.ghost.y * TILE, GHOST_ALPHA);
	// 5. him, his feet on the island's top edge; 6. his face, never mirrored
	const at = toScreen(s.camera, s.view, s.now, s.him.x - FRAME_W / 2, GROUND_Y * TILE - FRAME_H);
	if (!seen(at.x, at.y, FRAME_W * z, FRAME_H * z)) return;
	p.stamp("sprite", frameIndex(s.him.look.frame), at.x, at.y, z, 1, s.him.look.flip);
	if (s.him.look.face) p.stamp("faces", faceCell(s.him.look.face, s.him.look.gaze), at.x + FACE_AT.x * z, at.y + FACE_AT.y * z, z, 1, false);
}
