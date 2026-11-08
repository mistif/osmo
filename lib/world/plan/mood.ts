// The mood the planner's mood candidate follows (spec 5.3): Gur's long absence, else his slow mood's emotion or his
// newest fresh cause, read into six kinds.
import { CHARACTER } from "../../agent/character";
import { slowEmotion } from "../../agent/slow-mood";
import type { Emotion } from "../../agent/state";
import type { MoodKind, SeedKind } from "../build/types";
import { AWAY_LONG_MS, type MoodInput } from "./planner";

const CAUSE_MS = 36 * 3_600_000;
const LOW: readonly Emotion[] = ["loneliness", "sadness", "guilt", "fear"];
const BRIGHT: readonly Emotion[] = ["joy", "hope", "love", "trust"];
export const MOOD_RECIPES: Readonly<Record<MoodKind, readonly SeedKind[]>> = {
	low: ["lantern-walk", "garden", "shrine"],
	bright: ["tower", "bell-tower", "lighthouse"],
	tired: ["well", "statue", "garden"],
	calm: ["belvedere", "orchard", "pond"],
	curious: [],
	missing: [],
};
export function moodOf(input: MoodInput): MoodKind {
	if (input.awayMs >= AWAY_LONG_MS) return "missing";
	const m = input.mood;
	const newest = m?.causes[0];
	const e: Emotion | null = (m ? slowEmotion(m, CHARACTER.baseline) : null) ?? (newest && input.now - newest.at <= CAUSE_MS ? newest.tone : null);
	if (e && LOW.includes(e)) return "low";
	const h = ((input.hour % 24) + 24) % 24;
	if (e === "boredom" || h >= 23 || h < 5) return "tired";
	if (e && BRIGHT.includes(e)) return "bright";
	return e === "surprise" ? "curious" : "calm";
}
