import { emptyBond, sanitizeBond, type Bond } from "./bond/bond";

export const EMOTIONS = [
	"joy",
	"sadness",
	"anger",
	"fear",
	"trust",
	"disgust",
	"surprise",
	"love",
	"hope",
	"guilt",
	"loneliness",
	"boredom",
] as const;
export type Emotion = (typeof EMOTIONS)[number];
export type Activations = Record<Emotion, number>;
export type Vec3 = [number, number, number];
export type Coupling = Record<Emotion, Partial<Record<Emotion, number>>>;

export const VALUES = ["honesty", "kindness", "fairness", "loyalty", "harm"] as const;
export type Value = (typeof VALUES)[number];
export type Weights = Record<Value, number>;

export type Valence = "happy" | "tragic";
type Association = { count: number; tendencies: Partial<Record<Emotion, number>> };
export type EventRecord = { id: string; valence: Valence };

export const ORGANS = ["heart", "brain", "voice", "humor", "slang", "quirks"] as const;
export type Organ = (typeof ORGANS)[number];
// Which donor supplied each organ. Null on AgentState means the neutral Osmo.
export type Genome = { seed: number; donors: Record<Organ, string> };

export type AgentState = {
	genome: Genome | null;
	activations: Activations;
	coupling: Coupling;
	outlook: number;
	weights: Weights;
	associations: Record<string, Association>;
	history: EventRecord[];
	bond: Bond;
};

export const BASELINE: Activations = {
	joy: 0.55,
	trust: 0.5,
	hope: 0.45,
	sadness: 0.15,
	anger: 0.15,
	fear: 0.15,
	disgust: 0.15,
	surprise: 0.15,
	love: 0.15,
	guilt: 0.15,
	loneliness: 0.15,
	boredom: 0.15,
};

// [valence, arousal, dominance]
export const ANCHORS: Record<Emotion, Vec3> = {
	joy: [0.8, 0.5, 0.4],
	sadness: [-0.7, -0.4, -0.5],
	anger: [-0.6, 0.7, 0.5],
	fear: [-0.7, 0.7, -0.6],
	trust: [0.5, -0.2, 0.2],
	disgust: [-0.6, 0.3, 0.2],
	surprise: [0.1, 0.8, -0.1],
	love: [0.8, 0.2, 0.3],
	hope: [0.5, 0.3, 0.2],
	guilt: [-0.6, 0.1, -0.4],
	loneliness: [-0.6, -0.3, -0.5],
	boredom: [-0.3, -0.8, 0],
};

export const DEFAULT_WEIGHTS: Weights = {
	honesty: 0.25,
	kindness: 0.25,
	fairness: 0.2,
	loyalty: 0.15,
	harm: 0.15,
};

export function defaultCoupling(): Coupling {
	const c = Object.fromEntries(EMOTIONS.map((e) => [e, {}])) as Coupling;
	c.sadness = { boredom: 0.3, loneliness: 0.4, guilt: 0.3, joy: -0.4 };
	c.loneliness = { boredom: 0.3 };
	c.disgust = { anger: 0.3 };
	c.fear = { hope: -0.3, trust: -0.3 };
	return c;
}

export function defaultState(): AgentState {
	return {
		genome: null,
		activations: { ...BASELINE },
		coupling: defaultCoupling(),
		outlook: 0,
		weights: { ...DEFAULT_WEIGHTS },
		associations: {},
		history: [],
		bond: emptyBond(),
	};
}

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const isEmotion = (v: string): v is Emotion => (EMOTIONS as readonly string[]).includes(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function sanitizeState(raw: unknown): AgentState {
	const state = defaultState();
	if (!isObject(raw)) return state;

	if (isObject(raw.activations)) {
		for (const e of EMOTIONS) {
			const v = raw.activations[e];
			if (finite(v)) state.activations[e] = clampTo(v, 0, 1);
		}
	}

	if (isObject(raw.coupling)) {
		for (const target of EMOTIONS) {
			const row = raw.coupling[target];
			if (!isObject(row)) continue;
			for (const [source, w] of Object.entries(row)) {
				if (isEmotion(source) && finite(w)) state.coupling[target][source] = clampTo(w, -0.8, 0.8);
			}
		}
	}

	if (isObject(raw.weights)) {
		for (const v of VALUES) {
			const w = raw.weights[v];
			if (finite(w)) state.weights[v] = clampTo(w, 0.02, 1);
		}
		const total = VALUES.reduce((sum, v) => sum + state.weights[v], 0);
		for (const v of VALUES) state.weights[v] /= total;
	}

	if (finite(raw.outlook)) state.outlook = clampTo(raw.outlook, -1, 1);

	if (isObject(raw.associations)) {
		for (const [kind, a] of Object.entries(raw.associations)) {
			if (!isObject(a) || !finite(a.count) || a.count < 0 || !isObject(a.tendencies)) continue;
			const tendencies: Partial<Record<Emotion, number>> = {};
			for (const [e, t] of Object.entries(a.tendencies)) {
				if (isEmotion(e) && finite(t)) tendencies[e] = t;
			}
			state.associations[kind] = { count: a.count, tendencies };
		}
	}

	if (Array.isArray(raw.history)) {
		state.history = raw.history
			.filter(
				(r): r is EventRecord =>
					isObject(r) && typeof r.id === "string" && (r.valence === "happy" || r.valence === "tragic"),
			)
			.map((r) => ({ id: r.id, valence: r.valence }))
			.slice(-200);
	}

	state.bond = sanitizeBond(raw.bond);

	return state;
}
