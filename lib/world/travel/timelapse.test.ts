import { describe, expect, it } from "vitest";
import type { Block } from "../blueprints/types";
import { lapseSchedule, LAPSE_MS, lookAt, shotsDue, VISIT_MS } from "./timelapse";

const run = (key: string, x0: number, n: number) => ({ key, blocks: Array.from({ length: n }, (_, i): Block => ({ x: x0 + (i % 5), y: 60 - Math.floor(i / 5), tile: "brick", layer: "walls" })) });

describe("the time-lapse (spec 4.7)", () => {
	const shots = lapseSchedule([run("a", 600, 30), run("b", 700, 10)]);
	it("pops every block in within 10 s, in order, sharing the time by size, visiting each site first", () => {
		expect([LAPSE_MS, VISIT_MS]).toEqual([10_000, 400]);
		expect(shots).toHaveLength(40);
		expect(shots[0]).toMatchObject({ at: 637, key: "a" });
		expect(shots[29]).toMatchObject({ at: 7500, key: "a" });
		expect(shots[30]).toMatchObject({ at: 8110, key: "b" });
		expect(shots[39].at).toBe(10_000);
		for (let i = 1; i < shots.length; i++) expect(shots[i].at).toBeGreaterThanOrEqual(shots[i - 1].at);
	});
	it("says how many have popped in and where the camera looks", () => {
		expect(shotsDue(shots, 0)).toBe(0);
		expect(shotsDue(shots, 7500)).toBe(30);
		expect(shotsDue(shots, 99_999)).toBe(40);
		expect(lookAt(shots, 100)).toEqual({ x: 602.5 * 16, y: 58 * 16 });
		expect(lookAt(shots, 7600)).toEqual({ x: 702.5 * 16, y: 60 * 16 });
		expect(lookAt(shots, 10_001)).toBeNull();
	});
	it("has nothing to show for nothing", () => {
		expect(lapseSchedule([])).toEqual([]);
		expect(lapseSchedule([run("a", 600, 0)])).toEqual([]);
	});
});
