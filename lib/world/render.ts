// The village renderer (spec 2). It draws onto a Painter, so the same code draws to a canvas in the browser
// (canvas-painter.ts) and to plain pixels in the tests (pixel-painter.ts). Drawing order is in drawWorld.
import type { Look } from "./actor";
import { CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS, FAR_PARALLAX } from "./backdrop";
import { START_X } from "./blueprints";
import { GROUND_Y, TILE, type Block } from "./blueprints/types";
import { toScreen, zoomAt, type Camera, type View } from "./camera";
import { FACE_AT, FACE_CELLS, FACE_H, FACE_W, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex } from "./osmo-sprite";
import { PALETTE } from "./palette";
import { colours, rasterize, type Bitmap, type Colours, type Grid } from "./raster";
import { CLOUD_SPAN, CLOUDS, cloudX, hslCss, PARALLAX, SKY_STOPS, skyHslAt, type Sky, type Star } from "./sky";
import { TILE_IDS, TILES, tileIndex, type TileId } from "./tiles";

export type Sheet = "tiles" | "sprite" | "faces" | "clouds";
export const CELL: Readonly<Record<Sheet, { w: number; h: number }>> = {
	tiles: { w: TILE, h: TILE },
	sprite: { w: FRAME_W, h: FRAME_H },
	faces: { w: FACE_W, h: FACE_H },
	clouds: CLOUD_CELL,
};
export type Art = { grids: Readonly<Record<Sheet, readonly Grid[]>>; colours: Colours };
// The drawn art with his scarf in the mood's first aura colour; dark (0 by day, 1 at night) grades it toward night.
export function artFor(scarf: string, dark = 0): Art {
	return {
		grids: { tiles: TILE_IDS.map((id) => TILES[id]), sprite: FRAME_NAMES.map((n) => FRAMES[n]), faces: FACE_CELLS, clouds: CLOUD_GRIDS },
		colours: colours({ Z: scarf }, dark),
	};
}
export const sheetBitmap = (art: Art, sheet: Sheet, scale: number): Bitmap =>
	rasterize(art.grids[sheet], CELL[sheet].w, CELL[sheet].h, scale, art.colours);

// What the renderer draws with. Coordinates are whole canvas pixels; stamp draws cell `cell` of a sheet at `scale`
// with its top-left at (x, y), mirrored left to right when flip is set. gradient fills the canvas top to bottom through
// its stops (a share of the height, a colour); glow adds a warm light that falls off from (x, y) to radius r.
export type Stop = readonly [at: number, color: string];
export interface Painter {
	readonly w: number;
	readonly h: number;
	clear(): void;
	gradient(stops: readonly Stop[]): void;
	rect(x: number, y: number, w: number, h: number, color: string, alpha: number): void;
	stamp(sheet: Sheet, cell: number, x: number, y: number, scale: number, alpha: number, flip: boolean): void;
	glow(x: number, y: number, r: number, color: string, alpha: number): void;
}
// The glow's falloff, shared by both painters: its strength at a share of the radius out from the centre.
export const GLOW_STOPS: readonly (readonly [at: number, strength: number])[] = [[0, 1], [0.25, 0.55], [0.6, 0.18], [1, 0]];

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
	sky?: Sky; // when given, the far islands are drawn, tinted from it
	dark?: number; // 0 by day to 1 at night: lit windows and the lamps' glow (the art itself is graded by artFor)
};
export const GHOST_ALPHA = 0.3;
export const CLOUD_ALPHA = [0.72, 1] as const; // far, near
export const CLOUD_NIGHT_FADE = 0.6; // at night the clouds are this much fainter, so the stars come through
export const LIT_FROM = 0.5; // windows are lit from this dark on
const LIT: Partial<Record<TileId, TileId>> = { window: "window-lit", "window-top": "window-top-lit" };
// Where a lamp's light sits in its tile (px) and how far it reaches (world px).
const LIGHTS: Partial<Record<TileId, { x: number; y: number; r: number; strength: number }>> = {
	lantern: { x: 8.5, y: 9.5, r: 40, strength: 0.42 },
	"window-lit": { x: 8, y: 2, r: 30, strength: 0.3 },
};

export function drawSky(p: Painter, s: SkyScene): void {
	p.gradient([
		[0, hslCss(s.sky.top)],
		[SKY_STOPS.mid, hslCss(s.sky.mid)],
		[SKY_STOPS.horizon, hslCss(s.sky.bottom)],
		[1, hslCss(s.sky.bottom)],
	]);
	if (s.sky.stars <= 0) return;
	for (const star of s.stars) {
		const size = star.big ? 2 : 1;
		p.rect(Math.round(star.fx * p.w), Math.round(star.fy * p.h), size, size, PALETTE.p, s.sky.stars * (star.big ? 1 : 0.7));
	}
}

