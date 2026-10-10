import { describe, expect, it } from "vitest";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { CASTLE_ROOMS, type CastleRoom } from "./blueprints/types";
import type { VillageRow } from "./progress";
import {
	admit, current, dueSaves, finishedRooms, laidBlocks, laidCount, layNext, markRoomSaved, nextBlock, outlineBlocks, pinnedVillage,
	queueOf, resumeVillage, type Village,
} from "./village";

const NOW = "2026-10-10T12:00:00.000Z";
const total = (room: CastleRoom) => CASTLE_BLOCKS[room].length;
const row = (room: CastleRoom, laid: number, started_at = "2026-10-01T09:00:00.000Z"): VillageRow => ({ room, laid, started_at, finished_at: null });
const layMany = (v: Village, n: number) => {
	const news = [];
	for (let i = 0; i < n; i++) {
		const r = layNext(v, NOW);
		v = r.village;
		if (r.news) news.push(r.news);
	}
	return { v, news };
};

describe("the building order", () => {
	it("is the hall alone on day one", () => {
		expect(queueOf([], ["hall"])).toEqual(["hall"]);
	});
	it("keeps started rooms first, oldest first, then the open ones in spec order", () => {
		const rows = [row("gate", 3, "2026-10-05T00:00:00Z"), row("hall", 180, "2026-10-01T00:00:00Z")];
		expect(queueOf(rows, ["hall", "library", "workshop", "gate", "observatory"])).toEqual(["hall", "gate", "library", "workshop", "observatory"]);
	});
	it("keeps a started room whose rule is no longer true, and puts an unreadable start last among the started", () => {
		const rows = [row("library", 5, "junk"), row("hall", 180, "2026-10-01T00:00:00Z")];
		expect(queueOf(rows, ["hall"])).toEqual(["hall", "library"]);
	});
	it("ignores rows for rooms it does not know", () => {
		expect(queueOf([{ room: "moat", laid: 4, started_at: NOW, finished_at: null }], ["hall"])).toEqual(["hall"]);
	});
});

describe("building room after room", () => {
	it("picks up the hall where it was, and the library only once the hall is done", () => {
		const v = resumeVillage([row("hall", 90)], ["hall", "library"], NOW);
		expect(current(v)).toBe("hall");
		expect(nextBlock(v)).toBe(CASTLE_BLOCKS.hall[90]);
		const done = layMany(v, 90);
		expect(done.news).toEqual([{ room: "hall", event: "finished" }]);
		expect(current(done.v)).toBe("library");
		expect(nextBlock(done.v)).toBe(CASTLE_BLOCKS.library[0]);
		const begun = layNext(done.v, NOW);
		expect(begun.news).toEqual({ room: "library", event: "started" });
		expect(begun.laid).toMatchObject({ room: "library", laid: 1 });
	});
	it("takes a phase 1 hall row as it is: finished by its count even when finished_at never reached the table", () => {
		const v = resumeVillage([row("hall", 180)], ["hall", "library"], NOW);
		expect(v.rooms.hall).toMatchObject({ laid: 180, saved: 180 });
		expect(current(v)).toBe("library");
	});
	it("stops when every open room is finished, and never lays past the end", () => {
		const v = resumeVillage([row("hall", 180)], ["hall"], NOW);
		expect(current(v)).toBeNull();
		expect(nextBlock(v)).toBeNull();
		expect(layNext(v, NOW)).toEqual({ village: v, news: null, laid: null });
		expect(laidCount(resumeVillage([row("hall", 9999)], ["hall"], NOW))).toBe(180);
	});
	it("admits a room that opens during the visit at the end of the queue, once", () => {
		const v = resumeVillage([], ["hall", "gate"], NOW);
		const w = admit(v, ["hall", "gate", "observatory"], NOW);
		expect(w.queue).toEqual(["hall", "gate", "observatory"]);
		expect(w.rooms.observatory).toMatchObject({ laid: 0, total: total("observatory") });
		expect(admit(w, ["observatory"], NOW)).toBe(w);
	});
});

describe("what is drawn", () => {
	const v = resumeVillage([row("hall", 180), row("library", 10)], ["hall", "library", "gate"], NOW);
	it("draws the laid blocks solid, room by room", () => {
		expect(laidBlocks(v)).toEqual([...CASTLE_BLOCKS.hall, ...CASTLE_BLOCKS.library.slice(0, 10)]);
		expect(laidCount(v)).toBe(190);
	});
	it("outlines the rest of every open room except the next block, and nothing of a locked room", () => {
		const outline = outlineBlocks(v);
		expect(outline).toHaveLength(total("library") - 11 + total("gate"));
		expect(outline).not.toContain(nextBlock(v));
		expect(outline.some((b) => CASTLE_BLOCKS.workshop.includes(b))).toBe(false);
	});
	it("lists the finished rooms", () => {
		expect(finishedRooms(v)).toEqual(["hall"]);
	});
});

describe("saving", () => {
	it("saves a room every eight blocks, the room just finished, and everything ahead when hidden", () => {
		let v = resumeVillage([row("hall", 170)], ["hall", "library"], NOW);
		v = layMany(v, 8).v;
		expect(dueSaves(v, "block").map((p) => p.room)).toEqual(["hall"]);
		v = markRoomSaved(v, "hall", 178);
		v = layMany(v, 2).v; // the hall finishes at 180
		expect(dueSaves(v, "block").map((p) => p.room)).toEqual(["hall"]);
		v = markRoomSaved(v, "hall", 180);
		v = layMany(v, 3).v; // three blocks of the library
		expect(dueSaves(v, "block")).toEqual([]);
		expect(dueSaves(v, "hidden").map((p) => [p.room, p.laid])).toEqual([["library", 3]]);
	});
	it("never moves a saved count backwards, and ignores a room it does not hold", () => {
		const v = resumeVillage([row("hall", 40)], ["hall"], NOW);
		expect(markRoomSaved(v, "hall", 12).rooms.hall?.saved).toBe(40);
		expect(markRoomSaved(v, "gate", 12)).toBe(v);
	});
});

describe("the dev page's fixed village", () => {
	it("opens only the rooms it is given, clamped to whole blocks inside each room", () => {
		const v = pinnedVillage({ hall: 9999, gate: -4, observatory: Number.NaN, library: 12.6 }, NOW);
		expect(v.queue).toEqual(["hall", "library", "gate", "observatory"]);
		expect(CASTLE_ROOMS.map((r) => v.rooms[r]?.laid ?? null)).toEqual([180, 12, null, null, 0, 0]);
	});
});
