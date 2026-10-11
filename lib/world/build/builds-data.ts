// The builds table (spec section 6.2): one read per visit, inserts, forward-only saves, and Clear the world. Task 0 stub; T7 builds it.
import type { BuildRow, NewBuild } from "./types";

// ok is false when it could not be read: then he builds nothing and nothing is saved that visit.
export async function loadBuilds(): Promise<{ rows: BuildRow[]; ok: boolean }> {
	throw new Error("not built: loadBuilds");
}
// The row as saved, or null; taken is true when the table refused it because another unfinished build (or the same castle room) is already there.
export async function insertBuild(row: NewBuild): Promise<{ row: BuildRow | null; taken: boolean }> {
	void row;
	throw new Error("not built: insertBuild");
}
// Saves a build's count (the table keeps the larger) and its finish time (set once). True when saved.
export async function saveBuild(p: { id: string; laid: number; finished_at: string | null }): Promise<boolean> {
	void p;
	throw new Error("not built: saveBuild");
}
// Deletes every build (the castle's rooms too) and the old village rows; the islands stay. True when they are gone.
export async function clearWorld(): Promise<boolean> {
	throw new Error("not built: clearWorld");
}
export function isBuildRow(x: unknown): x is BuildRow {
	void x;
	throw new Error("not built: isBuildRow");
}
