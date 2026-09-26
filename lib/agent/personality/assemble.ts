import {
	BASELINE,
	DEFAULT_WEIGHTS,
	EMOTIONS,
	ORGANS,
	VALUES,
	type Activations,
	type AgentState,
	type Genome,
	type Organ,
	type Weights,
} from "../state";
import { DONORS } from "./donors";
import { MODERN_DONORS, MODERN_ORGANS } from "./modern";
import { hashString, mulberry32 } from "./rng";
import type { Donor } from "./types";

export type Personality = {
	genome: Genome | null;
	names: Record<Organ, string> | null;
	baseline: Activations;
	reactivity: number;
	weights: Weights;
	voice: Donor["voice"];
	humor: Donor["humor"];
	says: string[];
	quirks: Donor["quirks"];
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function newSeed(): number {
	return Math.floor(Math.random() * 4294967296) >>> 0;
}

// The donors an organ may come from: present-day ones for how he sounds, anyone for heart and brain.
// A roster with no present-day donors (a test roster) lets every organ come from anyone.
function poolFor(organ: Organ, roster: Donor[]): Donor[] {
	if (!MODERN_ORGANS.includes(organ)) return roster;
	const modern = roster.filter((d) => MODERN_DONORS.has(d.id));
	return modern.length > 0 ? modern : roster;
}

// The donor an organ falls back to when the saved one is missing or no longer allowed.
const fallbackDonor = (seed: number, organ: Organ, roster: Donor[]): Donor => {
	const pool = poolFor(organ, roster);
	return pool[hashString(`${seed}:${organ}`) % pool.length];
};

export function assemble(seed: number, roster: Donor[] = DONORS): Genome {
	const next = mulberry32(seed);
	const donors = {} as Record<Organ, string>;
	for (const organ of ORGANS) {
		const pool = poolFor(organ, roster);
		donors[organ] = pool[Math.floor(next() * pool.length)].id;
	}
	return { seed: seed >>> 0, donors };
}

function normalizeWeights(w: Weights): Weights {
	const raw = {} as Weights;
	for (const v of VALUES) raw[v] = Math.max(0.02, Number.isFinite(w[v]) ? w[v] : 0);
	const total = VALUES.reduce((sum, v) => sum + raw[v], 0);
	for (const v of VALUES) raw[v] /= total;
	return raw;
}

const NEUTRAL: Personality = {
	genome: null,
	names: null,
	baseline: BASELINE,
	reactivity: 1,
	weights: DEFAULT_WEIGHTS,
	voice: { formality: 0.5, verbosity: 0.5, warmth: 0, openers: [], elaboration: "" },
	humor: { style: "none", level: 0, lines: [] },
	says: [],
	quirks: { phrases: [], rate: 0 },
};

export function resolve(genome: Genome | null, roster: Donor[] = DONORS): Personality {
	if (!genome) return NEUTRAL;
	const byId = new Map(roster.map((d) => [d.id, d]));
	const pick = (organ: Organ): Donor => {
		const saved = byId.get(genome.donors[organ]);
		return saved && poolFor(organ, roster).includes(saved) ? saved : fallbackDonor(genome.seed, organ, roster);
	};
	const heart = pick("heart");
	const brain = pick("brain");
	const voice = pick("voice");
	const humor = pick("humor");
	const slang = pick("slang");
	const quirks = pick("quirks");

	const baseline = {} as Activations;
	for (const e of EMOTIONS) baseline[e] = clamp(BASELINE[e] + (heart.heart.baseline[e] ?? 0), 0.05, 0.85);

	return {
		genome,
		names: {
			heart: heart.name,
			brain: brain.name,
			voice: voice.name,
			humor: humor.name,
			slang: slang.name,
			quirks: quirks.name,
		},
		baseline,
		reactivity: clamp(heart.heart.reactivity, 0.6, 1.5),
		weights: normalizeWeights(brain.brain),
		voice: voice.voice,
		humor: humor.humor,
		says: slang.slang.says,
		quirks: quirks.quirks,
	};
}

// Repairs a genome read from storage. Anything unusable means "no genome yet".
export function sanitizeGenome(raw: unknown, roster: Donor[] = DONORS): Genome | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.seed !== "number" || !Number.isFinite(r.seed)) return null;
	const seed = r.seed >>> 0;
	const stored = typeof r.donors === "object" && r.donors !== null ? (r.donors as Record<string, unknown>) : {};
	const fresh = assemble(seed, roster);
	const donors = {} as Record<Organ, string>;
	for (const organ of ORGANS) {
		const id = stored[organ];
		const allowed = poolFor(organ, roster).some((d) => d.id === id);
		// An organ that is gone, or that now has to be present-day, becomes his seed's own pick.
		donors[organ] = typeof id === "string" && allowed ? id : MODERN_ORGANS.includes(organ) ? fresh.donors[organ] : fallbackDonor(seed, organ, roster).id;
	}
	return { seed, donors };
}

const sameWeights = (a: Weights, b: Weights) => VALUES.every((v) => Math.abs(a[v] - b[v]) < 1e-9);
const sameMood = (a: Activations, b: Activations) => EMOTIONS.every((e) => Math.abs(a[e] - b[e]) < 1e-9);

// Puts a genome on a state. A resting mood moves to the new baseline; learned moral weights survive
// unless resetWeights is set (a re-roll) or they are still the untouched defaults (a brand-new Osmo).
export function adoptGenome(
	state: AgentState,
	genome: Genome,
	options: { resetWeights: boolean },
	roster: Donor[] = DONORS,
): AgentState {
	const before = resolve(state.genome, roster);
	const after = resolve(genome, roster);
	return {
		...state,
		genome,
		activations: sameMood(state.activations, before.baseline) ? { ...after.baseline } : state.activations,
		weights: options.resetWeights || sameWeights(state.weights, DEFAULT_WEIGHTS) ? { ...after.weights } : state.weights,
	};
}

// Every donor's slang, so Osmo understands all of it. The earliest donor wins a conflict.
export function mergedLexicon(roster: Donor[] = DONORS): Record<string, string> {
	const out: Record<string, string> = {};
	for (const d of roster) {
		for (const [word, meaning] of Object.entries(d.slang.lexicon)) if (!(word in out)) out[word] = meaning;
	}
	return out;
}
