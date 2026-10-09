// A Painter over a plain RGBA buffer, with a canvas's source-over blending. The tests draw with it (node has no
// canvas, and no package for one is added) and hash the pixels.
import { parseColor, type Bitmap } from "./raster";
import { CELL, sheetBitmap, type Art, type Painter } from "./render";

export type PixelPainter = Painter & { readonly data: Uint8ClampedArray<ArrayBuffer> };

export function pixelPainter(w: number, h: number, art: Art): PixelPainter {
	const data = new Uint8ClampedArray(w * h * 4);
	const sheets = new Map<string, Bitmap>();
	const blend = (o: number, r: number, g: number, b: number, a: number) => {
		if (a <= 0) return;
		const keep = 1 - a;
		data[o] = Math.round(r * a + data[o] * keep);
		data[o + 1] = Math.round(g * a + data[o + 1] * keep);
		data[o + 2] = Math.round(b * a + data[o + 2] * keep);
		data[o + 3] = Math.round(255 * a + data[o + 3] * keep);
	};
	return {
		w,
		h,
		data,
		clear: () => {
			data.fill(0);
		},
		gradient(top, bottom) {
			const t = parseColor(top) ?? [0, 0, 0, 255];
			const b = parseColor(bottom) ?? t;
			for (let y = 0; y < h; y++) {
				const k = h > 1 ? y / (h - 1) : 0;
				const c = [0, 1, 2].map((i) => Math.round(t[i] + (b[i] - t[i]) * k));
				for (let x = 0; x < w; x++) {
					const o = (y * w + x) * 4;
					data[o] = c[0];
					data[o + 1] = c[1];
					data[o + 2] = c[2];
					data[o + 3] = 255;
				}
			}
		},
		rect(x, y, rw, rh, color, alpha) {
			const c = parseColor(color);
			if (!c) return;
			for (let yy = Math.max(0, y); yy < Math.min(h, y + rh); yy++) {
				for (let xx = Math.max(0, x); xx < Math.min(w, x + rw); xx++) blend((yy * w + xx) * 4, c[0], c[1], c[2], alpha);
			}
		},
		stamp(sheet, cell, x, y, scale, alpha, flip) {
			const key = `${sheet}@${scale}`;
			let bmp = sheets.get(key);
			if (!bmp) {
				bmp = sheetBitmap(art, sheet, scale);
				sheets.set(key, bmp);
			}
			const cw = CELL[sheet].w * scale;
			const ch = CELL[sheet].h * scale;
			for (let dy = 0; dy < ch; dy++) {
				const ty = y + dy;
				if (ty < 0 || ty >= h) continue;
				for (let dx = 0; dx < cw; dx++) {
					const tx = x + dx;
					if (tx < 0 || tx >= w) continue;
					const s = (dy * bmp.w + cell * cw + (flip ? cw - 1 - dx : dx)) * 4;
					blend((ty * w + tx) * 4, bmp.data[s], bmp.data[s + 1], bmp.data[s + 2], (bmp.data[s + 3] / 255) * alpha);
				}
			}
		},
	};
}

// FNV-1a over the bytes, as 8 hex digits.
export function hashPixels(data: Uint8Array | Uint8ClampedArray): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < data.length; i++) {
		h ^= data[i];
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}
