// The builds table (spec section 6.2): one read per visit, inserts, forward-only saves, and Clear the world. Task 0 stub; T7 builds it.
import { supabase } from "../../supabase";
import { LAYER_ORDER } from "../blueprints/types";
import { TILE_IDS } from "../tiles";
import { clearingNow, clearVillage, trackSave } from "../village-data";
import type { BuildRow, Footprint, NewBuild } from "./types";

const COLUMNS = "id,recipe,params,island,x,y,footprint,total,laid,reason,started_at,finished_at";
const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

// A footprint as read back: a rectangle of letters, every letter but "." in the legend, every legend entry a known tile and layer.
export function isFootprint(x: unknown): x is Footprint {
	if (typeof x !== "object" || x === null) return false;
	const f = x as Record<string, unknown>;
	if (!strings(f.map) || f.map.length === 0 || !strings(f.decor) || typeof f.legend !== "object" || f.legend === null) return false;
	const w = f.map[0].length;
	if (w === 0 || f.map.some((r) => r.length !== w)) return false;
	if (f.decor.length !== 0 && (f.decor.length !== f.map.length || f.decor.some((r) => r.length !== w))) return false;
	const legend = f.legend as Record<string, unknown>;
	for (const e of Object.values(legend)) {
		const o = e as Record<string, unknown> | null;
		if (!o || !(TILE_IDS as readonly unknown[]).includes(o.tile) || !(LAYER_ORDER as readonly unknown[]).includes(o.layer)) return false;
	}
	for (const ch of [...f.map.join(""), ...f.decor.join("")]) if (ch !== "." && !(ch in legend)) return false;
	return true;
}
export function isBuildRow(x: unknown): x is BuildRow {
	if (typeof x !== "object" || x === null) return false;
	const o = x as Record<string, unknown>;
	return (
		typeof o.id === "string" && typeof o.recipe === "string" && whole(o.island) && whole(o.x) && whole(o.y) && whole(o.total) && whole(o.laid) &&
		isFootprint(o.footprint) && (o.reason === null || typeof o.reason === "string") && typeof o.started_at === "string" &&
		(o.finished_at === null || typeof o.finished_at === "string")
	);
}
// ok is false when it could not be read: then he builds nothing and nothing is saved that visit.
export async function loadBuilds(): Promise<{ rows: BuildRow[]; ok: boolean }> {
	const r = await supabase.from("builds").select(COLUMNS);
	if (r.error) return { rows: [], ok: false };
	return { rows: ((r.data ?? []) as unknown[]).filter(isBuildRow), ok: true };
}
// The row as saved, or null; taken is true when the table refused it because another unfinished build (or the same castle room) is already there.
export async function insertBuild(row: NewBuild): Promise<{ row: BuildRow | null; taken: boolean }> {
	if (clearingNow()) return { row: null, taken: false };
	const r = await trackSave(Promise.resolve(supabase.from("builds").insert(row).select(COLUMNS).single()));
	if (r.error) return { row: null, taken: r.error.code === "23505" };
	return isBuildRow(r.data) ? { row: r.data, taken: false } : { row: null, taken: false };
}
// Saves a build's count (the table keeps the larger) and its finish time (set once). True when saved.
export async function saveBuild(p: { id: string; laid: number; finished_at: string | null }): Promise<boolean> {
	if (clearingNow()) return false;
	const { error } = await trackSave(Promise.resolve(supabase.from("builds").update({ laid: p.laid, finished_at: p.finished_at }).eq("id", p.id)));
	if (error) console.error("Could not save a build", error);
	return !error;
}
// Deletes every build (the castle's rooms too) and the old village rows; the islands stay. True when they are gone.
export const clearWorld = (): Promise<boolean> => clearVillage({ builds: true });
