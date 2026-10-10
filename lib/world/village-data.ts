// The village table (spec 4): one read per visit, an upsert per save, and Settings' "Clear the village". Rows are the
// owner's only (RLS). The import is relative so the test can stand in for the client.
import { supabase } from "../supabase";
import { CASTLE_ROOMS } from "./blueprints/types";
import { isVillageRow, saveRow, type RoomProgress, type VillageRow } from "./progress";

// Sent on window once the rows are gone; the world drops what it holds and reads the village again. Other open tabs
// hear it through localStorage (a "storage" event for CLEARED_KEY), so they stop saving their old counts too.
export const VILLAGE_CLEARED = "osmo:village-cleared";
export const CLEARED_KEY = "osmo-village-cleared";
// While a clear runs no save starts, and the clear first waits for a save already on its way, so an old count can never
// land after the rows are deleted. (The table's trigger guards updates only; a clear is a delete, so nothing stops it.)
let clearing = false;
let inFlight: Promise<unknown> = Promise.resolve();

// ok is false when it could not be read (a network error, or the table is not migrated yet): then he does not build
// and nothing is saved this visit, rather than building on a count that may be wrong.
export async function loadVillage(): Promise<{ rows: VillageRow[]; ok: boolean }> {
	const r = await supabase.from("village").select("room,laid,started_at,finished_at");
	if (r.error) return { rows: [], ok: false };
	return { rows: ((r.data ?? []) as unknown[]).filter(isVillageRow), ok: true };
}

// user_id comes from the column default (auth.uid()), as the room's other upserts do. True when it was saved; false
// when it failed or a clear is running.
export async function saveRoom(p: RoomProgress): Promise<boolean> {
	if (clearing) return false;
	const run = Promise.resolve(supabase.from("village").upsert(saveRow(p), { onConflict: "user_id,room" }));
	inFlight = run.catch(() => undefined);
	const { error } = await run;
	if (error) console.error("Could not save the village", error);
	return !error;
}

// Deletes every room of Gur's village. True when the rows are gone (also when there were none).
export async function clearVillage(): Promise<boolean> {
	if (clearing) return false;
	clearing = true;
	try {
		await inFlight;
		const { error } = await supabase.from("village").delete().in("room", [...CASTLE_ROOMS]);
		if (error) {
			console.error("Could not clear the village", error);
			return false;
		}
		// Before `clearing` ends, so the world has dropped its counts before any save can start again.
		if (typeof window !== "undefined") {
			window.dispatchEvent(new Event(VILLAGE_CLEARED));
			try {
				window.localStorage.setItem(CLEARED_KEY, new Date().toISOString());
			} catch {
				/* no storage: other tabs learn of it on their next visit */
			}
		}
		return true;
	} catch (err) {
		console.error("Could not clear the village", err);
		return false;
	} finally {
		clearing = false;
	}
}
