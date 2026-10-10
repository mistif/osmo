// The village renderer (spec 2). It draws onto a Painter, so the same code draws to a canvas in the browser
// (canvas-painter.ts) and to plain pixels in the tests (pixel-painter.ts). Drawing order is in drawWorld.
import type { Look } from "./actor";
import { CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS, FAR_PARALLAX, HILLS } from "./backdrop";
import { START_X } from "./blueprints";
import { GROUND_Y, TILE, type Block } from "./blueprints/types";
import { toScreen, zoomAt, type Camera, type View } from "./camera";
import { FACE_AT, FACE_CELLS, FACE_H, FACE_W, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex } from "./osmo-sprite";
import { PALETTE } from "./palette";
import { colours, rasterize, type Bitmap, type Colours, type Grid } from "./raster";
import { CLOUD_SPAN, CLOUDS, cloudX, hslCss, PARALLAX, SKY_STOPS, skyHslAt, twinkle, type Sky, type Star } from "./sky";
import { forgeBreath, litOf, poolsOf, SHADOW_ALPHA, SHADOW_COLOR, shadowed, variantOf } from "./texture";
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
// with its top-left at (x, y), mirrored left to right when flip is set; given w and h it fills that box instead, pixel
// for pixel from the cell at `scale` (nearest neighbour: how the world is drawn while the camera eases between two
// scales). gradient fills the canvas top to bottom through its stops (a share of the height, a colour); glow adds a
// warm light that falls off from (x, y) to radius r; pool is the same light squashed into an ellipse rx wide and ry
// tall (the light a lamp spills on the ground).
export type Stop = readonly [at: number, color: string];
export interface Painter {
	readonly w: number;
	readonly h: number;
	clear(): void;
	gradient(stops: readonly Stop[]): void;
	rect(x: number, y: number, w: number, h: number, color: string, alpha: number): void;
	stamp(sheet: Sheet, cell: number, x: number, y: number, scale: number, alpha: number, flip: boolean, w?: number, h?: number): void;
	glow(x: number, y: number, r: number, color: string, alpha: number): void;
	pool(x: number, y: number, rx: number, ry: number, color: string, alpha: number): void;
}
// The glow's falloff, shared by both painters: its strength at a share of the radius out from the centre.
export const GLOW_STOPS: readonly (readonly [at: number, strength: number])[] = [[0, 1], [0.25, 0.55], [0.6, 0.18], [1, 0]];

// tick: the slow tick's number (pace.ts SLOW_MS), for the stars that twinkle (sky.ts twinkle); none: all steady.
export type SkyScene = { sky: Sky; stars: readonly Star[]; tick?: number };
export type WorldScene = {
	camera: Camera;
	view: View;
	now: number; // the camera's clock
	clock: number; // the clouds' clock
	ground: readonly Block[]; // the island, always drawn
	laid: readonly Block[]; // the castle so far, in laying order
	ghost: Block | null; // the next block, drawn faint
	outline?: readonly Block[]; // phase 2: the rest of every open room, drawn fainter still (spec 5)
	him: { x: number; look: Look };
	sky?: Sky; // when given, the far islands are drawn, tinted from it
	dark?: number; // 0 by day to 1 at night: lit windows and the lamps' glow (the art itself is graded by artFor)
};
export const GHOST_ALPHA = 0.3;
export const OUTLINE_ALPHA = 0.12;
export const CLOUD_ALPHA = [0.72, 1] as const; // far, near
export const CLOUD_NIGHT_FADE = 0.6; // at night the clouds are this much fainter, so the stars come through
export { LIT_FROM } from "./texture"; // windows, bookcases and the dome are lit from this dark on (texture.ts litOf)
// Where a lamp's light sits in its tile (px) and how far it reaches (world px).
const LIGHTS: Partial<Record<TileId, { x: number; y: number; r: number; strength: number }>> = {
	lantern: { x: 8.5, y: 9.5, r: 40, strength: 0.42 },
	"window-lit": { x: 8, y: 2, r: 30, strength: 0.3 },
	forge: { x: 8, y: 11, r: 44, strength: 0.5 },
	"shelf-window-lit": { x: 8, y: 8, r: 28, strength: 0.26 },
	"dome-lit": { x: 8, y: 8, r: 34, strength: 0.1 }, // fifteen panes, their glows overlapping: each faint
};
// The haze band at the horizon (polish pass): it lies over the hills' foot, rising from nothing HAZE.from world px
// below their top line to HAZE.alpha at HAZE.peak, holding to HAZE.hold (the hills reach at least that deep, so their
// foot is lost in it) and fading out by HAZE.to, in the sky's horizon colour a little lighter.
export const HAZE = { from: 8, peak: 60, hold: 119, to: 172, alpha: 0.92, lift: 6 } as const;

