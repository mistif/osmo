// The world row (spec section 6.1): one read per visit, made on the first visit, saved forward only.
import { supabase } from "../../supabase";
import { GEN, MAX_ISLANDS, type WorldRow } from "./types";

const COLUMNS = "seed,gen,islands,budget_at,created_at,seen_at";
const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

export function isWorldRow(x: unknown): x is WorldRow {
	if (typeof x !== "object" || x === null) return false;
	const o = x as Record<string, unknown>;
	return (
		whole(o.seed) && whole(o.gen) && whole(o.islands) && o.islands >= 1 && o.islands <= MAX_ISLANDS &&
		typeof o.budget_at === "string" && Number.isFinite(Date.parse(o.budget_at)) && typeof o.created_at === "string" &&
		typeof o.seen_at === "string" && Number.isFinite(Date.parse(o.seen_at))
	);
}
// How long the world was away (ruling 12, "Gur away a long time"): since a page last ran it (seen_at, saved at each load
// and each hide), never negative. Not budget_at: that moves only when free blocks are spent, so it stands still while
// BIGWORLD runs without BUILDS, or while the castle or the day's decisions hold the budget at its cap.
export function awayOf(row: WorldRow, now: number): number {
	const t = Date.parse(row.seen_at);
	return Number.isFinite(t) && Number.isFinite(now) ? Math.max(0, now - t) : 0;
}

// ok is false when it could not be read (a network error, the table not migrated): then the world is drawn from seed 0
// and nothing is saved that visit. row is null when there is none yet.
export async function loadWorld(): Promise<{ row: WorldRow | null; ok: boolean }> {
	const r = await supabase.from("world").select(COLUMNS).maybeSingle();
	if (r.error) return { row: null, ok: false };
	if (r.data === null) return { row: null, ok: true };
	return isWorldRow(r.data) ? { row: r.data, ok: true } : { row: null, ok: false };
}

// Makes the row from the table's defaults (the database picks the seed), or keeps the one another tab made first, and
// reads it back.
export async function createWorld(): Promise<{ row: WorldRow | null; ok: boolean }> {
	const made = await supabase.from("world").upsert({ gen: GEN }, { onConflict: "user_id", ignoreDuplicates: true });
	if (made.error) return { row: null, ok: false };
	return loadWorld();
}

// Saves how many islands are present, how far the budget is spent and when the world was last seen; the table keeps
// the larger of each. True when saved.
export async function saveWorld(patch: { islands?: number; budget_at?: string; seen_at?: string }): Promise<boolean> {
	const row: Record<string, unknown> = {};
	if (patch.islands !== undefined) row.islands = patch.islands;
	if (patch.budget_at !== undefined) row.budget_at = patch.budget_at;
	if (patch.seen_at !== undefined) row.seen_at = patch.seen_at;
	if (Object.keys(row).length === 0) return true;
	const { error } = await supabase.from("world").upsert(row, { onConflict: "user_id" });
	if (error) console.error("Could not save the world", error);
	return !error;
}