// The far islands' three tones from the sky at their height: a body a little darker than the sky behind it, a rim lit
// like snow, and an underside fading back into the haze.
export function hazeTones(sky: Sky, at: number): [string, string, string] {
	const [h, sat, l] = skyHslAt(sky, at);
	const tone = (k: number, dl: number): string => hslCss([Math.round(h), Math.round(sat * 0.75), Math.max(2, Math.round(l * k + dl))]);
	return [tone(0.88, -1), tone(1.12, 2), tone(0.96, 0)];
}

export function drawWorld(p: Painter, s: WorldScene): void {
	p.clear();
	const z = zoomAt(s.camera, s.now);
	const size = TILE * z;
	const dark = s.dark ?? 0;
	const seen = (x: number, y: number, w: number, h: number) => x + w > 0 && y + h > 0 && x < p.w && y < p.h;
	const tile = (id: TileId, wx: number, wy: number, alpha: number, parallax = 1) => {
		const at = toScreen(s.camera, s.view, s.now, wx, wy, parallax);
		if (seen(at.x, at.y, size, size)) p.stamp("tiles", tileIndex(id), at.x, at.y, z, alpha, false);
	};
	const ground = toScreen(s.camera, s.view, s.now, 0, GROUND_Y * TILE);
	// 1. the far islands, in haze, barely moving with the camera
	if (s.sky) {
		// Drawn a scale smaller than the island when zoomed in or on a phone, so they stay far away.
		const fz = Math.max(1, z - 1);
		const shift = (START_X - s.camera.x) * FAR_PARALLAX * fz;
		for (const f of FAR_ISLANDS) {
			const ox = Math.round(f.fx * s.view.w + shift - (f.w * fz) / 2);
			const oy = ground.y - f.lift * fz;
			const tones = hazeTones(s.sky, s.view.h > 0 ? (oy + 20 * fz) / s.view.h : 0);
			for (const [y, x0, x1, t] of f.runs) p.rect(ox + x0 * fz, oy + y * fz, (x1 - x0) * fz, fz, tones[t], 1);
		}
	}
	// 2. clouds: the far layer, fainter, then the near one, each with its parallax, each cloud drawn again a span over
	// wherever the view reaches
	const cw = CLOUD_CELL.w * z;
	const ch = CLOUD_CELL.h * z;
	for (const layer of [0, 1] as const) {
		const left = s.camera.x * PARALLAX[layer] - s.view.w / 2 / z;
		const right = left + s.view.w / z;
		for (const c of CLOUDS) {
			if (c.layer !== layer) continue;
			const shape = CLOUD_SHAPES[c.shape];
			const x = cloudX(c, s.clock);
			for (let k = Math.floor((left - x - shape.x1) / CLOUD_SPAN) + 1; x + k * CLOUD_SPAN + shape.x0 < right; k++) {
				const at = toScreen(s.camera, s.view, s.now, x + k * CLOUD_SPAN, c.y, PARALLAX[layer]);
				if (seen(at.x, at.y, cw, ch)) p.stamp("clouds", c.shape, at.x, at.y, z, CLOUD_ALPHA[layer] * (1 - CLOUD_NIGHT_FADE * dark), false);
			}
		}
	}
	// 3. the island, 4. the castle so far (its windows lit after dark), 5. the next block, faint
	const lit = (id: TileId) => (dark >= LIT_FROM ? (LIT[id] ?? id) : id);
	for (const b of s.ground) tile(b.tile, b.x * TILE, b.y * TILE, 1);
	for (const b of s.laid) tile(lit(b.tile), b.x * TILE, b.y * TILE, 1);
	if (s.ghost) tile(s.ghost.tile, s.ghost.x * TILE, s.ghost.y * TILE, GHOST_ALPHA);
	// 6. him, his feet on the island's top edge; 7. his face, never mirrored
	const at = toScreen(s.camera, s.view, s.now, s.him.x - FRAME_W / 2, GROUND_Y * TILE - FRAME_H);
	if (seen(at.x, at.y, FRAME_W * z, FRAME_H * z)) {
		p.stamp("sprite", frameIndex(s.him.look.frame), at.x, at.y, z, 1, s.him.look.flip);
		if (s.him.look.face) p.stamp("faces", faceCell(s.him.look.face, s.him.look.gaze), at.x + FACE_AT.x * z, at.y + FACE_AT.y * z, z, 1, false);
	}
	// 8. after dark, the warm light of each lamp and lit window falls on what is round it
	if (dark <= 0) return;
	for (const b of [...s.ground, ...s.laid]) {
		const light = LIGHTS[lit(b.tile)];
		if (!light) continue;
		const c = toScreen(s.camera, s.view, s.now, b.x * TILE + light.x, b.y * TILE + light.y);
		const r = light.r * z;
		if (seen(c.x - r, c.y - r, 2 * r, 2 * r)) p.glow(c.x, c.y, r, PALETTE.t, light.strength * dark);
	}
}
