// The world row (spec section 6.1): one read per visit, made on the first visit, saved forward only. Task 0 stub; T1 builds it.
import type { WorldRow } from "./types";

// ok is false when it could not be read (a network error, the table not migrated): then the world is drawn from seed 0
// and nothing is saved that visit. row is null when there is none yet.
export async function loadWorld(): Promise<{ row: WorldRow | null; ok: boolean }> {
	throw new Error("not built: loadWorld");
}
// Makes the row from the table's defaults (the database picks the seed), or keeps the one another tab made first, and
// reads it back.
export async function createWorld(): Promise<{ row: WorldRow | null; ok: boolean }> {
	throw new Error("not built: createWorld");
}
// Saves how many islands are present and how far the budget is spent; the table keeps the larger of each. True when saved.
export async function saveWorld(patch: { islands?: number; budget_at?: string }): Promise<boolean> {
	void patch;
	throw new Error("not built: saveWorld");
}
export function isWorldRow(x: unknown): x is WorldRow {
	void x;
	throw new Error("not built: isWorldRow");
}
