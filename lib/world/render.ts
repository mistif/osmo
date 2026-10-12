// The village renderer (spec 2). It draws onto a Painter, so the same code draws to a canvas in the browser
// (canvas-painter.ts) and to plain pixels in the tests (pixel-painter.ts). Drawing order is in drawWorld.
import type { Look } from "./actor";
import { BIRD_CELL, BIRD_GRIDS, CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS, FAR_PARALLAX, HILLS, type Shape } from "./backdrop";
import { START_X } from "./blueprints";
import { GROUND_Y, TILE, type Block } from "./blueprints/types";
import { toScreen, zoomAt, type Camera, type View } from "./camera";
import { bucket, chunkKey, chunkRange, type Bucket } from "./chunks";
import { landShape, landTones } from "./far-view";
import type { Life } from "./life";
import { lodOf } from "./lod";
import { BALLOON_BASKET, BALLOON_ENVELOPE, BALLOON_ROPES } from "./map/home";
import { CHUNK } from "./map/types";
import {
	blinkCell, FACE_AT, FACE_CELLS, FACE_H, FACE_W, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex, TRAIL_AT, TRAIL_CELLS, TRAIL_H,
	TRAIL_W,
} from "./osmo-sprite";
import { PALETTE } from "./palette";
import { colours, nightColour, parseColor, rasterize, type Bitmap, type Colours, type Grid } from "./raster";
import { CLOUD_SPAN, CLOUDS, cloudX, hslCss, PARALLAX, SKY_STOPS, skyHslAt, twinkle, type Sky, type Star } from "./sky";
import { forgeBreath, LIT_FROM, litOf, poolsOf, SHADOW_ALPHA, SHADOW_COLOR, shadowed, variantOf, type Pool } from "./texture";
import { TILE_IDS, TILES, tileIndex, type TileId } from "./tiles";

export type Sheet = "tiles" | "sprite" | "faces" | "clouds" | "trail" | "birds";
export const CELL: Readonly<Record<Sheet, { w: number; h: number }>> = {
	tiles: { w: TILE, h: TILE },
	sprite: { w: FRAME_W, h: FRAME_H },
	faces: { w: FACE_W, h: FACE_H },
	clouds: CLOUD_CELL,
	trail: { w: TRAIL_W, h: TRAIL_H },
	birds: BIRD_CELL,
};
export type Art = { grids: Readonly<Record<Sheet, readonly Grid[]>>; colours: Colours };
// The drawn art with his scarf in the mood's first aura colour; dark (0 by day, 1 at night) grades it toward night.
export function artFor(scarf: string, dark = 0): Art {
	return {
		grids: {
			tiles: TILE_IDS.map((id) => TILES[id]), sprite: FRAME_NAMES.map((n) => FRAMES[n]), faces: FACE_CELLS, clouds: CLOUD_GRIDS,
			trail: TRAIL_CELLS, birds: BIRD_GRIDS,
		},
		colours: colours({ Z: scarf }, dark),
	};
}
export const sheetBitmap = (art: Art, sheet: Sheet, scale: number): Bitmap =>
	rasterize(art.grids[sheet], CELL[sheet].w, CELL[sheet].h, scale, art.colours);

// A silhouette (backdrop.ts Shape) as a bitmap at scale 1 in its tones, row 0 at shape.top, its tone-3 runs dithered
// pixel by pixel. The painters keep it per shape and tones (shapeCache), so a frame draws each far island and each
// period of the hills with one call, however many runs they have (review B1: the hills were 27,000 rects a period).
export function shapeBitmap(shape: Shape, tones: readonly string[]): Bitmap {
	const w = Math.max(0, shape.w);
	const h = Math.max(0, shape.bottom - shape.top);
	const data = new Uint8ClampedArray(w * h * 4);
	const cs = tones.map((t) => parseColor(t));
	for (const [y, x0, x1, t] of shape.runs) {
		if (y < shape.top || y >= shape.bottom) continue;
		const row = (y - shape.top) * w;
		for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
			const c = cs[t === 3 ? ((x + y) % 2 === 0 ? 2 : 0) : t];
			if (!c) continue;
			const o = (row + x) * 4;
			data[o] = c[0];
			data[o + 1] = c[1];
			data[o + 2] = c[2];
			data[o + 3] = 255;
		}
	}
	return { w, h, data };
}
// What a painter keeps per shape: up to SHAPE_KEEP sets of tones (the tones change only when the sky's tint at that
// height does, a step at a time), each made once from shapeBitmap.
export const SHAPE_KEEP = 4;
export function shapeCache<T>(make: (bmp: Bitmap) => T): (shape: Shape, tones: readonly string[]) => T {
	const kept = new WeakMap<Shape, Map<string, T>>();
	return (shape, tones) => {
		const key = tones.join("|");
		let byTones = kept.get(shape);
		if (!byTones) {
			byTones = new Map();
			kept.set(shape, byTones);
		}
		const hit = byTones.get(key);
		if (hit !== undefined) return hit;
		const made = make(shapeBitmap(shape, tones));
		const oldest = byTones.keys().next();
		if (byTones.size >= SHAPE_KEEP && !oldest.done) byTones.delete(oldest.value);
		byTones.set(key, made);
		return made;
	};
}

