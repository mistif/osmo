import type { OwnerDb } from "../server/admin";
import type { Surface, Tier } from "./types";

export type ActionStatus = "done" | "failed" | "refused" | "waiting" | "cancelled" | "expired";
export type LogRow = {
	surface: Surface;
	connector: string;
	name: string;
	tier: Tier;
	status: ActionStatus;
	summary: string;
	error: string | null;
	pending_id: string | null;
};

// One row per attempt (spec 5). It never throws: a log that fails must not break the turn.
export async function writeAction(db: OwnerDb, row: LogRow): Promise<number | null> {
	try {
		const { data, error } = await db.from("actions").insert({ ...row, summary: row.summary.slice(0, 200) }).select("id").single();
		return error ? null : ((data as { id: number }).id ?? null);
	} catch {
		return null;
	}
}
