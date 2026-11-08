// The castle (spec 4): the six rooms by name, each room's blocks in laying order, and where each room's door is.
// Left to right on the island: gate (x 4), study (11), library (16), hall (23), workshop (40), observatory (51).
import { GATE } from "./gate";
import { HALL } from "./hall";
import { blocksOf } from "./index";
import { LIBRARY } from "./library";
import { OBSERVATORY } from "./observatory";
import { STUDY } from "./study";
import { CASTLE_ROOMS, type Block, type Blueprint, type CastleRoom } from "./types";
import { WORKSHOP } from "./workshop";

export const CASTLE: Readonly<Record<CastleRoom, Blueprint>> = {
	hall: HALL,
	library: LIBRARY,
	workshop: WORKSHOP,
	study: STUDY,
	gate: GATE,
	observatory: OBSERVATORY,
};
const byRoom = <T>(f: (room: CastleRoom) => T): Readonly<Record<CastleRoom, T>> =>
	Object.fromEntries(CASTLE_ROOMS.map((room) => [room, f(room)])) as Record<CastleRoom, T>;
export const CASTLE_BLOCKS: Readonly<Record<CastleRoom, readonly Block[]>> = byRoom((room) => blocksOf(CASTLE[room]));
// The tile column of each room's door (its one "door" block): where he stands when he visits it.
export const DOOR_X: Readonly<Record<CastleRoom, number>> = byRoom((room) => CASTLE_BLOCKS[room].find((b) => b.tile === "door")?.x ?? CASTLE[room].x);
