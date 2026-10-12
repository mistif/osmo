// The builds as the world builds them (spec sections 4.7 and 6.2), pure: the castle's open rooms first, then one free
// build at a time, each from its saved footprint. Task 0 stub; T7 builds it.
import { cellsOf } from "../blueprints";
import { CASTLE_ROOMS, type Block, type CastleRoom } from "../blueprints/types";
import type { Rect } from "../map/types";
import { SAVE_EVERY, type VillageRow } from "../progress";
import { castleAt, castleFootprint, castleRecipeId, roomOfRecipe } from "./castle-sites";
import type { BuildNews, BuildProgress, BuildRow, Builds, NewBuild } from "./types";

const time = (iso: string | null | undefined): number => {
	const t = iso ? Date.parse(iso) : Number.NaN;
	return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};
const whole = (n: number, total: number) => Math.min(total, Math.max(0, Number.isFinite(n) ? Math.floor(n) : 0));
const castleOf = (p: { recipe: string }) => roomOfRecipe(p.recipe);

function fromRow(row: BuildRow, nowIso: string): BuildProgress {
	const blocks = cellsOf(row.footprint, row.x, row.y, row.recipe);
	const total = blocks.length;
	const laid = whole(row.laid, total);
	return {
		key: row.id, id: row.id, recipe: row.recipe, island: row.island, x: row.x, y: row.y, footprint: row.footprint, blocks, total, laid, saved: laid,
		startedAt: row.started_at, finishedAt: laid >= total ? (row.finished_at ?? nowIso) : null, reason: row.reason, params: row.params,
	};
}
function pendingRoom(room: CastleRoom, nowIso: string): BuildProgress {
	const at = castleAt(room);
	const footprint = castleFootprint(room);
	const recipe = castleRecipeId(room);
	const blocks = cellsOf(footprint, at.x, at.y, recipe);
	return { key: recipe, id: null, recipe, island: 0, x: at.x, y: at.y, footprint, blocks, total: blocks.length, laid: 0, saved: 0, startedAt: nowIso, finishedAt: null, reason: null, params: {} };
}
const roomProgress = (b: Builds, room: CastleRoom) => b.list.find((p) => p.recipe === castleRecipeId(room));
const frees = (b: Builds) => b.list.filter((p) => castleOf(p) === null).sort((p, q) => time(p.startedAt) - time(q.startedAt));
const replace = (b: Builds, next: BuildProgress, key: string): Builds => ({ ...b, list: b.list.map((p) => (p.key === key ? next : p)) });

// Every row's progress from its saved footprint (never recompiled), and the castle's open rooms queued as the village
// queues them: started rooms (they have a row) oldest first, then open rooms in spec order with key "castle:<room>" and id null.
export function resumeBuilds(rows: readonly BuildRow[], open: readonly CastleRoom[], nowIso: string): Builds {
	const list = rows.map((r) => fromRow(r, nowIso));
	const startOf = (room: CastleRoom) => time(list.find((p) => p.recipe === castleRecipeId(room))?.startedAt);
	const started = CASTLE_ROOMS.filter((room) => list.some((p) => p.recipe === castleRecipeId(room))).sort((a, b) => {
		const d = startOf(a) - startOf(b);
		return Number.isNaN(d) ? 0 : d;
	});
	const castle = [...started, ...CASTLE_ROOMS.filter((room) => open.includes(room) && !started.includes(room))];
	for (const room of castle) if (!list.some((p) => p.recipe === castleRecipeId(room))) list.push(pendingRoom(room, nowIso));
	return { castle, list };
}
// Rooms opened during the visit join the end of the castle's queue.
export function admitRooms(b: Builds, open: readonly CastleRoom[], nowIso: string): Builds {
	const add = CASTLE_ROOMS.filter((room) => open.includes(room) && !b.castle.includes(room));
	if (add.length === 0) return b;
	return { castle: [...b.castle, ...add], list: [...b.list, ...add.filter((room) => !roomProgress(b, room)).map((room) => pendingRoom(room, nowIso))] };
}
// What he works on: the first castle room in the queue not finished, else the free build not finished, else null.
export function currentBuild(b: Builds): BuildProgress | null {
	for (const room of b.castle) {
		const p = roomProgress(b, room);
		if (p && p.laid < p.total) return p;
	}
	return freeInProgress(b);
}
// True while an open castle room is not finished: no free block is laid and no decision is due then.
export const castleWaiting = (b: Builds): boolean => b.castle.some((room) => {
	const p = roomProgress(b, room);
	return p !== undefined && p.laid < p.total;
});
// The free build not finished, if any (it may be paused behind the castle).
export const freeInProgress = (b: Builds): BuildProgress | null => frees(b).find((p) => p.laid < p.total) ?? null;
export function nextBuildBlock(b: Builds): Block | null {
	const p = currentBuild(b);
	return p ? (p.blocks[p.laid] ?? null) : null;
}
// One block of the current build; news when it has just started (its first block) or just finished.
export function layBuild(b: Builds, nowIso: string): { builds: Builds; news: BuildNews | null; laid: BuildProgress | null } {
	const p = currentBuild(b);
	if (!p) return { builds: b, news: null, laid: null };
	const laid = p.laid + 1;
	const finished = laid >= p.total;
	const next: BuildProgress = { ...p, laid, startedAt: p.laid === 0 && p.id === null ? nowIso : p.startedAt, finishedAt: finished ? nowIso : null };
	const news: BuildNews | null = finished ? { key: p.key, recipe: p.recipe, event: "finished" } : laid === 1 ? { key: p.key, recipe: p.recipe, event: "started" } : null;
	return { builds: replace(b, next, p.key), news, laid: next };
}
// A free build the planner chose and the table took (laid 0): it becomes the free build in progress.
export const startBuild = (b: Builds, row: BuildRow): Builds => ({ ...b, list: [...b.list, fromRow(row, row.started_at)] });
// Every block laid so far, build by build (the castle's queue first, then the free builds by start).
export function laidBuildBlocks(b: Builds): Block[] {
	const castle = b.castle.flatMap((room) => {
		const p = roomProgress(b, room);
		return p ? p.blocks.slice(0, p.laid) : [];
	});
	return [...castle, ...frees(b).flatMap((p) => p.blocks.slice(0, p.laid))];
}
export const finishedCastle = (b: Builds): CastleRoom[] => b.castle.filter((room) => {
	const p = roomProgress(b, room);
	return p !== undefined && p.laid >= p.total;
});
export const finishedFree = (b: Builds): BuildProgress[] => frees(b).filter((p) => p.laid >= p.total);
// The builds to save now, by progress.ts's rule (ahead by SAVE_EVERY, finished, or the tab hidden).
export const dueBuildSaves = (b: Builds, reason: "block" | "hidden"): BuildProgress[] =>
	b.list.filter((p) => p.laid > p.saved && (reason === "hidden" || p.laid - p.saved >= SAVE_EVERY || p.finishedAt !== null));
