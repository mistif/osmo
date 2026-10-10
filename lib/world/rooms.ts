// Rooms as places (spec 5), pure. The rail stays the map: each panel has a place in the world, he walks there when it
// opens, and a finished room opens its panel when clicked. Talk is the yard in front of the hall.
// Library is the library (its "things" page is the workshop), Feed the gate, Ideas and Goals the study, Search the
// observatory's glass and Settings the observatory.
import { SHIPPED_PANELS, type PanelId, type Route } from "../shell/route";
import { START_X } from "./blueprints";
import { CASTLE_BLOCKS, DOOR_X } from "./blueprints/castle";
import { CASTLE_ROOMS, TILE, type CastleRoom } from "./blueprints/types";
import { toScreen, zoomAt, type Camera, type View } from "./camera";
import type { VillageCounts } from "./unlock";

export type Place = "yard" | Exclude<CastleRoom, "hall">;

// Where the open panel puts him.
export function placeOf(route: Route): Place {
	switch (route.panel) {
		case "library":
			return route.page === "things" ? "workshop" : "library";
		case "feed":
			return "gate";
		case "ideas":
		case "goals":
			return "study";
		case "search":
		case "settings":
			return "observatory";
		default:
			return "yard";
	}
}

const PANEL: Readonly<Record<Exclude<CastleRoom, "hall">, Route>> = {
	library: { panel: "library" },
	workshop: { panel: "library", page: "things" },
	gate: { panel: "feed" },
	study: { panel: "ideas" },
	observatory: { panel: "settings" },
};
// What a click on a room opens; null for the hall (Talk is already where he stands) and for a room whose panel has not
// shipped yet (the study, until Ideas exists), so such a room has no hit area.
export function routeOf(room: CastleRoom, shipped: readonly PanelId[] = SHIPPED_PANELS): Route | null {
	if (room === "hall") return null;
	const to = PANEL[room];
	return to.panel !== null && shipped.includes(to.panel) ? to : null;
}
// The rooms a click can open: finished ones whose panel exists, west to east.
export const clickable = (finished: readonly CastleRoom[], shipped: readonly PanelId[] = SHIPPED_PANELS): CastleRoom[] =>
	CASTLE_ROOMS.filter((room) => finished.includes(room) && routeOf(room, shipped) !== null);

// Where he stands for a place (world px): before the room's door, or the yard at the hall's door.
export const spotX = (place: Place): number => (place === "yard" ? START_X : (DOOR_X[place] + 0.5) * TILE);

// The label a room's hit area reads out.
export const ROOM_LABELS: Readonly<Record<CastleRoom, string>> = {
	hall: "The hall",
	library: "Open the library: memory and notes",
	workshop: "Open the workshop: the things I made",
	study: "Open the study: ideas and goals",
	gate: "Open the gate: the feed",
	observatory: "Open the observatory: settings",
};

export type Box = { x: number; y: number; w: number; h: number };
// Each room's footprint in world px: the box round its blocks.
export const ROOM_BOXES: Readonly<Record<CastleRoom, Box>> = Object.fromEntries(
	CASTLE_ROOMS.map((room) => {
		const bs = CASTLE_BLOCKS[room];
		const x0 = Math.min(...bs.map((b) => b.x));
		const y0 = Math.min(...bs.map((b) => b.y));
		const x1 = Math.max(...bs.map((b) => b.x)) + 1;
		const y1 = Math.max(...bs.map((b) => b.y)) + 1;
		return [room, { x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE }];
	}),
) as Record<CastleRoom, Box>;

export type Hit = Box & { room: CastleRoom; seen: boolean };
// The rooms' hit areas on the canvas (canvas px), for the DOM buttons laid over it. seen is false when none of the
// box is in view: that button is hidden, so the keyboard never lands on something off screen.
export function hitAreas(rooms: readonly CastleRoom[], camera: Camera, view: View, now: number): Hit[] {
	const z = zoomAt(camera, now);
	return rooms.map((room) => {
		const b = ROOM_BOXES[room];
		const at = toScreen(camera, view, now, b.x, b.y);
		const w = b.w * z;
		const h = b.h * z;
		return { room, x: at.x, y: at.y, w, h, seen: at.x + w > 0 && at.y + h > 0 && at.x < view.w && at.y < view.h };
	});
}

// The one line the language lane adds to a turn while a panel is open (spec 5): where Gur is, and counts only, never
// contents. Null in the yard (Talk). `who` is the name the prompt uses for him.
const WHERE: Readonly<Record<Exclude<Place, "yard">, string>> = {
	library: "in the library",
	workshop: "in the workshop",
	study: "in the study",
	gate: "at the gate",
	observatory: "in the observatory",
};
type Part = readonly [n: number, one: string, many: string];
const PARTS: Readonly<Record<Exclude<Place, "yard" | "observatory">, (c: VillageCounts) => Part[]>> = {
	library: (c) => [[c.memories, "memory", "memories"], [c.notes, "note", "notes"]],
	workshop: (c) => [[c.things, "thing you made", "things you made"]],
	study: (c) => [[c.ideas, "idea", "ideas"], [c.goals, "goal", "goals"]],
	gate: (c) => [[c.reminders, "reminder", "reminders"]],
};
export function roomContext(place: Place, counts: VillageCounts, who = "Gur"): string | null {
	if (place === "yard") return null;
	const here = `${who} is ${WHERE[place]} with you`;
	if (place === "observatory") return `${here}, where your settings are.`;
	const parts = PARTS[place](counts)
		.map(([n, one, many]) => [Number.isFinite(n) && n > 0 ? Math.floor(n) : 0, one, many] as const)
		.filter(([n]) => n > 0);
	if (parts.length === 0) return `${here}; nothing is here yet.`;
	const words = parts.map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
	const verb = parts.length === 1 && parts[0][0] === 1 ? "is" : "are";
	return `${here}; in front of you ${verb} ${words.join(" and ")}.`;
}
