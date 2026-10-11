// The builds as the world builds them (spec sections 4.7 and 6.2), pure: the castle's open rooms first, then one free
// build at a time, each from its saved footprint. Task 0 stub; T7 builds it.
import type { Block, CastleRoom } from "../blueprints/types";
import type { Rect } from "../map/types";
import type { VillageRow } from "../progress";
import type { BuildNews, BuildProgress, BuildRow, Builds, NewBuild } from "./types";

// Every row's progress from its saved footprint (never recompiled), and the castle's open rooms queued as the village
// queues them: started rooms (they have a row) oldest first, then open rooms in spec order with key "castle:<room>" and id null.
export function resumeBuilds(rows: readonly BuildRow[], open: readonly CastleRoom[], nowIso: string): Builds {
	void [rows, open, nowIso];
	throw new Error("not built: resumeBuilds");
}
// Rooms opened during the visit join the end of the castle's queue.
export function admitRooms(b: Builds, open: readonly CastleRoom[], nowIso: string): Builds {
	void [b, open, nowIso];
	throw new Error("not built: admitRooms");
}
// What he works on: the first castle room in the queue not finished, else the free build not finished, else null.
export function currentBuild(b: Builds): BuildProgress | null {
	void b;
	throw new Error("not built: currentBuild");
}
// True while an open castle room is not finished: no free block is laid and no decision is due then.
export function castleWaiting(b: Builds): boolean {
	void b;
	throw new Error("not built: castleWaiting");
}
// The free build not finished, if any (it may be paused behind the castle).
export function freeInProgress(b: Builds): BuildProgress | null {
	void b;
	throw new Error("not built: freeInProgress");
}
export function nextBuildBlock(b: Builds): Block | null {
	void b;
	throw new Error("not built: nextBuildBlock");
}
// One block of the current build; news when it has just started (its first block) or just finished.
export function layBuild(b: Builds, nowIso: string): { builds: Builds; news: BuildNews | null; laid: BuildProgress | null } {
	void [b, nowIso];
	throw new Error("not built: layBuild");
}
// A free build the planner chose and the table took (laid 0): it becomes the free build in progress.
export function startBuild(b: Builds, row: BuildRow): Builds {
	void [b, row];
	throw new Error("not built: startBuild");
}
// Every block laid so far, build by build (the castle's queue first, then the free builds by start).
export function laidBuildBlocks(b: Builds): Block[] {
	void b;
	throw new Error("not built: laidBuildBlocks");
}
export function finishedCastle(b: Builds): CastleRoom[] {
	void b;
	throw new Error("not built: finishedCastle");
}
export function finishedFree(b: Builds): BuildProgress[] {
	void b;
	throw new Error("not built: finishedFree");
}
// The builds to save now, by progress.ts's rule (ahead by SAVE_EVERY, finished, or the tab hidden).
export function dueBuildSaves(b: Builds, reason: "block" | "hidden"): BuildProgress[] {
	void [b, reason];
	throw new Error("not built: dueBuildSaves");
}
// After a save: the saved count (never backwards) and, for a castle room's first save, the new row's id (its key becomes the id).
export function markBuildSaved(b: Builds, key: string, laid: number, id: string | null): Builds {
	void [b, key, laid, id];
	throw new Error("not built: markBuildSaved");
}
// After a pause: when any saved row is gone or behind what this page saved, the read wins.
export function adoptBuilds(b: Builds, rows: readonly BuildRow[], open: readonly CastleRoom[], nowIso: string): { builds: Builds; adopted: boolean } {
	void [b, rows, open, nowIso];
	throw new Error("not built: adoptBuilds");
}
// The footprint rect of every build with a row or in the castle's queue.
export function builtRects(b: Builds): Rect[] {
	void b;
	throw new Error("not built: builtRects");
}
// The row a castle room's first save inserts.
export function newCastleRow(p: BuildProgress): NewBuild {
	void p;
	throw new Error("not built: newCastleRow");
}
// What the village table holds that builds does not (spec 6.3, progress made after the move): castle rooms to insert,
// and castle rows to raise to the village's count.
export function castleCarry(rows: readonly BuildRow[], village: readonly VillageRow[]): { insert: NewBuild[]; raise: { id: string; laid: number }[] } {
	void [rows, village];
	throw new Error("not built: castleCarry");
}
