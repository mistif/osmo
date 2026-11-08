import type { Level, Tier } from "./types";

// What a level does with a tier (spec 4.1): off refuses all, read runs tier 1 only,
// ask holds tiers 2 and 3 for a yes, act runs tier 2 and still holds tier 3.
export const decide = (level: Level, tier: Tier): "run" | "hold" | "refuse" =>
	level === "off" ? "refuse" : tier === 1 ? "run" : level === "read" ? "refuse" : tier === 3 || level === "ask" ? "hold" : "run";
