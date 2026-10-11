import { describe, expect, it } from "vitest";
import { cellsOf } from "../blueprints";
import { castleAt, castleFootprint } from "./castle-sites";
import {
	adoptBuilds, admitRooms, builtRects, castleCarry, castleWaiting, currentBuild, dueBuildSaves, finishedCastle, finishedFree, freeInProgress, laidBuildBlocks,
	layBuild, markBuildSaved, newCastleRow, nextBuildBlock, resumeBuilds, startBuild,
} from "./state";
import type { BuildRow, Footprint } from "./types";

const NOW = "2026-10-11T12:00:00.000Z";
const castleRow = (room: "hall" | "library" | "gate", laid: number, started: string, id = `id-${room}`): BuildRow => {
	const at = castleAt(room);
	const fp = castleFootprint(room);
	return { id, recipe: `castle:${room}`, params: {}, island: 0, ...at, footprint: fp, total: cellsOf(fp, at.x, at.y, room).length, laid, reason: null, started_at: started, finished_at: null };
};
const HUTFP: Footprint = { map: ["RRR", "BdB", "SSS"], decor: [], legend: { R: { tile: "roof-flat", layer: "roof" }, B: { tile: "brick", layer: "walls" }, d: { tile: "door", layer: "door" }, S: { tile: "step", layer: "floor" } } };
const free = (id: string, laid: number, started: string, over: Partial<BuildRow> = {}): BuildRow => ({
	id, recipe: "cottage", params: { width: 3 }, island: 1, x: 600, y: 60, footprint: HUTFP, total: 9, laid, reason: "I wanted a small house here.", started_at: started, finished_at: laid >= 9 ? started : null, ...over,
});

