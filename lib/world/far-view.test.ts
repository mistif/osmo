import { describe, expect, it } from "vitest";
import type { Block } from "./blueprints/types";
import { landShape, landTones } from "./far-view";
import { skyAt } from "./sky";

const g = (x: number, y: number): Block => ({ x, y, tile: "stone", layer: "ground" });

describe("the far view", () => {
	it("is one silhouette at a pixel a tile: the lit rim on top, the underside below, kept per pair of lists", () => {
		const ground = [g(10, 5), g(11, 5), g(12, 5), g(10, 6), g(11, 6), g(12, 6), g(11, 7)];
		const laid = [g(11, 4)];
		const s = landShape(ground, laid);
		expect([s.w, s.top, s.bottom]).toEqual([13, 4, 8]);
		expect(s.runs).toContainEqual([4, 11, 12, 1]); // the laid block on top: rim
		expect(s.runs).toContainEqual([5, 10, 11, 1]);
		expect(s.runs).toContainEqual([5, 11, 12, 0]); // under the laid block: body
		expect(s.runs).toContainEqual([6, 10, 11, 2]); // nothing under it: underside
		expect(s.runs).toContainEqual([7, 11, 12, 2]); // something above it, nothing below: underside
		expect(landShape(ground, laid)).toBe(s);
		expect(landShape([], [])).toEqual({ runs: [], w: 0, top: 0, bottom: 0 });
	});
	it("tones the land from the sky, darker at night", () => {
		const day = landTones(skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", 12), 0);
		const night = landTones(skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", 0), 1);
		for (const t of [...day, ...night]) expect(t).toMatch(/^#[0-9a-f]{6}$/);
		expect(night).not.toEqual(day);
		expect(landTones(undefined, 0)).toHaveLength(3);
	});
});
