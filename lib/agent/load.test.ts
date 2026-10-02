import { describe, expect, it } from "vitest";
import { emptyBond } from "./bond/bond";
import { defaultState } from "./state";
import { CHARACTER } from "./character";
import { moodPosition } from "./heart";
import { stateFromRows } from "./load";

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

describe("stateFromRows: a saved genome", () => {
	it("loads normally and puts no genome on the state", () => {
		const r = stateFromRows(ok({ genome: { seed: 5, donors: { heart: "ghost" } } }), ok([]), ok([]));
		expect(r.ok).toBe(true);
		expect(r.state).not.toHaveProperty("genome");
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

describe("stateFromRows: slow mood", () => {
	const ok = <T>(data: T) => ({ data, error: null });
	const T0 = moodPosition(CHARACTER.baseline);
	const now = 1_000_000_000_000;
	const drifted = [T0[0] + 0.2, T0[1] - 0.1, T0[2] + 0.05];

	it("loads a saved mood relaxed by the clock: 12 hours halves its distance from rest", () => {
		const row = { mood: { pad: drifted, at: now - 12 * 3_600_000, causes: [] } };
		const mood = stateFromRows(ok(row), ok([]), ok([]), now).state.mood;
		expect(mood?.at).toBe(now);
		expect(mood?.pad[0]).toBeCloseTo(T0[0] + 0.1, 5);
		expect(mood?.pad[1]).toBeCloseTo(T0[1] - 0.05, 5);
	});

	it("loads null for a missing or null column, without failing the load", () => {
		for (const row of [{ outlook: 0.3 }, { mood: null }, { mood: "junk" }]) {
			const r = stateFromRows(ok(row), ok([]), ok([]), now);
			expect(r.ok).toBe(true);
			expect(r.state.mood).toBeNull();
		}
	});
});
