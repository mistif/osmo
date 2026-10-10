import { describe, expect, it } from "vitest";
import { START_X } from "./blueprints";
import { CASTLE_ROOMS, TILE } from "./blueprints/types";
import { newCamera } from "./camera";
import { clickable, hitAreas, placeOf, ROOM_BOXES, ROOM_LABELS, roomContext, routeOf, spotX } from "./rooms";
import { NO_COUNTS } from "./unlock";

describe("places", () => {
	it("puts each panel in its room, and Talk in the yard", () => {
		expect(placeOf({ panel: null })).toBe("yard");
		expect(placeOf({ panel: "library" })).toBe("library");
		expect(placeOf({ panel: "library", page: "memory" })).toBe("library");
		expect(placeOf({ panel: "library", page: "things" })).toBe("workshop");
		expect(placeOf({ panel: "library", page: "things", item: "abc" })).toBe("workshop");
		expect(placeOf({ panel: "feed" })).toBe("gate");
		expect(placeOf({ panel: "ideas" })).toBe("study");
		expect(placeOf({ panel: "goals", item: "x" })).toBe("study");
		expect(placeOf({ panel: "search" })).toBe("observatory");
		expect(placeOf({ panel: "settings", page: "about" })).toBe("observatory");
	});
	it("stands him before each room's door, and at the hall's door in the yard", () => {
		expect(spotX("yard")).toBe(START_X);
		expect(spotX("library")).toBe(21.5 * TILE);
		expect(spotX("workshop")).toBe(44.5 * TILE);
		expect(spotX("gate")).toBe(7.5 * TILE);
		expect(spotX("study")).toBe(13.5 * TILE);
		expect(spotX("observatory")).toBe(55.5 * TILE);
	});
});

describe("clicking a room", () => {
	it("opens the room's panel, and the room's panel puts him back in that room", () => {
		for (const room of clickable([...CASTLE_ROOMS])) {
			const to = routeOf(room);
			expect(to, room).not.toBeNull();
			if (to) expect(placeOf(to)).toBe(room);
		}
		expect(routeOf("library")).toEqual({ panel: "library" });
		expect(routeOf("workshop")).toEqual({ panel: "library", page: "things" });
		expect(routeOf("gate")).toEqual({ panel: "feed" });
		expect(routeOf("observatory")).toEqual({ panel: "settings" });
	});
	it("gives the hall and a room whose panel has not shipped no hit area", () => {
		expect(routeOf("hall")).toBeNull();
		expect(routeOf("study")).toBeNull();
		expect(routeOf("study", ["ideas", "library"])).toEqual({ panel: "ideas" });
		expect(clickable([...CASTLE_ROOMS])).toEqual(["library", "workshop", "gate", "observatory"]);
		expect(clickable(["observatory", "hall", "gate"])).toEqual(["gate", "observatory"]);
		expect(clickable([])).toEqual([]);
	});
	it("labels every hit area for the keyboard", () => {
		for (const room of CASTLE_ROOMS) expect(ROOM_LABELS[room].length).toBeGreaterThan(3);
	});
});

describe("hit areas", () => {
	it("boxes each room round its blocks", () => {
		expect(ROOM_BOXES.hall).toEqual({ x: 24 * TILE, y: 11 * TILE, w: 17 * TILE, h: 15 * TILE });
		expect(ROOM_BOXES.observatory.y).toBe(9 * TILE);
	});
	it("puts the boxes where the camera draws them, scaled", () => {
		const view = { w: 1200, h: 800 };
		const camera = newCamera(START_X, view, 1);
		const [library] = hitAreas(["library"], camera, view, 0);
		expect(library).toEqual({ room: "library", x: Math.round(16 * TILE - camera.x + 600), y: Math.round(17 * TILE - camera.y + 400), w: 9 * TILE, h: 9 * TILE, seen: true });
		const near = hitAreas(["library"], { ...camera, from: 2, to: 2 }, view, 0)[0];
		expect([near.w, near.h]).toEqual([18 * TILE, 18 * TILE]);
	});
	it("marks a room out of view as unseen, so its button is hidden", () => {
		const phone = { w: 375, h: 700 };
		const hits = hitAreas(["hall", "observatory"], newCamera(START_X, phone, 2), phone, 0);
		expect(hits.map((h) => [h.room, h.seen])).toEqual([["hall", true], ["observatory", false]]);
		expect(hitAreas(["hall"], newCamera(START_X, { w: 0, h: 0 }, 1), { w: 0, h: 0 }, 0)[0].seen).toBe(false);
	});
});

describe("the context line", () => {
	it("says where Gur is and what is in front of Osmo, in counts only", () => {
		expect(roomContext("library", { ...NO_COUNTS, memories: 14, notes: 3 })).toBe("Gur is in the library with you; in front of you are 14 memories and 3 notes.");
		expect(roomContext("library", { ...NO_COUNTS, memories: 1 })).toBe("Gur is in the library with you; in front of you is 1 memory.");
		expect(roomContext("workshop", { ...NO_COUNTS, things: 2 })).toBe("Gur is in the workshop with you; in front of you are 2 things you made.");
		expect(roomContext("gate", { ...NO_COUNTS, reminders: 1, notes: 9 })).toBe("Gur is at the gate with you; in front of you is 1 reminder.");
		expect(roomContext("study", { ...NO_COUNTS, ideas: 1, goals: 1 })).toBe("Gur is in the study with you; in front of you are 1 idea and 1 goal.");
		expect(roomContext("observatory", NO_COUNTS)).toBe("Gur is in the observatory with you, where your settings are.");
	});
	it("says so when a room is empty, reads a bad count as none, and says nothing in the yard", () => {
		expect(roomContext("study", NO_COUNTS)).toBe("Gur is in the study with you; nothing is here yet.");
		expect(roomContext("library", { ...NO_COUNTS, memories: Number.NaN, notes: -2 })).toBe("Gur is in the library with you; nothing is here yet.");
		expect(roomContext("yard", { ...NO_COUNTS, memories: 4 })).toBeNull();
		expect(roomContext("gate", { ...NO_COUNTS, reminders: 2 }, "Sam")).toBe("Sam is at the gate with you; in front of you are 2 reminders.");
	});
	it("keeps to plain speakable text", () => {
		for (const place of ["library", "workshop", "study", "gate", "observatory"] as const) {
			const line = roomContext(place, { memories: 2, notes: 2, things: 2, reminders: 2, ideas: 2, goals: 2 }) ?? "";
			expect(line).toMatch(/^[A-Za-z0-9 ,;.]+$/);
		}
	});
});
