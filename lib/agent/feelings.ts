import { closeness, localDay } from "./bond/bond";
import { CHARACTER } from "./character";
import { CRISIS_CAUSE } from "./crisis-cause";
import { bondBaseline } from "./cues";
import { detectFromText, rememberGur, validateDetection, type Detection, type Tone } from "./detection";
import { applyShifts, dominantEmotions } from "./heart";
import type { TurnResult } from "./mind";
import { isCrisis } from "./safety";
import { nudgeMood, relaxMood } from "./slow-mood";
import type { Activations, Emotion } from "./state";

type Row = Partial<Record<Emotion, number>>;

// Spec 5.2, values at intensity 2. First guesses; tuned in Task 2.11.
export const COMPLEMENT: Record<Exclude<Tone, "neutral" | "angry">, Row> = {
	sad: { love: 0.1, trust: 0.06, sadness: 0.06, hope: 0.02 },
	worried: { love: 0.08, trust: 0.06, sadness: 0.04, hope: 0.03 },
	lonely: { love: 0.1, trust: 0.06, loneliness: 0.04, sadness: 0.03 },
	tired: { trust: 0.04, love: 0.04, joy: -0.02 },
	happy: { joy: 0.1, trust: 0.04, hope: 0.03 },
	excited: { joy: 0.12, surprise: 0.06, hope: 0.05 },
	grateful: { joy: 0.1, trust: 0.08, love: 0.06 },
	playful: { joy: 0.08, boredom: -0.04, surprise: 0.02 },
};
const ANGRY_AT_OSMO: Row = { guilt: 0.06, anger: 0.02, trust: -0.02 };
const ANGRY_ELSE: Row = { love: 0.04, trust: 0.04, anger: 0.02 };
const BY_INTENSITY = [0.5, 1, 1.5];
const PER_EMOTION = 0.2;
const PER_TURN = 0.4;

export function pushesFor(d: Detection, reactivity: number): Row {
	const react = Math.min(1.5, Math.max(0.6, reactivity));
	const sum: Row = {};
	d.tones.forEach((tone, i) => {
		if (tone === "neutral") return;
		const row = tone === "angry" ? (d.about === "osmo" ? ANGRY_AT_OSMO : ANGRY_ELSE) : COMPLEMENT[tone];
		const scale = BY_INTENSITY[d.intensity - 1] * (i === 0 ? 1 : 0.6) * react;
		for (const [e, v] of Object.entries(row) as [Emotion, number][]) sum[e] = (sum[e] ?? 0) + v * scale;
	});
	for (const e of Object.keys(sum) as Emotion[]) sum[e] = Math.max(-PER_EMOTION, Math.min(PER_EMOTION, sum[e]!));
	const total = Object.values(sum).reduce((s, v) => s + Math.abs(v), 0);
	if (total > PER_TURN) for (const e of Object.keys(sum) as Emotion[]) sum[e] = sum[e]! * (PER_TURN / total);
	return sum;
}

const CEILINGS: Row = { anger: 0.45, fear: 0.45, loneliness: 0.55, guilt: 0.5, disgust: 0.45 };

export function applyCeilings(a: Activations): Activations {
	const next = { ...a };
	for (const [e, cap] of Object.entries(CEILINGS) as [Emotion, number][]) next[e] = Math.min(next[e], cap);
	return next;
}

// The first turn of a new day: no grudge past a day.
export function forgiveGrudges(a: Activations, base: Activations): Activations {
	const next = { ...a };
	for (const e of ["anger", "disgust", "guilt"] as const) if (next[e] > base[e]) next[e] = base[e] + 0.25 * (next[e] - base[e]);
	return next;
}

export type FeelCtx = { now: number; lastAt: number | null; guest?: boolean; crisis?: boolean };

// Once per kept turn, after the reply is chosen. stepHeart already ran this turn (in startTurn); this adds the push.
export function feelTurn(kept: TurnResult, text: string, modelDetection: unknown, ctx: FeelCtx): TurnResult {
	if (ctx.guest || ctx.crisis || isCrisis(text) || kept.session.cause === CRISIS_CAUSE) return kept;
	const base = CHARACTER.baseline;
	const newDay = ctx.lastAt !== null && ctx.lastAt < ctx.now && localDay(ctx.lastAt) !== localDay(ctx.now); // a lastAt in the future is skew, not a new day
	// The new day forgives whether or not this message has a reading.
	const forgiven = newDay ? forgiveGrudges(kept.state.activations, base) : kept.state.activations;
	const d = validateDetection(modelDetection, "model") ?? detectFromText(text);
	if (d === null) return newDay ? { ...kept, state: { ...kept.state, activations: forgiven } } : kept;
	const resting = bondBaseline(base, closeness(kept.state.bond));
	const pushes = pushesFor(d, CHARACTER.reactivity);
	const a = applyCeilings(applyShifts(forgiven, pushes));
	const mood = nudgeMood(relaxMood(kept.state.mood, ctx.now, base), a);
	const because = (d.note || kept.session.cause || "").slice(0, 120);
	if (because !== "") {
		// The strongest feelings, and (since one message rarely clears the 0.10 salience) the two largest pushes of this turn.
		const pushed = (Object.entries(pushes) as [Emotion, number][]).filter(([, v]) => v >= 0.02).sort((x, y) => y[1] - x[1]).map(([e]) => e);
		const top = [...new Set([...dominantEmotions(a, 2, resting), ...pushed])].slice(0, 2);
		mood.causes = [...top.map((tone) => ({ tone, because, at: ctx.now })), ...mood.causes.filter((c) => !top.includes(c.tone))].slice(0, 4);
	}
	return { ...kept, state: { ...kept.state, activations: a, mood }, session: rememberGur(kept.session, d, ctx.now) };
}
