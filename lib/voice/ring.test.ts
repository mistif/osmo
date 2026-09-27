import { describe, expect, it } from "vitest";
import { SampleRing } from "./ring";

describe("SampleRing", () => {
	it("returns what was pushed since a position", () => {
		const ring = new SampleRing(8);
		ring.push(Int16Array.of(1, 2, 3));
		ring.push(Int16Array.of(4, 5));
		expect(ring.total).toBe(5);
		expect(Array.from(ring.since(0))).toEqual([1, 2, 3, 4, 5]);
		expect(Array.from(ring.since(3))).toEqual([4, 5]);
	});

	it("keeps only the newest samples once full", () => {
		const ring = new SampleRing(4);
		ring.push(Int16Array.of(1, 2, 3, 4, 5, 6));
		expect(Array.from(ring.since(0))).toEqual([3, 4, 5, 6]);
		expect(Array.from(ring.since(4))).toEqual([5, 6]);
	});

	it("returns nothing for a position that hasn't happened yet", () => {
		const ring = new SampleRing(4);
		ring.push(Int16Array.of(1, 2));
		expect(ring.since(10).length).toBe(0);
	});
});
