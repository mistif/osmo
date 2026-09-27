import { describe, expect, it } from "vitest";
import { WAKE, WakeGate } from "./wake";

const high = WAKE.threshold + 0.1;

describe("WakeGate", () => {
	it("needs two strong frames in a row", () => {
		const gate = new WakeGate();
		expect(gate.feed(high, 0)).toBe(false);
		expect(gate.feed(high, 80)).toBe(true);
	});

	it("starts counting again after a weak frame", () => {
		const gate = new WakeGate();
		gate.feed(high, 0);
		gate.feed(0.1, 80);
		expect(gate.feed(high, 160)).toBe(false);
	});

	it("won't wake again within the cooldown", () => {
		const gate = new WakeGate();
		gate.feed(high, 0);
		expect(gate.feed(high, 80)).toBe(true);
		gate.feed(high, 1000);
		expect(gate.feed(high, 1080)).toBe(false);
		expect(gate.feed(high, 80 + WAKE.cooldownMs)).toBe(true);
	});
});