export function drawSky(p: Painter, s: SkyScene): void {
	p.gradient([
		[0, hslCss(s.sky.top)],
		[SKY_STOPS.mid, hslCss(s.sky.mid)],
		[SKY_STOPS.horizon, hslCss(s.sky.bottom)],
		[1, hslCss(s.sky.bottom)],
	]);
	if (s.sky.stars <= 0) return;
	s.stars.forEach((star, i) => {
		const size = star.big ? 2 : 1;
		const shine = s.tick === undefined ? 1 : twinkle(i, s.tick);
		p.rect(Math.round(star.fx * p.w), Math.round(star.fy * p.h), size, size, PALETTE.p, s.sky.stars * (star.big ? 1 : 0.7) * shine);
	});
}

// The far islands' three tones from the sky at their height: a body a little darker than the sky behind it, a rim lit
// like snow, and an underside fading back into the haze.
export function hazeTones(sky: Sky, at: number): [string, string, string] {
	const [h, sat, l] = skyHslAt(sky, at);
	const tone = (k: number, dl: number): string => hslCss([Math.round(h), Math.round(sat * 0.75), Math.max(2, Math.round(l * k + dl))]);
	return [tone(0.88, -1), tone(1.12, 2), tone(0.96, 0)];
}
// The hills' tones (polish pass): nearer than the far islands, so darker and a little more coloured, with the same
// lit rim and hazy foot.
export function hillTones(sky: Sky, at: number): [string, string, string] {
	const [h, sat, l] = skyHslAt(sky, at);
	const tone = (k: number, dl: number): string => hslCss([Math.round(h), Math.round(sat * 0.85), Math.max(2, Math.round(l * k + dl))]);
	return [tone(0.74, -2), tone(1.02, 1), tone(0.86, 0)];
}

