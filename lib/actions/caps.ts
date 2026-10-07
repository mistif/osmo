// Daily caps (spec 6.7), counted from the action log over 24 hours.
import type { OwnerDb } from "../server/admin";

export const CAP_GROUPS: { names: string[]; limit: number }[] = [
	{ names: ["reminder_set"], limit: 50 },
	{ names: ["note_add"], limit: 100 },
	{ names: ["weather_now", "weather_forecast"], limit: 100 },
];
export const NOTES_TOTAL = 500;

export async function capReached(db: OwnerDb, name: string, now: number): Promise<boolean> {
	const group = CAP_GROUPS.find((g) => g.names.includes(name));
	if (!group) return false;
	const { count, error } = await db
		.from("actions")
		.select("id", { count: "exact", head: true })
		.in("name", group.names)
		.eq("status", "done")
		.gte("at", new Date(now - 86_400_000).toISOString());
	return error !== null || (count ?? 0) >= group.limit; // an unreadable count refuses
}
