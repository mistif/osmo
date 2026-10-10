import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What reached the table, in order, and a way to hold an upsert open or make the delete fail.
const log: string[] = [];
let holdUpsert: Promise<void> | null = null;
let deleteError: { message: string } | null = null;
let deleted: { column: string; values: string[] } | null = null;

vi.mock("../supabase", () => ({
	supabase: {
		from: (table: string) => ({
			upsert: async (row: { room: string; laid: number }) => {
				if (holdUpsert) await holdUpsert;
				log.push(`upsert ${table} ${row.room} ${row.laid}`);
				return { error: null };
			},
			delete: () => ({
				in: async (column: string, values: string[]) => {
					deleted = { column, values };
					log.push(`delete ${table}`);
					return { error: deleteError };
				},
			}),
		}),
	},
}));

import { CASTLE_ROOMS } from "./blueprints/types";
import { resume } from "./progress";
import { CLEARED_KEY, clearVillage, saveRoom, VILLAGE_CLEARED } from "./village-data";

const NOW = "2026-10-10T12:00:00.000Z";
const hall = (laid: number) => ({ ...resume([], "hall", 180, NOW), laid });

beforeEach(() => {
	log.length = 0;
	holdUpsert = null;
	deleteError = null;
	deleted = null;
	const win = new EventTarget();
	win.addEventListener(VILLAGE_CLEARED, () => log.push("cleared"));
	vi.stubGlobal("window", win);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("clearing the village", () => {
	it("deletes every room of the owner's village, then tells the world", async () => {
		expect(await clearVillage()).toBe(true);
		expect(deleted).toEqual({ column: "room", values: [...CASTLE_ROOMS] });
		expect(log).toEqual(["delete village", "cleared"]);
	});
	it("waits for a save already on its way, so an old count never lands after the delete", async () => {
		let release = () => {};
		holdUpsert = new Promise<void>((r) => (release = r));
		const saving = saveRoom(hall(40));
		const clearing = clearVillage();
		await Promise.resolve();
		expect(log).toEqual([]);
		release();
		expect(await saving).toBe(true);
		expect(await clearing).toBe(true);
		expect(log).toEqual(["upsert village hall 40", "delete village", "cleared"]);
	});
	it("starts no save while it clears, and saves again afterwards", async () => {
		let release = () => {};
		holdUpsert = new Promise<void>((r) => (release = r));
		const first = saveRoom(hall(8));
		const clearing = clearVillage();
		expect(await saveRoom(hall(16))).toBe(false);
		release();
		await first;
		await clearing;
		holdUpsert = null;
		expect(await saveRoom(hall(1))).toBe(true);
		expect(log).toEqual(["upsert village hall 8", "delete village", "cleared", "upsert village hall 1"]);
	});
	it("tells the other open tabs through localStorage, and does without it", async () => {
		const stored = new Map<string, string>();
		const win = Object.assign(new EventTarget(), { localStorage: { setItem: (k: string, v: string) => void stored.set(k, v) } });
		vi.stubGlobal("window", win);
		expect(await clearVillage()).toBe(true);
		expect(stored.get(CLEARED_KEY)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: { setItem: () => { throw new Error("blocked"); } } }));
		expect(await clearVillage()).toBe(true);
	});
	it("says false and tells nobody when the delete fails", async () => {
		deleteError = { message: "offline" };
		expect(await clearVillage()).toBe(false);
		expect(log).toEqual(["delete village"]);
		expect(await saveRoom(hall(3))).toBe(true);
	});
});
