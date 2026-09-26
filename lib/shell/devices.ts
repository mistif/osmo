// A saved passkey as a readable row: its name and when it was last used.
import { localDay } from "../agent/bond/bond";
import { shortDate } from "./story";

export type DeviceSource = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

function daysBetween(fromIso: string, now: number): number {
	const start = new Date(localDay(new Date(fromIso).getTime()) + "T12:00:00");
	const end = new Date(localDay(now) + "T12:00:00");
	return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function deviceRow(item: DeviceSource, now: number): { id: string; name: string; lastUsed: string } {
	const name = item.friendly_name?.trim() || "Unnamed device";
	if (!item.last_used_at) return { id: item.id, name, lastUsed: "Not used yet" };
	const days = daysBetween(item.last_used_at, now);
	const lastUsed =
		days <= 0 ? "Used today" : days === 1 ? "Used yesterday" : days < 7 ? `Used ${days} days ago` : `Used on ${shortDate(item.last_used_at, now)}`;
	return { id: item.id, name, lastUsed };
}
