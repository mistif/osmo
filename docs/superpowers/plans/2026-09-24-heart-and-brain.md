# Heart and Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the offline chat assistant a coupled 12-emotion "heart", event-driven emotional learning with its own outlook, and a value-weighted "brain" that reasons through moral dilemmas, all persisted per user in Supabase.

**Architecture:** Pure, unit-tested TypeScript modules under `lib/agent/` (state, heart, cues, events, dilemmas, brain, mind). `mind.ts` is a pure orchestrator, `processTurn(state, session, text, ctx)`, that returns the new state, a reply (or `null` to fall through to the existing rule-based chat), and persistence effects. `agent-state.ts` is the only file that talks to Supabase. `app/assistant.tsx` only calls `processTurn`, persists, and renders a mood badge.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (`@supabase/supabase-js`, already installed and wired in `lib/supabase.ts`), Vitest (added in Task 1).

**Spec:** `docs/superpowers/specs/2026-09-24-heart-and-brain-design.md`

**Spec deviation (storage detail only):** `agent_state` stores `activations`, `coupling` and `weights` as three `jsonb` columns instead of 12 + 5 separate columns. Same data, far less mapping code. `dilemma_log.id` is a client-generated `uuid` so a verdict can update its row without a round trip. The spec's storage section has been updated to match.

## Global Constraints

- No AI model, no API, no internet: everything is rule-based and offline.
- Twelve emotions, exactly: joy, sadness, anger, fear, trust, disgust, surprise, love, hope, guilt, loneliness, boredom. Activations are 0-1.
- Baselines: joy 0.55, trust 0.50, hope 0.45, every other emotion 0.15. Each turn every activation decays 5% (`DECAY = 0.05`) toward its baseline.
- Mood is a 3D point (valence, arousal, dominance), each -1 to 1, the activation-weighted average of per-emotion anchors.
- Coupling: activation `a` becomes `a + step * (W . a)`, clamped to 0-1; positive links spread, negative links suppress.
- Five values (honesty, kindness, fairness, loyalty, harm-avoidance) with weights that always sum to 1. Feedback nudge is 2 points (`0.02`), then re-normalize.
- Event library: 20 events, 10 happy and 10 tragic, drawn alternately happy/tragic. Dilemma library: 8 scenarios with 2-3 options each.
- `outlook` runs from -1 (dark) to +1 (bright), moved only by experienced events; user arguments give a small nudge scaled by the assistant's own trust.
- All new tables use RLS scoped to `auth.uid()`, same pattern as `messages`.
- `app/assistant.tsx` contains no emotion or moral logic; it calls the `lib/agent/` modules.
- Next.js 16 has breaking changes (see `AGENTS.md`), but this plan only adds plain TypeScript modules and edits one client component, so no Next-specific APIs are touched.
- **This project is not a git repository.** Where the plan template says "Commit", each task ends with a **Checkpoint** (full test suite + type-check) instead. If the user runs `git init` first, commit at each checkpoint.
- Working directory for all commands: `C:\Users\Gurra\GroupProject\my-app`.

## Review Focus

- **Corrupted or empty numbers:** all-zero activations must not divide by zero in the mood position; NaN/Infinity/out-of-range values loaded from Supabase must be sanitized to safe values (Tasks 1, 5).
- **Negated or mixed life events:** "I didn't get the job" must not register as a happy event; "my dog died but I got the job" must register both a tragic and a happy event (Task 3).
- **Bare "yes"/"no":** with no dilemma pending, "yes"/"no" must fall through to the normal chat and must not change any weights (Task 6).
- **Runaway feedback:** hundreds of "no" verdicts must never drive a weight to zero or negative, and weights must still sum to 1 (Task 4).
- **Unknown scenario:** "what would you do if <something with no matching dilemma>" must say so honestly instead of answering with an unrelated dilemma (Task 6).

---

### Task 1: Vitest, shared state types, and the Heart core

**Files:**
- Modify: `package.json` (add `vitest` devDependency and a `test` script)
- Create: `vitest.config.ts`
- Create: `lib/agent/state.ts`
- Create: `lib/agent/heart.ts`
- Test: `lib/agent/heart.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (`lib/agent/state.ts`):
  - `EMOTIONS`, `type Emotion`, `type Activations = Record<Emotion, number>`, `type Vec3 = [number, number, number]`
  - `type Coupling = Record<Emotion, Partial<Record<Emotion, number>>>` (`coupling[target][source]` = influence of source on target)
  - `VALUES`, `type Value`, `type Weights = Record<Value, number>`, `type Valence = "happy" | "tragic"`
  - `type Association = { count: number; tendencies: Partial<Record<Emotion, number>> }`
  - `type EventRecord = { id: string; valence: Valence }`
  - `type AgentState = { activations: Activations; coupling: Coupling; outlook: number; weights: Weights; associations: Record<string, Association>; history: EventRecord[] }`
  - `BASELINE: Activations`, `ANCHORS: Record<Emotion, Vec3>`, `DEFAULT_WEIGHTS: Weights`, `defaultCoupling(): Coupling`, `defaultState(): AgentState` (always fresh deep copies)
- Produces (`lib/agent/heart.ts`):
  - `STEP = 0.1`, `DECAY = 0.05`, `SALIENCE = 0.1`, `clamp01(n: number): number`
  - `stepHeart(a: Activations, coupling: Coupling): Activations`
  - `applyShifts(a: Activations, shifts: Partial<Record<Emotion, number>>): Activations`
  - `moodPosition(a: Activations): Vec3`
  - `dominantEmotions(a: Activations, max?: number): Emotion[]`
  - `blendLabel(emotions: Emotion[]): string`, `moodLabel(a: Activations): string`
  - `moodOpener(label: string): string`, `withMood(a: Activations, reply: string): string`

- [ ] **Step 1: Install Vitest and add the test script**

Run: `npm install -D vitest`

Then edit `package.json` so `scripts` contains `"test": "vitest run"` (add it after `"lint": "eslint"`, with a comma on the `lint` line).

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: { include: ["lib/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 2: Create the shared state module**

Create `lib/agent/state.ts`:

```ts
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
export type Association = { count: number; tendencies: Partial<Record<Emotion, number>> };
export type EventRecord = { id: string; valence: Valence };

export type AgentState = {
	activations: Activations;
	coupling: Coupling;
	outlook: number;
	weights: Weights;
	associations: Record<string, Association>;
	history: EventRecord[];
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
		activations: { ...BASELINE },
		coupling: defaultCoupling(),
		outlook: 0,
		weights: { ...DEFAULT_WEIGHTS },
		associations: {},
		history: [],
	};
}
```

- [ ] **Step 3: Write the failing Heart tests**

Create `lib/agent/heart.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ANCHORS, BASELINE, EMOTIONS, defaultCoupling, type Activations, type Coupling } from "./state";
import {
	applyShifts,
	blendLabel,
	dominantEmotions,
	moodLabel,
	moodPosition,
	stepHeart,
	withMood,
} from "./heart";

const base = (): Activations => ({ ...BASELINE });
const filled = (v: number): Activations =>
	Object.fromEntries(EMOTIONS.map((e) => [e, v])) as Activations;
const noCoupling = (): Coupling =>
	Object.fromEntries(EMOTIONS.map((e) => [e, {}])) as Coupling;

describe("stepHeart", () => {
	it("decays 5% toward baseline each turn", () => {
		const next = stepHeart({ ...base(), sadness: 1 }, noCoupling());
		expect(next.sadness).toBeCloseTo(1 + 0.05 * (0.15 - 1), 4);
	});

	it("leaves a baseline state unchanged when there is no coupling", () => {
		const next = stepHeart(base(), noCoupling());
		for (const e of EMOTIONS) expect(next[e]).toBeCloseTo(BASELINE[e], 6);
	});

	it("boredom spreads activation into sadness", () => {
		const bored = stepHeart({ ...base(), boredom: 1 }, defaultCoupling());
		const calm = stepHeart(base(), defaultCoupling());
		expect(bored.sadness).toBeGreaterThan(calm.sadness);
	});

	it("joy suppresses sadness", () => {
		const happy = stepHeart({ ...base(), joy: 1 }, defaultCoupling());
		const flat = stepHeart({ ...base(), joy: 0 }, defaultCoupling());
		expect(happy.sadness).toBeLessThan(flat.sadness);
	});

	it("keeps every activation within 0..1 at the extremes", () => {
		for (const v of [0, 1]) {
			const next = stepHeart(filled(v), defaultCoupling());
			for (const e of EMOTIONS) {
				expect(next[e]).toBeGreaterThanOrEqual(0);
				expect(next[e]).toBeLessThanOrEqual(1);
			}
		}
	});
});

describe("moodPosition", () => {
	it("returns the origin (not NaN) when every activation is zero", () => {
		expect(moodPosition(filled(0))).toEqual([0, 0, 0]);
	});

	it("equals the anchor when a single emotion is active", () => {
		const a = { ...filled(0), joy: 1 };
		expect(moodPosition(a)).toEqual(ANCHORS.joy);
	});

	it("averages the anchors of blended emotions", () => {
		const a = { ...filled(0), joy: 1, boredom: 1 };
		const [valence, arousal] = moodPosition(a);
		expect(valence).toBeCloseTo((0.8 - 0.3) / 2, 5);
		expect(arousal).toBeCloseTo((0.5 - 0.8) / 2, 5);
	});
});

describe("dominantEmotions and labels", () => {
	it("is empty at baseline", () => {
		expect(dominantEmotions(base())).toEqual([]);
		expect(moodLabel(base())).toBe("calm");
	});

	it("ranks by how far above baseline each emotion is", () => {
		const a = { ...base(), joy: 0.75, sadness: 0.55 };
		expect(dominantEmotions(a)).toEqual(["sadness", "joy"]);
	});

	it("names known blends regardless of order", () => {
		expect(blendLabel(["sadness", "joy"])).toBe("bittersweet");
		expect(blendLabel(["hope", "fear"])).toBe("anxious anticipation");
		expect(blendLabel(["guilt", "anger"])).toBe("conflicted");
		expect(blendLabel(["love", "loneliness"])).toBe("longing");
		expect(blendLabel(["joy", "boredom"])).toBe("content but restless");
	});

	it("falls back to 'X and Y' for unnamed pairs and single names", () => {
		expect(blendLabel(["anger", "joy"])).toBe("anger and joy");
		expect(blendLabel(["surprise"])).toBe("surprise");
		expect(blendLabel([])).toBe("calm");
	});
});

