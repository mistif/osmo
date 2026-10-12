// The Painter over a real canvas, and the optional PNG sheets (spec 2 and 3). Atlases are built lazily, one per
// sheet and scale, from the drawn art, or from a PNG that is present and exactly the right size.
import type { Shape } from "./backdrop";
import { TILE } from "./blueprints/types";
import { chunkCache } from "./chunks";
import { CHUNK_KEEP, CHUNK_PX } from "./lod";
import { FRAME_H, FRAME_NAMES, FRAME_W } from "./osmo-sprite";
import { parseColor, sheetProblem } from "./raster";
import { CELL, GLOW_STOPS, shapeCache, sheetBitmap, type Art, type Painter, type Sheet } from "./render";
import { TILE_IDS } from "./tiles";

export type Overrides = Partial<Record<"tiles" | "sprite", CanvasImageSource>>;

// keep: the most chunk bitmaps it keeps (free-will spec 3.3: CHUNK_KEEP.desk, or .phone on a phone). clock: what drawWorld
// times a frame's chunk bakes with (ms; the page's own clock, a fake in the tests).
export function canvasPainter(
	ctx: CanvasRenderingContext2D, art: Art, overrides: Overrides = {}, keep: number = CHUNK_KEEP.desk, clock: () => number = () => performance.now(),
): Painter {
	const atlases = new Map<string, HTMLCanvasElement>();
	const atlas = (sheet: Sheet, scale: number): HTMLCanvasElement => {
		const key = `${sheet}@${scale}`;
		const hit = atlases.get(key);
		if (hit) return hit;
		const bmp = sheetBitmap(art, sheet, scale);
		const c = document.createElement("canvas");
		c.width = bmp.w;
		c.height = bmp.h;
		const g = c.getContext("2d");
		if (g) {
			const png = sheet === "tiles" || sheet === "sprite" ? overrides[sheet] : undefined;
			if (png) {
				g.imageSmoothingEnabled = false;
				g.drawImage(png, 0, 0, bmp.w, bmp.h);
			} else {
				g.putImageData(new ImageData(bmp.data, bmp.w, bmp.h), 0, 0);
			}
		}
		atlases.set(key, c);
		return c;
	};
	// The far islands and the hills, each kept as an offscreen canvas per set of tones (review B1): a frame draws each
	// with one drawImage instead of a rect per run.
	const shapes = shapeCache((bmp) => {
		const c = document.createElement("canvas");
		c.width = bmp.w;
		c.height = bmp.h;
		if (bmp.w > 0 && bmp.h > 0) c.getContext("2d")?.putImageData(new ImageData(bmp.data, bmp.w, bmp.h), 0, 0);
		return c;
	});
	return over(ctx, atlas, shapes, keep, clock);
}

