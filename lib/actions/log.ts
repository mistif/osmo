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
		const { data, error } = await db.from("actions").insert({
				surface: row.surface,
				connector: row.connector,
				name: row.name,
				tier: row.tier,
				status: row.status,
				summary: row.summary.slice(0, 200),
				error: row.error === null ? null : String(row.error).slice(0, 200),
				pending_id: row.pending_id,
			}).select("id").single();
		return error ? null : ((data as { id: number }).id ?? null);
	} catch {
		return null;
	}
}

// Settles a log row that was written as "waiting" (spec 5). Update by id, the owner pinned by the db. It never throws.
export async function resolveLog(db: OwnerDb, actionId: number, status: ActionStatus, error?: string): Promise<void> {
	try {
		await db
			.from("actions")
			.update({ status, ...(error === undefined ? {} : { error: error.slice(0, 200) }) })
			.eq("id", actionId);
	} catch {
		// the daily sweep settles it
	}
}