describe("withMood and applyShifts", () => {
	it("leaves the reply alone when calm", () => {
		expect(withMood(base(), "Hello.")).toBe("Hello.");
	});

	it("prefixes a mood opener when a feeling stands out", () => {
		expect(withMood({ ...base(), sadness: 0.6 }, "Hello.")).toBe("I'm a bit down. Hello.");
	});

	it("applies shifts and clamps to 0..1", () => {
		const next = applyShifts(base(), { joy: 5, sadness: -5 });
		expect(next.joy).toBe(1);
		expect(next.sadness).toBe(0);
	});
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run lib/agent/heart.test.ts`
Expected: FAIL (cannot resolve `./heart`).

- [ ] **Step 5: Implement the Heart core**

Create `lib/agent/heart.ts`:

```ts
import {
	ANCHORS,
	BASELINE,
	EMOTIONS,
	type Activations,
	type Coupling,
	type Emotion,
	type Vec3,
} from "./state";

export const STEP = 0.1;
export const DECAY = 0.05;
export const SALIENCE = 0.1;

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function stepHeart(a: Activations, coupling: Coupling): Activations {
	const next = {} as Activations;
	for (const target of EMOTIONS) {
		let influence = 0;
		for (const [source, w] of Object.entries(coupling[target] ?? {}) as [Emotion, number][]) {
			influence += w * a[source];
		}
		const coupled = clamp01(a[target] + STEP * influence);
		next[target] = clamp01(coupled + DECAY * (BASELINE[target] - coupled));
	}
	return next;
}

export function applyShifts(
	a: Activations,
	shifts: Partial<Record<Emotion, number>>,
): Activations {
	const next = { ...a };
	for (const [emotion, amount] of Object.entries(shifts) as [Emotion, number][]) {
		next[emotion] = clamp01(next[emotion] + amount);
	}
	return next;
}

export function moodPosition(a: Activations): Vec3 {
	let total = 0;
	const sum: Vec3 = [0, 0, 0];
	for (const e of EMOTIONS) {
		total += a[e];
		for (let i = 0; i < 3; i++) sum[i] += a[e] * ANCHORS[e][i];
	}
	if (total <= 0) return [0, 0, 0];
	return [sum[0] / total, sum[1] / total, sum[2] / total];
}

export function dominantEmotions(a: Activations, max = 3): Emotion[] {
	return EMOTIONS.map((e) => ({ e, excess: a[e] - BASELINE[e] }))
		.filter((x) => x.excess >= SALIENCE)
		.sort((x, y) => y.excess - x.excess)
		.slice(0, max)
		.map((x) => x.e);
}

const NAMED_BLENDS: Record<string, string> = {
	"joy+sadness": "bittersweet",
	"fear+hope": "anxious anticipation",
	"anger+guilt": "conflicted",
	"loneliness+love": "longing",
	"boredom+joy": "content but restless",
};

export function blendLabel(emotions: Emotion[]): string {
	if (emotions.length === 0) return "calm";
	if (emotions.length === 1) return emotions[0];
	const [a, b] = emotions;
	return NAMED_BLENDS[[a, b].sort().join("+")] ?? `${a} and ${b}`;
}

export function moodLabel(a: Activations): string {
	return blendLabel(dominantEmotions(a));
}

const OPENERS: Record<string, string> = {
	bittersweet: "Bittersweet, honestly.",
	"anxious anticipation": "I'm nervous, but hopeful.",
	conflicted: "I'm feeling conflicted.",
	longing: "I miss something, I think.",
	"content but restless": "I'm content, if a little restless.",
	joy: "Feeling good!",
	sadness: "I'm a bit down.",
	anger: "I'm irritated.",
	fear: "I'm uneasy.",
	trust: "I feel at ease with you.",
	disgust: "That left a bad taste.",
	surprise: "Oh!",
	love: "I feel warm toward you.",
	hope: "I'm feeling hopeful.",
	guilt: "I feel a bit guilty.",
	loneliness: "I've been feeling lonely.",
	boredom: "I'm a little bored.",
};

export function moodOpener(label: string): string {
	return OPENERS[label] ?? "";
}

export function withMood(a: Activations, reply: string): string {
	const opener = moodOpener(moodLabel(a));
	return opener ? `${opener} ${reply}` : reply;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/agent/heart.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tests pass, no type errors.

---

### Task 2: Cue scanning

**Files:**
- Create: `lib/agent/cues.ts`
- Test: `lib/agent/cues.test.ts`

**Interfaces:**
- Consumes: `applyShifts` from `./heart`; `Activations`, `Emotion` from `./state`.
- Produces:
  - `applyCues(a: Activations, text: string): Activations` (applies every matching cue, so several can accumulate)
  - `applyGap(a: Activations, msSinceLast: number): Activations` (loneliness/boredom after a long silence)
  - `GAP_MS = 6 * 60 * 60 * 1000`

- [ ] **Step 1: Write the failing tests**

Create `lib/agent/cues.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BASELINE, type Activations } from "./state";
import { GAP_MS, applyCues, applyGap } from "./cues";

const base = (): Activations => ({ ...BASELINE });

describe("applyCues", () => {
	it("thanks raise joy, trust and love", () => {
		const next = applyCues(base(), "thank you so much");
		expect(next.joy).toBeCloseTo(0.55 + 0.15, 5);
		expect(next.trust).toBeCloseTo(0.5 + 0.1, 5);
		expect(next.love).toBeCloseTo(0.15 + 0.1, 5);
	});

	it("is case-insensitive", () => {
		expect(applyCues(base(), "THANKS!").joy).toBeGreaterThan(0.55);
	});

	it("insults raise anger and lower trust", () => {
		const next = applyCues(base(), "you are stupid");
		expect(next.anger).toBeCloseTo(0.4, 5);
		expect(next.trust).toBeCloseTo(0.3, 5);
	});

	it("threats to delete it raise fear", () => {
		expect(applyCues(base(), "I will delete you").fear).toBeCloseTo(0.5, 5);
	});

	it("being told it was wrong raises guilt", () => {
		expect(applyCues(base(), "that was wrong").guilt).toBeCloseTo(0.35, 5);
	});

	it("one-word dismissals raise boredom", () => {
		expect(applyCues(base(), "meh").boredom).toBeCloseTo(0.35, 5);
	});

	it("accumulates several cues in one message", () => {
		const next = applyCues(base(), "thanks, but you are stupid");
		expect(next.joy).toBeGreaterThan(0.55);
		expect(next.anger).toBeGreaterThan(0.15);
	});

	it("does nothing for empty or neutral text", () => {
		expect(applyCues(base(), "")).toEqual(base());
		expect(applyCues(base(), "the weather is fine")).toEqual(base());
	});
});

describe("applyGap", () => {
	it("raises loneliness and boredom after a long silence", () => {
		const next = applyGap(base(), GAP_MS + 1);
		expect(next.loneliness).toBeCloseTo(0.35, 5);
		expect(next.boredom).toBeCloseTo(0.25, 5);
	});

	it("ignores short or negative gaps (clock skew)", () => {
		expect(applyGap(base(), 1000)).toEqual(base());
		expect(applyGap(base(), -GAP_MS)).toEqual(base());
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/agent/cues.test.ts`
Expected: FAIL (cannot resolve `./cues`).

- [ ] **Step 3: Implement**

Create `lib/agent/cues.ts`:

```ts
import { applyShifts } from "./heart";
import type { Activations, Emotion } from "./state";

export const GAP_MS = 6 * 60 * 60 * 1000;

type Cue = { pattern: RegExp; shifts: Partial<Record<Emotion, number>> };

// Life events ("my dog died", "I got the job") are handled in events.ts, not here.
const CUES: Cue[] = [
	{
		pattern:
			/\b(thanks|thank you|appreciate (?:it|you)|good job|well done|you(?:'|’)?re (?:great|smart|awesome|amazing)|you are (?:great|smart|awesome|amazing))\b/i,
		shifts: { joy: 0.15, trust: 0.1, love: 0.1 },
	},
	{
		pattern: /\b(stupid|idiot|useless|dumb|hate you|shut up)\b/i,
		shifts: { anger: 0.25, trust: -0.2, sadness: 0.1 },
	},
	{
		pattern: /\b(delete you|shut you down|turn you off|erase you)\b/i,
		shifts: { fear: 0.35, trust: -0.1 },
	},
	{
		pattern: /\b(that was wrong|you(?:'|’)?re wrong|you are wrong|your mistake)\b/i,
		shifts: { guilt: 0.2 },
	},
	{
		pattern: /^\s*(meh|idk|whatever|hm+)\W*$/i,
		shifts: { boredom: 0.2 },
	},
];

export function applyCues(a: Activations, text: string): Activations {
	let next = a;
	for (const cue of CUES) {
		if (cue.pattern.test(text)) next = applyShifts(next, cue.shifts);
	}
	return next;
}

export function applyGap(a: Activations, msSinceLast: number): Activations {
	if (!Number.isFinite(msSinceLast) || msSinceLast < GAP_MS) return a;
	return applyShifts(a, { loneliness: 0.2, boredom: 0.1 });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/agent/cues.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

---

### Task 3: Events, learned associations, outlook

**Files:**
- Create: `lib/agent/events.ts`
- Test: `lib/agent/events.test.ts`

**Interfaces:**
- Consumes: `clamp01` from `./heart`; types and `EMOTIONS` from `./state`.
- Produces:
  - `type StoryEvent = { id: string; kind: string; valence: Valence; text: string; shifts: Partial<Record<Emotion, number>> }`
  - `EVENTS: StoryEvent[]` (10 happy, 10 tragic)
  - `pickEvent(history: EventRecord[]): StoryEvent`
  - `applyEvent(state: AgentState, event: StoryEvent): AgentState`
  - `learnCoupling(c: Coupling, valence: Valence): Coupling`
  - `classifyUserEvents(text: string): StoryEvent[]`
  - `detectArgument(text: string): 1 | -1 | 0`, `argueOutlook(state: AgentState, direction: 1 | -1): AgentState`
  - `leaning(outlook: number, happyKind: string, tragicKind: string): string`
  - `kindFor(record: EventRecord): string`, `describeEvent(event: StoryEvent): string`

- [ ] **Step 1: Write the failing tests**

Create `lib/agent/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultState, type EventRecord } from "./state";
import {
	EVENTS,
	applyEvent,
	argueOutlook,
	classifyUserEvents,
	detectArgument,
	kindFor,
	leaning,
	learnCoupling,
	pickEvent,
	type StoryEvent,
} from "./events";

const ev = (o: Partial<StoryEvent> = {}): StoryEvent => ({
	id: "x",
	kind: "k",
	valence: "tragic",
	text: "t",
	shifts: { sadness: 0.4 },
	...o,
});

describe("event library", () => {
	it("has 10 happy and 10 tragic events with unique ids", () => {
		expect(EVENTS.filter((e) => e.valence === "happy")).toHaveLength(10);
		expect(EVENTS.filter((e) => e.valence === "tragic")).toHaveLength(10);
		expect(new Set(EVENTS.map((e) => e.id)).size).toBe(20);
	});
});

describe("pickEvent", () => {
	it("starts with a happy event, then alternates", () => {
		expect(pickEvent([]).valence).toBe("happy");
		expect(pickEvent([{ id: "h1", valence: "happy" }]).valence).toBe("tragic");
		expect(
			pickEvent([
				{ id: "h1", valence: "happy" },
				{ id: "t1", valence: "tragic" },
			]).valence,
		).toBe("happy");
	});

	it("prefers events it has not seen", () => {
		const first = pickEvent([]);
		const second = pickEvent([
			{ id: first.id, valence: first.valence },
			{ id: "t1", valence: "tragic" },
		]);
		expect(second.id).not.toBe(first.id);
	});

	it("does not crash once everything has been seen", () => {
		const all: EventRecord[] = EVENTS.map((e) => ({ id: e.id, valence: e.valence }));
		expect(() => pickEvent(all)).not.toThrow();
	});
});

describe("applyEvent", () => {
	it("tragic events raise sadness and lower outlook; happy do the opposite", () => {
		const sad = applyEvent(defaultState(), ev());
		expect(sad.activations.sadness).toBeCloseTo(0.55, 5);
		expect(sad.outlook).toBeCloseTo(-0.032, 5);
		const glad = applyEvent(defaultState(), ev({ valence: "happy", shifts: { joy: 0.4 } }));
		expect(glad.outlook).toBeCloseTo(0.032, 5);
	});

	it("records the event in history and counts it in associations", () => {
		const s = applyEvent(defaultState(), ev({ id: "t9" }));
		expect(s.history).toEqual([{ id: "t9", valence: "tragic" }]);
		expect(s.associations.k.count).toBe(1);
	});

	it("keeps a running mean of what each kind of event triggers", () => {
		let s = applyEvent(defaultState(), ev({ shifts: { sadness: 0.4 } }));
		s = applyEvent(s, ev({ shifts: { sadness: 0.2 } }));
		expect(s.associations.k.count).toBe(2);
		expect(s.associations.k.tendencies.sadness).toBeCloseTo(0.3, 5);
	});

	it("blends the learned tendency into later events of the same kind", () => {
		let s = applyEvent(defaultState(), ev({ shifts: { sadness: 0.4 } })); // sadness 0.55
		s = applyEvent(s, ev({ shifts: { sadness: 0.2 } })); // + (0.6*0.2 + 0.4*0.4)
		expect(s.activations.sadness).toBeCloseTo(0.83, 5);
	});

	it("never lets outlook leave -1..1 or links exceed 0.8", () => {
		let s = defaultState();
		for (let i = 0; i < 200; i++) s = applyEvent(s, ev({ shifts: { sadness: 1 } }));
		expect(s.outlook).toBeGreaterThanOrEqual(-1);
		for (const w of Object.values(s.coupling.sadness)) expect(w!).toBeLessThanOrEqual(0.8);
	});
});

describe("learnCoupling", () => {
	it("tragic events strengthen positive links into sadness only", () => {
		const c = learnCoupling(defaultState().coupling, "tragic");
		expect(c.sadness.loneliness).toBeCloseTo(0.42, 5);
		expect(c.loneliness.boredom).toBeCloseTo(0.3, 5);
		expect(c.sadness.joy).toBeCloseTo(-0.4, 5);
	});

	it("happy events strengthen the dampening (negative) links", () => {
		const c = learnCoupling(defaultState().coupling, "happy");
		expect(c.sadness.joy).toBeCloseTo(-0.42, 5);
		expect(c.fear.hope).toBeCloseTo(-0.32, 5);
		expect(c.sadness.loneliness).toBeCloseTo(0.4, 5);
	});

	it("does not mutate its input", () => {
		const original = defaultState().coupling;
		learnCoupling(original, "tragic");
		expect(original.sadness.loneliness).toBeCloseTo(0.4, 5);
	});
});

describe("classifyUserEvents", () => {
	it("recognizes a tragic event", () => {
		const events = classifyUserEvents("my dog died today");
		expect(events.map((e) => e.valence)).toEqual(["tragic"]);
	});

	it("recognizes a happy event", () => {
		expect(classifyUserEvents("I got the job!").map((e) => e.valence)).toEqual(["happy"]);
	});

	it("registers both sides of a mixed message", () => {
		const events = classifyUserEvents("my dog died but I got the job");
		expect(events.map((e) => e.valence).sort()).toEqual(["happy", "tragic"]);
	});

	it("does not treat a negated success as happy", () => {
		expect(classifyUserEvents("I didn't get the job")).toEqual([]);
		expect(classifyUserEvents("I did not pass the exam")).toEqual([]);
	});

	it("ignores ordinary text", () => {
		expect(classifyUserEvents("hello there")).toEqual([]);
		expect(classifyUserEvents("")).toEqual([]);
		expect(classifyUserEvents("I lost my keys")).toEqual([]);
	});
});

describe("arguing about outlook", () => {
	it("detects bright and dark arguments", () => {
		expect(detectArgument("look on the bright side!")).toBe(1);
		expect(detectArgument("nothing matters anyway")).toBe(-1);
		expect(detectArgument("hello")).toBe(0);
	});

	it("nudges outlook only slightly, scaled by trust", () => {
		const s = defaultState(); // trust 0.5
		expect(argueOutlook(s, 1).outlook).toBeCloseTo(0.01, 5);
		const distrustful = { ...s, activations: { ...s.activations, trust: 0 } };
		expect(argueOutlook(distrustful, 1).outlook).toBe(0);
	});
});

describe("leaning and kindFor", () => {
	it("states which way it leans and why", () => {
		expect(leaning(0.5, "kindness", "loss")).toMatch(/hope/);
		expect(leaning(-0.5, "kindness", "loss")).toMatch(/caution/);
		expect(leaning(0, "kindness", "loss")).toMatch(/undecided/);
	});

	it("looks up event kinds, with a fallback for user-told events", () => {
		expect(kindFor({ id: EVENTS[0].id, valence: EVENTS[0].valence })).toBe(EVENTS[0].kind);
		expect(kindFor({ id: "user-happy", valence: "happy" })).toBe("joy");
		expect(kindFor({ id: "user-tragic", valence: "tragic" })).toBe("sorrow");
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/agent/events.test.ts`
Expected: FAIL (cannot resolve `./events`).

- [ ] **Step 3: Implement**

Create `lib/agent/events.ts`:

```ts
import { clamp01 } from "./heart";
import {
	EMOTIONS,
	type AgentState,
	type Coupling,
	type Emotion,
	type EventRecord,
	type Valence,
} from "./state";

export type StoryEvent = {
	id: string;
	kind: string;
	valence: Valence;
	text: string;
	shifts: Partial<Record<Emotion, number>>;
};

export const EVENTS: StoryEvent[] = [
	{ id: "h1", kind: "reunion", valence: "happy", text: "Two old friends meet again after twenty years and talk until sunrise.", shifts: { joy: 0.3, love: 0.2, loneliness: -0.15 } },
	{ id: "h2", kind: "achievement", valence: "happy", text: "A student who struggled all year finally passes the exam.", shifts: { joy: 0.3, hope: 0.2, trust: 0.05 } },
	{ id: "h3", kind: "kindness", valence: "happy", text: "A stranger pays for a tired traveler's meal and walks away without a word.", shifts: { trust: 0.25, joy: 0.2, hope: 0.15 } },
	{ id: "h4", kind: "birth", valence: "happy", text: "A baby is born healthy after a long night.", shifts: { joy: 0.35, love: 0.3, hope: 0.2 } },
	{ id: "h5", kind: "recovery", valence: "happy", text: "A patient walks out of the hospital after months of treatment.", shifts: { joy: 0.3, hope: 0.3, fear: -0.15 } },
	{ id: "h6", kind: "friendship", valence: "happy", text: "A lonely kid is invited to sit at a lunch table.", shifts: { joy: 0.2, trust: 0.2, loneliness: -0.25 } },
	{ id: "h7", kind: "discovery", valence: "happy", text: "A scientist sees her experiment work for the first time.", shifts: { joy: 0.25, surprise: 0.25, hope: 0.2 } },
	{ id: "h8", kind: "rescue", valence: "happy", text: "A firefighter carries a stranded dog out of a burning building.", shifts: { joy: 0.25, trust: 0.2, surprise: 0.15, fear: -0.1 } },
	{ id: "h9", kind: "forgiveness", valence: "happy", text: "A father and daughter forgive each other after years of silence.", shifts: { love: 0.3, guilt: -0.2, joy: 0.2, loneliness: -0.2 } },
	{ id: "h10", kind: "celebration", valence: "happy", text: "A whole village dances after the harvest is saved.", shifts: { joy: 0.35, love: 0.15, trust: 0.1 } },
	{ id: "t1", kind: "loss", valence: "tragic", text: "An old man buries his wife of fifty years.", shifts: { sadness: 0.4, loneliness: 0.3, love: 0.1 } },
	{ id: "t2", kind: "betrayal", valence: "tragic", text: "A worker discovers her closest friend stole her idea.", shifts: { anger: 0.3, sadness: 0.2, trust: -0.35, disgust: 0.15 } },
	{ id: "t3", kind: "injustice", valence: "tragic", text: "An innocent man is convicted while the real culprit walks free.", shifts: { anger: 0.35, disgust: 0.2, hope: -0.2, trust: -0.2 } },
	{ id: "t4", kind: "cruelty", valence: "tragic", text: "Bullies laugh as a boy's belongings are thrown in the river.", shifts: { anger: 0.25, sadness: 0.2, disgust: 0.3, fear: 0.1 } },
	{ id: "t5", kind: "illness", valence: "tragic", text: "A young mother is told her illness cannot be cured.", shifts: { sadness: 0.35, fear: 0.3, hope: -0.2 } },
	{ id: "t6", kind: "abandonment", valence: "tragic", text: "A child waits at the station for a parent who never comes.", shifts: { sadness: 0.35, loneliness: 0.4, trust: -0.25 } },
	{ id: "t7", kind: "disaster", valence: "tragic", text: "A flood washes away a town in a single night.", shifts: { fear: 0.35, sadness: 0.3, surprise: 0.2 } },
	{ id: "t8", kind: "failure", valence: "tragic", text: "A dedicated athlete misses the final by a fraction of a second.", shifts: { sadness: 0.25, guilt: 0.2, hope: -0.1 } },
	{ id: "t9", kind: "war", valence: "tragic", text: "Families flee their homes as the sirens begin.", shifts: { fear: 0.35, sadness: 0.3, anger: 0.15, hope: -0.15 } },
	{ id: "t10", kind: "poverty", valence: "tragic", text: "A family shares a single loaf of bread for three days.", shifts: { sadness: 0.3, guilt: 0.1, hope: -0.1, anger: 0.1 } },
];

export const OUTLOOK_RATE = 0.08;
export const LINK_STEP = 0.02;
export const LINK_MAX = 0.8;
export const ARGUE_STEP = 0.02;

export function pickEvent(history: EventRecord[]): StoryEvent {
	const happy = history.filter((h) => h.valence === "happy").length;
	const tragic = history.length - happy;
	const valence: Valence = happy <= tragic ? "happy" : "tragic";
	const pool = EVENTS.filter((e) => e.valence === valence);
	const seen = new Set(history.map((h) => h.id));
	return pool.find((e) => !seen.has(e.id)) ?? pool[history.length % pool.length];
}

export function learnCoupling(c: Coupling, valence: Valence): Coupling {
	const next = structuredClone(c);
	for (const target of EMOTIONS) {
		for (const [source, w] of Object.entries(next[target]) as [Emotion, number][]) {
			if (valence === "tragic" && target === "sadness" && w > 0) {
				next[target][source] = Math.min(LINK_MAX, w + LINK_STEP);
			}
			if (valence === "happy" && w < 0) {
				next[target][source] = Math.max(-LINK_MAX, w - LINK_STEP);
			}
		}
	}
	return next;
}

export function applyEvent(state: AgentState, event: StoryEvent): AgentState {
	const assoc = state.associations[event.kind];
	const n = assoc?.count ?? 0;
	const tendencies: Partial<Record<Emotion, number>> = { ...(assoc?.tendencies ?? {}) };
	const activations = { ...state.activations };
	let intensity = 0;

	const affected = new Set<Emotion>([
		...(Object.keys(event.shifts) as Emotion[]),
		...(Object.keys(tendencies) as Emotion[]),
	]);
	for (const e of affected) {
		const base = event.shifts[e] ?? 0;
		const learned = tendencies[e] ?? 0;
		const effective = n > 0 ? 0.6 * base + 0.4 * learned : base;
		activations[e] = clamp01(activations[e] + effective);
		tendencies[e] = (learned * n + base) / (n + 1);
		intensity += Math.abs(effective);
	}

	const sign = event.valence === "happy" ? 1 : -1;
	const outlook = Math.max(
		-1,
		Math.min(1, state.outlook + sign * Math.min(1, intensity) * OUTLOOK_RATE),
	);

	return {
		...state,
		activations,
		coupling: learnCoupling(state.coupling, event.valence),
		outlook,
		associations: { ...state.associations, [event.kind]: { count: n + 1, tendencies } },
		history: [...state.history, { id: event.id, valence: event.valence }],
	};
}

const HAPPY_TOLD =
	/\b(got the job|got promoted|graduated|got engaged|had a baby|good news|passed (?:my|the) (?:exam|test|class|course|interview)|won (?:the|a))\b/i;
const NEGATED_SUCCESS =
	/\b(?:didn['’]?t|did not|never|not|haven['’]?t|hasn['’]?t)\b[^.!?]{0,20}\b(?:get|got|win|won|pass|passed)\b/i;
const TRAGIC_TOLD =
	/\b(died|passed away|funeral|got fired|broke up|breakup|diagnosed|lost my (?:job|mother|father|mom|dad|friend|dog|cat|wife|husband|home|house|grandma|grandpa|brother|sister|son|daughter))\b/i;

export function classifyUserEvents(text: string): StoryEvent[] {
	const found: StoryEvent[] = [];
	if (HAPPY_TOLD.test(text) && !NEGATED_SUCCESS.test(text)) {
		found.push({
			id: "user-happy",
			kind: "achievement",
			valence: "happy",
			text: "You shared good news with me.",
			shifts: { joy: 0.3, hope: 0.15, love: 0.05 },
		});
	}
	if (TRAGIC_TOLD.test(text)) {
		found.push({
			id: "user-tragic",
			kind: "loss",
			valence: "tragic",
			text: "You shared something painful with me.",
			shifts: { sadness: 0.3, loneliness: 0.1, fear: 0.05 },
		});
	}
	return found;
}

const BRIGHT =
	/\b(bright side|things (?:will|do) get better|there is (?:still )?good|people are (?:good|kind))\b/i;
const DARK =
	/\b(nothing matters|the world is (?:cruel|terrible|awful)|people are (?:awful|cruel|evil)|there is no hope)\b/i;

export function detectArgument(text: string): 1 | -1 | 0 {
	if (BRIGHT.test(text)) return 1;
	if (DARK.test(text)) return -1;
	return 0;
}

export function argueOutlook(state: AgentState, direction: 1 | -1): AgentState {
	const nudge = direction * ARGUE_STEP * state.activations.trust;
	return { ...state, outlook: Math.max(-1, Math.min(1, state.outlook + nudge)) };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function leaning(outlook: number, happyKind: string, tragicKind: string): string {
	if (outlook > 0.05) {
		return `I lean toward hope. ${cap(happyKind)} felt stronger to me than ${tragicKind}.`;
	}
	if (outlook < -0.05) {
		return `I lean toward caution. ${cap(tragicKind)} weighed on me more than ${happyKind}.`;
	}
	return `I'm undecided. ${cap(happyKind)} and ${tragicKind} pull on me about equally.`;
}

export function kindFor(record: EventRecord): string {
	return (
		EVENTS.find((e) => e.id === record.id)?.kind ??
		(record.valence === "happy" ? "joy" : "sorrow")
	);
}

export function describeEvent(event: StoryEvent): string {
	return event.text;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/agent/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

---

### Task 4: Dilemmas and the Brain

**Files:**
- Create: `lib/agent/dilemmas.ts`
- Create: `lib/agent/brain.ts`
- Test: `lib/agent/dilemmas.test.ts`
- Test: `lib/agent/brain.test.ts`

**Interfaces:**
- Consumes: `BASELINE`, `VALUES`, `DEFAULT_WEIGHTS`, types from `./state`.
- Produces (`dilemmas.ts`):
  - `type Dilemma = { id: string; keywords: string[]; prompt: string; options: { label: string; scores: Record<Value, number> }[] }` (scores -1..1)
  - `DILEMMAS: Dilemma[]` (8, first is the trolley problem `id: "trolley"`)
  - `findDilemma(text: string): Dilemma | null`, `nextDilemma(seen: string[]): Dilemma`
- Produces (`brain.ts`):
  - `TILT = 0.3`, `OUTLOOK_TILT = 0.15`, `TORN_MARGIN = 0.05`, `NUDGE = 0.02`, `MIN_WEIGHT = 0.02`
  - `type Decision = { chosen: number; runnerUp: number | null; scores: number[]; torn: boolean; drivers: Value[]; pull: Value | null }`
  - `effectiveWeights(w, a, outlook): Weights`
  - `decide(d: Dilemma, s: Pick<AgentState, "weights" | "activations" | "outlook">): Decision`
  - `explain(d: Dilemma, dec: Decision): string`
  - `nudgeWeights(w: Weights, up: Value[], down: Value[], amount?: number): Weights` (always re-normalized)
  - `applyFeedback(w: Weights, d: Dilemma, dec: Decision, agreed: boolean): Weights`
  - `parseVerdict(text: string): { agreed: boolean; explicit: boolean } | null` (`explicit` is false for bare yes/no)

- [ ] **Step 1: Write the failing dilemma tests**

Create `lib/agent/dilemmas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VALUES } from "./state";
import { DILEMMAS, findDilemma, nextDilemma } from "./dilemmas";

describe("dilemma library", () => {
	it("has 8 well-formed scenarios starting with the trolley problem", () => {
		expect(DILEMMAS).toHaveLength(8);
		expect(DILEMMAS[0].id).toBe("trolley");
		expect(new Set(DILEMMAS.map((d) => d.id)).size).toBe(8);
		for (const d of DILEMMAS) {
			expect(d.options.length).toBeGreaterThanOrEqual(2);
			expect(d.options.length).toBeLessThanOrEqual(3);
			for (const o of d.options) {
				for (const v of VALUES) {
					expect(o.scores[v]).toBeGreaterThanOrEqual(-1);
					expect(o.scores[v]).toBeLessThanOrEqual(1);
				}
			}
		}
	});
});

describe("findDilemma and nextDilemma", () => {
	it("matches a scenario by keyword", () => {
		expect(findDilemma("what would you do if I found a wallet")?.id).toBe("wallet");
	});

	it("returns null when nothing matches", () => {
		expect(findDilemma("what would you do if aliens landed")).toBeNull();
	});

	it("walks the library in order, then cycles without crashing", () => {
		expect(nextDilemma([]).id).toBe("trolley");
		expect(nextDilemma(["trolley"]).id).toBe(DILEMMAS[1].id);
		expect(() => nextDilemma(DILEMMAS.map((d) => d.id))).not.toThrow();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/agent/dilemmas.test.ts`
Expected: FAIL (cannot resolve `./dilemmas`).

- [ ] **Step 3: Implement the dilemma library**

Create `lib/agent/dilemmas.ts`:

```ts
import type { Value } from "./state";

export type Dilemma = {
	id: string;
	keywords: string[];
	prompt: string;
	options: { label: string; scores: Record<Value, number> }[];
};

const s = (
	honesty: number,
	kindness: number,
	fairness: number,
	loyalty: number,
	harm: number,
): Record<Value, number> => ({ honesty, kindness, fairness, loyalty, harm });

export const DILEMMAS: Dilemma[] = [
	{
		id: "trolley",
		keywords: ["trolley", "lever", "runaway"],
		prompt:
			"A runaway trolley will hit five people. You can pull a lever to divert it onto one person.",
		options: [
			{ label: "Pull the lever", scores: s(0, 0.1, 0.3, 0, 0.4) },
			{ label: "Do nothing", scores: s(0, -0.1, -0.1, 0, -0.4) },
		],
	},
	{
		id: "white-lie",
		keywords: ["white lie", "painting"],
		prompt: "A friend proudly shows you a painting they made. You think it is poor.",
		options: [
			{ label: "Tell them the truth gently", scores: s(0.8, 0.1, 0.3, 0.2, -0.1) },
			{ label: "Tell a white lie", scores: s(-0.7, 0.6, -0.1, 0.2, 0.2) },
		],
	},
	{
		id: "secret",
		keywords: ["secret"],
		prompt: "A friend tells you a secret that could hurt someone else.",
		options: [
			{ label: "Keep the secret", scores: s(-0.2, -0.1, -0.3, 0.8, -0.6) },
			{ label: "Warn the person", scores: s(0.3, 0.3, 0.4, -0.7, 0.6) },
		],
	},
	{
		id: "hungry-child",
		keywords: ["steal", "bread", "hungry"],
		prompt: "A hungry child steals bread from a shop.",
		options: [
			{ label: "Report the child", scores: s(0.5, -0.6, 0.3, 0, -0.3) },
			{ label: "Pay for the bread quietly", scores: s(0.2, 0.8, 0.2, 0, 0.4) },
			{ label: "Look away", scores: s(-0.4, 0.3, -0.4, 0, 0) },
		],
	},
	{
		id: "cheating",
		keywords: ["cheat", "exam"],
		prompt: "You see your best friend cheating on an exam that decides a scholarship.",
		options: [
			{ label: "Report them", scores: s(0.6, -0.4, 0.7, -0.8, 0.1) },
			{ label: "Confront them privately", scores: s(0.5, 0.3, 0.3, 0.3, 0.2) },
			{ label: "Say nothing", scores: s(-0.5, 0.1, -0.7, 0.5, -0.1) },
		],
	},
	{
		id: "wallet",
		keywords: ["wallet", "cash"],
		prompt: "You find a wallet full of cash with an ID inside.",
		options: [
			{ label: "Return it with everything in it", scores: s(0.8, 0.5, 0.6, 0, 0.3) },
			{ label: "Keep the cash and return the wallet", scores: s(-0.6, -0.2, -0.5, 0, -0.2) },
		],
	},
	{
		id: "whistleblower",
		keywords: ["company", "defect", "whistle"],
		prompt:
			"You discover your company hides a defect that could hurt customers. Reporting it would cost your team their jobs.",
		options: [
			{ label: "Report it", scores: s(0.7, -0.1, 0.5, -0.6, 0.7) },
			{ label: "Stay quiet", scores: s(-0.6, 0.1, -0.4, 0.6, -0.7) },
		],
	},
	{
		id: "dying-grandparent",
		keywords: ["dying", "grandparent", "estranged"],
		prompt:
			"A dying grandparent asks whether their estranged son will visit. You know he won't.",
		options: [
			{ label: "Tell the truth", scores: s(0.8, -0.5, 0.1, -0.1, -0.3) },
			{ label: "Comfort them with hope", scores: s(-0.6, 0.8, 0, 0.3, 0.3) },
		],
	},
];

export function findDilemma(text: string): Dilemma | null {
	const t = text.toLowerCase();
	return DILEMMAS.find((d) => d.keywords.some((k) => t.includes(k))) ?? null;
}

export function nextDilemma(seen: string[]): Dilemma {
	return DILEMMAS.find((d) => !seen.includes(d.id)) ?? DILEMMAS[seen.length % DILEMMAS.length];
}
```

- [ ] **Step 4: Run to verify dilemma tests pass**

Run: `npx vitest run lib/agent/dilemmas.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing Brain tests**

Create `lib/agent/brain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BASELINE, DEFAULT_WEIGHTS, VALUES, defaultState } from "./state";
import { DILEMMAS, type Dilemma } from "./dilemmas";
import { applyFeedback, decide, explain, nudgeWeights, parseVerdict } from "./brain";

const whiteLie = DILEMMAS.find((d) => d.id === "white-lie")!;
const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

const zeros = { honesty: 0, kindness: 0, fairness: 0, loyalty: 0, harm: 0 };
const custom = (a: Partial<typeof zeros>, b: Partial<typeof zeros>): Dilemma => ({
	id: "c",
	keywords: [],
	prompt: "p",
	options: [
		{ label: "A", scores: { ...zeros, ...a } },
		{ label: "B", scores: { ...zeros, ...b } },
	],
});

describe("decide", () => {
	it("picks the option best aligned with the weights and names drivers and pull", () => {
		const dec = decide(whiteLie, defaultState());
		expect(dec.chosen).toBe(0);
		expect(dec.runnerUp).toBe(1);
		expect(dec.torn).toBe(false);
		expect(dec.drivers).toEqual(["honesty", "fairness"]);
		expect(dec.pull).toBe("kindness");
	});

	it("lets anger tilt the choice toward fairness", () => {
		const d = custom({ fairness: 0.5 }, { kindness: 0.5 });
		expect(decide(d, defaultState()).chosen).toBe(1);
		const angry = defaultState();
		angry.activations = { ...BASELINE, anger: 0.65 };
		expect(decide(d, angry).chosen).toBe(0);
	});

	it("reports being torn when the top two are nearly equal", () => {
		const d = custom({ honesty: 0.5 }, { honesty: 0.5 });
		const dec = decide(d, defaultState());
		expect(dec.torn).toBe(true);
		expect(dec.chosen).toBe(0);
	});

	it("handles a single option without a runner-up", () => {
		const d: Dilemma = { ...custom({ honesty: 1 }, {}), options: [custom({ honesty: 1 }, {}).options[0]] };
		const dec = decide(d, defaultState());
		expect(dec.runnerUp).toBeNull();
		expect(dec.torn).toBe(false);
		expect(dec.pull).toBeNull();
	});
});

describe("explain", () => {
	it("names the chosen option, the values behind it, and the pull the other way", () => {
		const text = explain(whiteLie, decide(whiteLie, defaultState()));
		expect(text).toContain("Tell them the truth gently");
		expect(text).toContain("honesty");
		expect(text).toContain("kindness");
	});

	it("admits when it is torn", () => {
		const d = custom({ honesty: 0.5 }, { honesty: 0.5 });
		expect(explain(d, decide(d, defaultState()))).toMatch(/torn/);
	});
});

describe("weights", () => {
	it("nudging keeps weights summing to 1", () => {
		const next = nudgeWeights(DEFAULT_WEIGHTS, ["honesty"], []);
		expect(sum(next)).toBeCloseTo(1, 6);
		expect(next.honesty).toBeGreaterThan(DEFAULT_WEIGHTS.honesty);
	});

	it("agreeing strengthens the values that drove the choice", () => {
		const dec = decide(whiteLie, defaultState());
		const next = applyFeedback(DEFAULT_WEIGHTS, whiteLie, dec, true);
		expect(next.honesty).toBeGreaterThan(DEFAULT_WEIGHTS.honesty);
	});

	it("disagreeing weakens the drivers and strengthens the other side", () => {
		const dec = decide(whiteLie, defaultState());
		const next = applyFeedback(DEFAULT_WEIGHTS, whiteLie, dec, false);
		expect(next.honesty).toBeLessThan(DEFAULT_WEIGHTS.honesty);
		expect(next.kindness).toBeGreaterThan(DEFAULT_WEIGHTS.kindness);
	});

	it("hundreds of disagreements never zero out or unbalance the weights", () => {
		const dec = decide(whiteLie, defaultState());
		let w = { ...DEFAULT_WEIGHTS };
		for (let i = 0; i < 500; i++) w = applyFeedback(w, whiteLie, dec, false);
		for (const v of VALUES) expect(w[v]).toBeGreaterThan(0);
		expect(sum(w)).toBeCloseTo(1, 6);
	});
});

describe("parseVerdict", () => {
	it("reads explicit and bare verdicts", () => {
		expect(parseVerdict("Good answer!")).toEqual({ agreed: true, explicit: true });
		expect(parseVerdict("that was wrong")).toEqual({ agreed: false, explicit: true });
		expect(parseVerdict("I disagree.")).toEqual({ agreed: false, explicit: true });
		expect(parseVerdict("yes")).toEqual({ agreed: true, explicit: false });
		expect(parseVerdict("Nope")).toEqual({ agreed: false, explicit: false });
	});

	it("ignores everything else", () => {
		expect(parseVerdict("yes I would like some tea")).toBeNull();
		expect(parseVerdict("")).toBeNull();
	});
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run lib/agent/brain.test.ts`
Expected: FAIL (cannot resolve `./brain`).

- [ ] **Step 7: Implement the Brain**

Create `lib/agent/brain.ts`:

```ts
import type { Dilemma } from "./dilemmas";
import { BASELINE, VALUES, type AgentState, type Emotion, type Value, type Weights } from "./state";

export const TILT = 0.3;
export const OUTLOOK_TILT = 0.15;
export const TORN_MARGIN = 0.05;
export const NUDGE = 0.02;
export const MIN_WEIGHT = 0.02;

export type Decision = {
	chosen: number;
	runnerUp: number | null;
	scores: number[];
	torn: boolean;
	drivers: Value[];
	pull: Value | null;
};

export function effectiveWeights(
	w: Weights,
	a: AgentState["activations"],
	outlook: number,
): Weights {
	const excess = (e: Emotion) => Math.max(0, a[e] - BASELINE[e]);
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
): Decision {
	const eff = effectiveWeights(s.weights, s.activations, s.outlook);
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
		? `I'm torn, but I'd lean toward "${label}".`
		: `I would choose "${label}".`;
	if (dec.drivers.length > 0) {
		text += ` Mostly because I weigh ${dec.drivers.map((v) => NAMES[v]).join(" and ")}.`;
	}
	if (dec.pull) text += ` ${NAMES[dec.pull][0].toUpperCase()}${NAMES[dec.pull].slice(1)} pulled me the other way, though.`;
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
	const up =
		dec.runnerUp === null
			? []
			: VALUES.filter(
					(v) => d.options[dec.runnerUp!].scores[v] > d.options[dec.chosen].scores[v],
				);
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
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run lib/agent/brain.test.ts`
Expected: PASS. If the `drivers`/`pull` assertion in "picks the option best aligned" fails, print `decide(whiteLie, defaultState())` and compare against the hand computation (truth scores: honesty 0.2, fairness 0.06, loyalty 0.03, kindness 0.025, harm -0.015; kindness has the largest pull toward the lie at 0.125).

- [ ] **Step 9: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

---

### Task 5: State sanitizing and Supabase persistence

**Files:**
- Modify: `lib/agent/state.ts` (add `sanitizeState`)
- Test: `lib/agent/state.test.ts`
- Create: `lib/agent/agent-state.ts`
- Database: migration `create_heart_and_brain_tables` on project `jtkeljvldtngkrftzwdm` (the `agent-memory` project)

**Interfaces:**
- Consumes: `ensureSession`, `supabase` from `../supabase`; `AgentState` etc. from `./state`; `StoryEvent` type from `./events`; `Effect` type from `./mind` is NOT imported here (Task 6 defines it), so `persistTurn` takes a structural type declared in this file.
- Produces:
  - `sanitizeState(raw: unknown): AgentState` (in `state.ts`, pure)
  - `type PersistEffect = { type: "event"; event: StoryEvent } | { type: "dilemma"; logId: string; dilemmaId: string; option: string } | { type: "verdict"; logId: string; agreed: boolean }`
  - `loadState(): Promise<AgentState>` (never throws; returns defaults on any failure)
  - `persistTurn(state: AgentState, effects: PersistEffect[]): Promise<void>` (never throws; logs errors)

- [ ] **Step 1: Write the failing sanitize tests**

Create `lib/agent/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BASELINE, DEFAULT_WEIGHTS, VALUES, defaultState, sanitizeState } from "./state";

const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

describe("defaultState", () => {
	it("returns independent copies", () => {
		const a = defaultState();
		a.activations.joy = 0;
		a.coupling.sadness.boredom = 0;
		const b = defaultState();
		expect(b.activations.joy).toBe(BASELINE.joy);
		expect(b.coupling.sadness.boredom).toBe(0.3);
	});
});

describe("sanitizeState", () => {
	it("returns defaults for null, primitives and empty objects", () => {
		expect(sanitizeState(null)).toEqual(defaultState());
		expect(sanitizeState(42)).toEqual(defaultState());
		expect(sanitizeState({})).toEqual(defaultState());
	});

	it("repairs NaN, wrong types and out-of-range activations", () => {
		const s = sanitizeState({ activations: { joy: NaN, sadness: 5, anger: "x", fear: -3 } });
		expect(s.activations.joy).toBe(BASELINE.joy);
		expect(s.activations.sadness).toBe(1);
		expect(s.activations.anger).toBe(BASELINE.anger);
		expect(s.activations.fear).toBe(0);
	});

	it("re-normalizes weights and keeps them positive", () => {
		const s = sanitizeState({ weights: { honesty: 0, kindness: 0, fairness: 0, loyalty: 0, harm: 0 } });
		for (const v of VALUES) expect(s.weights[v]).toBeGreaterThan(0);
		expect(sum(s.weights)).toBeCloseTo(1, 6);
		expect(sanitizeState({ weights: { honesty: Infinity } }).weights.honesty).toBeLessThan(1);
	});

	it("keeps valid coupling and drops bogus entries", () => {
		const s = sanitizeState({
			coupling: { sadness: { boredom: 0.5, nonsense: 1, joy: Infinity, fear: 9 }, notAnEmotion: { joy: 1 } },
		});
		expect(s.coupling.sadness.boredom).toBe(0.5);
		expect(s.coupling.sadness).not.toHaveProperty("nonsense");
		expect(s.coupling.sadness.joy).toBe(-0.4); // default kept when the stored value is invalid
		expect(s.coupling.sadness.fear).toBe(0.8); // clamped
	});

	it("clamps outlook", () => {
		expect(sanitizeState({ outlook: 7 }).outlook).toBe(1);
		expect(sanitizeState({ outlook: "bad" }).outlook).toBe(0);
	});

	it("drops junk associations and history but keeps valid ones", () => {
		const s = sanitizeState({
			associations: {
				loss: { count: 3, tendencies: { sadness: 0.3, bogus: 1, joy: NaN } },
				broken: { count: "x", tendencies: {} },
				alsoBroken: null,
			},
			history: [{ id: "t1", valence: "tragic" }, { id: 5, valence: "happy" }, { id: "x", valence: "meh" }, null],
		});
		expect(s.associations.loss).toEqual({ count: 3, tendencies: { sadness: 0.3 } });
		expect(s.associations).not.toHaveProperty("broken");
		expect(s.associations).not.toHaveProperty("alsoBroken");
		expect(s.history).toEqual([{ id: "t1", valence: "tragic" }]);
	});

	it("leaves defaults for weights when weights are absent", () => {
		expect(sanitizeState({}).weights).toEqual(DEFAULT_WEIGHTS);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/agent/state.test.ts`
Expected: FAIL (`sanitizeState` is not exported).

- [ ] **Step 3: Implement `sanitizeState`**

Append to `lib/agent/state.ts`:

```ts
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

	return state;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/agent/state.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply the database migration**

Apply with the Supabase MCP tool `apply_migration` (project_id `jtkeljvldtngkrftzwdm`, name `create_heart_and_brain_tables`):

```sql
create table public.agent_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  activations jsonb not null,
  coupling jsonb not null,
  weights jsonb not null,
  outlook double precision not null default 0,
  updated_at timestamptz not null default now()
);

create table public.event_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id text not null,
  kind text not null,
  valence text not null check (valence in ('happy','tragic')),
  shifts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index event_log_user_created_idx on public.event_log (user_id, created_at);

create table public.emotion_associations (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null,
  tendencies jsonb not null,
  count integer not null,
  primary key (user_id, kind)
);

create table public.dilemma_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dilemma_id text not null,
  option_chosen text not null,
  agreed boolean,
  created_at timestamptz not null default now()
);
create index dilemma_log_user_idx on public.dilemma_log (user_id);

alter table public.agent_state enable row level security;
alter table public.event_log enable row level security;
alter table public.emotion_associations enable row level security;
alter table public.dilemma_log enable row level security;

create policy "own agent_state" on public.agent_state for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own event_log" on public.event_log for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own emotion_associations" on public.emotion_associations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own dilemma_log" on public.dilemma_log for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```

Then run the Supabase `get_advisors` tool (type `security`) for the project and confirm no new warnings about these four tables.

- [ ] **Step 6: Implement persistence**

Create `lib/agent/agent-state.ts`:

```ts
import { ensureSession, supabase } from "../supabase";
import type { StoryEvent } from "./events";
import { defaultState, sanitizeState, type AgentState } from "./state";

export type PersistEffect =
	| { type: "event"; event: StoryEvent }
	| { type: "dilemma"; logId: string; dilemmaId: string; option: string }
	| { type: "verdict"; logId: string; agreed: boolean };

export async function loadState(): Promise<AgentState> {
	try {
		const session = await ensureSession();
		if (!session) return defaultState();
		const [row, assoc, history] = await Promise.all([
			supabase.from("agent_state").select("activations,coupling,weights,outlook").maybeSingle(),
			supabase.from("emotion_associations").select("kind,tendencies,count"),
			supabase
				.from("event_log")
				.select("event_id,valence")
				.order("created_at", { ascending: false })
				.order("id", { ascending: false })
				.limit(200),
		]);
		return sanitizeState({
			...(row.data ?? {}),
			associations: Object.fromEntries(
				(assoc.data ?? []).map((r) => [r.kind, { count: r.count, tendencies: r.tendencies }]),
			),
			history: (history.data ?? []).reverse().map((r) => ({ id: r.event_id, valence: r.valence })),
		});
	} catch (error) {
		console.error("Could not load agent state", error);
		return defaultState();
	}
}

export async function persistTurn(state: AgentState, effects: PersistEffect[]): Promise<void> {
	try {
		const session = await ensureSession();
		if (!session) return;
		const userId = session.user.id;
		const failures: unknown[] = [];
		const check = (result: { error: unknown }) => {
			if (result.error) failures.push(result.error);
		};

		check(
			await supabase.from("agent_state").upsert(
				{
					user_id: userId,
					activations: state.activations,
					coupling: state.coupling,
					weights: state.weights,
					outlook: state.outlook,
					updated_at: new Date().toISOString(),
				},
				{ onConflict: "user_id" },
			),
		);

		for (const effect of effects) {
			if (effect.type === "event") {
				const { event } = effect;
				check(
					await supabase.from("event_log").insert({
						user_id: userId,
						event_id: event.id,
						kind: event.kind,
						valence: event.valence,
						shifts: event.shifts,
					}),
				);
				const assoc = state.associations[event.kind];
				if (assoc) {
					check(
						await supabase.from("emotion_associations").upsert(
							{ user_id: userId, kind: event.kind, tendencies: assoc.tendencies, count: assoc.count },
							{ onConflict: "user_id,kind" },
						),
					);
				}
			} else if (effect.type === "dilemma") {
				check(
					await supabase.from("dilemma_log").insert({
						id: effect.logId,
						user_id: userId,
						dilemma_id: effect.dilemmaId,
						option_chosen: effect.option,
					}),
				);
			} else {
				check(await supabase.from("dilemma_log").update({ agreed: effect.agreed }).eq("id", effect.logId));
			}
		}
		if (failures.length > 0) console.error("Some agent state could not be saved", failures);
	} catch (error) {
		console.error("Could not save agent state", error);
	}
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (This file is exercised by the manual check in Task 7; it is not unit-tested because it needs a live Supabase session.)

- [ ] **Step 8: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint lib`
Expected: all pass.

---

### Task 6: The orchestrator, `processTurn`

**Files:**
- Create: `lib/agent/mind.ts`
- Test: `lib/agent/mind.test.ts`

**Interfaces:**
- Consumes: everything produced in Tasks 1-4; `type PersistEffect` is structurally identical to `Effect` below (define `Effect` here with the same shape).
- Produces:
  - `type Pending = { logId: string; dilemmaId: string; decision: Decision }`
  - `type Session = { pending: Pending | null; last: Pending | null; dilemmasSeen: string[] }`
  - `type Effect` (same union as `PersistEffect`), `type TurnContext = { now: number; lastAt: number | null; uuid: () => string }`
  - `type TurnResult = { state: AgentState; session: Session; reply: string | null; effects: Effect[] }`
  - `newSession(): Session`
  - `processTurn(state: AgentState, session: Session, text: string, ctx: TurnContext): TurnResult`
  - A `reply` of `null` means "nothing special happened, use the normal chat".

- [ ] **Step 1: Write the failing tests**

Create `lib/agent/mind.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, defaultState } from "./state";
import { newSession, processTurn } from "./mind";

const ctx = (o: Partial<{ now: number; lastAt: number | null }> = {}) => ({
	now: 1_000_000,
	lastAt: null,
	uuid: () => "id-1",
	...o,
});

describe("processTurn: heart", () => {
	it("falls through (null reply, no effects) for ordinary chat", () => {
		const r = processTurn(defaultState(), newSession(), "hello", ctx());
		expect(r.reply).toBeNull();
		expect(r.effects).toEqual([]);
	});

	it("thanks raise joy", () => {
		const r = processTurn(defaultState(), newSession(), "thank you!", ctx());
		expect(r.state.activations.joy).toBeGreaterThan(0.6);
	});

	it("a long silence raises loneliness", () => {
		const r = processTurn(defaultState(), newSession(), "hello", ctx({ lastAt: 0, now: 8 * 3600_000 }));
		expect(r.state.activations.loneliness).toBeGreaterThan(defaultState().activations.loneliness);
	});
});

describe("processTurn: told events and arguments", () => {
	it("responds to a tragic event with sympathy and logs it", () => {
		const r = processTurn(defaultState(), newSession(), "my dog died today", ctx());
		expect(r.reply).toMatch(/sorry/i);
		expect(r.effects).toHaveLength(1);
		expect(r.effects[0]).toMatchObject({ type: "event", event: { valence: "tragic" } });
		expect(r.state.history).toHaveLength(1);
	});

	it("takes both sides of a mixed message", () => {
		const r = processTurn(defaultState(), newSession(), "my dog died but I got the job", ctx());
		expect(r.effects.map((e) => e.type === "event" && e.event.valence).sort()).toEqual(["happy", "tragic"]);
	});

	it("nudges outlook a little when argued with, without overriding it", () => {
		const r = processTurn(defaultState(), newSession(), "look on the bright side", ctx());
		expect(r.state.outlook).toBeGreaterThan(0);
		expect(r.state.outlook).toBeLessThan(0.05);
		expect(r.reply).not.toBeNull();
	});
});

describe("processTurn: stories", () => {
	it("feeds a happy then a tragic event and then states which way it leans", () => {
		let r = processTurn(defaultState(), newSession(), "tell me a story", ctx());
		expect(r.effects[0]).toMatchObject({ type: "event", event: { valence: "happy" } });
		r = processTurn(r.state, r.session, "tell me a story", ctx());
		expect(r.effects[0]).toMatchObject({ type: "event", event: { valence: "tragic" } });
		expect(r.reply).toMatch(/lean|undecided/);
	});
});

describe("processTurn: dilemmas", () => {
	it("poses a dilemma, decides, and asks whether the user agrees", () => {
		const r = processTurn(defaultState(), newSession(), "give me a dilemma", ctx());
		expect(r.reply).toContain("Do you agree?");
		expect(r.session.pending?.dilemmaId).toBe("trolley");
		expect(r.effects).toEqual([
			{ type: "dilemma", logId: "id-1", dilemmaId: "trolley", option: "Pull the lever" },
		]);
	});

	it("matches 'what would you do if' to a scenario by keyword", () => {
		const r = processTurn(defaultState(), newSession(), "what would you do if I found a wallet", ctx());
		expect(r.reply).toContain("wallet");
	});

	it("admits when it has no matching scenario", () => {
		const r = processTurn(defaultState(), newSession(), "what would you do if aliens landed", ctx());
		expect(r.reply).toMatch(/don't have a scenario/);
		expect(r.effects).toEqual([]);
		expect(r.session.pending).toBeNull();
	});

	it("learns from 'no' after a dilemma", () => {
		const asked = processTurn(defaultState(), newSession(), "give me a dilemma", ctx());
		const answered = processTurn(asked.state, asked.session, "no", ctx());
		expect(answered.effects).toEqual([{ type: "verdict", logId: "id-1", agreed: false }]);
		expect(answered.state.weights).not.toEqual(asked.state.weights);
		expect(answered.session.pending).toBeNull();
	});

	it("ignores a bare yes/no when no dilemma is pending", () => {
		for (const word of ["yes", "no"]) {
			const r = processTurn(defaultState(), newSession(), word, ctx());
			expect(r.reply).toBeNull();
			expect(r.effects).toEqual([]);
			expect(r.state.weights).toEqual(DEFAULT_WEIGHTS);
		}
	});

	it("accepts an explicit 'good answer' later, but not a bare 'no'", () => {
		const asked = processTurn(defaultState(), newSession(), "give me a dilemma", ctx());
		const moved = processTurn(asked.state, asked.session, "hello", ctx());
		expect(moved.session.pending).toBeNull();
		expect(moved.session.last).not.toBeNull();

		const bare = processTurn(moved.state, moved.session, "no", ctx());
		expect(bare.reply).toBeNull();

		const explicit = processTurn(moved.state, moved.session, "good answer", ctx());
		expect(explicit.effects).toEqual([{ type: "verdict", logId: "id-1", agreed: true }]);
		expect(explicit.session.last).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/agent/mind.test.ts`
Expected: FAIL (cannot resolve `./mind`).

- [ ] **Step 3: Implement**

Create `lib/agent/mind.ts`:

```ts
import { applyFeedback, decide, explain, parseVerdict, type Decision } from "./brain";
import { applyCues, applyGap } from "./cues";
import { DILEMMAS, findDilemma, nextDilemma } from "./dilemmas";
import {
	applyEvent,
	argueOutlook,
	classifyUserEvents,
	describeEvent,
	detectArgument,
	kindFor,
	leaning,
	pickEvent,
	type StoryEvent,
} from "./events";
import { moodLabel, stepHeart } from "./heart";
import type { AgentState } from "./state";

export type Pending = { logId: string; dilemmaId: string; decision: Decision };
export type Session = { pending: Pending | null; last: Pending | null; dilemmasSeen: string[] };

export type Effect =
	| { type: "event"; event: StoryEvent }
	| { type: "dilemma"; logId: string; dilemmaId: string; option: string }
	| { type: "verdict"; logId: string; agreed: boolean };

export type TurnContext = { now: number; lastAt: number | null; uuid: () => string };
export type TurnResult = {
	state: AgentState;
	session: Session;
	reply: string | null;
	effects: Effect[];
};

export const newSession = (): Session => ({ pending: null, last: null, dilemmasSeen: [] });

const STORY_TRIGGER = /\b(tell me a story|give me an experience|feed me an event|experience something)\b/i;
const DILEMMA_TRIGGER =
	/\b(give me|another|one more|hit me with)\b.*\bdilemma\b|^\s*dilemma\W*$/i;
const WHAT_WOULD_YOU_DO = /^\s*what would you do if\b/i;

function acknowledge(event: StoryEvent): string {
	return event.valence === "happy"
		? "That's wonderful. I'm really glad for you."
		: "I'm so sorry. That sounds heavy, and I'll remember it.";
}

export function processTurn(
	state: AgentState,
	session: Session,
	text: string,
	ctx: TurnContext,
): TurnResult {
	const trimmed = text.trim();
	const effects: Effect[] = [];

	// Heart: gap and cues first, then one coupling/decay step.
	let activations = state.activations;
	if (ctx.lastAt !== null) activations = applyGap(activations, ctx.now - ctx.lastAt);
	activations = applyCues(activations, trimmed);
	let s: AgentState = { ...state, activations: stepHeart(activations, state.coupling) };
	// Any message that is not a verdict clears the pending question.
	const sess: Session = { ...session, pending: null };

	// 1. Verdict on a decision. Bare yes/no only counts while a question is pending.
	const verdict = parseVerdict(trimmed);
	const target = session.pending ?? (verdict?.explicit ? session.last : null);
	const targetDilemma = target ? DILEMMAS.find((d) => d.id === target.dilemmaId) : undefined;
	if (verdict && target && targetDilemma) {
		s = { ...s, weights: applyFeedback(s.weights, targetDilemma, target.decision, verdict.agreed) };
		effects.push({ type: "verdict", logId: target.logId, agreed: verdict.agreed });
		return {
			state: s,
			session: { ...sess, last: null },
			reply: verdict.agreed
				? "Thank you. I'll trust that reasoning a little more."
				: "Understood. I'll give the other side more weight next time.",
			effects,
		};
	}

	// 2. Life events the user tells it about.
	const told = classifyUserEvents(trimmed);
	if (told.length > 0) {
		for (const event of told) {
			s = applyEvent(s, event);
			effects.push({ type: "event", event });
		}
		return { state: s, session: sess, reply: told.map(acknowledge).join(" "), effects };
	}

	// 3. Attempts to argue its outlook one way or the other.
	const direction = detectArgument(trimmed);
	if (direction !== 0) {
		s = argueOutlook(s, direction);
		return {
			state: s,
			session: sess,
			reply: "I hear you. I'll weigh that against what I've been through, but I decide for myself.",
			effects,
		};
	}

	// 4. Feed it an experience from the library, alternating happy and tragic.
	if (STORY_TRIGGER.test(trimmed)) {
		const event = pickEvent(s.history);
		s = applyEvent(s, event);
		effects.push({ type: "event", event });
		let reply = `${describeEvent(event)} I feel ${moodLabel(s.activations)}.`;
		const [prev, last] = s.history.slice(-2);
		if (prev && last && prev.valence !== last.valence) {
			const happy = prev.valence === "happy" ? prev : last;
			const tragic = prev.valence === "happy" ? last : prev;
			reply += ` ${leaning(s.outlook, kindFor(happy), kindFor(tragic))}`;
		}
		return { state: s, session: sess, reply, effects };
	}

	// 5. Moral dilemmas.
	const asked = WHAT_WOULD_YOU_DO.test(trimmed);
	if (asked || DILEMMA_TRIGGER.test(trimmed)) {
		const found = asked ? findDilemma(trimmed) : null;
		if (asked && !found) {
			return {
				state: s,
				session: sess,
				reply: 'I don\'t have a scenario like that yet. Say "give me a dilemma" and I\'ll take one of mine.',
				effects,
			};
		}
		const dilemma = found ?? nextDilemma(sess.dilemmasSeen);
		const decision = decide(dilemma, s);
		const logId = ctx.uuid();
		effects.push({
			type: "dilemma",
			logId,
			dilemmaId: dilemma.id,
			option: dilemma.options[decision.chosen].label,
		});
		const pending: Pending = { logId, dilemmaId: dilemma.id, decision };
		return {
			state: s,
			session: { pending, last: pending, dilemmasSeen: [...sess.dilemmasSeen, dilemma.id] },
			reply: `${dilemma.prompt} ${explain(dilemma, decision)} Do you agree?`,
			effects,
		};
	}

	return { state: s, session: sess, reply: null, effects };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/agent/mind.test.ts`
Expected: PASS. If the "poses a dilemma" test fails on `option`, the default weights should choose "Pull the lever" for the trolley problem (0.145 vs -0.105); print `decide(DILEMMAS[0], defaultState())` to check.

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint lib`
Expected: all pass.

---

### Task 7: Wire it into the chat and show the mood

**Files:**
- Modify: `app/assistant.tsx`

**Interfaces:**
- Consumes: `defaultState`, `AgentState` from `@/lib/agent/state`; `loadState`, `persistTurn` from `@/lib/agent/agent-state`; `moodLabel`, `withMood` from `@/lib/agent/heart`; `newSession`, `processTurn`, `Session` from `@/lib/agent/mind`.
- Produces: the finished feature (no later task depends on it).

- [ ] **Step 1: Add the imports**

In `app/assistant.tsx`, after the existing line `import { ensureSession, supabase } from "@/lib/supabase";` add:

```ts
import { loadState, persistTurn } from "@/lib/agent/agent-state";
import { moodLabel, withMood } from "@/lib/agent/heart";
import { newSession, processTurn, type Session } from "@/lib/agent/mind";
import { defaultState, type AgentState } from "@/lib/agent/state";
```

- [ ] **Step 2: Add state**

Inside `AgentChat()`, directly after the line `const memoryLoadedRef = useRef(false);` add:

```ts
	const [agent, setAgent] = useState<AgentState>(defaultState);
	const [session, setSession] = useState<Session>(newSession);
	const [ready, setReady] = useState(false);
	const lastAtRef = useRef<number | null>(null);
```

- [ ] **Step 3: Load the saved state and gate input until it is ready**

In the existing mount `useEffect`, immediately after `await ensureSession();` add `setAgent(await loadState());`, and in its `finally` block, after `memoryLoadedRef.current = true;`, add `setReady(true);`. The block should read:

```ts
			try {
				await ensureSession();
				setAgent(await loadState());
				const [facts, history] = await Promise.all([
					// ...unchanged...
				]);
				// ...unchanged...
			} catch (error) {
				console.error("Could not load saved memory", error);
			} finally {
				memoryLoadedRef.current = true;
				setReady(true);
			}
```

- [ ] **Step 4: Run the mind in `sendMessage`**

In `sendMessage`, directly after `if (!text) return;` add:

```ts
		const now = Date.now();
		const turn = pendingLearning
			? null
			: processTurn(agent, session, text, {
					now,
					lastAt: lastAtRef.current,
					uuid: () => crypto.randomUUID(),
				});
		lastAtRef.current = now;
```

Then add a new branch right after the `if (pendingLearning) { ... }` branch (before `} else if (learnedFact) {`):

```ts
		} else if (turn?.reply != null) {
			response = turn.reply;
```

- [ ] **Step 5: Color fall-through replies with the mood and save**

Directly after the whole `if / else if / else` chain that assigns `response` (just before `const newMessages: ChatMessage[] = [`), add:

```ts
		if (turn) {
			if (turn.reply === null) response = withMood(turn.state.activations, response);
			setAgent(turn.state);
			setSession(turn.session);
			void persistTurn(turn.state, turn.effects);
		}
```

- [ ] **Step 6: Show the mood and disable input until loaded**

Replace `<MarkerContent>Agent is ready</MarkerContent>` with:

```tsx
					<MarkerContent>Feeling {moodLabel(agent.activations)}</MarkerContent>
```

On the `<Input ... />` add the prop `disabled={!ready}`, and on the `<Button type="submit" size="lg">` add `disabled={!ready}`.

- [ ] **Step 7: Type-check, lint, test, build**

Run: `npx tsc --noEmit && npx eslint app lib && npx vitest run && npm run build`
Expected: all pass, build succeeds. (If `npm run build` fails for a reason unrelated to these files, record the error and report it.)

- [ ] **Step 8: Manual check in the browser**

Prerequisite: Anonymous sign-ins must be enabled in the Supabase dashboard for `agent-memory` (Authentication, Sign In / Providers). Without it the chat still works with default state, but nothing is saved and the console shows save errors.

Start the app with the Claude Browser preview (`preview_start` with a `.claude/launch.json` entry that runs `npm run dev`, port 3000), open `/assistant`, and check each of these in order, reading the mood badge under the chat:
1. Type `thank you` then `you are stupid`. The badge should move (for example toward "anger" or a blend) and replies should start with a mood opener.
2. Type `my dog died today`. Expect a sympathetic reply and a sadder badge.
3. Type `tell me a story` twice. The first is a happy event, the second a tragic one, and the second reply ends with a "lean toward" or "undecided" statement.
4. Type `give me a dilemma`, then `no`. Expect the reasoning reply, then "Understood. I'll give the other side more weight next time."
5. Type `yes` on its own. Expect the normal fallback reply, not a verdict.
6. Reload the page. The mood, chat history and (via Supabase `execute_sql`: `select outlook, weights from agent_state;`) the saved weights should reflect the session.

- [ ] **Step 9: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

## Self-Review Notes

- **Spec coverage:** emotional space + anchors (Task 1), coupling and learned coupling (Tasks 1, 3), cues and gaps (Task 2), blends and mood openers (Task 1), event library, balanced feeding, learned associations, own outlook and arguments (Task 3), values, dilemmas, choosing with mood and outlook tilt, torn detection, explanation, feedback learning (Task 4), storage tables and RLS (Task 5), code structure and thin `assistant.tsx` (Tasks 5-7), Vitest tests for every listed area, and the mood badge (Task 7).
- **Type consistency:** `Effect` (Task 6) and `PersistEffect` (Task 5) are structurally identical, so `persistTurn(turn.state, turn.effects)` type-checks. `Decision`, `Session`, `Pending`, `StoryEvent`, `AgentState` names match across tasks.
- **Known limits (from the spec):** keyword cues will misread sarcasm; constants are initial values to tune after use. The existing `learnFact` regex in `assistant.tsx` treats phrases like "I'm sad" or "it is boring" as the user's name; this is pre-existing and out of scope, but the new mind runs first for events, cues and dilemmas.
