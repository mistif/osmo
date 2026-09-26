import { describe, expect, it } from "vitest";
import { hashString, mulberry32, roll } from "./rng";

describe("mulberry32", () => {
	it("is deterministic for a seed and stays in [0,1)", () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		for (let i = 0; i < 50; i++) {
			const v = a();
			expect(v).toBe(b());
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it("gives different streams for different seeds", () => {
		expect(mulberry32(1)()).not.toBe(mulberry32(2)());
	});
});

describe("hashString and roll", () => {
	it("hashes the same string the same way, and different strings differently", () => {
		expect(hashString("heart")).toBe(hashString("heart"));
		expect(hashString("heart")).not.toBe(hashString("brain"));
	});

	it("roll is stable for the same inputs and in range", () => {
		expect(roll(7, 3, "humor")).toBe(roll(7, 3, "humor"));
		for (let t = 0; t < 100; t++) {
			const v = roll(7, t, "humor");
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it("is roughly uniform over turns and differs between salts", () => {
		let sum = 0;
		let different = 0;
		for (let t = 0; t < 2000; t++) {
			sum += roll(99, t, "quirk");
			if (roll(99, t, "quirk") !== roll(99, t, "slang")) different++;
		}
		expect(sum / 2000).toBeGreaterThan(0.45);
		expect(sum / 2000).toBeLessThan(0.55);
		expect(different).toBeGreaterThan(1900);
	});
});
