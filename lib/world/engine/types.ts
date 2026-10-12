// The world's props, its pins and its control (components/osmo/world.tsx re-exports them under the same names), shared
// by the small world's engine in world.tsx and the big world's in big.ts, so the two files do not import each other.
// Types only (I1 of docs/superpowers/plans/2026-10-11-osmo-free-will.md).
import type { RefObject } from "react";
import type { AgentState } from "../../agent/state";
import type { Route } from "../../shell/route";
import type { ActorEvent, ActorKind } from "../actor";
import type { CastleRoom } from "../blueprints/types";
import type { MoodKind } from "../build/types";
import type { VillageNews } from "../progress";
import type { RoomSignals } from "../signals";

// attend: Gur is typing or focused the composer. takeNews: the oldest room started or finished since the last call (for
// TurnFacts.village). context: the line for the open panel's room (lib/world/rooms.ts roomContext), null in Talk or
// before the visit's counts are read. The last two are the language lane's to call. zoom and home: the big world's
// camera, one zoom step in (1) or out (-1) about the middle, and back to him (the dev page's buttons; the room calls
// only attend). In the small world they do nothing.
export type WorldControl = { attend(): void; takeNews(): VillageNews | null; context(): string | null; zoom(dir: 1 | -1): void; home(): void };
// The dev page's pins: the hour, each room's laid blocks (a room left out is locked), his pose, the hit areas drawn,
// and the life in the world (polish pass: "all" keeps snow, smoke and birds going whatever the hour, "none" stops them).
// The big world's (free-will plan, I1): which world runs (a pin wins over the switches), its seed and how many islands
// it has, the castle live from nothing or done, a grant of blocks to the work budget (a new `at` grants again: the
// budget is set that many blocks back and the catch-up runs), and the planner's mood.
export type WorldFixed = {
	hour?: number;
	rooms?: Partial<Record<CastleRoom, number>>;
	pose?: ActorKind;
	hits?: boolean;
	life?: "all" | "none";
	world?: "small" | "big" | "builds";
	seed?: number;
	islands?: number;
	castle?: "live" | "done";
	grant?: { blocks: number; at: number };
	mood?: MoodKind;
};
export type WorldProps = {
	agent: Pick<AgentState, "activations" | "mood">;
	colorA: string;
	colorB: string;
	signals: RoomSignals;
	said: string | null;
	heard: string | null;
	controlRef?: RefObject<WorldControl | null>;
	persist?: boolean;
	fixed?: WorldFixed;
	route?: Route; // the open panel (shell v2); he walks to its room
	onOpen?(to: Route): void; // a finished room was clicked
	onFrame?(ms: number): void; // the big world: how long each drawWorld took (the dev page's frame timer)
};
// One running world, as the React side drives it.
export type Engine = {
	send(e: ActorEvent): void;
	refresh(): void;
	takeNews(): VillageNews | null;
	context(): string | null;
	zoom(dir: 1 | -1): void;
	home(): void;
	dispose(): void;
};
// How the loop tells React what to show: the rooms that have a hit area now; the line he says when he starts a build
// he chose (null: none); whether he is off screen with the camera away from him (the Back to Osmo button).
export type Hooks = { finished(rooms: CastleRoom[]): void; line?(text: string | null): void; away?(off: boolean): void };
