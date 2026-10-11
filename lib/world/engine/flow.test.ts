import { describe, expect, it } from "vitest";
import { cellsOf } from "../blueprints";
import { CASTLE_BLOCKS } from "../blueprints/castle";
import { TILE } from "../blueprints/types";
import { layBuild, resumeBuilds } from "../build/state";
import type { BuildRow } from "../build/types";
import { DOCK_DECK, HOME_ISLAND, shiftBlocks } from "../map/home";
import { worldMayTake } from "../view/input";
import { pinnedVillage } from "../village";
import {
	beginDecision, cameraAfter, catchUpStep, decisionStarted, decksOf, drawLists, endDecision, followZoom, lapseRuns, lightsOf, mayDecide, modeOf, NO_ROOM_MS,
	OPEN_GATE, shiftedVillage, showHome, startOf, WILL_LINE_MS,
} from "./flow";

const NOW = "2026-10-11T12:00:00.000Z";
const FP = { map: ["BBB", "BBB"], decor: [], legend: { B: { tile: "brick" as const, layer: "walls" as const } } };
const freeRow = (id: string, laid: number, over: Partial<BuildRow> = {}): BuildRow => ({
	id, recipe: "cottage", params: {}, island: 1, x: 600, y: 60, footprint: FP, total: 6, laid, reason: null, started_at: NOW, finished_at: laid >= 6 ? NOW : null, ...over,
});

describe("the engine's pure helpers", () => {
	it("runs today's village unless a switch or a pin says otherwise", () => {
		expect(modeOf({ bigworld: false, builds: false })).toBe("small");
		expect(modeOf({ bigworld: true, builds: false })).toBe("big");
		expect(modeOf({ bigworld: true, builds: true })).toBe("builds");
		expect(modeOf({ bigworld: false, builds: false }, "builds")).toBe("builds");
	});
	it("draws the village's castle moved by the home offset", () => {
		const v = shiftedVillage(pinnedVillage({ hall: 40 }, NOW));
		expect(v.laid).toEqual(shiftBlocks(CASTLE_BLOCKS.hall.slice(0, 40), 445, 60));
		expect(v.ghost).toEqual(shiftBlocks([CASTLE_BLOCKS.hall[40]], 445, 60)[0]);
		expect(Object.keys(v)).toEqual(["laid", "ghost"]);
	});
	it("gives one light per finished build, over its middle, a tile under its top", () => {
		const b = resumeBuilds([freeRow("a", 6), freeRow("b", 2, { x: 700 })], [], NOW);
		expect(lightsOf(b.list.filter((p) => p.laid >= p.total))).toEqual([{ x: 601.5 * TILE, y: 61 * TILE }]);
	});
	it("makes the lists it draws once per state of the builds, so the renderer's caches hold", () => {
		const b = resumeBuilds([freeRow("a", 6), freeRow("b", 2, { x: 700 })], [], NOW);
		expect(drawLists(b)).toBe(drawLists(b));
		expect(drawLists(b).lights).toEqual([{ x: 601.5 * TILE, y: 61 * TILE }]);
		const next = layBuild(b, NOW).builds;
		expect(drawLists(next).laid).toHaveLength(drawLists(b).laid.length + 1);
	});
	it("lists what a catch-up laid, build by build, in laying order", () => {
		const before = resumeBuilds([freeRow("a", 2)], [], NOW);
		let after = before;
		for (let i = 0; i < 3; i++) after = layBuild(after, NOW).builds;
		const runs = lapseRuns(before, after);
		expect(runs).toEqual([{ key: "a", blocks: cellsOf(FP, 600, 60, "cottage").slice(2, 5) }]);
		expect(lapseRuns(after, after)).toEqual([]);
	});
	it("walks the dock with builds on, and every finished rope bridge, the one east of home from the dock's end", () => {
		const bridgeFp = { map: ["BBB"], decor: [], legend: { B: { tile: "bridge-board" as const, layer: "floor" as const } } };
		const b = resumeBuilds([freeRow("r", 3, { recipe: "rope-bridge", island: 0, x: 510, y: 86, footprint: bridgeFp, total: 3 })], [], NOW);
		const map = { seed: 0, gen: 1, islands: [HOME_ISLAND, { id: 1, x0: 512, x1: 600, ground: 86, top: Array.from({ length: 88 }, () => 86), home: false }], ground: [] };
		expect(decksOf(b, map, false)).toEqual([{ x0: 510, x1: 513, rows: [86, 86, 86], from: 0, to: 1 }]);
		expect(decksOf(b, map, true)[0]).toEqual(DOCK_DECK);
	});
	it("frames him at today's zoom, in canvas px", () => {
		expect(followZoom(1920, 1080, false, 1)).toBe(1);
		expect(followZoom(1920, 1080, true, 2)).toBe(6);
		expect(followZoom(375, 700, false, 2)).toBe(4);
		expect(WILL_LINE_MS).toBe(6000);
	});
});

