// The far view (spec 3.3): below a quarter, the whole world is one silhouette at one pixel a tile, toned from the sky
// as the far islands are, with the land, its scenery and every laid block in it. Kept per pair of lists.
import type { Run, Shape, Tone } from "./backdrop";
import type { Block } from "./blueprints/types";
import { PALETTE } from "./palette";
import { nightColour, parseColor } from "./raster";
import { hslCss, skyHslAt, type Sky } from "./sky";

const KEPT = new WeakMap<readonly Block[], WeakMap<readonly Block[], Shape>>();
const EMPTY: Shape = { runs: [], w: 0, top: 0, bottom: 0 };
export function landShape(ground: readonly Block[], laid: readonly Block[]): Shape {
	let byLaid = KEPT.get(ground);
	if (!byLaid) {
		byLaid = new WeakMap();
		KEPT.set(ground, byLaid);
	}
	const hit = byLaid.get(laid);
	if (hit) return hit;
	const key = (x: number, y: number) => y * 4096 + x;
	const cells = new Set<number>();
	let x1 = -1;
	let y0 = Number.POSITIVE_INFINITY;
	let y1 = -1;
	for (const list of [ground, laid]) {
		for (const b of list) {
			cells.add(key(b.x, b.y));
			x1 = Math.max(x1, b.x);
			y0 = Math.min(y0, b.y);
			y1 = Math.max(y1, b.y);
		}
	}
	if (cells.size === 0) {
		byLaid.set(laid, EMPTY);
		return EMPTY;
	}
	const runs: Run[] = [];
	for (let y = y0; y <= y1; y++) {
		let start = -1;
		let tone: Tone = 0;
		for (let x = 0; x <= x1 + 1; x++) {
			const here = cells.has(key(x, y));
			const t: Tone = !here ? 0 : !cells.has(key(x, y - 1)) ? 1 : !cells.has(key(x, y + 1)) ? 2 : 0;
			if (start >= 0 && (!here || t !== tone)) {
				runs.push([y, start, x, tone]);
				start = -1;
			}
			if (here && start < 0) {
				start = x;
				tone = t;
			}
		}
	}
	const shape: Shape = { runs, w: x1 + 1, top: y0, bottom: y1 + 1 };
	byLaid.set(laid, shape);
	return shape;
}

const hex = (c: readonly number[]) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: string, b: string, k: number): string => {
	const ca = parseColor(a) ?? [0, 0, 0, 255];
	const cb = parseColor(b) ?? ca;
	return hex(ca.map((v, i) => v + (cb[i] - v) * k));
};
// Body, rim and underside: the island's stone, snow and stone shadow, a share of the sky's horizon mixed in (more for
// the underside, which fades into the haze), graded toward night as the art is.
export function landTones(sky: Sky | undefined, dark: number): [string, string, string] {
	const horizon = sky ? hslCss(skyHslAt(sky, 1)) : null;
	const tone = (base: string, k: number) => {
		const mixed = horizon ? mix(base, horizon, k) : base;
		const c = parseColor(mixed) ?? [0, 0, 0, 255];
		return hex(nightColour(c, dark));
	};
	return [tone(PALETTE.c, 0.3), tone(PALETTE.o, 0.15), tone(PALETTE.b, 0.4)];
}
