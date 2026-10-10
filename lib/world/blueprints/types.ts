// Blueprints (spec 4): rooms as tile maps with a laying order. Coordinates are in tiles unless a name says px.
import type { TileId } from "../tiles";

export const TILE = 16; // world pixels per tile
export const WORLD_W = 64; // tiles
export const WORLD_H = 40;
export const GROUND_Y = 26; // the island's snow row; his feet stand on its top edge
// The castle's rooms in the order spec 4 lists them: the order unlocked rooms wait in when several open at once.
export const CASTLE_ROOMS = ["hall", "library", "workshop", "study", "gate", "observatory"] as const;
export type CastleRoom = (typeof CASTLE_ROOMS)[number];
export type RoomId = "island" | CastleRoom;
// "ground" is the island's, never laid. The rest is the order a room is built in (spec 4).
export type Layer = "ground" | "floor" | "walls" | "roof" | "windows" | "door" | "lanterns" | "banners";
export const LAYER_ORDER: readonly Layer[] = ["ground", "floor", "walls", "roof", "windows", "door", "lanterns", "banners"];
export type Legend = Readonly<Record<string, { tile: TileId; layer: Layer }>>;
// map: the structure, one letter per tile; decor: things that hang on it (lanterns, banners), same size or empty.
export type Blueprint = { room: RoomId; x: number; y: number; map: readonly string[]; decor: readonly string[]; legend: Legend };
export type Block = { x: number; y: number; tile: TileId; layer: Layer };