export function drawWorld(p: Painter, s: WorldScene): void {
	p.clear();
	// The zoom: a whole scale at rest, between two while the camera eases (polish pass). Every cell is then drawn from
	// the next whole scale's atlas into the box between the screen points of its two corners, so neighbours meet with
	// no gap and no overlap at any zoom; at a whole scale the box is the cell's own size and nothing changes.
	const z = zoomAt(s.camera, s.now);
	const zs = Math.max(1, Math.ceil(z - 1e-9));
	const dark = s.dark ?? 0;
	const seen = (x: number, y: number, w: number, h: number) => x + w > 0 && y + h > 0 && x < p.w && y < p.h;
	const put = (sheet: Sheet, cell: number, wx: number, wy: number, cw: number, ch: number, alpha: number, flip = false, parallax = 1) => {
		const a = toScreen(s.camera, s.view, s.now, wx, wy, parallax);
		const b = toScreen(s.camera, s.view, s.now, wx + cw, wy + ch, parallax);
		if (seen(a.x, a.y, b.x - a.x, b.y - a.y)) p.stamp(sheet, cell, a.x, a.y, zs, alpha, flip, b.x - a.x, b.y - a.y);
	};
	const tile = (id: TileId, wx: number, wy: number, alpha: number) => put("tiles", tileIndex(id), wx, wy, TILE, TILE, alpha);
	const ground = toScreen(s.camera, s.view, s.now, 0, GROUND_Y * TILE);
	// 1. the far islands, in haze, barely moving with the camera
	if (s.sky) {
		// Drawn a scale smaller than the island when zoomed in or on a phone, so they stay far away.
		const fz = Math.max(1, z - 1);
		const shift = (START_X - s.camera.x) * FAR_PARALLAX * fz;
		for (const f of FAR_ISLANDS) {
			const ox = f.fx * s.view.w + shift - (f.w * fz) / 2;
			const oy = ground.y - f.lift * fz;
			const tones = hazeTones(s.sky, s.view.h > 0 ? (oy + 20 * fz) / s.view.h : 0);
			for (const [y, x0, x1, t] of f.runs) {
				const left = Math.round(ox + x0 * fz);
				const top = Math.round(oy + y * fz);
				p.rect(left, top, Math.round(ox + x1 * fz) - left, Math.round(oy + (y + 1) * fz) - top, tones[t], 1);
			}
		}
		// 1b. the hills (polish pass): nearer and lower than the far islands, repeating across the view, then the haze
		// band over their foot
		const htop = ground.y + HILLS.drop * fz;
		const hTones = hillTones(s.sky, s.view.h > 0 ? (htop + 12 * fz) / s.view.h : 0);
		const period = HILLS.w * fz;
		const hshift = (START_X - s.camera.x) * HILLS.parallax * fz;
		if (period > 0) {
			for (let ox = (((hshift % period) + period) % period) - period; ox < s.view.w; ox += period) {
				for (const [y, x0, x1, t] of HILLS.runs) {
					const left = Math.round(ox + x0 * fz);
					const top = Math.round(htop + y * fz);
					p.rect(left, top, Math.round(ox + x1 * fz) - left, Math.round(htop + (y + 1) * fz) - top, hTones[t], 1);
				}
			}
		}
		const [hh, hs, hl] = skyHslAt(s.sky, 1);
		const hazeColor = hslCss([Math.round(hh), Math.round(hs), Math.min(100, Math.round(hl + HAZE.lift))]);
		for (let y = HAZE.from; y < HAZE.to; y++) {
			const k = y < HAZE.peak ? (y - HAZE.from) / (HAZE.peak - HAZE.from) : y < HAZE.hold ? 1 : (HAZE.to - y) / (HAZE.to - HAZE.hold);
			const top = Math.round(htop + y * fz);
			p.rect(0, top, s.view.w, Math.round(htop + (y + 1) * fz) - top, hazeColor, HAZE.alpha * k);
		}
	}
	// 2. clouds: the far layer, fainter, then the near one, each with its parallax, each cloud drawn again a span over
	// wherever the view reaches
	for (const layer of [0, 1] as const) {
		const left = s.camera.x * PARALLAX[layer] - s.view.w / 2 / z;
		const right = left + s.view.w / z;
		for (const c of CLOUDS) {
			if (c.layer !== layer) continue;
			const shape = CLOUD_SHAPES[c.shape];
			const x = cloudX(c, s.clock);
			for (let k = Math.floor((left - x - shape.x1) / CLOUD_SPAN) + 1; x + k * CLOUD_SPAN + shape.x0 < right; k++) {
				const alpha = CLOUD_ALPHA[layer] * (1 - CLOUD_NIGHT_FADE * dark);
				put("clouds", c.shape, x + k * CLOUD_SPAN, c.y, CLOUD_CELL.w, CLOUD_CELL.h, alpha, false, PARALLAX[layer]);
			}
		}
	}
	// 3. the island, 4. the castle so far (its windows lit after dark) with a row of shadow under each eave and sill,
	// 5. the outline of what is still to come in each open room, then the next block, both faint. Brick, stone and
	// snow show one of their variants by the cell (texture.ts), the blocks themselves unchanged.
	const lit = (id: TileId) => litOf(id, dark);
	const block = (b: Block, alpha: number) => tile(variantOf(lit(b.tile), b.x, b.y), b.x * TILE, b.y * TILE, alpha);
	for (const b of s.ground) block(b, 1);
	for (const b of s.laid) block(b, 1);
	for (const b of shadowed(s.laid)) {
		const a = toScreen(s.camera, s.view, s.now, b.x * TILE, b.y * TILE);
		const c = toScreen(s.camera, s.view, s.now, (b.x + 1) * TILE, b.y * TILE + 1);
		if (seen(a.x, a.y, c.x - a.x, c.y - a.y)) p.rect(a.x, a.y, c.x - a.x, c.y - a.y, SHADOW_COLOR, SHADOW_ALPHA);
	}
	for (const b of s.outline ?? []) block(b, OUTLINE_ALPHA);
	if (s.ghost) block(s.ghost, GHOST_ALPHA);
	// 5b. after dark, each lantern and door spills a soft ellipse of warm light on the ground under it
	if (dark > 0) {
		for (const pool of poolsOf([...s.ground, ...s.laid])) {
			const c = toScreen(s.camera, s.view, s.now, pool.x, pool.y);
			const rx = pool.rx * z;
			const ry = pool.ry * z;
			if (seen(c.x - rx, c.y - ry, 2 * rx, 2 * ry)) p.pool(c.x, c.y, rx, ry, PALETTE.t, pool.strength * dark);
		}
	}
	// 6. him, his feet on the island's top edge; 7. his face, never mirrored
	const hx = s.him.x - FRAME_W / 2; // his sprite's top-left, world px
	const hy = GROUND_Y * TILE - FRAME_H;
	put("sprite", frameIndex(s.him.look.frame), hx, hy, FRAME_W, FRAME_H, 1, s.him.look.flip);
	if (s.him.look.face) put("faces", faceCell(s.him.look.face, s.him.look.gaze), hx + FACE_AT.x, hy + FACE_AT.y, FACE_W, FACE_H, 1);
	// 8. after dark, the warm light of each lamp and lit window falls on what is round it
	if (dark <= 0) return;
	for (const b of [...s.ground, ...s.laid]) {
		const light = LIGHTS[lit(b.tile)];
		if (!light) continue;
		const c = toScreen(s.camera, s.view, s.now, b.x * TILE + light.x, b.y * TILE + light.y);
		const r = light.r * z;
		const strength = light.strength * (b.tile === "forge" ? forgeBreath(s.now) : 1);
		if (seen(c.x - r, c.y - r, 2 * r, 2 * r)) p.glow(c.x, c.y, r, PALETTE.t, strength * dark);
	}
}
