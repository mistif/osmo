import { describe, expect, it } from "vitest";
import { HOME_ISLAND, homeGround } from "./home";
import { uncovered } from "./scenery";
import type { WorldMap } from "./types";

const map: WorldMap = { seed: 0, gen: 1, islands: [HOME_ISLAND], ground: homeGround() };
const inRect = (b: { x: number; y: number }) => b.x >= 450 && b.x < 456 && b.y >= 80 && b.y < 86;

describe("scenery under builds", () => {
	it("leaves out the trees and bushes under a started build, and never the land", () => {
		expect(map.ground.filter(inRect).length).toBeGreaterThan(0);
		const left = uncovered(map, [{ x: 450, y: 80, w: 6, h: 6 }]);
		expect(left.filter(inRect)).toEqual([]);
		expect(left.filter((b) => b.y >= 86)).toEqual(map.ground.filter((b) => b.y >= 86));
		expect(left.length).toBe(map.ground.length - map.ground.filter(inRect).length);
	});
	it("keeps everything when nothing is built", () => {
		expect(uncovered(map, [])).toEqual([...map.ground]);
	});
});
