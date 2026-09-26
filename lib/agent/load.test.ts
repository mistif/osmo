import { describe, expect, it } from "vitest";
import { emptyBond } from "./bond/bond";
import { defaultState } from "./state";
import { stateFromRows } from "./load";
import { assemble } from "./personality/assemble";

const ok = <T,>(data: T) => ({ data, error: null });
const fail = { data: null, error: { message: "boom" } };

describe("stateFromRows", () => {
	it("marks a fully successful load as ok and reads saved values", () => {
		const r = stateFromRows(
			ok({ outlook: 0.4, updated_at: "2026-01-01T00:00:00.000Z" }),
			ok([{ kind: "loss", count: 2, tendencies: { sadness: 0.3 } }]),
			ok([{ event_id: "t1", valence: "tragic" }]),
		);
		expect(r.ok).toBe(true);
		expect(r.state.outlook).toBe(0.4);
		expect(r.state.associations.loss.count).toBe(2);
		expect(r.state.history).toEqual([{ id: "t1", valence: "tragic" }]);
		expect(r.lastAt).toBe(Date.parse("2026-01-01T00:00:00.000Z"));
	});

	it("is ok with defaults for a brand-new user (no rows, no errors)", () => {
		const r = stateFromRows(ok(null), ok([]), ok([]));
		expect(r.ok).toBe(true);
		expect(r.state).toEqual(defaultState());
		expect(r.lastAt).toBeNull();
	});

	it("is not ok when any query failed, so callers never save defaults over real data", () => {
		expect(stateFromRows(fail, ok([]), ok([])).ok).toBe(false);
		expect(stateFromRows(ok(null), fail, ok([])).ok).toBe(false);
		expect(stateFromRows(ok(null), ok([]), fail).ok).toBe(false);
	});
});

describe("stateFromRows: genome", () => {
	it("reads a saved genome", () => {
		const genome = assemble(21);
		const r = stateFromRows(ok({ genome }), ok([]), ok([]));
		expect(r.state.genome).toEqual(genome);
	});

	it("is neutral (null) when nothing was saved", () => {
		expect(stateFromRows(ok(null), ok([]), ok([])).state.genome).toBeNull();
		expect(stateFromRows(ok({ outlook: 0.1 }), ok([]), ok([])).state.genome).toBeNull();
	});

	it("repairs unknown donors and drops garbage without failing the load", () => {
		const r = stateFromRows(ok({ genome: { seed: 5, donors: { heart: "ghost" } } }), ok([]), ok([]));
		expect(r.ok).toBe(true);
		expect(r.state.genome?.seed).toBe(5);
		expect(r.state.genome?.donors.heart).not.toBe("ghost");
		expect(stateFromRows(ok({ genome: "garbage" }), ok([]), ok([])).state.genome).toBeNull();
	});
});

describe("stateFromRows: bond", () => {
	const ok = <T>(data: T) => ({ data, error: null });
	it("loads a null bond column as a fresh bond without losing the rest", () => {
		const loaded = stateFromRows(ok({ bond: null, outlook: 0.3 }), ok([]), ok([]));
		expect(loaded.ok).toBe(true);
		expect(loaded.state.bond).toEqual(emptyBond());
		expect(loaded.state.outlook).toBeCloseTo(0.3);
	});

	it("loads a saved bond", () => {
		const bond = { ...emptyBond(), messages: 9, days: 3, lastDay: "2026-09-25", metAt: "2026-09-23T10:00:00.000Z" };
		expect(stateFromRows(ok({ bond }), ok([]), ok([])).state.bond).toEqual(bond);
	});
});
