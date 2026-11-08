// Mood on him (spec 3): his face and walking pace from the numbers he already keeps. No model calls.
import { CHARACTER } from "../agent/character";
import type { Activations, AgentState, Emotion } from "../agent/state";
import type { FaceId } from "./osmo-sprite";

export const WALK_SPEED = 48; // world px per second: three tiles
export const TIRED_SPEED = 32;
const CAUSE_FRESH_MS = 60 * 60_000;

export type Bearing = { face: FaceId; speed: number };
// Fear or sadness (his own, or in his newest reading of Gur) comes first: he looks at Gur attentively. Then boredom or
// the late hour (23:00 to 05:00): tired, and slower. Then joy or love: warm. Otherwise attentive.
export function bearing(state: Pick<AgentState, "activations" | "mood">, nowMs: number, hour: number, baseline: Activations = CHARACTER.baseline): Bearing {
	const over = (e: Emotion) => state.activations[e] - baseline[e];
	const newest = state.mood?.causes[0];
	const fresh = newest && nowMs - newest.at <= CAUSE_FRESH_MS ? newest.tone : null;
	const worried = over("fear") >= 0.15 || over("sadness") >= 0.15 || fresh === "fear" || fresh === "sadness";
	const h = ((hour % 24) + 24) % 24;
	const tired = over("boredom") >= 0.25 || h >= 23 || h < 5;
	const glad = over("joy") >= 0.1 || over("love") >= 0.2;
	const face: FaceId = worried ? "attentive" : tired ? "tired" : glad ? "warm" : "attentive";
	return { face, speed: tired ? TIRED_SPEED : WALK_SPEED };
}
