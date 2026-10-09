// The Painter over a real canvas, and the optional PNG sheets (spec 2 and 3). Atlases are built lazily, one per
// sheet and scale, from the drawn art, or from a PNG that is present and exactly the right size.
import { TILE } from "./blueprints/types";
import { FRAME_H, FRAME_NAMES, FRAME_W } from "./osmo-sprite";
import { parseColor, sheetProblem } from "./raster";
import { CELL, GLOW_STOPS, sheetBitmap, type Art, type Painter, type Sheet } from "./render";
import { TILE_IDS } from "./tiles";

export type Overrides = Partial<Record<"tiles" | "sprite", CanvasImageSource>>;

export function canvasPainter(ctx: CanvasRenderingContext2D, art: Art, overrides: Overrides = {}): Painter {
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
	return {
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
		stamp(sheet, cell, x, y, scale, alpha, flip) {
			const src = atlas(sheet, scale);
			const cw = CELL[sheet].w * scale;
			const ch = CELL[sheet].h * scale;
			ctx.imageSmoothingEnabled = false;
			ctx.globalAlpha = alpha;
			if (flip) {
				ctx.save();
				ctx.translate(x + cw, y);
				ctx.scale(-1, 1);
				ctx.drawImage(src, cell * cw, 0, cw, ch, 0, 0, cw, ch);
				ctx.restore();
			} else {
				ctx.drawImage(src, cell * cw, 0, cw, ch, x, y, cw, ch);
			}
			ctx.globalAlpha = 1;
		},
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
	};
}

const SHEETS = {
	tiles: { file: "/village/tiles.png", w: TILE_IDS.length * TILE, h: TILE },
	sprite: { file: "/village/osmo-sheet.png", w: FRAME_NAMES.length * FRAME_W, h: FRAME_H },
} as const;

// The optional PNG sheets: used only when present and exactly the right size; otherwise the console says why.
export async function loadSheets(): Promise<Overrides> {
	const out: Overrides = {};
	for (const sheet of ["tiles", "sprite"] as const) {
		const { file, w, h } = SHEETS[sheet];
		const img = new Image();
		img.src = file;
		try {
			await img.decode();
		} catch {
			console.info(`[village] No ${file}; using the drawn ${sheet}.`);
			continue;
		}
		const problem = sheetProblem(img.naturalWidth, img.naturalHeight, w, h);
		if (problem) {
			console.warn(`[village] ${file} ${problem}; using the drawn ${sheet}.`);
			continue;
		}
		out[sheet] = img;
	}
	return out;
}