// A painter over one context, drawing from the atlases and silhouettes it is given: a chunk's painter shares its
// parent's. Its chunk bitmaps are offscreen canvases of CHUNK_PX square, each emptied (sized to nothing, so the browser
// lets its memory go) when it is evicted or released.
function over(
	ctx: CanvasRenderingContext2D,
	atlas: (sheet: Sheet, scale: number) => HTMLCanvasElement,
	shapes: (shape: Shape, tones: readonly string[]) => HTMLCanvasElement,
	keep: number,
	clock?: () => number,
): Painter {
	const cache = chunkCache(
		keep,
		() => {
			const c = document.createElement("canvas");
			c.width = CHUNK_PX;
			c.height = CHUNK_PX;
			const g = c.getContext("2d");
			return { c, p: g ? over(g, atlas, shapes, 1) : null };
		},
		({ c }) => {
			c.width = 0;
			c.height = 0;
		},
	);
	return {
		chunkKeep: keep,
		clock,
		get w() {
			return ctx.canvas.width;
		},
		get h() {
			return ctx.canvas.height;
		},
		clear() {
			ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		},
		gradient(stops) {
			const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
			for (const [at, color] of stops) g.addColorStop(at, color);
			ctx.globalAlpha = 1;
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		},
		rect(x, y, w, h, color, alpha) {
			ctx.globalAlpha = alpha;
			ctx.fillStyle = color;
			ctx.fillRect(x, y, w, h);
			ctx.globalAlpha = 1;
		},
		stamp(sheet, cell, x, y, scale, alpha, flip, dw, dh) {
			const src = atlas(sheet, scale);
			const cw = CELL[sheet].w * scale;
			const ch = CELL[sheet].h * scale;
			const bw = Math.max(0, Math.round(dw ?? cw));
			const bh = Math.max(0, Math.round(dh ?? ch));
			if (bw === 0 || bh === 0) return;
			ctx.imageSmoothingEnabled = false;
			ctx.globalAlpha = alpha;
			if (flip) {
				ctx.save();
				ctx.translate(x + bw, y);
				ctx.scale(-1, 1);
				ctx.drawImage(src, cell * cw, 0, cw, ch, 0, 0, bw, bh);
				ctx.restore();
			} else {
				ctx.drawImage(src, cell * cw, 0, cw, ch, x, y, bw, bh);
			}
			ctx.globalAlpha = 1;
		},
		shape(shape, tones, x, y, w, h) {
			const src = shapes(shape, tones);
			if (w <= 0 || h <= 0 || src.width === 0 || src.height === 0) return;
			ctx.imageSmoothingEnabled = false;
			ctx.globalAlpha = 1;
			ctx.drawImage(src, x, y, w, h);
		},
		chunk(key, version, bake, x, y, w, h, mayBake = true) {
			const got = cache.get(key, version, mayBake, ({ p }) => {
				if (!p) return;
				p.clear();
				bake(p);
			});
			if (!got) return "missing";
			const bw = Math.round(w);
			const bh = Math.round(h);
			if (bw > 0 && bh > 0) {
				ctx.imageSmoothingEnabled = false;
				ctx.globalAlpha = 1;
				ctx.drawImage(got.t.c, x, y, bw, bh);
			}
			return got.state;
		},
		release: () => cache.release(),
		glow(x, y, r, color, alpha) {
			const c = parseColor(color);
			if (!c || r <= 0) return;
			const g = ctx.createRadialGradient(x, y, 0, x, y, r);
			for (const [at, k] of GLOW_STOPS) g.addColorStop(at, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${k})`);
			ctx.save();
			ctx.globalCompositeOperation = "lighter";
			ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
			ctx.fillStyle = g;
			ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
			ctx.restore();
		},
		pool(x, y, rx, ry, color, alpha) {
			const c = parseColor(color);
			if (!c || rx <= 0 || ry <= 0) return;
			ctx.save();
			ctx.translate(x, y);
			ctx.scale(1, ry / rx);
			const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
			for (const [at, k] of GLOW_STOPS) g.addColorStop(at, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${k})`);
			ctx.globalCompositeOperation = "lighter";
			ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
			ctx.fillStyle = g;
			ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
			ctx.restore();
		},
	};
}

const SHEETS = {
	tiles: { file: "/village/tiles.png", w: TILE_IDS.length * TILE, h: TILE },
	sprite: { file: "/village/osmo-sheet.png", w: FRAME_NAMES.length * FRAME_W, h: FRAME_H },
} as const;

// What asking for one of the files brings back: the image and its size in pixels, or null when the file is not there.
export type SheetFile = { img: CanvasImageSource; w: number; h: number };
export type SheetLoader = (file: string) => Promise<SheetFile | null>;
const fromPage: SheetLoader = async (file) => {
	const img = new Image();
	img.src = file;
	try {
		await img.decode();
	} catch {
		return null;
	}
	return { img, w: img.naturalWidth, h: img.naturalHeight };
};

// What each file came to (its image, or null: missing or the wrong size), kept for the life of the page. The world starts
// again for a new scarf, a darker hour, a clear or a visit back to it, and each start used to ask for both files again:
// a 404 in the console every time for a file nobody has drawn. The promise is kept, so two starts that overlap ask once.
const answers = new Map<string, Promise<CanvasImageSource | null>>();
async function answer(sheet: keyof typeof SHEETS, load: SheetLoader): Promise<CanvasImageSource | null> {
	const { file, w, h } = SHEETS[sheet];
	let got: SheetFile | null = null;
	try {
		got = await load(file);
	} catch {
		got = null;
	}
	if (!got) {
		console.info(`[village] No ${file}; using the drawn ${sheet}.`);
		return null;
	}
	const problem = sheetProblem(got.w, got.h, w, h);
	if (problem) {
		console.warn(`[village] ${file} ${problem}; using the drawn ${sheet}.`);
		return null;
	}
	return got.img;
}

// The optional PNG sheets: used only when present and exactly the right size; otherwise the console says why, once. Each
// file is asked for at most once per page load, found or not. load: how a file is asked for (the page's own, a fake in
// the tests).
export async function loadSheets(load: SheetLoader = fromPage): Promise<Overrides> {
	const out: Overrides = {};
	for (const sheet of ["tiles", "sprite"] as const) {
		const { file } = SHEETS[sheet];
		let asked = answers.get(file);
		if (!asked) {
			asked = answer(sheet, load);
			answers.set(file, asked);
		}
		const img = await asked;
		if (img) out[sheet] = img;
	}
	return out;
}