// What the renderer draws with. Coordinates are whole canvas pixels; stamp draws cell `cell` of a sheet at `scale`
// with its top-left at (x, y), mirrored left to right when flip is set; given w and h it fills that box instead, pixel
// for pixel from the cell at `scale` (nearest neighbour: how the world is drawn while the camera eases between two
// scales). gradient fills the canvas top to bottom through its stops (a share of the height, a colour); glow adds a
// warm light that falls off from (x, y) to radius r; pool is the same light squashed into an ellipse rx wide and ry
// tall (the light a lamp spills on the ground); shape draws a silhouette (backdrop.ts) opaque into the box (x, y, w, h)
// from its bitmap at scale 1 (shapeBitmap), nearest neighbour, so at a whole scale every run lands where its own rect
// would.
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
	shape(shape: Shape, tones: readonly string[], x: number, y: number, w: number, h: number): void;
	// A chunk of the world as a bitmap at scale 1 (CHUNK_PX square), kept by key: baked by bake when the painter has none
	// for this key at this version (only when mayBake, true when left out), then drawn into the box, nearest neighbour.
	// "missing": not kept at this version and not baked now; nothing drawn. The bitmaps live in a chunkCache of chunkKeep.
	chunk(key: string, version: string, bake: (p: Painter) => void, x: number, y: number, w: number, h: number, mayBake?: boolean): "kept" | "baked" | "missing";
	readonly chunkKeep?: number;
	release?(): void;
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
	him: { x: number; y?: number; look: Look }; // his feet, world px; y: the small world's snow row when left out
	sky?: Sky; // when given, the far islands are drawn, tinted from it
	dark?: number; // 0 by day to 1 at night: lit windows and the lamps' glow (the art itself is graded by artFor)
	life?: Life; // polish pass: snow, birds, smoke, a landing's dust and pop (life.ts); none when left out
	// The big world (free-will spec 3.3); each left out, the small world is drawn exactly as before.
	anchor?: { x: number; groundY: number }; // where the far islands and the hills hang, world px: START_X and the snow row
	dpr?: number; // the canvas's device pixel ratio (lod.ts deviceRatio): the level of detail goes by the zoom over it
	balloon?: { x: number; y: number } | null; // the bottom centre of its basket, world px
	lights?: readonly { x: number; y: number }[]; // world px, one per finished build: the far view's lights at night
	stampCap?: number; // the tiles level stamps at most this many ground blocks in view (GROUND_STAMP_CAP): past it, chunk bitmaps
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
// The life's colours (polish pass): smoke a pale grey, dust a pale mortar (the stone's own light is lost against the
// wall it falls past), both graded toward night with the art; snow the snow's highlight, never graded (it catches
// what light there is).
const SMOKE = "#c4c8d0";
const DUST = "#ddd6c8";
// A smoke puff is drawn PUFF.grow times its radius, so the puffs of one plume run together, as a disc at PUFF.rim of
// its alpha with a denser core (PUFF.core of the radius, a little above the centre) over it: soft, not a flat coin.
const PUFF = { grow: 1.3, rim: 0.6, core: 0.6, lift: 0.2 } as const;
// A flake is its square at full alpha with a softer cross of SNOW_HALO round it, so it reads as a soft flake and not
// as one more hard star.
const SNOW_HALO = 0.35;
const graded = (hex: string, dark: number): string => {
	const c = parseColor(hex);
	if (!c || dark <= 0) return hex;
	const [r, g, b] = nightColour(c, dark);
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
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

// The shadow rows and the pools of light depend only on the blocks, so they are worked out once per list of blocks
// (the world keeps its lists until the village changes) instead of every frame (review M3).
const SHADOWS = new WeakMap<readonly Block[], readonly Block[]>();
function keep<T>(cache: WeakMap<readonly Block[], T>, blocks: readonly Block[], make: (blocks: readonly Block[]) => T): T {
	const hit = cache.get(blocks);
	if (hit !== undefined) return hit;
	const made = make(blocks);
	cache.set(blocks, made);
	return made;
}
const NONE: readonly Block[] = [];

// What an island's top is made of, for the floor a lamp's pool lies on: its snow, path and rock, and the dock's boards.
// What stands on it (trees, bushes, a sign, a fence) is not floor: the castle stands over the island's pines, and its
// pools stay on the snow.
const FLOOR_TILES: ReadonlySet<TileId> = new Set<TileId>([
	"snow", "snow-edge-l", "snow-edge-r", "path", "stone", "stone-dark", "stone-edge-l", "stone-edge-r", "stone-bottom", "stone-under-l",
	"stone-under-r", "bridge-board",
]);
// Each column's floor rows, top first, once per ground list.
const FLOORS = new WeakMap<readonly Block[], ReadonlyMap<number, readonly number[]>>();
// The world px y of the floor under a block: the top edge of the first floor row at or below it in its column, or the
// block's own foot over open sky. In the small world that is the snow row under every lamp, as it always was.
function floorOf(ground: readonly Block[]): (b: Block) => number {
	let cols = FLOORS.get(ground);
	if (!cols) {
		const m = new Map<number, number[]>();
		for (const g of ground) {
			if (!FLOOR_TILES.has(g.tile)) continue;
			const rows = m.get(g.x);
			if (rows) rows.push(g.y);
			else m.set(g.x, [g.y]);
		}
		for (const rows of m.values()) rows.sort((a, b) => a - b);
		cols = m;
		FLOORS.set(ground, m);
	}
	const byCol = cols;
	return (b) => (byCol.get(b.x)?.find((y) => y >= b.y) ?? b.y + 1) * TILE;
}
// The pools of light a list spills on a ground, once per pair of lists.
const POOLS = new WeakMap<readonly Block[], WeakMap<readonly Block[], readonly Pool[]>>();
function poolsOn(list: readonly Block[], ground: readonly Block[]): readonly Pool[] {
	let byGround = POOLS.get(list);
	if (!byGround) {
		byGround = new WeakMap();
		POOLS.set(list, byGround);
	}
	const hit = byGround.get(ground);
	if (hit) return hit;
	const made = poolsOf(list, floorOf(ground));
	byGround.set(ground, made);
	return made;
}

// Drawing at scale (free-will spec 3.3). The level of detail goes by the CSS zoom (the canvas zoom over the device pixel
// ratio, lod.ts): stamped tiles from 1, chunk bitmaps at 1/2 and 1/4, one silhouette below. No atlas is built at a
// scale above ATLAS_MAX (ruling 15): nearer zooms draw from it into the box, nearest neighbour, as the easing frames
// do, so at canvas zoom 4 and below nothing changes. A frame bakes at most BAKE_BUDGET chunk bitmaps; drawWorld says
// how many it left undrawn (pending), and the loop asks for another frame while any are.
export const ATLAS_MAX = 4;
export const BAKE_BUDGET = 4;
export const GROUND_STAMP_CAP = 1500; // ground blocks in view the tiles level stamps at most (ruling 8)
const CHUNK_SPAN = CHUNK * TILE; // a chunk's side, world px
const MARK = { outer: 5, inner: 3, lift: 16 }; // his mark below 1/2: CSS px squares, centred this many world px above his feet
const LIGHT_PX = 2; // a finished build's light in the far view, CSS px

// What each painter keeps, as the renderer has seen it: chunk key to version, least recently drawn first, at most its
// chunkKeep. It follows the painter's own chunkCache (the same LRU, fed the same calls), so a frame knows before it
// draws whether a chunk will be missing and lays the silhouette under the chunks first. A chunk thought kept that the
// painter says is missing (a painter released and drawn with again) is put right then and drawn the frame after.
const KEPT_BY = new WeakMap<Painter, Map<string, string>>();
function keptBy(p: Painter): Map<string, string> {
	let m = KEPT_BY.get(p);
	if (!m) {
		m = new Map();
		KEPT_BY.set(p, m);
	}
	return m;
}
function noteChunk(kept: Map<string, string>, limit: number, key: string, version: string, got: "kept" | "baked" | "missing"): void {
	if (got === "missing") {
		if (kept.get(key) === version) kept.delete(key);
		return;
	}
	if (!kept.has(key) && kept.size >= limit) {
		const oldest = kept.keys().next();
		if (!oldest.done) kept.delete(oldest.value);
	}
	kept.delete(key);
	kept.set(key, version);
}

// One chunk's share of each list, and whether the ghost is in it.
type Cell = { cx: number; cy: number; d: number; g?: Bucket; l?: Bucket; sh?: Bucket; o?: Bucket; ghost: boolean };

export function drawWorld(p: Painter, s: WorldScene): { pending: number } {
	p.clear();
	// The zoom: a whole scale at rest, between two while the camera eases (polish pass). Every cell is then drawn from
	// the next whole scale's atlas (at most ATLAS_MAX) into the box between the screen points of its two corners, so
	// neighbours meet with no gap and no overlap at any zoom; at a whole scale up to 4 the box is the cell's own size.
	const z = zoomAt(s.camera, s.now);
	const zs = Math.min(ATLAS_MAX, Math.max(1, Math.ceil(z - 1e-9)));
	const dark = s.dark ?? 0;
	const dpr = s.dpr ?? 1;
	const lod = lodOf(z / dpr);
	const near = z / dpr >= 0.5 - 1e-9; // his sprite, the balloon and the life: from CSS zoom 1/2 on
	const anchor = s.anchor ?? { x: START_X, groundY: GROUND_Y * TILE };
	const feet = s.him.y ?? GROUND_Y * TILE;
	const seen = (x: number, y: number, w: number, h: number) => x + w > 0 && y + h > 0 && x < p.w && y < p.h;
	const put = (sheet: Sheet, cell: number, wx: number, wy: number, cw: number, ch: number, alpha: number, flip = false, parallax = 1) => {
		const a = toScreen(s.camera, s.view, s.now, wx, wy, parallax);
		const b = toScreen(s.camera, s.view, s.now, wx + cw, wy + ch, parallax);
		if (seen(a.x, a.y, b.x - a.x, b.y - a.y)) p.stamp(sheet, cell, a.x, a.y, zs, alpha, flip, b.x - a.x, b.y - a.y);
	};
	const tile = (id: TileId, wx: number, wy: number, alpha: number) => put("tiles", tileIndex(id), wx, wy, TILE, TILE, alpha);
	// World px to screen px as toScreen does (parallax 1), without an object for each corner: a smoke puff is a few
	// dozen of these rows a frame (review M3).
	const sx = (wx: number) => Math.round((wx - s.camera.x) * z + s.view.w / 2);
	const sy = (wy: number) => Math.round((wy - s.camera.y) * z + s.view.h / 2);
	const dot = (wx: number, wy: number, ww: number, wh: number, color: string, alpha: number) => {
		const ax = sx(wx);
		const ay = sy(wy);
		const cx = sx(wx + ww);
		const cy = sy(wy + wh);
		if (cx > ax && cy > ay && seen(ax, ay, cx - ax, cy - ay)) p.rect(ax, ay, cx - ax, cy - ay, color, alpha);
	};
	// A square of CSS px (so dpr canvas px on a side for each) centred on a world point.
	const square = (wx: number, wy: number, css: number, color: string, alpha: number) => {
		const size = css * dpr;
		const x = sx(wx) - Math.floor(size / 2);
		const y = sy(wy) - Math.floor(size / 2);
		if (seen(x, y, size, size)) p.rect(x, y, size, size, color, alpha);
	};
	// 1. the far islands, in haze, barely moving with the camera; hung on the anchor (the castle's ground), and drawn
	// only at the tiles level: below it the real world is the view (ruling 6)
	if (s.sky && lod === "tiles") {
		const ground = toScreen(s.camera, s.view, s.now, 0, anchor.groundY);
		// Drawn a scale smaller than the island when zoomed in or on a phone, so they stay far away.
		const fz = Math.max(1, z - 1);
		const shift = (anchor.x - s.camera.x) * FAR_PARALLAX * fz;
		// Each is one bitmap kept by the painter (review B1), drawn into the box its runs would cover.
		for (const f of FAR_ISLANDS) {
			const ox = f.fx * s.view.w + shift - (f.w * fz) / 2;
			const oy = ground.y - f.lift * fz;
			const left = Math.round(ox);
			const top = Math.round(oy + f.top * fz);
			const w = Math.round(ox + f.w * fz) - left;
			const h = Math.round(oy + f.bottom * fz) - top;
			if (seen(left, top, w, h)) p.shape(f, hazeTones(s.sky, s.view.h > 0 ? (oy + 20 * fz) / s.view.h : 0), left, top, w, h);
		}
		// 1b. the hills (polish pass): nearer and lower than the far islands, repeating across the view, then the haze
		// band over their foot. The small world only: in the big world they would draw home's horizon across a sky with
		// islands above and below it (the look pass), so there the far islands stand alone.
		if (!s.anchor) {
			const htop = ground.y + HILLS.drop * fz;
			const hTones = hillTones(s.sky, s.view.h > 0 ? (htop + 12 * fz) / s.view.h : 0);
			const period = HILLS.w * fz;
			const hshift = (anchor.x - s.camera.x) * HILLS.parallax * fz;
			if (period > 0) {
				// One draw of the kept bitmap per period across the view (two or three on a desktop), not one rect per run.
				const top = Math.round(htop + HILLS.top * fz);
				const h = Math.round(htop + HILLS.bottom * fz) - top;
				for (let ox = (((hshift % period) + period) % period) - period; ox < s.view.w; ox += period) {
					const left = Math.round(ox);
					const w = Math.round(ox + HILLS.w * fz) - left;
					if (seen(left, top, w, h)) p.shape(HILLS, hTones, left, top, w, h);
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
	}
	// 1c. birds crossing the sky by day (polish pass), behind the clouds; screen px, at a whole scale, from an atlas of at
	// most ATLAS_MAX into the bird's box
	if (near) {
		const k = Math.max(1, Math.round(z));
		for (const b of s.life?.birds ?? []) {
			if (seen(b.x, b.y, BIRD_CELL.w * k, BIRD_CELL.h * k)) p.stamp("birds", b.frame, b.x, b.y, Math.min(ATLAS_MAX, k), 1, b.flip, BIRD_CELL.w * k, BIRD_CELL.h * k);
		}
	}
	// 2. clouds, at every step: the far layer, fainter, then the near one, each with its parallax, each cloud drawn again
	// a span over wherever the view reaches
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
	// snow show one of their variants by the cell (texture.ts), the blocks themselves unchanged. Each list is walked a
	// chunk at a time, over the chunks on screen only (chunks.ts).
	const lit = (id: TileId) => litOf(id, dark);
	const litKey = dark >= LIT_FROM ? "lit" : "day";
	const block = (b: Block, alpha: number) => tile(variantOf(lit(b.tile), b.x, b.y), b.x * TILE, b.y * TILE, alpha);
	const ghost = s.ghost;
	const r0 = chunkRange(s.camera, s.view, s.now, 0);
	const limit = p.chunkKeep ?? Number.POSITIVE_INFINITY;
	const kept = keptBy(p);
	let bakes = 0;
	let pending = 0;
	// A chunk's bitmap into its box on screen, baked when the painter has none at this version and the frame's bake
	// budget is not spent.
	const drawChunk = (key: string, version: string, cx: number, cy: number, bake: (q: Painter) => void) => {
		const a = toScreen(s.camera, s.view, s.now, cx * CHUNK_SPAN, cy * CHUNK_SPAN);
		const b = toScreen(s.camera, s.view, s.now, (cx + 1) * CHUNK_SPAN, (cy + 1) * CHUNK_SPAN);
		const got = p.chunk(key, version, bake, a.x, a.y, b.x - a.x, b.y - a.y, bakes < BAKE_BUDGET);
		if (got === "baked") bakes++;
		else if (got === "missing") pending++;
		noteChunk(kept, limit, key, version, got);
		return got;
	};
	// What a chunk's bitmap holds, at scale 1 with the chunk's top-left at (0, 0): its ground, laid blocks and their
	// shadow rows, outline and ghost, as they are stamped.
	const bakeOf = (c: Cell) => (q: Painter) => {
		const ox = c.cx * CHUNK_SPAN;
		const oy = c.cy * CHUNK_SPAN;
		const at = (b: Block, alpha: number) => q.stamp("tiles", tileIndex(variantOf(lit(b.tile), b.x, b.y)), b.x * TILE - ox, b.y * TILE - oy, 1, alpha, false);
		for (const b of c.g?.blocks ?? NONE) at(b, 1);
		for (const b of c.l?.blocks ?? NONE) at(b, 1);
		for (const b of c.sh?.blocks ?? NONE) q.rect(b.x * TILE - ox, b.y * TILE - oy, TILE, 1, SHADOW_COLOR, SHADOW_ALPHA);
		for (const b of c.o?.blocks ?? NONE) at(b, OUTLINE_ALPHA);
		if (c.ghost && ghost) at(ghost, GHOST_ALPHA);
	};
	// The chunks the view touches that hold something of `has`, nearest the view's centre first.
	const cellsInView = (has: (k: number, cx: number, cy: number) => Omit<Cell, "cx" | "cy" | "d"> | null): Cell[] => {
		const out: Cell[] = [];
		for (let cy = r0.cy0; cy <= r0.cy1; cy++) {
			for (let cx = r0.cx0; cx <= r0.cx1; cx++) {
				const got = has(chunkKey(cx, cy), cx, cy);
				if (!got) continue;
				const dx = (cx + 0.5) * CHUNK_SPAN - s.camera.x;
				const dy = (cy + 0.5) * CHUNK_SPAN - s.camera.y;
				out.push({ ...got, cx, cy, d: dx * dx + dy * dy });
			}
		}
		return out.sort((a, b) => a.d - b.d || a.cy - b.cy || a.cx - b.cx);
	};
	// All the land and every laid block as one silhouette at a pixel a tile (far-view.ts).
	const silhouette = () => {
		const shape = landShape(s.ground, s.laid);
		if (shape.w <= 0 || shape.bottom <= shape.top) return;
		const a = toScreen(s.camera, s.view, s.now, 0, shape.top * TILE);
		const b = toScreen(s.camera, s.view, s.now, shape.w * TILE, shape.bottom * TILE);
		if (seen(a.x, a.y, b.x - a.x, b.y - a.y)) p.shape(shape, landTones(s.sky, dark), a.x, a.y, b.x - a.x, b.y - a.y);
	};
	// 5a to 7: what is drawn over the world at every level: the life, the pools of light, the balloon, and him (or, below
	// 1/2, his mark).
	const drawNear = (): void => {
		// 5a. polish pass: the block that just landed, a world pixel bigger all round for a moment; the dust from its
		// foot; the smoke from the workshop's chimney (from CSS zoom 1/2 on)
		if (near) {
			const pop = s.life?.pop;
			if (pop) put("tiles", tileIndex(variantOf(lit(pop.tile), pop.x, pop.y)), pop.x * TILE - 1, pop.y * TILE - 1, TILE + 2, TILE + 2, 1);
			const dust = graded(DUST, dark);
			for (const m of s.life?.dust ?? []) dot(Math.round(m.x), Math.round(m.y), m.size, m.size, dust, m.alpha);
			const smoke = graded(SMOKE, dark);
			// A round disc of rows, each its own width, in world px.
			const disc = (cx: number, cy: number, r: number, alpha: number) => {
				for (let dy = -r; dy < r; dy++) {
					const half = Math.round(Math.sqrt(r * r - (dy + 0.5) * (dy + 0.5)));
					dot(cx - half, cy + dy, 2 * half, 1, smoke, alpha);
				}
			};
			for (const puff of s.life?.smoke ?? []) {
				const r = Math.max(1, Math.round(puff.r * PUFF.grow));
				const cx = Math.round(puff.x);
				const cy = Math.round(puff.y);
				disc(cx, cy, r, puff.alpha * PUFF.rim);
				disc(cx, cy - Math.round(r * PUFF.lift), Math.max(1, Math.round(r * PUFF.core)), puff.alpha * PUFF.rim);
			}
		}
		// 5b. after dark, each lantern and door spills a soft ellipse of warm light on the floor under it (tiles level)
		if (dark > 0 && lod === "tiles") {
			for (const pools of [poolsOn(s.ground, s.ground), poolsOn(s.laid, s.ground)]) {
				for (const pool of pools) {
					const c = toScreen(s.camera, s.view, s.now, pool.x, pool.y);
					const rx = pool.rx * z;
					const ry = pool.ry * z;
					if (seen(c.x - rx, c.y - ry, 2 * rx, 2 * ry)) p.pool(c.x, c.y, rx, ry, PALETTE.t, pool.strength * dark);
				}
			}
		}
		// The balloon's envelope and its two ropes, behind him (from 1/2 on)
		const balloon = near ? (s.balloon ?? null) : null;
		if (balloon) {
			for (const e of BALLOON_ENVELOPE) tile(e.tile, balloon.x + e.dx, balloon.y + e.dy, 1);
			for (const r of BALLOON_ROPES) {
				const ax = sx(balloon.x + r.x);
				const ay = sy(balloon.y + r.top);
				const w = Math.max(1, sx(balloon.x + r.x + 1) - ax);
				const h = sy(balloon.y + r.bottom) - ay;
				if (h > 0 && seen(ax, ay, w, h)) p.rect(ax, ay, w, h, PALETTE.j, 1);
			}
		}
		if (near) {
			// 6. him, his feet on the ground he stands on; 7. his face, never mirrored
			const look = s.him.look;
			const hx = s.him.x - FRAME_W / 2; // his sprite's top-left, world px
			const hy = feet - FRAME_H;
			// 6a. polish pass: the end of his scarf streaming behind him while he walks, behind his body (mirrored with him)
			if (look.trail !== null) {
				const tx = look.flip ? hx + FRAME_W - TRAIL_AT.x - TRAIL_W : hx + TRAIL_AT.x;
				put("trail", look.trail, tx, hy + TRAIL_AT.y, TRAIL_W, TRAIL_H, 1, look.flip);
			}
			put("sprite", frameIndex(look.frame), hx, hy, FRAME_W, FRAME_H, 1, look.flip);
			if (look.face) put("faces", look.blink ? blinkCell(look.face) : faceCell(look.face, look.gaze), hx + FACE_AT.x, hy + FACE_AT.y, FACE_W, FACE_H, 1);
		} else {
			// Below 1/2 he is a small bright mark, so he can be found: snow on stone.
			square(s.him.x, feet - MARK.lift, MARK.outer, PALETTE.a, 1);
			square(s.him.x, feet - MARK.lift, MARK.inner, PALETTE.p, 1);
		}
		// The balloon's basket, in front of him, so he stands in it
		if (balloon) tile(BALLOON_BASKET.tile, balloon.x + BALLOON_BASKET.dx, balloon.y + BALLOON_BASKET.dy, 1);
	};
	const shadows = keep(SHADOWS, s.laid, shadowed);
	if (lod === "tiles") {
		// Every list walked over the chunks on screen and one more all round (a glow reaches past its own chunk), row by
		// row, column by column, each chunk's blocks in the list's own order: blocks that share a cell (a wall and its
		// lantern) share a chunk and keep their order, and no two chunks overlap, so the pixels are as a walk of the list.
		const r1 = chunkRange(s.camera, s.view, s.now, 1);
		const walk = (list: readonly Block[], each: (b: Block) => void) => {
			const m = bucket(list);
			if (m.size === 0) return;
			for (let cy = r1.cy0; cy <= r1.cy1; cy++) {
				for (let cx = r1.cx0; cx <= r1.cx1; cx++) {
					const got = m.get(chunkKey(cx, cy));
					if (got) for (const b of got.blocks) each(b);
				}
			}
		};
		// 3. the ground: stamped, or, when the view holds more of it than the cap (a view filled with land), from chunk
		// bitmaps (at most the painter keeps, nearest first); a chunk the bake budget leaves for later is stamped now.
		const groundB = bucket(s.ground);
		let inView = 0;
		for (let cy = r0.cy0; cy <= r0.cy1; cy++) for (let cx = r0.cx0; cx <= r0.cx1; cx++) inView += groundB.get(chunkKey(cx, cy))?.blocks.length ?? 0;
		if (inView > (s.stampCap ?? GROUND_STAMP_CAP)) {
			const cells = cellsInView((k) => {
				const g = groundB.get(k);
				return g ? { g, ghost: false } : null;
			});
			cells.forEach((c, i) => {
				const g = c.g?.blocks ?? NONE;
				if (i < limit && drawChunk(`g${c.cx},${c.cy}`, `${c.g?.sig}|${litKey}`, c.cx, c.cy, bakeOf(c)) !== "missing") return;
				for (const b of g) block(b, 1);
			});
		} else {
			walk(s.ground, (b) => block(b, 1));
		}
		walk(s.laid, (b) => block(b, 1));
		walk(shadows, (b) => {
			const a = toScreen(s.camera, s.view, s.now, b.x * TILE, b.y * TILE);
			const c = toScreen(s.camera, s.view, s.now, (b.x + 1) * TILE, b.y * TILE + 1);
			if (seen(a.x, a.y, c.x - a.x, c.y - a.y)) p.rect(a.x, a.y, c.x - a.x, c.y - a.y, SHADOW_COLOR, SHADOW_ALPHA);
		});
		walk(s.outline ?? NONE, (b) => block(b, OUTLINE_ALPHA));
		if (ghost) block(ghost, GHOST_ALPHA);
		drawNear();
		// 8. after dark, the warm light of each lamp and lit window falls on what is round it
		if (dark > 0) {
			const glow = (b: Block) => {
				const light = LIGHTS[lit(b.tile)];
				if (!light) return;
				const c = toScreen(s.camera, s.view, s.now, b.x * TILE + light.x, b.y * TILE + light.y);
				const r = light.r * z;
				const strength = light.strength * (b.tile === "forge" ? forgeBreath(s.now) : 1);
				if (seen(c.x - r, c.y - r, 2 * r, 2 * r)) p.glow(c.x, c.y, r, PALETTE.t, strength * dark);
			};
			walk(s.ground, glow);
			walk(s.laid, glow);
		}
	} else if (lod === "chunks") {
		// 3 to 5 at 1/2 and 1/4: each chunk the view touches that holds anything, as one bitmap at scale 1 drawn smaller,
		// at most as many as the painter keeps (nearest the centre first, so none drawn this frame is evicted by another
		// drawn this frame). When any will be missing (the bake budget is spent) or is left out, the silhouette goes
		// under them first, so no land vanishes for a frame.
		const groundB = bucket(s.ground);
		const laidB = bucket(s.laid);
		const shadowB = bucket(shadows);
		const outlineB = bucket(s.outline ?? NONE);
		const gx = ghost ? Math.floor(ghost.x / CHUNK) : Number.NaN;
		const gy = ghost ? Math.floor(ghost.y / CHUNK) : Number.NaN;
		const cells = cellsInView((k, cx, cy) => {
			const g = groundB.get(k);
			const l = laidB.get(k);
			const o = outlineB.get(k);
			const here = cx === gx && cy === gy;
			return g || l || o || here ? { g, l, sh: shadowB.get(k), o, ghost: here } : null;
		});
		const drawn = cells.slice(0, Math.min(cells.length, limit));
		const versions = drawn.map(
			(c) => `${litKey}|${c.g?.sig ?? "-"}|${c.l?.sig ?? "-"}/${c.sh?.sig ?? "-"}|${c.o?.sig ?? "-"}|${c.ghost && ghost ? `${ghost.x},${ghost.y}` : "-"}`,
		);
		const toBake = drawn.filter((c, i) => kept.get(`${c.cx},${c.cy}`) !== versions[i]).length;
		if (drawn.length < cells.length || toBake > BAKE_BUDGET - bakes) silhouette();
		drawn.forEach((c, i) => drawChunk(`${c.cx},${c.cy}`, versions[i], c.cx, c.cy, bakeOf(c)));
		drawNear();
	} else {
		// 3 to 5 below 1/4: the whole world as one silhouette, then at night a small light for each finished build.
		silhouette();
		if (dark > 0) for (const l of s.lights ?? []) square(l.x, l.y, LIGHT_PX, PALETTE.t, Math.min(1, dark));
		drawNear();
	}
	// 9. polish pass: snow at night, in front of everything; screen px
	if (near) {
		for (const f of s.life?.snow ?? []) {
			const t = Math.max(1, Math.floor(f.size / 2)); // the halo's width
			if (!seen(f.x - t, f.y - t, f.size + 2 * t, f.size + 2 * t)) continue;
			p.rect(f.x, f.y, f.size, f.size, PALETTE.p, f.alpha);
			const halo = f.alpha * SNOW_HALO;
			p.rect(f.x, f.y - t, f.size, t, PALETTE.p, halo);
			p.rect(f.x, f.y + f.size, f.size, t, PALETTE.p, halo);
			p.rect(f.x - t, f.y, t, f.size, PALETTE.p, halo);
			p.rect(f.x + f.size, f.y, t, f.size, PALETTE.p, halo);
		}
	}
	return { pending };
}
