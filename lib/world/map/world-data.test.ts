import { beforeEach, describe, expect, it, vi } from "vitest";

const ROW = { seed: 1234567, gen: 1, islands: 4, budget_at: "2026-10-11T08:00:00.000Z", created_at: "2026-10-11T08:00:00.000Z", seen_at: "2026-10-11T08:00:00.000Z" };
const db = vi.hoisted(() => ({ row: null as unknown, readError: null as { message: string } | null, writeError: null as { message: string } | null, calls: [] as string[] }));
vi.mock("../../supabase", () => ({
	supabase: {
		from: (table: string) => ({
			select: (cols: string) => ({
				maybeSingle: async () => {
					db.calls.push(`select ${table} ${cols}`);
					return { data: db.readError ? null : db.row, error: db.readError };
				},
			}),
			upsert: async (row: Record<string, unknown>, opts: Record<string, unknown>) => {
				db.calls.push(`upsert ${table} ${JSON.stringify(row)} ${JSON.stringify(opts)}`);
				if (!db.writeError && db.row === null) db.row = { seed: 999, gen: 1, islands: 4, budget_at: "2026-10-11T09:00:00.000Z", created_at: "2026-10-11T09:00:00.000Z", seen_at: "2026-10-11T09:00:00.000Z" };
				return { error: db.writeError };
			},
		}),
	},
}));

import { awayOf, createWorld, isWorldRow, loadWorld, saveWorld } from "./world-data";

beforeEach(() => {
	db.row = null;
	db.readError = null;
	db.writeError = null;
	db.calls = [];
});

describe("the world row", () => {
	it("reads none, a row, or a failure", async () => {
		expect(await loadWorld()).toEqual({ row: null, ok: true });
		db.row = ROW;
		expect(await loadWorld()).toEqual({ row: ROW, ok: true });
		db.readError = { message: "relation does not exist" };
		expect(await loadWorld()).toEqual({ row: null, ok: false });
		expect(db.calls[0]).toBe("select world seed,gen,islands,budget_at,created_at,seen_at");
	});
	it("reads a malformed row as a failure", async () => {
		db.row = { ...ROW, islands: 9 };
		expect(await loadWorld()).toEqual({ row: null, ok: false });
	});
	it("makes the row from the table's defaults, keeping one another tab made, and reads it back", async () => {
		const made = await createWorld();
		expect(made.ok).toBe(true);
		expect(made.row?.seed).toBe(999);
		expect(db.calls[0]).toBe('upsert world {"gen":1} {"onConflict":"user_id","ignoreDuplicates":true}');
		db.row = ROW;
		expect((await createWorld()).row).toEqual(ROW);
	});
	it("saves only what it is given, forward only by the table", async () => {
		expect(await saveWorld({ islands: 5 })).toBe(true);
		expect(db.calls.at(-1)).toBe('upsert world {"islands":5} {"onConflict":"user_id"}');
		expect(await saveWorld({ budget_at: "2026-10-12T00:00:00.000Z" })).toBe(true);
		expect(await saveWorld({ seen_at: "2026-10-12T00:00:00.000Z" })).toBe(true);
		expect(db.calls.at(-1)).toBe('upsert world {"seen_at":"2026-10-12T00:00:00.000Z"} {"onConflict":"user_id"}');
		expect(await saveWorld({})).toBe(true);
		expect(db.calls).toHaveLength(3);
		db.writeError = { message: "no" };
		expect(await saveWorld({ islands: 6 })).toBe(false);
	});
	it("knows a row when it sees one", () => {
		expect(isWorldRow(ROW)).toBe(true);
		for (const bad of [null, 3, { ...ROW, seed: "1" }, { ...ROW, islands: 0 }, { ...ROW, budget_at: "soon" }, { ...ROW, gen: 1.5 }, { ...ROW, seen_at: undefined }, { ...ROW, seen_at: "soon" }]) {
			expect(isWorldRow(bad)).toBe(false);
		}
	});
	it("Gur away a long time is since the world was last seen, not since the budget was last spent (ruling 12)", () => {
		const now = Date.parse("2026-10-25T08:00:00.000Z");
		// Two weeks of BIGWORLD alone (budget_at never moves then), seen yesterday: one day away, not fourteen.
		expect(awayOf({ ...ROW, seen_at: "2026-10-24T08:00:00.000Z" }, now)).toBe(86_400_000);
		expect(awayOf({ ...ROW, seen_at: "2026-10-26T08:00:00.000Z" }, now)).toBe(0); // a clock moved back
	});
});
