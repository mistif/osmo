// A Painter over a plain RGBA buffer, with a canvas's source-over blending. The tests draw with it (node has no
// canvas, and no package for one is added) and hash the pixels.
import { parseColor, type Bitmap } from "./raster";
import { CELL, GLOW_STOPS, sheetBitmap, type Art, type Painter } from "./render";

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
		gradient(stops) {
			const cs = stops.map(([at, color]) => [at, parseColor(color) ?? [0, 0, 0, 255]] as const);
			for (let y = 0; y < h; y++) {
				const k = h > 1 ? y / (h - 1) : 0;
				let i = 0;
				while (i < cs.length - 2 && k > cs[i + 1][0]) i++;
				const [a0, c0] = cs[i];
				const [a1, c1] = cs[Math.min(i + 1, cs.length - 1)];
				const t = a1 > a0 ? Math.min(1, Math.max(0, (k - a0) / (a1 - a0))) : 0;
				const c = [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * t));
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
		// Like the canvas's "lighter": premultiplied colours add, and so do the alphas.
		glow(cx, cy, r, color, alpha) {
			const c = parseColor(color);
			if (!c || r <= 0) return;
			for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(h, Math.ceil(cy + r)); y++) {
				for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(w, Math.ceil(cx + r)); x++) {
					const a = alpha * glowAt(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r);
					if (a <= 0) continue;
					const o = (y * w + x) * 4;
					const da = data[o + 3] / 255;
					const oa = Math.min(1, da + a);
					for (let i = 0; i < 3; i++) data[o + i] = Math.min(255, Math.round((data[o + i] * da + c[i] * a) / oa));
					data[o + 3] = Math.round(oa * 255);
				}
			}
		},
	};
}

// The glow's strength at a share d of its radius, between the shared stops.
export function glowAt(d: number): number {
	if (d >= 1) return 0;
	for (let i = 1; i < GLOW_STOPS.length; i++) {
		const [a1, s1] = GLOW_STOPS[i];
		if (d <= a1) {
			const [a0, s0] = GLOW_STOPS[i - 1];
			return s0 + ((s1 - s0) * (d - a0)) / (a1 - a0);
		}
	}
	return 0;
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
