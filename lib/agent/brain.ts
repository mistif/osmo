import type { Dilemma } from "./dilemmas";
import { BASELINE, VALUES, type Activations, type AgentState, type Emotion, type Value, type Weights } from "./state";

const TILT = 0.3;
const OUTLOOK_TILT = 0.15;
const TORN_MARGIN = 0.05;
const NUDGE = 0.02;
const MIN_WEIGHT = 0.02;

export type Decision = {
	chosen: number;
	runnerUp: number | null;
	scores: number[];
	torn: boolean;
	drivers: Value[];
	pull: Value | null;
};

function effectiveWeights(
	w: Weights,
	a: AgentState["activations"],
	outlook: number,
	baseline: Activations = BASELINE,
): Weights {
	const excess = (e: Emotion) => Math.max(0, a[e] - baseline[e]);
	return {
		...w,
		fairness: w.fairness + TILT * excess("anger"),
		kindness: w.kindness + TILT * excess("sadness") + OUTLOOK_TILT * Math.max(0, outlook),
		harm: w.harm + TILT * excess("fear") + OUTLOOK_TILT * Math.max(0, -outlook),
	};
}

export function decide(
	d: Dilemma,
	s: Pick<AgentState, "weights" | "activations" | "outlook">,
	baseline: Activations = BASELINE,
): Decision {
	const eff = effectiveWeights(s.weights, s.activations, s.outlook, baseline);
	const scores = d.options.map((o) => VALUES.reduce((sum, v) => sum + eff[v] * o.scores[v], 0));
	const order = scores.map((_, i) => i).sort((x, y) => scores[y] - scores[x]);
	const chosen = order[0];
	const runnerUp = order[1] ?? null;
	const torn = runnerUp !== null && scores[chosen] - scores[runnerUp] < TORN_MARGIN;

	const contribution = (v: Value) => eff[v] * d.options[chosen].scores[v];
	const drivers = [...VALUES]
		.sort((x, y) => contribution(y) - contribution(x))
		.filter((v) => contribution(v) > 0)
		.slice(0, 2);

	let pull: Value | null = null;
	if (runnerUp !== null) {
		const gain = (v: Value) =>
			eff[v] * (d.options[runnerUp].scores[v] - d.options[chosen].scores[v]);
		const best = [...VALUES].sort((x, y) => gain(y) - gain(x))[0];
		if (gain(best) > 0) pull = best;
	}
	return { chosen, runnerUp, scores, torn, drivers, pull };
}

const NAMES: Record<Value, string> = {
	honesty: "honesty",
	kindness: "kindness",
	fairness: "fairness",
	loyalty: "loyalty",
	harm: "avoiding harm",
};

export function explain(d: Dilemma, dec: Decision): string {
	const label = d.options[dec.chosen].label;
	let text = dec.torn
		? `I am torn, but I would lean toward "${label}".`
		: `I would choose "${label}".`;
	if (dec.drivers.length > 0) {
		text += ` Mostly because I weigh ${dec.drivers.map((v) => NAMES[v]).join(" and ")}.`;
	}
	if (dec.pull) {
		const name = NAMES[dec.pull];
		text += ` ${name[0].toUpperCase()}${name.slice(1)} pulled me the other way, though.`;
	}
	return text;
}

export function nudgeWeights(w: Weights, up: Value[], down: Value[], amount = NUDGE): Weights {
	const next = { ...w };
	for (const v of up) next[v] += amount;
	for (const v of down) next[v] -= amount;
	for (const v of VALUES) next[v] = Math.max(MIN_WEIGHT, next[v]);
	const total = VALUES.reduce((sum, v) => sum + next[v], 0);
	for (const v of VALUES) next[v] /= total;
	return next;
}

export function applyFeedback(w: Weights, d: Dilemma, dec: Decision, agreed: boolean): Weights {
	if (agreed) return nudgeWeights(w, dec.drivers, []);
	const runnerUp = dec.runnerUp;
	const up =
		runnerUp === null
			? []
			: VALUES.filter((v) => d.options[runnerUp].scores[v] > d.options[dec.chosen].scores[v]);
	return nudgeWeights(w, up, dec.drivers);
}

export function parseVerdict(text: string): { agreed: boolean; explicit: boolean } | null {
	const t = text.trim().toLowerCase().replace(/[.!?]+$/, "");
	if (/^(good answer|well said|i agree|agree|that was (?:right|good)|you(?:'|’)?re right|you are right)$/.test(t)) {
		return { agreed: true, explicit: true };
	}
	if (/^(that was wrong|i disagree|disagree|bad answer|you(?:'|’)?re wrong|you are wrong)$/.test(t)) {
		return { agreed: false, explicit: true };
	}
	if (/^(yes|yeah|yep|sure|i do)$/.test(t)) return { agreed: true, explicit: false };
	if (/^(no|nope|nah|i do not|i don['’]?t)$/.test(t)) return { agreed: false, explicit: false };
	return null;
}
