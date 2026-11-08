import { describe, expect, it } from "vitest";
import { WAKE, WakeGate } from "./wake";

const high = WAKE.threshold + 0.1;

describe("WAKE", () => {
	it("is a touch stricter than openWakeWord's default of one frame at 0.5", () => {
		expect(WAKE.frames).toBe(1);
		expect(WAKE.threshold).toBe(0.6);
	});
});

describe("WakeGate", () => {
	it("wakes on one strong frame", () => {
		const gate = new WakeGate();
		expect(gate.feed(high, 0)).toBe(true);
	});

	it("wakes at exactly the threshold, and not just below it", () => {
		expect(new WakeGate().feed(WAKE.threshold, 0)).toBe(true);
		expect(new WakeGate().feed(WAKE.threshold - 0.01, 0)).toBe(false);
	});

	it("won't wake again within the cooldown", () => {
		const gate = new WakeGate();
		expect(gate.feed(high, 0)).toBe(true);
		expect(gate.feed(high, 1000)).toBe(false);
		expect(gate.feed(high, 1080)).toBe(false);
		expect(gate.feed(high, WAKE.cooldownMs)).toBe(true);
	});

	it("wakes again after a reset only once the cooldown has passed", () => {
		const gate = new WakeGate();
		gate.feed(high, 0);
		gate.reset();
		expect(gate.feed(high, 500)).toBe(false);
	});
});
