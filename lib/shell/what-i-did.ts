// Insights wording: the audit log of what Osmo did, one plain sentence per row.
export type ActionRow = { id: number; at: string; surface: string; status: string; summary: string };

const STATUS: Record<string, string> = {
	done: "done",
	failed: "could not do it",
	refused: "not allowed",
	waiting: "waiting for your yes",
	cancelled: "cancelled",
	expired: "expired",
};

const SURFACE: Record<string, string> = {
	room: "in the room",
	telegram: "from Telegram",
	cron: "by the timer",
	confirm: "after your yes",
};

// Plain, speakable day and time, built from parts so the wording does not depend on the ICU version.
function when(at: string, now: number): string | null {
	const d = new Date(at);
	if (Number.isNaN(d.getTime())) return null;
	const parts = new Intl.DateTimeFormat("en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(d);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	const year = d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`;
	return `${get("weekday")} ${get("day")} ${get("month")}${year}, ${get("hour")}:${get("minute")}`;
}

export function describeAction(row: ActionRow, now: number): string {
	const status = STATUS[row.status] ?? "";
	const surface = SURFACE[row.surface] ?? "";
	const day = when(row.at, now);
	const summary = typeof row.summary === "string" ? row.summary.trim() : "";
	const where = [day, surface].filter(Boolean).join(", ");
	let head: string;
	if (row.status === "waiting") head = where ? `Waiting for your yes, ${where}.` : "Waiting for your yes.";
	else if (status) head = where ? `${where}: ${status}.` : `${status[0].toUpperCase()}${status.slice(1)}.`;
	else head = where ? `${where}.` : "";
	const tail = summary && !/[.?]$/.test(summary) ? `${summary}.` : summary;
	return [head, tail].filter(Boolean).join(" ");
}

// A row from the database, or null when it is not shaped like one.
export function sanitizeActionRow(raw: unknown): ActionRow | null {
	if (typeof raw !== "object" || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.id !== "number" || !Number.isFinite(r.id)) return null;
	return {
		id: r.id,
		at: typeof r.at === "string" ? r.at : "",
		surface: typeof r.surface === "string" ? r.surface : "",
		status: typeof r.status === "string" ? r.status : "",
		summary: typeof r.summary === "string" ? r.summary : "",
	};
}
