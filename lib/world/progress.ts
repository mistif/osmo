// How far he has built (spec 4), pure. The in-page count is the truth between saves; a save never moves the stored
// count backwards (the table's trigger keeps the larger, see docs/migrations/village-phase-1.sql).
import type { RoomId } from "./blueprints/types";

export type VillageRow = { room: string; laid: number; started_at: string; finished_at: string | null };
export type RoomProgress = { room: RoomId; laid: number; total: number; startedAt: string; finishedAt: string | null; saved: number };
export type VillageNews = { room: RoomId; event: "started" | "finished" };
export const SAVE_EVERY = 8;

export function isVillageRow(x: unknown): x is VillageRow {
	if (typeof x !== "object" || x === null) return false;
	const o = x as Record<string, unknown>;
	return (
		typeof o.room === "string" &&
		typeof o.laid === "number" &&
		Number.isFinite(o.laid) &&
		typeof o.started_at === "string" &&
		(o.finished_at === null || typeof o.finished_at === "string")
	);
}

// Where to pick up: the saved count, as a whole number between 0 and the blueprint's total.
export function resume(rows: readonly VillageRow[], room: RoomId, total: number, nowIso: string): RoomProgress {
	const saved = rows.find((r) => r.room === room);
	if (!saved) return { room, laid: 0, total, startedAt: nowIso, finishedAt: null, saved: 0 };
	const laid = Math.min(total, Math.max(0, Math.floor(saved.laid)));
	return { room, laid, total, startedAt: saved.started_at, finishedAt: laid >= total ? (saved.finished_at ?? nowIso) : null, saved: laid };
}

// One more block; says when the room has just started or just finished.
export function lay(p: RoomProgress, nowIso: string): { progress: RoomProgress; news: VillageNews | null } {
	if (p.laid >= p.total) return { progress: p, news: null };
	const laid = p.laid + 1;
	const finished = laid >= p.total;
	const progress: RoomProgress = { ...p, laid, finishedAt: finished ? nowIso : null };
	const news: VillageNews | null = finished ? { room: p.room, event: "finished" } : laid === 1 ? { room: p.room, event: "started" } : null;
	return { progress, news };
}

export const needsSave = (p: RoomProgress, reason: "block" | "hidden"): boolean =>
	p.laid > p.saved && (reason === "hidden" || p.laid - p.saved >= SAVE_EVERY || p.finishedAt !== null);
export const markSaved = (p: RoomProgress, laid: number): RoomProgress => ({ ...p, saved: Math.max(p.saved, laid) });
export const saveRow = (p: RoomProgress) => ({ room: p.room, laid: p.laid, started_at: p.startedAt, finished_at: p.finishedAt });
export const nextIndex = (p: RoomProgress): number | null => (p.laid < p.total ? p.laid : null);

const NAMES: Readonly<Record<RoomId, string>> = { island: "island", hall: "hall" };
// His own line for a room starting or finishing, when no model writes it (spec 4).
export function villageLine(news: VillageNews): string {
	const name = NAMES[news.room];
	return news.event === "started" ? `I have begun the ${name}.` : `The ${name} is finished.`;
}
