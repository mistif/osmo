// A Painter over a plain RGBA buffer, with a canvas's source-over blending. The tests draw with it (node has no
// canvas, and no package for one is added) and hash the pixels.
import type { Shape } from "./backdrop";
import { chunkCache, type ChunkStats } from "./chunks";
import { CHUNK_KEEP, CHUNK_PX } from "./lod";
import { parseColor, type Bitmap } from "./raster";
import { CELL, GLOW_STOPS, shapeCache, sheetBitmap, type Art, type Painter } from "./render";

// chunks: the chunk bitmaps' cache's counts (the same chunkCache the canvas painter keeps its bitmaps in).
export type PixelPainter = Painter & { readonly data: Uint8ClampedArray<ArrayBuffer>; readonly chunks: ChunkStats };

// keep: the most chunk bitmaps it keeps (CHUNK_KEEP.desk, or .phone).
export function pixelPainter(w: number, h: number, art: Art, keep: number = CHUNK_KEEP.desk): PixelPainter {
	return make(w, h, art, new Map(), shapeCache((bmp) => bmp), keep);
}

// A painter over its own buffer, sharing the atlases (sheets) and the kept silhouettes (shapes) it is given: a chunk's
// painter draws from its parent's.
function make(w: number, h: number, art: Art, sheets: Map<string, Bitmap>, shapes: (shape: Shape, tones: readonly string[]) => Bitmap, keep: number): PixelPainter {
	const data = new Uint8ClampedArray(w * h * 4);
	const blend = (o: number, r: number, g: number, b: number, a: number) => {
		if (a <= 0) return;
		const under = 1 - a;
		data[o] = Math.round(r * a + data[o] * under);
		data[o + 1] = Math.round(g * a + data[o + 1] * under);
		data[o + 2] = Math.round(b * a + data[o + 2] * under);
		data[o + 3] = Math.round(255 * a + data[o + 3] * under);
	};
	// A bitmap into the box (x, y, bw, bh), nearest neighbour, source-over with its own alpha, as the canvas painter's
	// drawImage with smoothing off; only the rows and columns on the buffer are visited. This buffer's colours are
	// premultiplied (blend is premultiplied source-over), so a chunk's (premul) is divided by its alpha first: a faint
	// ghost baked in a chunk comes out as faint as it is stamped. Opaque and empty pixels are the same either way.
	const blit = (bmp: Bitmap, x: number, y: number, bw: number, bh: number, premul = false) => {
		if (bw <= 0 || bh <= 0 || bmp.w === 0 || bmp.h === 0) return;
		const dx0 = Math.max(0, -x);
		const dx1 = Math.min(bw, w - x);
		for (let dy = Math.max(0, -y); dy < Math.min(bh, h - y); dy++) {
			const ty = y + dy;
			const sy = Math.floor((dy * bmp.h) / bh);
			for (let dx = dx0; dx < dx1; dx++) {
				const s = (sy * bmp.w + Math.floor((dx * bmp.w) / bw)) * 4;
				const a = bmp.data[s + 3] / 255;
				const k = premul && a > 0 ? 1 / a : 1;
				blend((ty * w + x + dx) * 4, bmp.data[s] * k, bmp.data[s + 1] * k, bmp.data[s + 2] * k, a);
			}
		}
	};
	// The chunk bitmaps (free-will spec 3.3): each a painter of CHUNK_PX square over the same atlases; evicted ones are
	// left to the collector.
	const cache = chunkCache(keep, () => make(CHUNK_PX, CHUNK_PX, art, sheets, shapes, 1), () => {});
	return {
		w,
		h,
		data,
		chunks: cache.stats,
		chunkKeep: keep,
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
		stamp(sheet, cell, x, y, scale, alpha, flip, dw, dh) {
			const key = `${sheet}@${scale}`;
			let bmp = sheets.get(key);
			if (!bmp) {
				bmp = sheetBitmap(art, sheet, scale);
				sheets.set(key, bmp);
			}
			const cw = CELL[sheet].w * scale;
			const ch = CELL[sheet].h * scale;
			// The box drawn: the cell's own size, or the one asked for, sampled nearest neighbour as a canvas does with
			// smoothing off. At the cell's own size every pixel maps to itself.
			const bw = Math.max(0, Math.round(dw ?? cw));
			const bh = Math.max(0, Math.round(dh ?? ch));
			for (let dy = 0; dy < bh; dy++) {
				const ty = y + dy;
				if (ty < 0 || ty >= h) continue;
				const sy = Math.floor((dy * ch) / bh);
				for (let dx = 0; dx < bw; dx++) {
					const tx = x + dx;
					if (tx < 0 || tx >= w) continue;
					const sx = Math.floor(((flip ? bw - 1 - dx : dx) * cw) / bw);
					const s = (sy * bmp.w + cell * cw + sx) * 4;
					blend((ty * w + tx) * 4, bmp.data[s], bmp.data[s + 1], bmp.data[s + 2], (bmp.data[s + 3] / 255) * alpha);
				}
			}
		},
		// The kept bitmap into the box, nearest neighbour, as the canvas painter's drawImage with smoothing off.
		shape(shape, tones, x, y, bw, bh) {
			blit(shapes(shape, tones), x, y, bw, bh);
		},
		chunk(key, version, bake, x, y, bw, bh, mayBake = true) {
			const got = cache.get(key, version, mayBake, (q) => {
				q.clear();
				bake(q);
			});
			if (!got) return "missing";
			blit({ w: CHUNK_PX, h: CHUNK_PX, data: got.t.data }, x, y, Math.round(bw), Math.round(bh), true);
			return got.state;
		},
		release: () => cache.release(),
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
		// The glow squashed into an ellipse: its strength by the distance measured in each radius.
		pool(cx, cy, rx, ry, color, alpha) {
			const c = parseColor(color);
			if (!c || rx <= 0 || ry <= 0) return;
			for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(h, Math.ceil(cy + ry)); y++) {
				for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(w, Math.ceil(cx + rx)); x++) {
					const a = alpha * glowAt(Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry));
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
