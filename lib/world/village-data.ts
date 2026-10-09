// The village table (spec 4): one read per visit, an upsert per save. Rows are the owner's only (RLS).
import { supabase } from "@/lib/supabase";
import { isVillageRow, saveRow, type RoomProgress, type VillageRow } from "./progress";

// ok is false when it could not be read (a network error, or the table is not migrated yet): then he does not build
// and nothing is saved this visit, rather than building on a count that may be wrong.
export async function loadVillage(): Promise<{ rows: VillageRow[]; ok: boolean }> {
	const r = await supabase.from("village").select("room,laid,started_at,finished_at");
	if (r.error) return { rows: [], ok: false };
	return { rows: ((r.data ?? []) as unknown[]).filter(isVillageRow), ok: true };
}

// user_id comes from the column default (auth.uid()), as the room's other upserts do. True when it was saved.
export async function saveRoom(p: RoomProgress): Promise<boolean> {
	const { error } = await supabase.from("village").upsert(saveRow(p), { onConflict: "user_id,room" });
	if (error) console.error("Could not save the village", error);
	return !error;
}
