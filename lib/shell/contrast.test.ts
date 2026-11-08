import { describe, expect, it } from "vitest";
import { skyAt } from "../world/sky";
import { contrastRatio, hslToRgb, mixOklab, type Rgb } from "./contrast";

const INK: Rgb = [0x0c, 0x11, 0x1b];
const BONE: Rgb = [0xf3, 0xef, 0xe8];
const WHITE: Rgb = [255, 255, 255];
// moodTheme writes the page base as hsl(H 30% L%) with L = 7 + (valence + 1) * 4, so 7 to 15.
const HUES = [0, 60, 172, 212, 300];
const LIGHTNESS = [7, 11, 15];

const rows = HUES.flatMap((h) => LIGHTNESS.map((l) => ({ h, l, rail: mixOklab(INK, hslToRgb(h, 30, l), 0.38) })));

describe("colour maths", () => {
	it("mixes at the ends and the middle", () => {
		const a: Rgb = [200, 40, 40], b: Rgb = [20, 90, 220];
		const same = mixOklab(a, b, 1);
		const other = mixOklab(a, b, 0);
		a.forEach((v, i) => expect(same[i]).toBeCloseTo(v, 0));
		b.forEach((v, i) => expect(other[i]).toBeCloseTo(v, 0));
	});
	it("matches known contrast values", () => {
		expect(contrastRatio([0, 0, 0], WHITE)).toBeCloseTo(21, 5);
		expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
	});
	it("converts hsl", () => {
		expect(hslToRgb(0, 100, 50).map(Math.round)).toEqual([255, 0, 0]);
		expect(hslToRgb(120, 100, 25).map(Math.round)).toEqual([0, 128, 0]);
	});
});

describe("the rail's contrast holds on every mood tone", () => {
	it.each(rows)("hue $h, lightness $l", ({ rail }) => {
		const icon = mixOklab(BONE, rail, 0.62);
		expect(contrastRatio(icon, rail)).toBeGreaterThanOrEqual(3);
		expect(contrastRatio(BONE, rail)).toBeGreaterThanOrEqual(4.5);
		const active = mixOklab(hslToRgb(172, 38, 50), WHITE, 0.85);
		expect(contrastRatio(active, rail)).toBeGreaterThanOrEqual(3);
	});
	it("the lightest ground still reads at the measured margin", () => {
		const worst = Math.min(...rows.map(({ rail }) => contrastRatio(mixOklab(BONE, rail, 0.62), rail)));
		expect(worst).toBeGreaterThanOrEqual(5);
	});
});

// The village (spec 6): the sky sits behind the header and the rail's hover label. At the lightest hour of the day,
// on every hue, Bone text must still read at 4.5:1 on the sky's top, and on the label over it.
describe("the village sky keeps the room's text readable", () => {
	const hours = Array.from({ length: 96 }, (_, i) => i / 4);
	it.each(Array.from({ length: 24 }, (_, i) => i * 15))("hue %i at the lightest hour", (h) => {
		const mood = `hsl(${h} 95% 78%)`;
		const lightest = hours.map((hr) => skyAt(mood, mood, hr)).reduce((a, b) => (b.top[2] > a.top[2] ? b : a));
		const top = hslToRgb(lightest.top[0], lightest.top[1], lightest.top[2]);
		expect(contrastRatio(BONE, top)).toBeGreaterThanOrEqual(4.5);
		const rail = mixOklab(INK, hslToRgb(h, 30, 15), 0.38);
		expect(contrastRatio(BONE, mixOklab(rail, top, 0.92))).toBeGreaterThanOrEqual(4.5);
	});
});