describe("the builds as he builds them (spec 4.7, 6.2)", () => {
	it("queues the castle as the village did: started rooms oldest first, then open rooms in spec order", () => {
		const b = resumeBuilds([castleRow("library", 10, "2026-10-10T00:00:00.000Z"), castleRow("hall", 180, "2026-10-09T00:00:00.000Z")], ["hall", "library", "gate"], NOW);
		expect(b.castle).toEqual(["hall", "library", "gate"]);
		expect(currentBuild(b)?.recipe).toBe("castle:library");
		const gate = b.list.find((p) => p.recipe === "castle:gate");
		expect(gate).toMatchObject({ key: "castle:gate", id: null, laid: 0, total: 69 });
		expect(finishedCastle(b)).toEqual(["hall"]);
	});
	it("builds the castle first: a free build waits behind an open room", () => {
		const b = resumeBuilds([castleRow("hall", 180, "2026-10-09T00:00:00.000Z"), free("f1", 5, "2026-10-10T00:00:00.000Z")], ["hall", "library"], NOW);
		expect(castleWaiting(b)).toBe(true);
		expect(currentBuild(b)?.recipe).toBe("castle:library");
		expect(freeInProgress(b)?.id).toBe("f1");
		const done = resumeBuilds([castleRow("hall", 180, "2026-10-09T00:00:00.000Z"), free("f1", 5, "2026-10-10T00:00:00.000Z")], ["hall"], NOW);
		expect(castleWaiting(done)).toBe(false);
		expect(currentBuild(done)?.id).toBe("f1");
		expect(nextBuildBlock(done)).toEqual(done.list.find((p) => p.id === "f1")?.blocks[5]);
	});
	it("resumes from the saved footprint, never a recompiled one, even for a recipe the code does not know", () => {
		const odd = free("f2", 4, "2026-10-10T00:00:00.000Z", { recipe: "no-such-recipe", total: 99 });
		const b = resumeBuilds([castleRow("hall", 180, "2026-10-09T00:00:00.000Z"), odd], ["hall"], NOW);
		const p = b.list.find((x) => x.id === "f2");
		expect(p?.blocks).toEqual(cellsOf(HUTFP, 600, 60, "no-such-recipe"));
		expect(p?.total).toBe(9); // the footprint's own count, not the row's
		expect(p?.laid).toBe(4);
		const over = resumeBuilds([free("f3", 50, "2026-10-10T00:00:00.000Z")], [], NOW).list[0];
		expect([over.laid, over.finishedAt]).toEqual([9, "2026-10-10T00:00:00.000Z"]);
	});
	it("lays one block at a time, saying when a build starts and finishes", () => {
		let b = resumeBuilds([], ["hall"], NOW);
		const first = layBuild(b, NOW);
		expect(first.news).toEqual({ key: "castle:hall", recipe: "castle:hall", event: "started" });
		b = first.builds;
		for (let i = 1; i < 179; i++) b = layBuild(b, NOW).builds;
		const last = layBuild(b, "2026-10-11T13:00:00.000Z");
		expect(last.news?.event).toBe("finished");
		expect(last.laid).toMatchObject({ laid: 180, finishedAt: "2026-10-11T13:00:00.000Z" });
		expect(currentBuild(last.builds)).toBeNull();
		expect(laidBuildBlocks(last.builds)).toHaveLength(180);
	});
	it("starts a chosen free build, its first block next", () => {
		const b = startBuild(resumeBuilds([castleRow("hall", 180, "2026-10-09T00:00:00.000Z")], ["hall"], NOW), free("f4", 0, NOW));
		expect(currentBuild(b)?.id).toBe("f4");
		expect(nextBuildBlock(b)).toEqual(currentBuild(b)?.blocks[0]);
		expect(builtRects(b)).toContainEqual({ x: 600, y: 60, w: 3, h: 3 });
		expect(finishedFree(b)).toEqual([]);
	});
	it("saves every 8 blocks, on finish and on hide, never backwards, and learns a castle room's id from its first save", () => {
		let b = resumeBuilds([], ["hall"], NOW);
		for (let i = 0; i < 7; i++) b = layBuild(b, NOW).builds;
		expect(dueBuildSaves(b, "block")).toEqual([]);
		expect(dueBuildSaves(b, "hidden").map((p) => p.key)).toEqual(["castle:hall"]);
		b = layBuild(b, NOW).builds;
		expect(dueBuildSaves(b, "block").map((p) => p.laid)).toEqual([8]);
		b = markBuildSaved(b, "castle:hall", 8, "row-1");
		expect(b.list.find((p) => p.recipe === "castle:hall")).toMatchObject({ key: "row-1", id: "row-1", saved: 8 });
		b = markBuildSaved(b, "row-1", 3, null);
		expect(b.list.find((p) => p.id === "row-1")?.saved).toBe(8);
		expect(newCastleRow(b.list[0])).toMatchObject({ recipe: "castle:hall", island: 0, x: 468, y: 71, total: 180, laid: 8, reason: null });
	});
	it("lets the read win after a pause when a saved row went backwards or is gone (another tab or device cleared it)", () => {
		let b = resumeBuilds([castleRow("hall", 40, "2026-10-09T00:00:00.000Z")], ["hall"], NOW);
		expect(adoptBuilds(b, [castleRow("hall", 40, "2026-10-09T00:00:00.000Z")], ["hall"], NOW).adopted).toBe(false);
		const gone = adoptBuilds(b, [], ["hall"], NOW);
		expect(gone.adopted).toBe(true);
		expect(gone.builds.list.find((p) => p.recipe === "castle:hall")?.laid).toBe(0);
		b = admitRooms(b, ["hall", "gate"], NOW);
		expect(b.castle).toEqual(["hall", "gate"]);
	});
	it("carries castle progress the village table holds and builds does not", () => {
		const village = [
			{ room: "hall", laid: 180, started_at: "2026-10-09T00:00:00.000Z", finished_at: "2026-10-09T01:00:00.000Z" },
			{ room: "library", laid: 30, started_at: "2026-10-10T00:00:00.000Z", finished_at: null },
			{ room: "gate", laid: 99999, started_at: "2026-10-10T02:00:00.000Z", finished_at: null },
		];
		const carry = castleCarry([castleRow("library", 10, "2026-10-10T00:00:00.000Z")], village);
		expect(carry.raise).toEqual([{ id: "id-library", laid: 30 }]);
		expect(carry.insert.map((r) => [r.recipe, r.laid, r.started_at, r.finished_at])).toEqual([
			["castle:hall", 180, "2026-10-09T00:00:00.000Z", "2026-10-09T01:00:00.000Z"],
			["castle:gate", 69, "2026-10-10T02:00:00.000Z", "2026-10-10T02:00:00.000Z"],
		]);
		expect(castleCarry([castleRow("library", 40, "2026-10-10T00:00:00.000Z")], [village[1]])).toEqual({ insert: [], raise: [] });
	});
});