// After a save: the saved count (never backwards) and, for a castle room's first save, the new row's id (its key becomes the id).
export function markBuildSaved(b: Builds, key: string, laid: number, id: string | null): Builds {
	const p = b.list.find((x) => x.key === key);
	if (!p) return b;
	const withId = p.id === null && id !== null ? { id, key: id } : {};
	return replace(b, { ...p, ...withId, saved: Math.max(p.saved, laid) }, key);
}
// After a pause: when any saved row is gone or behind what this page saved, the read wins.
export function adoptBuilds(b: Builds, rows: readonly BuildRow[], open: readonly CastleRoom[], nowIso: string): { builds: Builds; adopted: boolean } {
	const behind = b.list.some((p) => {
		if (p.saved <= 0 || p.id === null) return false;
		const row = rows.find((r) => r.id === p.id);
		return !row || row.laid < p.saved;
	});
	return behind ? { builds: resumeBuilds(rows, open, nowIso), adopted: true } : { builds: b, adopted: false };
}
// The footprint rect of every build with a row or in the castle's queue.
export const builtRects = (b: Builds): Rect[] => b.list.map((p) => ({ x: p.x, y: p.y, w: p.footprint.map[0]?.length ?? 0, h: p.footprint.map.length }));
// The row a castle room's first save inserts.
export const newCastleRow = (p: BuildProgress): NewBuild => ({
	recipe: p.recipe, params: {}, island: 0, x: p.x, y: p.y, footprint: p.footprint, total: p.total, laid: p.laid, reason: null, started_at: p.startedAt, finished_at: p.finishedAt,
});
// What the village table holds that builds does not (spec 6.3, progress made after the move): castle rooms to insert,
// and castle rows to raise to the village's count. Only while builds still holds the castle as it was copied from
// village (a castle row with its village row's start: the migration's copy, or an earlier carry). After Clear the world
// builds holds no such row, so a village that could not be deleted (read-only, or a delete that took no rows) never
// brings the cleared castle back, and a room he starts again has a new start, so it is never raised to the old count.
export function castleCarry(rows: readonly BuildRow[], village: readonly VillageRow[]): { insert: NewBuild[]; raise: { id: string; laid: number }[] } {
	const insert: NewBuild[] = [];
	const raise: { id: string; laid: number }[] = [];
	const sameStart = (a: string, b: string) => Date.parse(a) === Date.parse(b) && Number.isFinite(Date.parse(a));
	const copied = (r: BuildRow) => village.some((v) => castleRecipeId(v.room as CastleRoom) === r.recipe && sameStart(r.started_at, v.started_at));
	if (!rows.some(copied)) return { insert, raise };
	for (const room of CASTLE_ROOMS) {
		const v = village.find((r) => r.room === room);
		if (!v) continue;
		const at = castleAt(room);
		const footprint = castleFootprint(room);
		const recipe = castleRecipeId(room);
		const total = cellsOf(footprint, at.x, at.y, recipe).length;
		const laid = whole(v.laid, total);
		const have = rows.find((r) => r.recipe === recipe);
		if (!have) {
			insert.push({
				recipe, params: {}, island: 0, x: at.x, y: at.y, footprint, total, laid, reason: null, started_at: v.started_at,
				finished_at: laid >= total ? (v.finished_at ?? v.started_at) : null,
			});
		} else if (have.laid < laid && sameStart(have.started_at, v.started_at)) raise.push({ id: have.id, laid });
	}
	return { insert, raise };
}