describe("who moves the camera (spec 3.2: following suspended while Gur steers)", () => {
	it("stops following while Gur steers, and follows again on Home, a tap on him or a message", () => {
		expect(cameraAfter("following", "steer")).toBe("steering");
		expect(cameraAfter("steering", "steer")).toBe("steering");
		expect(cameraAfter("steering", "home")).toBe("following");
		expect(cameraAfter("lapse", "home")).toBe("following");
	});
	it("lets the time-lapse visit its sites only from following, and Gur's steering win over it", () => {
		expect(cameraAfter("following", "lapse")).toBe("lapse");
		expect(cameraAfter("steering", "lapse")).toBe("steering");
		expect(cameraAfter("lapse", "steer")).toBe("steering");
		expect(cameraAfter("lapse", "lapse-end")).toBe("following");
		expect(cameraAfter("steering", "lapse-end")).toBe("steering");
	});
	it("shows Back to Osmo only while he is off screen and the camera is not following him", () => {
		expect([showHome("steering", true), showHome("lapse", true), showHome("following", true), showHome("steering", false)]).toEqual([true, true, false, false]);
	});
});

describe("where a gesture starts (spec 3.2: the conversation wins)", () => {
	const layer = { tag: "div", role: "region", world: true };
	it("gives the world only what starts on its own input layer, never a control", () => {
		expect(worldMayTake(startOf([layer, { tag: "div", role: null, world: false }]))).toBe(true);
		expect(startOf([{ tag: "p", role: null, world: false }, { tag: "section", role: null, world: false }])).toEqual({ inColumn: true, onControl: false });
		expect(startOf([{ tag: "span", role: null, world: false }, { tag: "button", role: null, world: false }]).onControl).toBe(true);
		expect(startOf([{ tag: "div", role: "button", world: false }]).onControl).toBe(true);
		expect(worldMayTake(startOf([{ tag: "textarea", role: null, world: false }]))).toBe(false);
		expect(worldMayTake(startOf([]))).toBe(false);
	});
});

describe("decisions (spec 4.8: one at most per due moment, two tabs at once)", () => {
	it("makes one decision at a time, and pauses ten minutes after one that started nothing", () => {
		let g = beginDecision(OPEN_GATE);
		expect(mayDecide(OPEN_GATE, true, 0)).toBe(true);
		expect(mayDecide(OPEN_GATE, false, 0)).toBe(false);
		expect(mayDecide(g, true, 10)).toBe(false);
		g = endDecision(g, false, 1000);
		expect(mayDecide(g, true, 1000 + NO_ROOM_MS - 1)).toBe(false);
		expect(mayDecide(g, true, 1000 + NO_ROOM_MS)).toBe(true);
		expect(mayDecide(endDecision(beginDecision(OPEN_GATE), true, 5), true, 6)).toBe(true);
	});
	it("two tabs choosing at once: the second adopts the first one's build, or pauses when the re-read shows none", () => {
		expect(decisionStarted("row", null)).toBe(true);
		expect(decisionStarted("taken", resumeBuilds([freeRow("theirs", 0)], [], NOW))).toBe(true);
		expect(decisionStarted("taken", resumeBuilds([freeRow("theirs", 6)], [], NOW))).toBe(false);
		expect(decisionStarted("taken", null)).toBe(false);
		expect(decisionStarted("failed", resumeBuilds([freeRow("theirs", 0)], [], NOW))).toBe(false);
	});
	it("catches up: lays the build in progress, decides when none is, stops at the blocks, the day's decisions or the castle", () => {
		const going = resumeBuilds([freeRow("a", 2)], [], NOW);
		expect(catchUpStep({ left: 410, decided: 0, allowed: 3 }, going)).toEqual({ kind: "lay", n: 4 });
		expect(catchUpStep({ left: 3, decided: 0, allowed: 3 }, going)).toEqual({ kind: "lay", n: 3 });
		const idle = resumeBuilds([freeRow("a", 6)], [], NOW);
		expect(catchUpStep({ left: 406, decided: 0, allowed: 3 }, idle)).toEqual({ kind: "decide" });
		expect(catchUpStep({ left: 406, decided: 3, allowed: 3 }, idle)).toEqual({ kind: "done" });
		expect(catchUpStep({ left: 0, decided: 0, allowed: 3 }, going)).toEqual({ kind: "done" });
		expect(catchUpStep({ left: 50, decided: 0, allowed: 3 }, resumeBuilds([freeRow("a", 2)], ["hall"], NOW))).toEqual({ kind: "done" });
	});
});
