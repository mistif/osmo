import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
	rows: [] as unknown[], readError: null as { code?: string } | null, insertError: null as { code: string } | null, updateError: null as { code: string } | null,
	calls: [] as string[],
}));
vi.mock("../../supabase", () => ({
	supabase: {
		from: (table: string) => ({
			select: async (cols: string) => {
				db.calls.push(`select ${table} ${cols}`);
				return { data: db.readError ? null : db.rows, error: db.readError };
			},
			insert: (row: Record<string, unknown>) => ({
				select: () => ({
					single: async () => {
						db.calls.push(`insert ${table} ${String(row.recipe)}`);
						if (db.insertError) return { data: null, error: db.insertError };
						return { data: { id: "new-id", started_at: "2026-10-11T12:00:00.000Z", finished_at: null, ...row }, error: null };
					},
				}),
			}),
			update: (patch: Record<string, unknown>) => ({
				eq: async (col: string, value: string) => {
					db.calls.push(`update ${table} ${JSON.stringify(patch)} ${col}=${value}`);
					return { error: db.updateError };
				},
			}),
			delete: () => ({
				not: async () => {
					db.calls.push(`delete ${table} all`);
					return { error: null };
				},
				in: async () => {
					db.calls.push(`delete ${table} rooms`);
					return { error: null };
				},
			}),
		}),
	},
}));

import { clearWorld, insertBuild, isBuildRow, loadBuilds, saveBuild } from "./builds-data";

const FP = { map: ["BB"], decor: [], legend: { B: { tile: "brick" as const, layer: "walls" as const } } };
const ROW = { id: "a", recipe: "cottage", params: {}, island: 1, x: 600, y: 60, footprint: FP, total: 2, laid: 1, reason: "I wanted a small house here.", started_at: "2026-10-11T12:00:00.000Z", finished_at: null };
beforeEach(() => {
	db.rows = [];
	db.readError = null;
	db.insertError = null;
	db.updateError = null;
	db.calls = [];
	const win = new EventTarget();
	vi.stubGlobal("window", Object.assign(win, { localStorage: { setItem: () => {} } }));
});

describe("the builds table", () => {
	it("reads the rows, keeping only well-formed ones, and says when it cannot", async () => {
		db.rows = [ROW, { ...ROW, id: "b", footprint: { map: ["BX"], decor: [], legend: FP.legend } }, { ...ROW, id: "c", laid: "1" }];
		expect(await loadBuilds()).toEqual({ rows: [ROW], ok: true });
		db.readError = { code: "42P01" };
		expect(await loadBuilds()).toEqual({ rows: [], ok: false });
	});
	it("inserts a build and hands back the row; a second unfinished build is refused as taken", async () => {
		const { id, started_at, finished_at, ...fresh } = ROW;
		void [id, started_at, finished_at];
		expect((await insertBuild(fresh)).row?.id).toBe("new-id");
		db.insertError = { code: "23505" };
		expect(await insertBuild(fresh)).toEqual({ row: null, taken: true });
		db.insertError = { code: "08006" };
		expect(await insertBuild(fresh)).toEqual({ row: null, taken: false });
	});
	it("saves a count and a finish by id", async () => {
		expect(await saveBuild({ id: "a", laid: 2, finished_at: "2026-10-11T13:00:00.000Z" })).toBe(true);
		expect(db.calls.at(-1)).toBe('update builds {"laid":2,"finished_at":"2026-10-11T13:00:00.000Z"} id=a');
		db.updateError = { code: "42501" };
		expect(await saveBuild({ id: "a", laid: 2, finished_at: null })).toBe(false);
	});
	it("clears the world: the old village rows, then every build", async () => {
		expect(await clearWorld()).toBe(true);
		expect(db.calls).toEqual(["delete village rooms", "delete builds all"]);
	});
	it("knows a row and its footprint when it sees one", () => {
		expect(isBuildRow(ROW)).toBe(true);
		for (const bad of [null, { ...ROW, footprint: { map: ["B"], decor: ["xx"], legend: FP.legend } }, { ...ROW, footprint: { map: ["B"], decor: [], legend: { B: { tile: "nope", layer: "walls" } } } }, { ...ROW, x: 1.5 }, { ...ROW, finished_at: 3 }]) {
			expect(isBuildRow(bad)).toBe(false);
		}
	});
});
