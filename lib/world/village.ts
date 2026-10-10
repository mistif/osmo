// The castle's progress across its rooms (spec 4), pure. Rooms are built one at a time, in the order they unlock:
// a room that has started (it has a saved row) keeps its place, oldest first, and rooms open but not started follow in
// spec order. Each room's own count is progress.ts's RoomProgress, so resume, lay and save work per room as in phase 1.
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { CASTLE_ROOMS, type Block, type CastleRoom, type RoomId } from "./blueprints/types";
import { lay, markSaved, needsSave, resume, type RoomProgress, type VillageNews, type VillageRow } from "./progress";

export type Village = { queue: readonly CastleRoom[]; rooms: Readonly<Partial<Record<CastleRoom, RoomProgress>>> };

const total = (room: CastleRoom): number => CASTLE_BLOCKS[room].length;
const laidIn = (v: Village, room: CastleRoom): number => v.rooms[room]?.laid ?? 0;
const time = (iso: string | undefined): number => {
	const t = iso === undefined ? Number.NaN : Date.parse(iso);
	return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

// The building order: started rooms by when they started (an unreadable date goes last; ties keep spec order), then
// the open rooms not started yet, in spec order. A started room stays even if its unlock rule is no longer true.
export function queueOf(rows: readonly VillageRow[], open: readonly CastleRoom[]): CastleRoom[] {
	const startOf = (room: CastleRoom) => time(rows.find((r) => r.room === room)?.started_at);
	const started = CASTLE_ROOMS.filter((room) => rows.some((r) => r.room === room)).sort((a, b) => {
		const d = startOf(a) - startOf(b);
		return Number.isNaN(d) ? 0 : d;
	});
	return [...started, ...CASTLE_ROOMS.filter((room) => open.includes(room) && !started.includes(room))];
}

export function resumeVillage(rows: readonly VillageRow[], open: readonly CastleRoom[], nowIso: string): Village {
	const queue = queueOf(rows, open);
	const rooms: Partial<Record<CastleRoom, RoomProgress>> = {};
	for (const room of queue) rooms[room] = resume(rows, room, total(room), nowIso);
	return { queue, rooms };
}

// Rooms that opened during the visit (Settings opened for the first time) join the end of the queue.
export function admit(v: Village, open: readonly CastleRoom[], nowIso: string): Village {
	const add = CASTLE_ROOMS.filter((room) => open.includes(room) && !v.queue.includes(room));
	if (add.length === 0) return v;
	const rooms: Partial<Record<CastleRoom, RoomProgress>> = { ...v.rooms };
	for (const room of add) rooms[room] = resume([], room, total(room), nowIso);
	return { queue: [...v.queue, ...add], rooms };
}

// The room he works on: the first in the queue that is not finished. Null when every open room is done.
export function current(v: Village): CastleRoom | null {
	return v.queue.find((room) => laidIn(v, room) < total(room)) ?? null;
}
export function nextBlock(v: Village): Block | null {
	const room = current(v);
	return room === null ? null : (CASTLE_BLOCKS[room][laidIn(v, room)] ?? null);
}

// One more block of the room he works on. `laid` is that room's progress afterwards (save it when needsSave says so).
export function layNext(v: Village, nowIso: string): { village: Village; news: VillageNews | null; laid: RoomProgress | null } {
	const room = current(v);
	const p = room === null ? undefined : v.rooms[room];
	if (room === null || !p) return { village: v, news: null, laid: null };
	const r = lay(p, nowIso);
	return { village: { ...v, rooms: { ...v.rooms, [room]: r.progress } }, news: r.news, laid: r.progress };
}

// Every block laid so far, room by room in queue order: what the renderer draws solid.
export const laidBlocks = (v: Village): Block[] => v.queue.flatMap((room) => CASTLE_BLOCKS[room].slice(0, laidIn(v, room)));
export const laidCount = (v: Village): number => v.queue.reduce((n, room) => n + laidIn(v, room), 0);
// What is still to come in every open room, drawn as a faint outline (spec 5): a locked room is not in the queue, so
// it is not drawn at all (spec 2). The next block is left out; it is drawn on its own, a little stronger.
export function outlineBlocks(v: Village): Block[] {
	const next = nextBlock(v);
	return v.queue.flatMap((room) => CASTLE_BLOCKS[room].slice(laidIn(v, room))).filter((b) => b !== next);
}
// The rooms that are finished, in queue order: a click on one of these opens its panel.
export const finishedRooms = (v: Village): CastleRoom[] => v.queue.filter((room) => laidIn(v, room) >= total(room));

// The rooms to save now: any room ahead of its last save by the rule in progress.ts (needsSave).
export const dueSaves = (v: Village, reason: "block" | "hidden"): RoomProgress[] =>
	v.queue.map((room) => v.rooms[room]).filter((p): p is RoomProgress => p !== undefined && needsSave(p, reason));
// After a save of a room (by its RoomProgress.room): the saved count, never backwards. A room not in the queue is ignored.
export function markRoomSaved(v: Village, room: RoomId, laid: number): Village {
	const key = v.queue.find((r) => r === room);
	const p = key === undefined ? undefined : v.rooms[key];
	return key !== undefined && p ? { ...v, rooms: { ...v.rooms, [key]: markSaved(p, laid) } } : v;
}

// A fixed village for /dev/world: each listed room open with that many blocks (a whole number from 0 to its total),
// every other room locked. Nothing in it is ever laid or saved.
export function pinnedVillage(laid: Partial<Record<CastleRoom, number>>, nowIso: string): Village {
	const queue = CASTLE_ROOMS.filter((room) => laid[room] !== undefined);
	const rows: VillageRow[] = queue.map((room) => {
		const n = laid[room] ?? 0;
		return { room, laid: Number.isFinite(n) ? n : 0, started_at: nowIso, finished_at: null };
	});
	return resumeVillage(rows, [], nowIso);
}
