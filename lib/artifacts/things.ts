// Insights wording and shape for the things Osmo has made (spec 8). Pure: no database, no clock.
export type ThingRow = { id: string; title: string; version: number; parent_id: string | null; created_at: string };

const TITLE_MAX = 60;

// A row from the database, or null when it is not shaped like one. The source column is never read here.
export function sanitizeThing(raw: unknown): ThingRow | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.id !== "string" || r.id === "") return null;
	if (typeof r.version !== "number" || !Number.isFinite(r.version)) return null;
	if (typeof r.title !== "string" || r.title === "" || Array.from(r.title).length > TITLE_MAX) return null;
	if (typeof r.created_at !== "string") return null;
	return { id: r.id, title: r.title, version: r.version, parent_id: typeof r.parent_id === "string" ? r.parent_id : null, created_at: r.created_at };
}

// The newest version of each chain: the rows no other row points to, newest first.
export function latestOfChains(rows: ThingRow[]): ThingRow[] {
	const pointedTo = new Set(rows.map((r) => r.parent_id).filter((p): p is string => p !== null));
	return rows.filter((r) => !pointedTo.has(r.id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// A plain day, built from parts so the wording does not depend on the ICU version.
function day(at: string, now: number): string | null {
	const d = new Date(at);
	if (Number.isNaN(d.getTime())) return null;
	const parts = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).formatToParts(d);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	const year = d.getFullYear() === new Date(now).getFullYear() ? "" : ` ${d.getFullYear()}`;
	return `${get("weekday")} ${get("day")} ${get("month")}${year}`;
}

export function describeThing(r: ThingRow, now: number): string {
	const when = day(r.created_at, now);
	const head = r.version > 1 ? `${r.title}, version ${r.version}` : r.title;
	return when ? `${head}, made on ${when}.` : `${head}.`;
}
