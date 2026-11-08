// Daily caps (spec 6.7), counted from the action log over 24 hours.
import type { OwnerDb } from "../server/admin";

import { LIMITS } from "../artifacts/compile";

// statuses: which log rows count (default done only). A failed build still cost tokens, so builds count failed rows too.
export const CAP_GROUPS: { names: string[]; limit: number; statuses?: string[] }[] = [
	{ names: ["reminder_set"], limit: 50 },
	{ names: ["note_add"], limit: 100 },
	{ names: ["weather_now", "weather_forecast"], limit: 100 },
	{ names: ["build"], limit: LIMITS.dailyBuilds, statuses: ["done", "failed"] },
];
export const NOTES_TOTAL = 500;

// extra raises the line by that many rows: buildGate counts after the ticket's own row is written.
export async function capReached(db: OwnerDb, name: string, now: number, extra = 0): Promise<boolean> {
	const group = CAP_GROUPS.find((g) => g.names.includes(name));
	if (!group) return false;
	const { count, error } = await db
		.from("actions")
		.select("id", { count: "exact", head: true })
		.in("name", group.names)
		.in("status", group.statuses ?? ["done"])
		.gte("at", new Date(now - 86_400_000).toISOString());
	return error !== null || (count ?? 0) >= group.limit + extra; // an unreadable count refuses
}
