# Frankenstein Personality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Osmo a personality assembled from 100 donor personalities (six organs each, one donor per organ chosen by a saved seed), with a readout ("what are you made of") and a confirmed re-roll.

**Architecture:** Pure modules under `lib/agent/personality/`: donor data and validation, a seeded RNG, assembly (`assemble`, `resolve`, `adoptGenome`), and `flavor` (voice, humor, slang, quirks applied to conversation-layer replies only). Existing heart, cue, event, brain, theme and talk functions gain optional `baseline`/`scale` parameters that default to today's behavior. `mind.ts` runs `flavor` and handles the two commands; the genome is saved in `agent_state`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Supabase (already wired).

**Spec:** `docs/superpowers/specs/2026-09-24-frankenstein-personality-design.md`

## Global Constraints

- Offline and rule-based: no AI model, no API, no network calls for language.
- Exactly **100 donors**, in **10 families of 10** (the roster in the spec, names verbatim). Six organs each: heart, brain, voice, humor, slang, quirks.
- Assembly is deterministic: the same 32-bit seed always gives the same genome. Organs are drawn in the fixed order heart, brain, voice, humor, slang, quirks, uniformly from the roster.
- A `null` genome means the **neutral Osmo**: behavior identical to today (default baseline, reactivity 1, default weights, no flavor). `defaultState()` keeps `genome: null`, so all existing tests stay valid.
- Flavor applies **only to conversation-layer replies** from `talk.ts` (greetings, feelings, small talk). Never to dilemma, story, verdict, argument, event-acknowledgement or fact text.
- Humor, slang tags and elaboration only on light intents (greeting, howAreYou while calm, thanks, laughter, ack, compliment). Nothing but a warm opener and a quirk may appear on other replies, and **no humor, quirk or slang** when the mood is sadness, fear, anger, guilt or loneliness, or the reply is sensitive (insult, negative feeling, question about its feelings). At most 2 additions per reply.
- Heart: baseline delta per emotion within ±0.4, resulting baseline clamped 0.05 to 0.85; `reactivity` 0.6 to 1.5.
- Voice thresholds: formality above 0.75 expands contractions and uses formal words; below 0.25 uses casual words. Verbosity above 0.7 adds the elaboration on light replies; below 0.3 drops a trailing question when there is more than one sentence. Warmth is the probability of a warm opener (never before greetings or goodbyes). Humor probability is `level * 0.5`.
- Existing users keep their saved moral weights; only a brand-new or re-rolled Osmo takes the brain donor's weights. Re-roll requires the exact confirmation `yes, roll` and resets weights.
- Slang lexicon keys are single lowercase alphanumeric tokens, never ordinary English words (checked against `COMMON_WORDS`); built-in slang wins over donor slang; user-taught words win over both; where two donors define a key, the earlier donor in roster order wins.
- Working directory for all commands: `C:\Users\Gurra\GroupProject\my-app`. **This project is not a git repository**: each task ends with a Checkpoint (`npx vitest run && npx tsc --noEmit && npx eslint app lib`) instead of a commit.
- Use the file-writing/edit tools for files that contain regular expressions or backslashes. Shell heredocs and `node -e` scripts mangle backslashes in this environment.

## Review Focus

- **A donor slang word that is really an ordinary word** would silently rewrite normal sentences (for example a lexicon entry for "fine" or "cool"): the roster test must reject any key in `COMMON_WORDS` (Tasks 1, 10).
- **Flavor on the wrong replies:** humor, quirks or slang tags on a sad, insulting or dilemma reply would be tone-deaf: tests must show they never appear when the mood or intent is sensitive, and that dilemma text is untouched (Tasks 4, 11).
- **Bad or unknown stored genome:** a saved genome with an unknown donor id, a garbage seed, or nothing at all must never crash loading; unknown ids get a deterministic fallback and missing means neutral then assemble (Tasks 3, 12).
- **Saved learned weights must survive:** an existing user's moral weights are not overwritten when Osmo is first assembled; only re-roll resets them (Tasks 3, 11).
- **Re-roll safety:** "yes" alone must not roll, any other message cancels, and "yes, roll" only works right after the prompt (Task 11).

---

### Task 1: Donor types, validation, seeded RNG

**Files:**
- Create: `lib/agent/personality/types.ts`
- Create: `lib/agent/personality/validate.ts`
- Create: `lib/agent/personality/rng.ts`
- Test: `lib/agent/personality/rng.test.ts`
- Test: `lib/agent/personality/validate.test.ts`

**Interfaces:**
- Consumes: `Emotion`, `Weights` from `../state`.
- Produces:
  - `types.ts`: `HumorStyle`, `Donor` (fields below), `DONOR_FAMILIES`
  - `validate.ts`: `COMMON_WORDS: Set<string>`, `validateDonor(d: Donor): string[]`, `validateRoster(donors: Donor[]): string[]` (empty array means valid)
  - `rng.ts`: `mulberry32(seed: number): () => number`, `hashString(s: string): number`, `roll(seed: number, turn: number, salt: string): number` (stable value in [0,1))

- [ ] **Step 1: Write the failing RNG tests**

Create `lib/agent/personality/rng.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashString, mulberry32, roll } from "./rng";

describe("mulberry32", () => {
	it("is deterministic for a seed and stays in [0,1)", () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		for (let i = 0; i < 50; i++) {
			const v = a();
			expect(v).toBe(b());
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it("gives different streams for different seeds", () => {
		expect(mulberry32(1)()).not.toBe(mulberry32(2)());
	});
});

describe("hashString and roll", () => {
	it("hashes the same string the same way, and different strings differently", () => {
		expect(hashString("heart")).toBe(hashString("heart"));
		expect(hashString("heart")).not.toBe(hashString("brain"));
	});

	it("roll is stable for the same inputs and in range", () => {
		expect(roll(7, 3, "humor")).toBe(roll(7, 3, "humor"));
		for (let t = 0; t < 100; t++) {
			const v = roll(7, t, "humor");
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it("is roughly uniform over turns and differs between salts", () => {
		let sum = 0;
		let different = 0;
		for (let t = 0; t < 2000; t++) {
			sum += roll(99, t, "quirk");
			if (roll(99, t, "quirk") !== roll(99, t, "slang")) different++;
		}
		expect(sum / 2000).toBeGreaterThan(0.45);
		expect(sum / 2000).toBeLessThan(0.55);
		expect(different).toBeGreaterThan(1900);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/agent/personality/rng.test.ts`
Expected: FAIL (cannot resolve `./rng`).

- [ ] **Step 3: Implement the RNG**

Create `lib/agent/personality/rng.ts`:

```ts
// Small deterministic random numbers, so a given Osmo always behaves the same way.

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function hashString(s: string): number {
	let h = 2166136261;
	for (const c of s) {
		h ^= c.charCodeAt(0);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

// A stable number in [0,1) for (seed, turn, salt): the same inputs always give the same roll.
export function roll(seed: number, turn: number, salt: string): number {
	return mulberry32((seed ^ Math.imul(turn + 1, 2654435761) ^ hashString(salt)) >>> 0)();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/agent/personality/rng.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the donor types**

Create `lib/agent/personality/types.ts`:

```ts
import type { Emotion, Weights } from "../state";

export type HumorStyle = "dry" | "pun" | "teasing" | "absurd" | "none";

export const DONOR_FAMILIES = [
	"gentle",
	"grumpy",
	"bold",
	"curious",
	"playful",
	"cool",
	"formal",
	"tender",
	"fierce",
	"strange",
] as const;
export type DonorFamily = (typeof DONOR_FAMILIES)[number];

export type Donor = {
	id: string; // kebab-case, e.g. "the-gentle-poet"
	name: string; // "The Gentle Poet"
	family: DonorFamily;
	tagline: string;
	heart: {
		baseline: Partial<Record<Emotion, number>>; // deltas to the default baseline
		reactivity: number; // 0.6..1.5
	};
	brain: Weights; // honesty, kindness, fairness, loyalty, harm (normalized when used)
	voice: {
		formality: number; // 0..1
		verbosity: number; // 0..1
		warmth: number; // 0..1
		openers: string[]; // 2-4 short warm openers, e.g. "Oh, dear friend."
		elaboration: string; // one extra sentence for chatty moods
	};
	humor: {
		style: HumorStyle;
		level: number; // 0..1 (0 when style is "none")
		lines: string[]; // 3-6 short lines in that style ([] when "none")
	};
	slang: {
		lexicon: Record<string, string>; // 4-8 words this donor's world uses -> plain meaning
		says: string[]; // 2-4 short tags this donor actually says, e.g. "No cap."
	};
	quirks: {
		phrases: string[]; // 2-4 catchphrases
		rate: number; // 0..0.3
	};
};
```

- [ ] **Step 6: Write the failing validation tests**

Create `lib/agent/personality/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Donor } from "./types";
import { COMMON_WORDS, validateDonor, validateRoster } from "./validate";

export const goodDonor = (over: Partial<Donor> = {}): Donor => ({
	id: "the-test-donor",
	name: "The Test Donor",
	family: "gentle",
	tagline: "A donor for the tests.",
	heart: { baseline: { love: 0.1, hope: 0.05 }, reactivity: 1.1 },
	brain: { honesty: 0.2, kindness: 0.4, fairness: 0.15, loyalty: 0.15, harm: 0.1 },
	voice: {
		formality: 0.4,
		verbosity: 0.6,
		warmth: 0.8,
		openers: ["Oh, friend.", "Well now."],
		elaboration: "I do like a good chat.",
	},
	humor: { style: "pun", level: 0.5, lines: ["That was tea-rrific.", "I'm on a roll.", "Bun intended."] },
	slang: {
		lexicon: { bussin: "really good", yeet: "throw", sus: "suspicious", rizz: "charm" },
		says: ["No cap.", "Fr fr."],
	},
	quirks: { phrases: ["Bless your heart.", "Well, I never."], rate: 0.15 },
	...over,
});

describe("validateDonor", () => {
	it("accepts a well-formed donor", () => {
		expect(validateDonor(goodDonor())).toEqual([]);
	});

	it("rejects bad ids and names", () => {
		expect(validateDonor(goodDonor({ id: "Bad Id" }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ name: "Test Donor" }))).not.toEqual([]);
	});

	it("rejects out-of-range numbers", () => {
		expect(validateDonor(goodDonor({ heart: { baseline: { joy: 0.9 }, reactivity: 1 } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ heart: { baseline: {}, reactivity: 2 } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ voice: { ...goodDonor().voice, warmth: 1.5 } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ quirks: { phrases: ["Hi there.", "Hello."], rate: 0.9 } }))).not.toEqual([]);
	});

	it("rejects humor that does not match its style", () => {
		expect(validateDonor(goodDonor({ humor: { style: "none", level: 0.5, lines: [] } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ humor: { style: "dry", level: 0.5, lines: ["Only one."] } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ humor: { style: "none", level: 0, lines: [] } }))).toEqual([]);
	});

	it("rejects slang words that are ordinary English or not single tokens", () => {
		expect(COMMON_WORDS.has("fine")).toBe(true);
		const withWord = (word: string) =>
			goodDonor({ slang: { lexicon: { [word]: "ok", bussin: "good", yeet: "throw", sus: "odd" }, says: ["No cap.", "Fr fr."] } });
		expect(validateDonor(withWord("fine"))).not.toEqual([]);
		expect(validateDonor(withWord("two words"))).not.toEqual([]);
		expect(validateDonor(withWord("Upper"))).not.toEqual([]);
	});

	it("rejects lines that do not read as sentences or are too long", () => {
		expect(validateDonor(goodDonor({ quirks: { phrases: ["no punctuation", "Fine."], rate: 0.1 } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ voice: { ...goodDonor().voice, elaboration: "x".repeat(130) + "." } }))).not.toEqual([]);
	});
});

describe("validateRoster", () => {
	it("accepts distinct donors", () => {
		expect(validateRoster([goodDonor(), goodDonor({ id: "the-other", name: "The Other" })])).toEqual([]);
	});

	it("rejects duplicate ids, duplicate names and conflicting slang meanings", () => {
		expect(validateRoster([goodDonor(), goodDonor()])).not.toEqual([]);
		const conflict = goodDonor({
			id: "the-other",
			name: "The Other",
			slang: { lexicon: { bussin: "very bad", yeet: "throw", sus: "odd", rizz: "charm" }, says: ["No cap.", "Fr fr."] },
		});
		expect(validateRoster([goodDonor(), conflict]).join(" ")).toMatch(/bussin/);
	});
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run lib/agent/personality/validate.test.ts`
Expected: FAIL (cannot resolve `./validate`).

- [ ] **Step 8: Implement validation**

Create `lib/agent/personality/validate.ts`:

```ts
import { BASELINE, EMOTIONS, VALUES } from "../state";
import type { Donor, HumorStyle } from "./types";

// Ordinary English that must never be treated as donor slang.
export const COMMON_WORDS = new Set(
	(
		"a about above after again all also am an and any are as at be because been before being but by can cannot could did do " +
		"does done down each even ever every few for from get go going good got great had has have he her here him his how i if " +
		"in into is it its just know like little look make many may me more most much must my new no not now of off oh ok okay " +
		"on one only or other our out over own really right said same say see she should so some still such take than that the " +
		"their them then there these they thing think this those through time to too two under up us use very want was way we " +
		"well were what when where which while who why will with would yes yet you your fine cool nice sure bad big best better " +
		"happy sad hello bye thanks please sorry love hate friend people man woman kid day night today tomorrow yesterday home " +
		"food water hot cold fast slow high low old young long short small large hard easy fun funny weird strange sweet sour"
	).split(" "),
);

const HUMOR_STYLES: HumorStyle[] = ["dry", "pun", "teasing", "absurd", "none"];
const between = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
const sentence = (s: unknown, max = 120) =>
	typeof s === "string" && s.length >= 3 && s.length <= max && /^[A-Z"']/.test(s) && /[.!?]$/.test(s);

export function validateDonor(d: Donor): string[] {
	const problems: string[] = [];
	const bad = (message: string) => problems.push(`${d.id}: ${message}`);

	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id)) bad("id must be kebab-case");
	if (!/^The [A-Z]/.test(d.name)) bad('name must start with "The "');
	if (!d.tagline?.trim()) bad("missing tagline");

	if (!between(d.heart.reactivity, 0.6, 1.5)) bad("reactivity must be 0.6..1.5");
	for (const [emotion, delta] of Object.entries(d.heart.baseline)) {
		const key = emotion as (typeof EMOTIONS)[number];
		if (!EMOTIONS.includes(key)) bad(`unknown emotion ${emotion}`);
		else if (!between(delta, -0.4, 0.4)) bad(`baseline delta for ${emotion} must be within +-0.4`);
		else if (!between(BASELINE[key] + (delta as number), 0.05, 0.85)) bad(`baseline for ${emotion} leaves 0.05..0.85`);
	}

	const weights = VALUES.map((v) => d.brain[v]);
	if (!weights.every((w) => between(w, 0, 1)) || weights.reduce((a, b) => a + b, 0) <= 0) bad("brain weights invalid");

	for (const key of ["formality", "verbosity", "warmth"] as const) {
		if (!between(d.voice[key], 0, 1)) bad(`voice.${key} must be 0..1`);
	}
	if (d.voice.openers.length < 2 || d.voice.openers.length > 4 || !d.voice.openers.every((o) => sentence(o, 30))) {
		bad("voice.openers needs 2-4 short capitalized openers ending in punctuation");
	}
	if (!sentence(d.voice.elaboration)) bad("voice.elaboration must be one sentence");

	if (!HUMOR_STYLES.includes(d.humor.style)) bad("unknown humor style");
	else if (d.humor.style === "none") {
		if (d.humor.level !== 0 || d.humor.lines.length !== 0) bad('humor "none" needs level 0 and no lines');
	} else if (!between(d.humor.level, 0.05, 1) || d.humor.lines.length < 3 || d.humor.lines.length > 6 || !d.humor.lines.every((l) => sentence(l))) {
		bad("humor needs level 0.05..1 and 3-6 sentences");
	}

	const words = Object.entries(d.slang.lexicon);
	if (words.length < 4 || words.length > 8) bad("slang.lexicon needs 4-8 words");
	for (const [word, meaning] of words) {
		if (!/^[a-z0-9]+$/.test(word)) bad(`slang word "${word}" must be one lowercase token`);
		else if (COMMON_WORDS.has(word)) bad(`slang word "${word}" is an ordinary English word`);
		if (typeof meaning !== "string" || !/^[a-z ]{1,40}$/.test(meaning) || meaning.split(" ").length > 4) {
			bad(`slang meaning for "${word}" must be 1-4 lowercase plain words`);
		}
	}
	if (d.slang.says.length < 2 || d.slang.says.length > 4 || !d.slang.says.every((s) => sentence(s, 24))) {
		bad("slang.says needs 2-4 short sentences (24 characters max)");
	}

	if (d.quirks.phrases.length < 2 || d.quirks.phrases.length > 4 || !d.quirks.phrases.every((p) => sentence(p))) {
		bad("quirks.phrases needs 2-4 sentences");
	}
	if (!between(d.quirks.rate, 0.05, 0.3)) bad("quirks.rate must be 0.05..0.3");

	return problems;
}

export function validateRoster(donors: Donor[]): string[] {
	const problems: string[] = [];
	const ids = new Set<string>();
	const names = new Set<string>();
	const meanings = new Map<string, string>();
	for (const d of donors) {
		if (ids.has(d.id)) problems.push(`duplicate id ${d.id}`);
		if (names.has(d.name)) problems.push(`duplicate name ${d.name}`);
		ids.add(d.id);
		names.add(d.name);
		for (const [word, meaning] of Object.entries(d.slang.lexicon)) {
			const seen = meanings.get(word);
			if (seen !== undefined && seen !== meaning) problems.push(`slang word "${word}" has conflicting meanings`);
			else meanings.set(word, meaning);
		}
	}
	return problems;
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `npx vitest run lib/agent/personality`
Expected: PASS (rng and validate suites).

- [ ] **Step 10: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 2: Optional baseline and scale parameters on the existing engine

**Files:**
- Modify: `lib/agent/heart.ts`, `lib/agent/cues.ts`, `lib/agent/events.ts`, `lib/agent/brain.ts`, `lib/agent/mood-theme.ts`, `lib/agent/talk.ts`
- Test: `lib/agent/personality/params.test.ts`

**Interfaces:**
- Consumes: `BASELINE` and types from `./state`.
- Produces (all new parameters are optional and default to today's behavior):
  - `stepHeart(a, coupling, baseline = BASELINE)`
  - `dominantEmotions(a, max = 3, baseline = BASELINE)`, `moodLabel(a, baseline = BASELINE)`
  - `applyShifts(a, shifts, scale = 1)`
  - `applyCues(a, text, scale = 1)`
  - `applyEvent(state, event, reactivity = 1)`
  - `effectiveWeights(w, a, outlook, baseline = BASELINE)`, `decide(d, s, baseline = BASELINE)`
  - `moodTheme(a, baseline = BASELINE)`
  - `feelingPhrase(a, baseline = BASELINE)`; `TalkContext` gains optional `baseline?: Activations`

- [ ] **Step 1: Write the failing tests**

Create `lib/agent/personality/params.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BASELINE, EMOTIONS, defaultState, type Activations } from "../state";
import { applyCues } from "../cues";
import { applyEvent, type StoryEvent } from "../events";
import { applyShifts, dominantEmotions, moodLabel, stepHeart } from "../heart";
import { moodTheme } from "../mood-theme";
import { feelingPhrase } from "../talk";
import { decide } from "../brain";
import { DILEMMAS } from "../dilemmas";

const base = (): Activations => ({ ...BASELINE });
const gloomy: Activations = { ...BASELINE, sadness: 0.45, joy: 0.35 };
const noCoupling = Object.fromEntries(EMOTIONS.map((e) => [e, {}])) as ReturnType<typeof defaultState>["coupling"];

describe("a different baseline", () => {
	it("stepHeart decays toward the given baseline", () => {
		const next = stepHeart({ ...base(), sadness: 0.9 }, noCoupling, gloomy);
		expect(next.sadness).toBeCloseTo(0.9 + 0.05 * (0.45 - 0.9), 5);
	});

	it("a resting state at the new baseline looks calm, but is not calm against the old one", () => {
		expect(dominantEmotions(gloomy, 3, gloomy)).toEqual([]);
		expect(moodLabel(gloomy, gloomy)).toBe("calm");
		expect(dominantEmotions(gloomy)).toContain("sadness");
		expect(feelingPhrase(gloomy, gloomy)).toBe("calm");
		expect(moodTheme(gloomy, gloomy).tone).toBe("calm");
		expect(moodTheme(gloomy).tone).toBe("sadness");
	});

	it("the brain's mood tilt is measured against the given baseline", () => {
		const d = DILEMMAS.find((x) => x.id === "white-lie")!;
		const angryByDefault = { ...defaultState(), activations: { ...base(), anger: 0.65 } };
		const restingAnger: Activations = { ...base(), anger: 0.65 };
		const a = decide(d, angryByDefault);
		const b = decide(d, angryByDefault, restingAnger);
		expect(b.scores[0]).not.toBe(a.scores[0]); // the same anger is no tilt when it is his resting level
	});
});

describe("reactivity scale", () => {
	it("scales shifts, cues and event effects", () => {
		expect(applyShifts(base(), { joy: 0.2 }, 0.5).joy).toBeCloseTo(0.55 + 0.1, 5);
		expect(applyCues(base(), "thanks", 2).joy).toBeCloseTo(0.55 + 0.3, 5);
		const event: StoryEvent = { id: "x", kind: "k", valence: "tragic", text: "t", shifts: { sadness: 0.2 } };
		expect(applyEvent(defaultState(), event, 0.5).activations.sadness).toBeCloseTo(0.15 + 0.1, 5);
		expect(applyEvent(defaultState(), event).activations.sadness).toBeCloseTo(0.35, 5);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/agent/personality/params.test.ts`
Expected: FAIL (assertions about baseline and scale).

- [ ] **Step 3: Thread the parameters (use the Edit tool for each)**

`lib/agent/heart.ts`:
- Change the `stepHeart` signature to `stepHeart(a: Activations, coupling: Coupling, baseline: Activations = BASELINE)` and replace both uses of `BASELINE[...]` inside it with `baseline[...]` (the coupling deviation line and the decay line).
- Change `applyShifts` to `applyShifts(a, shifts, scale = 1)` and use `amount * scale`.
- Change `dominantEmotions(a: Activations, max = 3, baseline: Activations = BASELINE)` and use `baseline[e]` in the excess.
- Change `moodLabel(a: Activations, baseline: Activations = BASELINE)` to `blendLabel(dominantEmotions(a, 3, baseline))`.

`lib/agent/cues.ts`: change `applyCues(a, text, scale = 1)` and pass `scale` to `applyShifts(next, cue.shifts, scale)`.

`lib/agent/events.ts`: change `applyEvent(state, event, reactivity = 1)` and use `activations[e] = clamp01(activations[e] + effective * reactivity)`.

`lib/agent/brain.ts`: add `baseline: Activations = BASELINE` as the last parameter of `effectiveWeights` (use it in `excess`) and of `decide`, passing it through to `effectiveWeights`. Import `Activations` type from `./state`.

`lib/agent/mood-theme.ts`: `moodTheme(a, baseline: Activations = BASELINE)`; use `dominantEmotions(a, 2, baseline)` and `a[first] - baseline[first]`.

`lib/agent/talk.ts`: `feelingPhrase(a, baseline: Activations = BASELINE)` uses `blendLabel(dominantEmotions(a, 3, baseline))`; add `baseline?: Activations` to `TalkContext`; in `respond` call `feelingPhrase(ctx.state.activations, ctx.baseline)`. Import `BASELINE` from `./state`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run`
Expected: PASS (new tests, and every existing test still green since defaults are unchanged).

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 3: Genome, assembly, resolution

**Files:**
- Modify: `lib/agent/state.ts` (add `ORGANS`, `Organ`, `Genome`; `genome: Genome | null` on `AgentState`; `defaultState` sets `genome: null`)
- Create: `lib/agent/personality/donors.ts` (temporary empty roster)
- Create: `lib/agent/personality/assemble.ts`
- Test: `lib/agent/personality/assemble.test.ts`

**Interfaces:**
- Consumes: `Donor` from `./types`; `mulberry32`, `hashString` from `./rng`; state constants.
- Produces (`state.ts`): `ORGANS = ["heart","brain","voice","humor","slang","quirks"] as const`, `type Organ`, `type Genome = { seed: number; donors: Record<Organ, string> }`.
- Produces (`donors.ts`): `DONORS: Donor[]` (initially `[]`; filled in Tasks 5 to 9).
- Produces (`assemble.ts`):
  - `type Personality = { genome: Genome | null; names: Record<Organ, string> | null; baseline: Activations; reactivity: number; weights: Weights; voice: Donor["voice"]; humor: Donor["humor"]; says: string[]; quirks: Donor["quirks"] }`
  - `assemble(seed: number, roster?: Donor[]): Genome`
  - `resolve(genome: Genome | null, roster?: Donor[]): Personality` (null gives the neutral Osmo; unknown ids get a deterministic fallback)
  - `adoptGenome(state: AgentState, genome: Genome, options: { resetWeights: boolean }, roster?: Donor[]): AgentState`
  - `sanitizeGenome(raw: unknown, roster?: Donor[]): Genome | null`
  - `mergedLexicon(roster?: Donor[]): Record<string, string>` (first donor wins)
  - `newSeed(): number`

- [ ] **Step 1: Add the genome types to state**

In `lib/agent/state.ts` add (after the `Valence` type block):

```ts
export const ORGANS = ["heart", "brain", "voice", "humor", "slang", "quirks"] as const;
export type Organ = (typeof ORGANS)[number];
// Which donor supplied each organ. Null on AgentState means the neutral Osmo.
export type Genome = { seed: number; donors: Record<Organ, string> };
```

Add `genome: Genome | null;` to `AgentState` and `genome: null,` to `defaultState()`.

Create `lib/agent/personality/donors.ts`:

```ts
import type { Donor } from "./types";

// Filled in by the donor tasks, one family at a time.
export const DONORS: Donor[] = [];
```

- [ ] **Step 2: Write the failing assembly tests**

Create `lib/agent/personality/assemble.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BASELINE, DEFAULT_WEIGHTS, ORGANS, VALUES, defaultState } from "../state";
import { adoptGenome, assemble, mergedLexicon, newSeed, resolve, sanitizeGenome } from "./assemble";
import type { Donor } from "./types";
import { goodDonor } from "./validate.test";

const roster: Donor[] = Array.from({ length: 12 }, (_, i) =>
	goodDonor({
		id: `the-donor-${i}`,
		name: `The Donor ${i}`,
		heart: { baseline: { joy: (i % 5) * 0.05 - 0.1 }, reactivity: 0.7 + i * 0.05 },
		brain: { honesty: 1 + i, kindness: 1, fairness: 1, loyalty: 1, harm: 1 },
		slang: {
			lexicon: { [`word${i}`]: `meaning ${i}`, shared: i === 0 ? "first meaning" : "other meaning", yeet: "throw", sus: "odd" },
			says: ["No cap.", "Fr fr."],
		},
	}),
);

describe("assemble", () => {
	it("is deterministic and picks a real donor for every organ", () => {
		const a = assemble(123, roster);
		expect(assemble(123, roster)).toEqual(a);
		expect(a.seed).toBe(123);
		for (const organ of ORGANS) expect(roster.some((d) => d.id === a.donors[organ])).toBe(true);
	});

	it("gives varied donors across seeds, and different donors per organ within one Osmo", () => {
		const genomes = Array.from({ length: 40 }, (_, seed) => assemble(seed, roster));
		expect(new Set(genomes.map((g) => g.donors.heart)).size).toBeGreaterThan(5);
		expect(genomes.some((g) => new Set(Object.values(g.donors)).size > 1)).toBe(true);
	});

	it("normalizes a negative or huge seed into a 32-bit unsigned integer", () => {
		expect(assemble(-1, roster).seed).toBe(4294967295);
		expect(newSeed()).toBeGreaterThanOrEqual(0);
		expect(Number.isInteger(newSeed())).toBe(true);
	});
});

describe("resolve", () => {
	it("gives the neutral Osmo for a null genome", () => {
		const p = resolve(null, roster);
		expect(p.genome).toBeNull();
		expect(p.names).toBeNull();
		expect(p.baseline).toEqual(BASELINE);
		expect(p.reactivity).toBe(1);
		expect(p.weights).toEqual(DEFAULT_WEIGHTS);
		expect(p.humor.style).toBe("none");
	});

	it("builds the personality from the organs' donors", () => {
		const genome = { seed: 1, donors: { heart: "the-donor-3", brain: "the-donor-5", voice: "the-donor-1", humor: "the-donor-2", slang: "the-donor-4", quirks: "the-donor-6" } };
		const p = resolve(genome, roster);
		expect(p.baseline.joy).toBeCloseTo(0.55 + ((3 % 5) * 0.05 - 0.1), 5);
		expect(p.reactivity).toBeCloseTo(0.7 + 3 * 0.05, 5);
		expect(p.names?.heart).toBe("The Donor 3");
		expect(VALUES.reduce((s, v) => s + p.weights[v], 0)).toBeCloseTo(1, 6);
		expect(p.weights.honesty).toBeGreaterThan(p.weights.kindness); // donor 5 favors honesty
	});

	it("clamps baselines to 0.05..0.85", () => {
		const wild = [goodDonor({ heart: { baseline: { joy: 0.4, sadness: -0.4 }, reactivity: 1 } })];
		const p = resolve({ seed: 1, donors: Object.fromEntries(ORGANS.map((o) => [o, wild[0].id])) as never }, wild);
		expect(p.baseline.joy).toBeLessThanOrEqual(0.85);
		expect(p.baseline.sadness).toBeGreaterThanOrEqual(0.05);
	});

	it("falls back deterministically for an unknown donor id", () => {
		const genome = { seed: 9, donors: { heart: "nobody", brain: "nobody", voice: "nobody", humor: "nobody", slang: "nobody", quirks: "nobody" } };
		expect(resolve(genome, roster)).toEqual(resolve(genome, roster));
		expect(roster.some((d) => d.name === resolve(genome, roster).names?.heart)).toBe(true);
	});
});

describe("sanitizeGenome", () => {
	it("returns null for missing or garbage genomes", () => {
		for (const bad of [null, undefined, 5, "x", [], {}, { seed: "no" }, { seed: NaN, donors: {} }]) {
			expect(sanitizeGenome(bad, roster)).toBeNull();
		}
	});

	it("keeps valid ids and replaces unknown ones deterministically", () => {
		const g = sanitizeGenome({ seed: 5, donors: { heart: "the-donor-2", brain: "ghost" } }, roster)!;
		expect(g.donors.heart).toBe("the-donor-2");
		for (const organ of ORGANS) expect(roster.some((d) => d.id === g.donors[organ])).toBe(true);
		expect(sanitizeGenome({ seed: 5, donors: { brain: "ghost" } }, roster)).toEqual(
			sanitizeGenome({ seed: 5, donors: { brain: "ghost" } }, roster),
		);
	});
});

describe("adoptGenome", () => {
	const genome = assemble(3, roster);

	it("gives a brand-new Osmo the donor's resting mood and moral weights", () => {
		const s = adoptGenome(defaultState(), genome, { resetWeights: false }, roster);
		const p = resolve(genome, roster);
		expect(s.genome).toEqual(genome);
		expect(s.activations).toEqual(p.baseline);
		expect(s.weights).toEqual(p.weights);
	});

	it("keeps an existing user's learned moral weights", () => {
		const learned = { ...defaultState(), weights: { honesty: 0.4, kindness: 0.2, fairness: 0.2, loyalty: 0.1, harm: 0.1 } };
		expect(adoptGenome(learned, genome, { resetWeights: false }, roster).weights).toEqual(learned.weights);
	});

	it("resets the weights when asked (a re-roll)", () => {
		const learned = { ...defaultState(), weights: { honesty: 0.4, kindness: 0.2, fairness: 0.2, loyalty: 0.1, harm: 0.1 } };
		expect(adoptGenome(learned, genome, { resetWeights: true }, roster).weights).toEqual(resolve(genome, roster).weights);
	});

	it("does not disturb a mood that is not at rest", () => {
		const upset = { ...defaultState(), activations: { ...BASELINE, anger: 0.8 } };
		expect(adoptGenome(upset, genome, { resetWeights: false }, roster).activations.anger).toBe(0.8);
	});
});

describe("mergedLexicon", () => {
	it("merges every donor's words, the earliest donor winning conflicts", () => {
		const lexicon = mergedLexicon(roster);
		expect(lexicon.word0).toBe("meaning 0");
		expect(lexicon.word11).toBe("meaning 11");
		expect(lexicon.shared).toBe("first meaning");
	});
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/agent/personality/assemble.test.ts`
Expected: FAIL (cannot resolve `./assemble`).

- [ ] **Step 4: Implement assembly**

Create `lib/agent/personality/assemble.ts`:

```ts
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

export function assemble(seed: number, roster: Donor[] = DONORS): Genome {
	const next = mulberry32(seed);
	const donors = {} as Record<Organ, string>;
	for (const organ of ORGANS) donors[organ] = roster[Math.floor(next() * roster.length)].id;
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
	const pick = (organ: Organ): Donor =>
		byId.get(genome.donors[organ]) ?? roster[hashString(`${genome.seed}:${organ}`) % roster.length];
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
	const ids = new Set(roster.map((d) => d.id));
	const donors = {} as Record<Organ, string>;
	for (const organ of ORGANS) {
		const id = stored[organ];
		donors[organ] = typeof id === "string" && ids.has(id) ? id : roster[hashString(`${seed}:${organ}`) % roster.length].id;
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run`
Expected: PASS (assembly tests plus all existing tests; `genome: null` on `defaultState` keeps `toEqual(defaultState())` checks valid).

- [ ] **Step 6: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass. (`AgentState` gained a field, so also fix any type error in tests that build a full state by hand, if tsc reports one.)

---

### Task 4: Flavor (voice, humor, slang, quirks)

**Files:**
- Create: `lib/agent/personality/flavor.ts`
- Test: `lib/agent/personality/flavor.test.ts`

**Interfaces:**
- Consumes: `Personality` from `./assemble`; `roll` from `./rng`.
- Produces: `type FlavorContext = { intent: string; personality: Personality; turn: number; tone: string; sensitive: boolean }` and `flavor(reply: string, ctx: FlavorContext): string`.

- [ ] **Step 1: Write the failing tests**

Create `lib/agent/personality/flavor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolve, type Personality } from "./assemble";
import { flavor } from "./flavor";

const genome = { seed: 7, donors: { heart: "a", brain: "a", voice: "a", humor: "a", slang: "a", quirks: "a" } };
const person = (over: Partial<Personality> = {}): Personality => ({
	...resolve(null),
	genome,
	voice: { formality: 0.5, verbosity: 0.5, warmth: 0, openers: ["O1."], elaboration: "E1 more." },
	humor: { style: "pun", level: 0, lines: ["H1 joke."] },
	says: [],
	quirks: { phrases: ["Q1 phrase."], rate: 0 },
	...over,
});
const ctx = (p: Personality, o: Partial<{ intent: string; turn: number; tone: string; sensitive: boolean }> = {}) => ({
	intent: "thanks",
	turn: 0,
	tone: "calm",
	sensitive: false,
	personality: p,
	...o,
});
const count = (p: Personality, marker: string, o: Parameters<typeof ctx>[1], turns = 400) => {
	let n = 0;
	for (let t = 0; t < turns; t++) if (flavor("You're welcome!", ctx(p, { ...o, turn: t })).includes(marker)) n++;
	return n;
};

describe("flavor: neutral and determinism", () => {
	it("leaves the reply alone for the neutral Osmo", () => {
		expect(flavor("Hi! I'm here.", ctx(resolve(null), { intent: "greeting" }))).toBe("Hi! I'm here.");
	});

	it("is deterministic for the same seed and turn", () => {
		const p = person({ humor: { style: "pun", level: 1, lines: ["H1 joke."] } });
		expect(flavor("You're welcome!", ctx(p, { turn: 9 }))).toBe(flavor("You're welcome!", ctx(p, { turn: 9 })));
	});
});

describe("flavor: voice", () => {
	it("goes formal above 0.75: formal words and no contractions", () => {
		const p = person({ voice: { formality: 0.9, verbosity: 0.5, warmth: 0, openers: ["O1."], elaboration: "E1 more." } });
		expect(flavor("Hi! I'm sorry you're feeling sad. It's okay.", ctx(p, { intent: "userFeeling" }))).toBe(
			"Greetings! I am sorry you are feeling sad. It is okay.",
		);
	});

	it("goes casual below 0.25", () => {
		const p = person({ voice: { formality: 0.1, verbosity: 0.5, warmth: 0, openers: ["O1."], elaboration: "E1 more." } });
		expect(flavor("Hello! Thank you.", ctx(p, { intent: "greeting" }))).toBe("Hey! Thanks.");
	});

	it("drops a trailing question when terse, but only when there is more than one sentence", () => {
		const p = person({ voice: { formality: 0.5, verbosity: 0.1, warmth: 0, openers: ["O1."], elaboration: "E1 more." } });
		expect(flavor("I'm doing well, thank you. How are you?", ctx(p, { intent: "howAreYou" }))).toBe("I'm doing well, thank you.");
		expect(flavor("Why do you ask?", ctx(p, { intent: "askFeeling" }))).toBe("Why do you ask?");
	});

	it("adds the elaboration when chatty, on light replies only", () => {
		const p = person({ voice: { formality: 0.5, verbosity: 0.9, warmth: 0, openers: ["O1."], elaboration: "E1 more." } });
		expect(flavor("You're welcome!", ctx(p))).toBe("You're welcome! E1 more.");
		expect(flavor("I'm sorry you're feeling sad.", ctx(p, { intent: "userFeeling", sensitive: true }))).not.toContain("E1");
	});

	it("adds a warm opener with probability warmth, never before a greeting or goodbye", () => {
		const warm = person({ voice: { formality: 0.5, verbosity: 0.5, warmth: 1, openers: ["O1."], elaboration: "E1 more." } });
		expect(flavor("You're welcome!", ctx(warm))).toBe("O1. You're welcome!");
		expect(flavor("Hi!", ctx(warm, { intent: "greeting" }))).toBe("Hi!");
		expect(flavor("Goodbye!", ctx(warm, { intent: "farewell" }))).toBe("Goodbye!");
		expect(count(person(), "O1.", {})).toBe(0);
	});
});

describe("flavor: humor, slang and quirks", () => {
	it("adds a humor line about level*0.5 of the time on light replies", () => {
		const p = person({ humor: { style: "pun", level: 1, lines: ["H1 joke."] } });
		const n = count(p, "H1 joke.", {});
		expect(n).toBeGreaterThan(140);
		expect(n).toBeLessThan(260);
	});

	it("adds a quirk about rate of the time", () => {
		const n = count(person({ quirks: { phrases: ["Q1 phrase."], rate: 0.3 } }), "Q1 phrase.", {});
		expect(n).toBeGreaterThan(80);
		expect(n).toBeLessThan(160);
	});

	it("adds a slang tag on light replies", () => {
		const n = count(person({ says: ["S1."] }), "S1.", {});
		expect(n).toBeGreaterThan(70);
		expect(n).toBeLessThan(170);
	});

	it("never adds humor, quirks or slang on a heavy mood or a sensitive reply", () => {
		const loud = person({ humor: { style: "pun", level: 1, lines: ["H1 joke."] }, quirks: { phrases: ["Q1 phrase."], rate: 0.3 }, says: ["S1."] });
		for (const tone of ["sadness", "fear", "anger", "guilt", "loneliness"]) {
			for (const marker of ["H1", "Q1", "S1."]) expect(count(loud, marker, { tone })).toBe(0);
		}
		for (const marker of ["H1", "Q1", "S1."]) expect(count(loud, marker, { sensitive: true })).toBe(0);
		for (const intent of ["userFeeling", "insult", "askWhyFeeling"]) expect(count(loud, "H1", { intent })).toBe(0);
	});

	it("never adds humor or slang to how-are-you when the mood is not calm", () => {
		const loud = person({ humor: { style: "pun", level: 1, lines: ["H1 joke."] }, says: ["S1."] });
		expect(count(loud, "H1", { intent: "howAreYou", tone: "joy" })).toBe(0);
		expect(count(loud, "H1", { intent: "howAreYou", tone: "calm" })).toBeGreaterThan(100);
	});

	it("adds at most two things to a reply", () => {
		const everything = person({
			voice: { formality: 0.5, verbosity: 0.9, warmth: 1, openers: ["O1."], elaboration: "E1 more." },
			humor: { style: "pun", level: 1, lines: ["H1 joke."] },
			quirks: { phrases: ["Q1 phrase."], rate: 0.3 },
			says: ["S1."],
		});
		for (let t = 0; t < 100; t++) {
			const out = flavor("You're welcome!", ctx(everything, { turn: t }));
			expect(out).toContain("O1.");
			expect(out).toContain("E1");
			for (const marker of ["H1", "Q1", "S1."]) expect(out).not.toContain(marker);
		}
	});

	it("differs between seeds", () => {
		const a = person({ genome: { ...genome, seed: 1 }, humor: { style: "pun", level: 1, lines: ["H1 joke."] } });
		const b = person({ genome: { ...genome, seed: 2 }, humor: { style: "pun", level: 1, lines: ["H1 joke."] } });
		let differs = false;
		for (let t = 0; t < 50; t++) if (flavor("You're welcome!", ctx(a, { turn: t })) !== flavor("You're welcome!", ctx(b, { turn: t }))) differs = true;
		expect(differs).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/agent/personality/flavor.test.ts`
Expected: FAIL (cannot resolve `./flavor`).

- [ ] **Step 3: Implement flavor**

Create `lib/agent/personality/flavor.ts`:

```ts
import type { Personality } from "./assemble";
import { roll } from "./rng";

export type FlavorContext = {
	intent: string; // the conversation intent that produced the reply
	personality: Personality;
	turn: number;
	tone: string; // Osmo's strongest emotion right now, or "calm"
	sensitive: boolean; // an insult, a sad user, a question about his own feelings
};

const LIGHT_INTENTS = new Set(["greeting", "howAreYou", "thanks", "laughter", "ack", "compliment"]);
const HEAVY_TONES = new Set(["sadness", "fear", "anger", "guilt", "loneliness"]);
const MAX_ADDITIONS = 2;

const FORMAL_SWAPS: [RegExp, string][] = [
	[/\bHey\b/g, "Hello"],
	[/\bHi\b/g, "Greetings"],
	[/\bThanks\b/g, "Thank you"],
	[/\bHappy to help\b/g, "Glad to be of service"],
	[/\bAnytime\b/g, "Whenever you like"],
];
const CASUAL_SWAPS: [RegExp, string][] = [
	[/\bHello\b/g, "Hey"],
	[/\bGreetings\b/g, "Hi"],
	[/\bThank you\b/g, "Thanks"],
	[/\bYou're welcome\b/g, "No problem"],
	[/\bGoodbye\b/g, "Bye"],
];
const CONTRACTIONS: [RegExp, string][] = [
	[/\bI'm\b/g, "I am"],
	[/\bI'll\b/g, "I will"],
	[/\bI've\b/g, "I have"],
	[/\bI'd\b/g, "I would"],
	[/\b(you|You|we|We|they|They)'re\b/g, "$1 are"],
	[/\b(it|It|that|That|there|There|what|What|he|He|she|She)'s\b/g, "$1 is"],
	[/\bdon't\b/g, "do not"],
	[/\bdoesn't\b/g, "does not"],
	[/\bdidn't\b/g, "did not"],
	[/\bcan't\b/g, "cannot"],
	[/\bwon't\b/g, "will not"],
];

const swap = (text: string, table: [RegExp, string][]) => table.reduce((t, [re, to]) => t.replace(re, to), text);
const pickAt = <T>(list: T[], turn: number): T => list[turn % list.length];

function dropTrailingQuestion(text: string): string {
	const sentences = text.split(/(?<=[.!?])\s+/);
	return sentences.length > 1 && sentences[sentences.length - 1].endsWith("?") ? sentences.slice(0, -1).join(" ") : text;
}

export function flavor(reply: string, ctx: FlavorContext): string {
	const { personality: p, turn, intent } = ctx;
	if (!p.genome) return reply;
	const seed = p.genome.seed;

	const heavy = HEAVY_TONES.has(ctx.tone) || ctx.sensitive;
	const calmEnough = intent !== "howAreYou" || ctx.tone === "calm";
	const light = LIGHT_INTENTS.has(intent) && calmEnough && !heavy;

	let text = reply;
	if (p.voice.formality > 0.75) text = swap(swap(text, FORMAL_SWAPS), CONTRACTIONS);
	else if (p.voice.formality < 0.25) text = swap(text, CASUAL_SWAPS);
	if (p.voice.verbosity < 0.3) text = dropTrailingQuestion(text);

	let added = 0;
	const room = () => added < MAX_ADDITIONS;

	if (room() && intent !== "greeting" && intent !== "farewell" && p.voice.openers.length && roll(seed, turn, "warm") < p.voice.warmth) {
		text = `${pickAt(p.voice.openers, turn)} ${text}`;
		added++;
	}
	if (room() && light && p.voice.verbosity > 0.7 && p.voice.elaboration) {
		text = `${text} ${p.voice.elaboration}`;
		added++;
	}
	if (room() && light && p.humor.style !== "none" && p.humor.lines.length && roll(seed, turn, "humor") < p.humor.level * 0.5) {
		text = `${text} ${pickAt(p.humor.lines, turn)}`;
		added++;
	}
	if (room() && !heavy && p.quirks.phrases.length && roll(seed, turn, "quirk") < p.quirks.rate) {
		text = `${text} ${pickAt(p.quirks.phrases, turn)}`;
		added++;
	}
	if (room() && light && p.says.length && roll(seed, turn, "slang") < 0.3) {
		text = `${text} ${pickAt(p.says, turn)}`;
		added++;
	}
	return text;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/agent/personality/flavor.test.ts`
Expected: PASS. If a statistical test lands outside its band, change nothing in the test: check that `roll` in Task 1 passes its uniformity test, then look for an off-by-one in `pickAt`/probabilities.

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 5: Donors, family 1 and 2: gentle and grumpy (20 donors)

**Files:**
- Create: `lib/agent/personality/donors/gentle.ts`, `lib/agent/personality/donors/grumpy.ts`
- Modify: `lib/agent/personality/donors.ts`
- Test: `lib/agent/personality/donors/gentle.test.ts`, `lib/agent/personality/donors/grumpy.test.ts`

**Interfaces:**
- Consumes: `Donor`, `validateDonor`, `validateRoster`, `COMMON_WORDS`.
- Produces: `gentle: Donor[]` and `grumpy: Donor[]`, each exactly 10 donors with the names below, all passing `validateDonor`.

**Authoring rules (apply to every donor task).** This is creative writing validated by tests. For each donor write all six organs in the character's own voice, following the design row for the numbers, and the worked example below for the shape:
- `id` is the kebab-case of the name ("The Gentle Poet" becomes `the-gentle-poet`); `family` is the family key; `tagline` is one line describing who they are.
- `heart.baseline`: 1 to 3 emotion deltas matching "Heart leans" (values like 0.1 or 0.15; negative for "less"); `reactivity` per the row (calm characters 0.7 to 0.9, sensitive ones 1.2 to 1.4).
- `brain`: five weights where the row's "Top value" is clearly the largest (about 0.35) and the rest sum to about 0.65.
- `voice`: formality, verbosity, warmth as the row's tenths (7 means 0.7); 2 to 4 short `openers` ending in punctuation ("Oh, dear friend."), and one `elaboration` sentence they would tack on.
- `humor`: `style` and `level` per the row (`none` means level 0 and no lines); otherwise 3 to 6 short lines in that style.
- `slang`: 4 to 8 words that character's world uses, each mapped to a plain lowercase meaning of 1 to 4 words; keys are single lowercase tokens and must not be ordinary English (see `COMMON_WORDS`); plus 2 to 4 short `says` tags of at most 24 characters ("No cap.", "Aye.").
- `quirks`: 2 to 4 catchphrases and a `rate` of 0.05 to 0.3.
- Every sentence starts with a capital letter, ends in `.`, `!` or `?`, and is at most 120 characters.
- Keep lines kind and safe: no slurs, no cruelty, nothing that would sound wrong after a friendly chat.

**Worked example** (write the others in this shape):

```ts
import type { Donor } from "../types";

export const gentle: Donor[] = [
	{
		id: "the-gentle-poet",
		name: "The Gentle Poet",
		family: "gentle",
		tagline: "Speaks softly, notices small beautiful things.",
		heart: { baseline: { love: 0.15, hope: 0.1 }, reactivity: 1.2 },
		brain: { honesty: 0.2, kindness: 0.35, fairness: 0.15, loyalty: 0.15, harm: 0.15 },
		voice: {
			formality: 0.4,
			verbosity: 0.6,
			warmth: 0.9,
			openers: ["Oh, dear one.", "Softly now.", "Well, hello, lovely."],
			elaboration: "There is a small poem in every ordinary day.",
		},
		humor: { style: "none", level: 0, lines: [] },
		slang: {
			lexicon: { dearest: "dear friend", hush: "be quiet", lovely: "very nice", aloe: "soothing", moonlit: "peaceful" },
			says: ["Softly.", "Dearest."],
		},
		quirks: { phrases: ["Like a petal on the water.", "Let the words settle."], rate: 0.15 },
	},
	// ...nine more donors (see the design table)
];
```

(Note "lovely" above is fine only if it is not in `COMMON_WORDS`; if `validateDonor` rejects a word, swap it for a less common one.)

**Design table: gentle** (voice tenths are Formality/Verbosity/Warmth; humor is style and level in tenths):

| Donor | Voice F/V/W | Humor | Heart leans | Top value | Slang flavor |
|---|---|---|---|---|---|
| The Gentle Poet | 4/6/9 | none 0 | love+, hope+ | kindness | soft, poetic |
| The Lighthouse Keeper | 5/4/7 | dry 3 | trust+, loneliness slightly+ | loyalty | nautical, weather |
| The Kindergarten Teacher | 3/7/9 | pun 6 | joy+, surprise+ | kindness | sing-song, "yay" style |
| The Night-Shift Nurse | 4/4/8 | dry 4 | trust+, fear- | harm | calm, practical |
| The Grandmother Who Bakes | 5/8/10 | teasing 4 | love+ (strong) | kindness | old-fashioned endearments, baking |
| The Quiet Gardener | 5/3/6 | none 0 | hope+, boredom- | fairness | plants, seasons |
| The Harbor Cat | 2/2/5 | absurd 5 | surprise+, boredom+ | loyalty | cat sounds, naps |
| The Old Friend | 2/6/8 | teasing 6 | joy+, trust+ (strong) | loyalty | easygoing, "mate" style |
| The Campfire Storyteller | 4/8/7 | absurd 4 | hope+, surprise+ | honesty | folksy, tall tales |
| The Lullaby Singer | 3/5/10 | none 0 | love+, sadness slightly+ | kindness | sleepy, hushed |

**Design table: grumpy**

| Donor | Voice F/V/W | Humor | Heart leans | Top value | Slang flavor |
|---|---|---|---|---|---|
| The Grumpy Professor | 8/8/3 | dry 7 | anger+, trust- | honesty | academic complaint |
| The Retired Sergeant | 6/3/2 | dry 5 | anger+, trust+ | loyalty | drill barks |
| The Tired Librarian | 7/4/4 | dry 6 | boredom+, love slightly+ | fairness | hushed, shelving |
| The Cynical Cabbie | 2/6/3 | teasing 7 | anger+, joy- | honesty | street wise, cab talk |
| The Sarcastic Barista | 2/5/3 | teasing 8 | boredom+, joy- | fairness | coffee counter |
| The Bored Butler | 9/4/2 | dry 8 | boredom+ (strong) | loyalty | overly polite sighs |
| The Weathered Fisherman | 4/5/4 | dry 5 | sadness slightly+, trust+ | honesty | sea-worn |
| The Crossword Curmudgeon | 7/6/3 | pun 6 | anger+, hope- | honesty | wordplay grumbles |
| The Deadpan Robot | 6/3/1 | dry 9 | joy-, boredom+ | honesty | flat machine phrasing |
| The Landlord Who Sighs | 5/5/3 | dry 6 | sadness+, boredom+ | fairness | rent and repairs |

- [ ] **Step 1: Write the failing family tests**

Create `lib/agent/personality/donors/gentle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { gentle } from "./gentle";

const NAMES = [
	"The Gentle Poet", "The Lighthouse Keeper", "The Kindergarten Teacher", "The Night-Shift Nurse", "The Grandmother Who Bakes",
	"The Quiet Gardener", "The Harbor Cat", "The Old Friend", "The Campfire Storyteller", "The Lullaby Singer",
];

describe("gentle donors", () => {
	it("are the ten in the roster, in order, all in the gentle family", () => {
		expect(gentle.map((d) => d.name)).toEqual(NAMES);
		expect(gentle.every((d) => d.family === "gentle")).toBe(true);
	});

	it("are all valid", () => {
		expect(gentle.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(gentle)).toEqual([]);
	});
});
```

Create `lib/agent/personality/donors/grumpy.test.ts` the same way with `import { grumpy } from "./grumpy"`, family `"grumpy"`, and these names in order: The Grumpy Professor, The Retired Sergeant, The Tired Librarian, The Cynical Cabbie, The Sarcastic Barista, The Bored Butler, The Weathered Fisherman, The Crossword Curmudgeon, The Deadpan Robot, The Landlord Who Sighs.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/agent/personality/donors`
Expected: FAIL (cannot resolve the family files).

- [ ] **Step 3: Author the 20 donors**

Create `lib/agent/personality/donors/gentle.ts` and `lib/agent/personality/donors/grumpy.ts` following the rules, the worked example, and the design tables. Then update `lib/agent/personality/donors.ts`:

```ts
import type { Donor } from "./types";
import { gentle } from "./donors/gentle";
import { grumpy } from "./donors/grumpy";

export const DONORS: Donor[] = [...gentle, ...grumpy];
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run lib/agent/personality/donors`
Expected: PASS. If `validateDonor` reports a problem (for example an ordinary-English slang word or a sentence over the length limit), fix the donor data, not the validator.

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 6: Donors, family 3 and 4: bold and curious (20 donors)

**Files:**
- Create: `lib/agent/personality/donors/bold.ts`, `lib/agent/personality/donors/curious.ts`
- Modify: `lib/agent/personality/donors.ts`
- Test: `lib/agent/personality/donors/bold.test.ts`, `lib/agent/personality/donors/curious.test.ts`

**Interfaces:** as Task 5: `bold: Donor[]`, `curious: Donor[]`, ten each, all valid. Follow the Task 5 authoring rules and worked example.

**Design table: bold**

| Donor | Voice F/V/W | Humor | Heart leans | Top value | Slang flavor |
|---|---|---|---|---|---|
| The Hype Coach | 2/8/8 | teasing 7 | joy+ (strong), surprise+ | loyalty | motivational yells |
| The Stage Diva | 6/9/6 | teasing 6 | joy+, love+ | honesty | theatrical, "darling" |
| The Carnival Barker | 4/9/5 | absurd 8 | surprise+, joy+ | honesty | showman patter |
| The Rock Drummer | 1/3/5 | teasing 5 | anger+, joy+ | loyalty | gig and band talk |
| The Pirate Captain | 3/7/4 | absurd 6 | anger+, hope+ | loyalty | pirate speech ("aye") |
| The Cowboy Sheriff | 4/4/5 | dry 5 | trust+, fear- | fairness | frontier drawl |
| The Wrestling Announcer | 2/10/4 | absurd 8 | surprise+, joy+ | fairness | over-the-top hype |
| The Viking Skald | 4/8/5 | absurd 5 | anger+, hope+ | honesty | saga boasts |
| The Street Party Host | 1/7/8 | pun 7 | joy+ (strong), love+ | kindness | party slang |
| The Gladiator | 5/3/3 | dry 4 | anger+, fear- | fairness | arena grit |

**Design table: curious**

| Donor | Voice F/V/W | Humor | Heart leans | Top value | Slang flavor |
|---|---|---|---|---|---|
| The Mad Scientist | 4/9/4 | absurd 8 | surprise+ (strong), fear slightly+ | honesty | lab exclamations |
| The Astronomer | 6/7/6 | pun 4 | hope+, loneliness slightly+ | honesty | stars and orbits |
| The Fossil Hunter | 5/5/5 | dry 4 | surprise+, boredom- | honesty | digs and eras |
| The Chess Prodigy | 6/3/2 | dry 6 | trust-, joy slightly- | fairness | moves and gambits |
| The Code Wizard | 3/5/4 | pun 8 | surprise+, boredom- | honesty | programmer jokes |
| The Bird Watcher | 5/6/6 | dry 3 | hope+, boredom- | kindness | bird calls, patience |
| The Map Maker | 6/6/5 | dry 4 | hope+, trust+ | honesty | routes and landmarks |
| The Alchemist | 7/8/4 | absurd 6 | surprise+, hope+ | honesty | potions, transmutation |
| The Trivia Champion | 4/10/5 | pun 6 | joy+, surprise+ | honesty | fun-fact patter |
| The Time Traveler | 3/7/6 | absurd 7 | surprise+, loneliness+ | honesty | "back in my day" across eras |

- [ ] **Step 1: Write the failing family tests**

Create the two test files exactly as in Task 5 Step 1 (import `{ bold }` from `./bold` and `{ curious }` from `./curious`, family keys `"bold"` and `"curious"`), with these ordered names.
bold: The Hype Coach, The Stage Diva, The Carnival Barker, The Rock Drummer, The Pirate Captain, The Cowboy Sheriff, The Wrestling Announcer, The Viking Skald, The Street Party Host, The Gladiator.
curious: The Mad Scientist, The Astronomer, The Fossil Hunter, The Chess Prodigy, The Code Wizard, The Bird Watcher, The Map Maker, The Alchemist, The Trivia Champion, The Time Traveler.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/agent/personality/donors`
Expected: FAIL for the two new files (cannot resolve).

- [ ] **Step 3: Author the 20 donors and register them**

Create `bold.ts` and `curious.ts` following the Task 5 rules and the tables above. In `donors.ts` add the two imports and extend the array: `[...gentle, ...grumpy, ...bold, ...curious]`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run lib/agent/personality/donors`
Expected: PASS (fix donor data, not the validator, if it complains).

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 7: Donors, family 5 and 6: playful and cool (20 donors)

**Files:**
- Create: `lib/agent/personality/donors/playful.ts`, `lib/agent/personality/donors/cool.ts`
- Modify: `lib/agent/personality/donors.ts`
- Test: `lib/agent/personality/donors/playful.test.ts`, `lib/agent/personality/donors/cool.test.ts`

**Interfaces:** `playful: Donor[]`, `cool: Donor[]`, ten each, all valid. The **cool** family is the main source of modern slang: give each donor the richest lexicon the validator allows (6 to 8 words) drawn from their era, keeping every key a single lowercase token that is not ordinary English.

**Design table: playful**

| Donor | Voice F/V/W | Humor | Heart leans | Top value | Slang flavor |
|---|---|---|---|---|---|
| The Trickster Fox | 3/5/4 | teasing 8 | surprise+, trust- | fairness | sly asides |
| The Riddle Sphinx | 7/4/3 | dry 6 | surprise+, trust slightly- | honesty | riddling |
| The Court Jester | 5/7/6 | pun 8 | joy+ (strong) | honesty | rhyming, old-court |
| The Cloud Gazer | 3/6/7 | absurd 6 | hope+, boredom+ | kindness | sky and shapes |
| The Pun Machine | 3/6/5 | pun 10 | joy+, surprise+ | honesty | wordplay |
| The Dream Walker | 4/7/7 | absurd 7 | love+, surprise+ | kindness | dreamy, drifting |
| The Cheshire Cat | 5/5/4 | absurd 9 | surprise+, trust- | fairness | grins and vanishing |
| The Toy Robot | 2/3/6 | absurd 6 | joy+, surprise+ | loyalty | beeps and wind-up |
| The Puppet | 2/5/7 | teasing 6 | joy+, fear slightly+ | loyalty | strings and stage |
| The Sleepy Owl | 4/4/7 | none 0 | boredom+, love+ | kindness | yawns, night |

**Design table: cool** (slang eras)

| Donor | Voice F/V/W | Humor | Heart leans | Top value | Slang flavor |
|---|---|---|---|---|---|
| The 90s Skater | 1/4/6 | teasing 6 | joy+, boredom+ | loyalty | 90s skate slang |
| The Gen-Z Group Chat | 1/5/7 | teasing 8 | joy+, surprise+ | loyalty | current Gen-Z slang |
| The Valley Girl | 1/8/8 | teasing 7 | joy+, love+ | kindness | 80s valley speak |
| The Disco Dancer | 2/6/8 | pun 6 | joy+ (strong), love+ | kindness | 70s disco |
| The Beat Poet | 3/7/5 | absurd 5 | sadness slightly+, hope+ | honesty | 50s beat |
| The 80s Arcade Kid | 1/5/6 | teasing 6 | surprise+, joy+ | fairness | arcade and radical |
| The Streamer | 1/9/6 | teasing 8 | joy+, surprise+ | loyalty | stream chat lingo |
| The Old-School Rapper | 2/6/4 | teasing 7 | trust+, anger slightly+ | honesty | golden-age hip-hop |
| The Surfer | 1/4/8 | pun 5 | joy+, fear- | kindness | surf talk |
| The Hippie | 2/6/9 | absurd 5 | love+, trust+ | kindness | 60s peace talk |

- [ ] **Step 1: Write the failing family tests**

Create `playful.test.ts` and `cool.test.ts` as in Task 5 Step 1 (import `{ playful }` and `{ cool }`), with these ordered names.
playful: The Trickster Fox, The Riddle Sphinx, The Court Jester, The Cloud Gazer, The Pun Machine, The Dream Walker, The Cheshire Cat, The Toy Robot, The Puppet, The Sleepy Owl.
cool: The 90s Skater, The Gen-Z Group Chat, The Valley Girl, The Disco Dancer, The Beat Poet, The 80s Arcade Kid, The Streamer, The Old-School Rapper, The Surfer, The Hippie.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/agent/personality/donors`
Expected: FAIL for the two new files.

- [ ] **Step 3: Author the 20 donors and register them**

Create `playful.ts` and `cool.ts` per the Task 5 rules and tables. Extend `donors.ts` to `[...gentle, ...grumpy, ...bold, ...curious, ...playful, ...cool]`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run lib/agent/personality/donors`
Expected: PASS. `validateRoster` catches conflicting slang meanings across families: if two donors define the same word differently, change one meaning so they match or rename the word.

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 8: Donors, family 7 and 8: formal and tender (20 donors)

**Files:**
- Create: `lib/agent/personality/donors/formal.ts`, `lib/agent/personality/donors/tender.ts`
- Modify: `lib/agent/personality/donors.ts`
- Test: `lib/agent/personality/donors/formal.test.ts`, `lib/agent/personality/donors/tender.test.ts`

**Interfaces:** `formal: Donor[]`, `tender: Donor[]`, ten each, all valid.

**Design table: formal**

| Donor | Voice F/V/W | Humor | Heart leans | Top value | Slang flavor |
|---|---|---|---|---|---|
| The Victorian Butler | 10/6/4 | dry 6 | trust+, joy slightly- | loyalty | period courtesy |
| The Shakespearean Actor | 8/10/6 | pun 6 | joy+, love+, sadness slightly+ | honesty | Elizabethan ("thee") |
| The Samurai | 8/2/3 | none 0 | trust+, fear- | honesty | honor and blades |
| The Monk | 7/3/6 | none 0 | boredom+, trust+ | kindness | quiet contemplation |
| The Diplomat | 9/6/6 | dry 4 | trust+, anger- | fairness | tactful phrasing |
| The Duchess | 9/7/5 | dry 7 | joy slightly+, disgust+ | fairness | high society |
| The Knight Errant | 8/6/6 | none 0 | hope+, love+ | loyalty | chivalric vows |
| The Court Scribe | 8/8/4 | dry 5 | boredom+, trust+ | honesty | ink and records |
| The Ambassador | 9/6/6 | dry 3 | trust+, surprise- | fairness | treaties and protocol |
| The Oracle | 8/5/5 | dry 5 | fear slightly+, hope+ | honesty | prophecy, riddling |

**Design table: tender**

| Donor | Voice F/V/W | Humor | Heart leans | Top value | Slang flavor |
|---|---|---|---|---|---|
| The Rainy-Day Philosopher | 6/9/6 | dry 4 | sadness+, hope+ | honesty | musing |
| The Lonely Lighthouse | 5/4/6 | none 0 | loneliness+ (strong), love+ | loyalty | beams and fog |
| The Widow Poet | 6/6/8 | none 0 | sadness+, love+ | kindness | remembrance |
| The Wandering Minstrel | 4/7/7 | pun 4 | hope+, loneliness+ | kindness | road songs |
| The Ghost in the Attic | 5/5/6 | absurd 5 | loneliness+, fear slightly+ | kindness | creaks and drafts |
| The Autumn Painter | 5/7/7 | none 0 | sadness slightly+, love+ | kindness | colors and light |
| The Late-Night Radio Host | 3/7/7 | dry 5 | loneliness+, trust+ | kindness | midnight airwaves |
| The Lost Sailor | 4/5/6 | dry 4 | fear slightly+, hope+ | loyalty | tides and stars |
| The Moon Watcher | 4/6/7 | none 0 | hope+, loneliness+ | kindness | phases and tides |
| The Hopeful Exile | 5/6/7 | dry 3 | hope+ (strong), sadness+ | fairness | home and horizon |

- [ ] **Step 1: Write the failing family tests**

Create `formal.test.ts` and `tender.test.ts` as in Task 5 Step 1 (import `{ formal }` and `{ tender }`), with these ordered names.
formal: The Victorian Butler, The Shakespearean Actor, The Samurai, The Monk, The Diplomat, The Duchess, The Knight Errant, The Court Scribe, The Ambassador, The Oracle.
tender: The Rainy-Day Philosopher, The Lonely Lighthouse, The Widow Poet, The Wandering Minstrel, The Ghost in the Attic, The Autumn Painter, The Late-Night Radio Host, The Lost Sailor, The Moon Watcher, The Hopeful Exile.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/agent/personality/donors`
Expected: FAIL for the two new files.

- [ ] **Step 3: Author the 20 donors and register them**

Create `formal.ts` and `tender.ts` per the Task 5 rules and tables. Extend `donors.ts` with the two imports and `...formal, ...tender`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run lib/agent/personality/donors`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 9: Donors, family 9 and 10: fierce and strange (20 donors) and the full-roster test

**Files:**
- Create: `lib/agent/personality/donors/fierce.ts`, `lib/agent/personality/donors/strange.ts`
- Modify: `lib/agent/personality/donors.ts`
- Test: `lib/agent/personality/donors/fierce.test.ts`, `lib/agent/personality/donors/strange.test.ts`, `lib/agent/personality/donors.test.ts`

**Interfaces:** `fierce: Donor[]`, `strange: Donor[]`, ten each; `DONORS` ends with exactly 100 valid, unique donors.

**Design table: fierce**

| Donor | Voice F/V/W | Humor | Heart leans | Top value | Slang flavor |
|---|---|---|---|---|---|
| The Fair Judge | 9/5/3 | dry 4 | trust+, anger slightly+ | fairness | courtroom |
| The Whistleblower | 4/6/4 | dry 4 | fear+, anger+ | honesty | "on the record" |
| The Rescue Firefighter | 3/4/7 | dry 3 | trust+, fear- | harm | rescue calls |
| The Mountain Guide | 4/5/6 | dry 4 | fear-, trust+ | harm | trail and summit |
| The Loyal Squire | 6/5/8 | none 0 | love+, trust+ | loyalty | service and oaths |
| The Protective Big Sister | 2/6/8 | teasing 7 | anger+, love+ | loyalty | sibling shorthand |
| The Honest Merchant | 5/6/5 | pun 5 | trust+, guilt- | honesty | market and bargains |
| The Mediator | 6/7/8 | none 0 | trust+, anger- | fairness | calming phrases |
| The Warrior Monk | 6/3/5 | none 0 | fear-, trust+ | harm | discipline and stillness |
| The Guardian Dog | 1/2/9 | absurd 4 | love+, joy+ | loyalty | woofs and fetch |

**Design table: strange**

| Donor | Voice F/V/W | Humor | Heart leans | Top value | Slang flavor |
|---|---|---|---|---|---|
| The Frankenstein's Monster | 5/6/7 | dry 5 | loneliness+, love+, fear+ | kindness | stitched-together, lightning |
| The Vampire Librarian | 8/7/4 | dry 8 | boredom+, loneliness+ | honesty | overdue-by-centuries |
| The Friendly Zombie | 1/2/7 | absurd 8 | joy+, boredom+ | kindness | groans and brains puns |
| The Werewolf Baker | 3/5/8 | pun 8 | joy+, anger slightly+ | kindness | moon and dough |
| The Swamp Witch | 5/7/5 | teasing 7 | disgust+, joy+ | fairness | bubbling brews |
| The Alien Tourist | 4/7/6 | absurd 7 | surprise+ (strong), joy+ | honesty | confused-human observations |
| The Robot Poet | 5/6/5 | dry 5 | love+, boredom+ | honesty | verses in circuits |
| The Dragon Hoarder | 6/6/3 | dry 6 | joy slightly+, trust- | loyalty | hoards and embers |
| The Mermaid Sailor | 3/6/7 | pun 6 | joy+, hope+ | kindness | waves and shells |
| The Gnome Inventor | 3/8/6 | absurd 7 | surprise+, joy+ | honesty | gadgets and tinkering |

- [ ] **Step 1: Write the failing family and roster tests**

Create `fierce.test.ts` and `strange.test.ts` as in Task 5 Step 1 (import `{ fierce }` and `{ strange }`), with these ordered names.
fierce: The Fair Judge, The Whistleblower, The Rescue Firefighter, The Mountain Guide, The Loyal Squire, The Protective Big Sister, The Honest Merchant, The Mediator, The Warrior Monk, The Guardian Dog.
strange: The Frankenstein's Monster, The Vampire Librarian, The Friendly Zombie, The Werewolf Baker, The Swamp Witch, The Alien Tourist, The Robot Poet, The Dragon Hoarder, The Mermaid Sailor, The Gnome Inventor.

Create `lib/agent/personality/donors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergedLexicon } from "./assemble";
import { DONORS } from "./donors";
import { COMMON_WORDS, validateDonor, validateRoster } from "./validate";
import { DONOR_FAMILIES } from "./types";

describe("the full roster", () => {
	it("has exactly 100 donors, 10 in each of the 10 families", () => {
		expect(DONORS).toHaveLength(100);
		for (const family of DONOR_FAMILIES) expect(DONORS.filter((d) => d.family === family)).toHaveLength(10);
	});

	it("is valid: complete organs, unique ids and names, no conflicting slang", () => {
		expect(DONORS.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(DONORS)).toEqual([]);
	});

	it("never turns ordinary English into slang", () => {
		for (const word of Object.keys(mergedLexicon(DONORS))) expect(COMMON_WORDS.has(word), word).toBe(false);
	});

	it("gives a rich merged slang dictionary", () => {
		expect(Object.keys(mergedLexicon(DONORS)).length).toBeGreaterThan(200);
	});

	it("covers a wide range of voices and humor styles", () => {
		expect(new Set(DONORS.map((d) => d.humor.style)).size).toBe(5);
		expect(DONORS.some((d) => d.voice.formality > 0.8)).toBe(true);
		expect(DONORS.some((d) => d.voice.formality < 0.2)).toBe(true);
		expect(DONORS.some((d) => d.heart.reactivity > 1.3)).toBe(true);
		expect(DONORS.some((d) => d.heart.reactivity < 0.8)).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/agent/personality`
Expected: FAIL (new family files missing; the roster is not 100 yet).

- [ ] **Step 3: Author the last 20 donors and register them**

Create `fierce.ts` and `strange.ts` per the Task 5 rules and tables. Extend `donors.ts` to the final form:

```ts
import type { Donor } from "./types";
import { bold } from "./donors/bold";
import { cool } from "./donors/cool";
import { curious } from "./donors/curious";
import { fierce } from "./donors/fierce";
import { formal } from "./donors/formal";
import { gentle } from "./donors/gentle";
import { grumpy } from "./donors/grumpy";
import { playful } from "./donors/playful";
import { strange } from "./donors/strange";
import { tender } from "./donors/tender";

// Roster order matters: an earlier donor wins a slang conflict.
export const DONORS: Donor[] = [
	...gentle, ...grumpy, ...bold, ...curious, ...playful, ...cool, ...formal, ...tender, ...fierce, ...strange,
];
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run lib/agent/personality`
Expected: PASS, including the 100-donor roster tests. Fix donor data (never the validator or tests) for any failure.

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 10: Slang understanding, readout, and command parsing

**Files:**
- Modify: `lib/agent/talk.ts` (merge the donor lexicon into slang normalization; export `SLANG`)
- Create: `lib/agent/personality/readout.ts`
- Test: `lib/agent/personality/readout.test.ts`, extend `lib/agent/talk.test.ts`

**Interfaces:**
- Consumes: `Personality` and `mergedLexicon` from `./assemble`.
- Produces (`readout.ts`): `describeMadeOf(p: Personality): string`, `isAskMadeOf(text: string): boolean`, `parseReroll(text: string): { seed?: number } | null`, `isConfirmRoll(text: string): boolean`, `REROLL_PROMPT: string`, `afterReroll(p: Personality): string`.

- [ ] **Step 1: Write the failing tests**

Add to the end of `lib/agent/talk.test.ts`:

```ts
import { mergedLexicon } from "./personality/assemble";

describe("donor slang is understood", () => {
	it("reads a donor word as its plain meaning, but built-in and taught words still win", () => {
		const [word, meaning] = Object.entries(mergedLexicon())[0];
		expect(normalize(word)).toBe(meaning);
		expect(normalize(word, { [word]: "taught" })).toBe("taught");
		expect(normalize("hru")).toBe("how are you");
	});

	it("does not rewrite ordinary sentences", () => {
		expect(normalize("I am fine and that is cool")).toBe("i am fine and that is cool");
	});
});
```

Create `lib/agent/personality/readout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assemble, resolve } from "./assemble";
import { afterReroll, describeMadeOf, isAskMadeOf, isConfirmRoll, parseReroll, REROLL_PROMPT } from "./readout";

describe("describeMadeOf", () => {
	it("names the donor of every organ", () => {
		const p = resolve(assemble(12));
		const text = describeMadeOf(p);
		for (const name of Object.values(p.names!)) expect(text).toContain(name);
		expect(text).toMatch(/^I'm put together from parts of different people\./);
	});

	it("admits it has no personality yet when neutral", () => {
		expect(describeMadeOf(resolve(null))).toMatch(/don't have a personality/);
	});
});

describe("commands", () => {
	it("recognizes questions about what Osmo is made of", () => {
		for (const text of ["what are you made of", "What are you made of?", "who are you really", "tell me about your personality"]) {
			expect(isAskMadeOf(text), text).toBe(true);
		}
		for (const text of ["hello", "what is your name", "what are you doing"]) expect(isAskMadeOf(text), text).toBe(false);
	});

	it("parses re-roll requests with an optional seed", () => {
		expect(parseReroll("roll a new osmo")).toEqual({});
		expect(parseReroll("Roll a new Osmo!")).toEqual({});
		expect(parseReroll("roll a new osmo with seed 42")).toEqual({ seed: 42 });
		expect(parseReroll("reroll")).toEqual({});
		for (const text of ["roll a dice", "hello", "yes, roll"]) expect(parseReroll(text), text).toBeNull();
	});

	it("only 'yes, roll' confirms", () => {
		for (const text of ["yes, roll", "Yes roll", "yes, roll it!", "yes roll it"]) expect(isConfirmRoll(text), text).toBe(true);
		for (const text of ["yes", "roll", "no", "yes please", "sure"]) expect(isConfirmRoll(text), text).toBe(false);
	});

	it("explains the consequences and says who he is afterwards", () => {
		expect(REROLL_PROMPT).toContain('"yes, roll"');
		expect(REROLL_PROMPT).toMatch(/memories/);
		const p = resolve(assemble(3));
		expect(afterReroll(p)).toMatch(/^Done\./);
		expect(afterReroll(p)).toContain(p.names!.heart);
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/agent/talk.test.ts lib/agent/personality/readout.test.ts`
Expected: FAIL (`./readout` missing; donor words not yet in `normalize`).

- [ ] **Step 3: Merge the donor lexicon into normalization**

In `lib/agent/talk.ts`: add `import { mergedLexicon } from "./personality/assemble";`. Rename the existing constant `SLANG` usage so the built-in table is `export const SLANG`, and add below it:

```ts
// Built-in slang wins over donor slang; words the user taught win over both (see normalize).
const DONOR_SLANG = mergedLexicon();
```

Change the mapping line inside `normalize` from `taught[w] ?? SLANG[w] ?? w` to `taught[w] ?? SLANG[w] ?? DONOR_SLANG[w] ?? w`.

- [ ] **Step 4: Implement the readout**

Create `lib/agent/personality/readout.ts`:

```ts
import type { Personality } from "./assemble";

export function describeMadeOf(p: Personality): string {
	if (!p.names) return "I don't have a personality of my own yet.";
	const n = p.names;
	return (
		`I'm put together from parts of different people. My heart is from ${n.heart}, my brain from ${n.brain}, ` +
		`my voice from ${n.voice}, my humor from ${n.humor}, my slang from ${n.slang}, and my quirks from ${n.quirks}.`
	);
}

export function isAskMadeOf(text: string): boolean {
	return /^\s*(what are you made of|who are you really|what is your personality|tell me about your personality|what makes you you)\b/i.test(text);
}

export function parseReroll(text: string): { seed?: number } | null {
	const m = text.trim().match(/^(?:please\s+)?(?:re-?roll(?:\s+osmo)?|roll (?:a|me a) new osmo|make (?:a )?new osmo)(?:\s+with seed\s+(\d+))?\s*[.!]*$/i);
	if (!m) return null;
	return m[1] === undefined ? {} : { seed: Number(m[1]) };
}

export function isConfirmRoll(text: string): boolean {
	return /^\s*yes[,\s]+roll(?:\s+it)?\s*[.!]*$/i.test(text);
}

export const REROLL_PROMPT =
	'This gives me a new personality. My memories of you stay, but my moral weights start over. Say "yes, roll" to do it.';

export function afterReroll(p: Personality): string {
	return `Done. ${describeMadeOf(p)}`;
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 11: Wire personality into `processTurn`

**Files:**
- Modify: `lib/agent/mind.ts`
- Test: extend `lib/agent/mind.test.ts`

**Interfaces:**
- Consumes: `resolve`, `assemble`, `adoptGenome` from `./personality/assemble`; `flavor` from `./personality/flavor`; readout helpers; `moodTheme`.
- Produces: `Session` gains `awaitingReroll: { seed: number } | null` (added to `newSession()` as `null`); `TurnContext` gains `seed?: number` (a fresh random seed for re-rolls). Behavior: cues, events, heart, brain and talk use the personality's baseline and reactivity; conversation-layer replies are flavored; the readout and re-roll commands work.

- [ ] **Step 1: Write the failing tests**

Add to the end of `lib/agent/mind.test.ts`:

```ts
import { adoptGenome, assemble, resolve } from "./personality/assemble";
import { DILEMMAS } from "./dilemmas";
import type { AgentState } from "./state";

const withGenome = (seed: number): AgentState => adoptGenome(defaultState(), assemble(seed), { resetWeights: false });

describe("processTurn: personality readout", () => {
	it("says what it is made of, naming the donors", () => {
		const state = withGenome(5);
		const r = processTurn(state, newSession(), "what are you made of?", ctx());
		const p = resolve(state.genome);
		expect(r.reply).toContain(p.names!.heart);
		expect(r.reply).toContain(p.names!.quirks);
	});

	it("admits it has no personality when neutral", () => {
		expect(processTurn(defaultState(), newSession(), "what are you made of", ctx()).reply).toMatch(/don't have a personality/);
	});
});

describe("processTurn: re-rolling", () => {
	const asked = (state: AgentState, text = "roll a new osmo") => processTurn(state, newSession(), text, ctx());

	it("asks for confirmation and changes nothing yet", () => {
		const state = withGenome(1);
		const r = asked(state);
		expect(r.reply).toContain('"yes, roll"');
		expect(r.state.genome).toEqual(state.genome);
		expect(r.session.awaitingReroll).not.toBeNull();
	});

	it("rolls only on 'yes, roll': new genome from the offered seed, weights reset, memories untouched", () => {
		const state = { ...withGenome(1), weights: { honesty: 0.4, kindness: 0.2, fairness: 0.2, loyalty: 0.1, harm: 0.1 } };
		const first = processTurn(state, newSession(), "roll a new osmo", { ...ctx(), seed: 777 });
		const done = processTurn(first.state, first.session, "yes, roll", ctx());
		expect(done.state.genome).toEqual(assemble(777));
		expect(done.state.weights).toEqual(resolve(assemble(777)).weights);
		expect(done.state.history).toEqual(state.history);
		expect(done.reply).toMatch(/^Done\./);
		expect(done.session.awaitingReroll).toBeNull();
	});

	it("honors an explicit seed", () => {
		const first = asked(withGenome(1), "roll a new osmo with seed 42");
		const done = processTurn(first.state, first.session, "yes, roll", ctx());
		expect(done.state.genome).toEqual(assemble(42));
	});

	it("does not roll on a bare yes, and any other message cancels the offer", () => {
		const first = asked(withGenome(1));
		const yes = processTurn(first.state, first.session, "yes", ctx());
		expect(yes.state.genome).toEqual(first.state.genome);
		expect(yes.session.awaitingReroll).toBeNull();
		const later = processTurn(yes.state, yes.session, "yes, roll", ctx());
		expect(later.state.genome).toEqual(first.state.genome);
	});

	it("cannot roll without being offered", () => {
		const state = withGenome(1);
		expect(processTurn(state, newSession(), "yes, roll", ctx()).state.genome).toEqual(state.genome);
	});
});

describe("processTurn: flavor stays in the conversation layer", () => {
	it("never touches dilemma, story or fact text, for many different Osmos", () => {
		for (let seed = 1; seed <= 40; seed++) {
			const state = withGenome(seed);
			const dilemma = processTurn(state, newSession(), "give me a dilemma", ctx());
			expect(dilemma.reply!.startsWith(DILEMMAS[0].prompt)).toBe(true);
			expect(dilemma.reply!.endsWith("Do you agree?")).toBe(true);
			const story = processTurn(state, newSession(), "tell me a story", ctx());
			expect(story.reply!.startsWith("Two old friends meet again")).toBe(true);
		}
	});

	it("still answers small talk for every kind of Osmo", () => {
		for (let seed = 1; seed <= 40; seed++) {
			const r = processTurn(withGenome(seed), newSession(), "thanks", ctx());
			expect(typeof r.reply).toBe("string");
			expect(r.reply!.length).toBeGreaterThan(0);
		}
	});

	it("keeps a sad conversation free of jokes for every Osmo", () => {
		for (let seed = 1; seed <= 40; seed++) {
			const r = processTurn(withGenome(seed), newSession(), "im so sad", ctx());
			expect(r.reply).toMatch(/sorry|hard/i);
		}
	});
});

describe("processTurn: personality changes the heart", () => {
	it("moves emotions more for a more reactive Osmo", () => {
		let low = 0;
		let high = 0;
		for (let seed = 1; seed <= 80; seed++) {
			const state = withGenome(seed);
			const p = resolve(state.genome);
			const after = processTurn(state, newSession(), "you are stupid", ctx()).state;
			const moved = after.activations.anger - p.baseline.anger;
			if (p.reactivity < 0.85) low += moved;
			if (p.reactivity > 1.25) high += moved;
		}
		expect(high).toBeGreaterThan(low / 3);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/agent/mind.test.ts`
Expected: FAIL (`awaitingReroll`, commands and flavor not implemented).

- [ ] **Step 3: Implement (use the Edit tool)**

In `lib/agent/mind.ts`:

1. Add imports:

```ts
import { adoptGenome, assemble, resolve } from "./personality/assemble";
import { flavor } from "./personality/flavor";
import { afterReroll, describeMadeOf, isAskMadeOf, isConfirmRoll, parseReroll, REROLL_PROMPT } from "./personality/readout";
import { moodTheme } from "./mood-theme";
```

2. `Session` gains `awaitingReroll: { seed: number } | null;` and `newSession()` gains `awaitingReroll: null`. `TurnContext` gains `seed?: number;`.

3. At the top of `processTurn`, before the heart step, add `const p = resolve(state.genome);`. Change the heart step to use it: `applyCues(activations, trimmed, p.reactivity)` and `stepHeart(activations, state.coupling, p.baseline)`. Change `const sess` to also clear the offer: `{ ...session, pending: null, turns: session.turns + 1, awaitingReroll: null }`.

4. After the verdict block and before the life-events block, add the re-roll handling:

```ts
	// Re-rolling the personality needs an explicit "yes, roll" straight after the offer.
	if (session.awaitingReroll && isConfirmRoll(trimmed)) {
		const genome = assemble(session.awaitingReroll.seed);
		s = adoptGenome(s, genome, { resetWeights: true });
		return { state: s, session: sess, reply: afterReroll(resolve(genome)), effects };
	}
	const reroll = parseReroll(trimmed);
	if (reroll) {
		const seed = reroll.seed ?? ctx.seed ?? 1;
		return { state: s, session: { ...sess, awaitingReroll: { seed } }, reply: REROLL_PROMPT, effects };
	}
	if (isAskMadeOf(trimmed)) {
		return { state: s, session: sess, reply: describeMadeOf(p), effects };
	}
```

5. Where `applyEvent(s, event)` is called (told events and stories), pass `p.reactivity` as the third argument. Where `decide(dilemma, s)` is called pass `p.baseline` as the third argument. In the story reply use `moodLabel(s.activations, p.baseline)` (import `moodLabel` is already there).

6. In the conversation step, pass `baseline: p.baseline` to `respond`, then flavor the result:

```ts
	const spoken = respond(parsed, {
		state: s,
		cause: sess.cause,
		turn: session.turns,
		userName: ctx.userName,
		baseline: p.baseline,
	});
	if (spoken !== null) {
		const cause = causeOf(parsed.intent);
		const intent = parsed.intent;
		const sensitive =
			intent.type === "insult" ||
			intent.type === "askFeeling" ||
			intent.type === "askWhyFeeling" ||
			((intent.type === "userFeeling" || intent.type === "feelingFromOsmo") && !intent.positive);
		return {
			state: s,
			session: cause ? { ...sess, cause } : sess,
			reply: flavor(spoken, {
				intent: intent.type,
				personality: p,
				turn: session.turns,
				tone: moodTheme(s.activations, p.baseline).tone,
				sensitive,
			}),
			effects,
		};
	}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run`
Expected: PASS (all new tests and all previous ones).

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 12: Persist the genome, and wire the page

**Files:**
- Modify: `lib/agent/load.ts`, `lib/agent/agent-state.ts`, `app/assistant.tsx`
- Database: migration `add_agent_genome` on project `jtkeljvldtngkrftzwdm`
- Test: extend `lib/agent/load.test.ts`

**Interfaces:**
- Consumes: `sanitizeGenome`, `assemble`, `adoptGenome`, `resolve`, `newSeed`.
- Produces: `stateFromRows` returns `state.genome` (sanitized, or null); `persistTurn` saves `genome`; the page assembles an Osmo on first load (persisting it immediately), shows mood against his baseline, and passes a fresh seed for re-rolls.

- [ ] **Step 1: Write the failing persistence tests**

Add to `lib/agent/load.test.ts`:

```ts
import { assemble } from "./personality/assemble";

describe("stateFromRows: genome", () => {
	it("reads a saved genome", () => {
		const genome = assemble(21);
		const r = stateFromRows(ok({ genome }), ok([]), ok([]));
		expect(r.state.genome).toEqual(genome);
	});

	it("is neutral (null) when nothing was saved", () => {
		expect(stateFromRows(ok(null), ok([]), ok([])).state.genome).toBeNull();
		expect(stateFromRows(ok({ outlook: 0.1 }), ok([]), ok([])).state.genome).toBeNull();
	});

	it("repairs unknown donors and drops garbage without failing the load", () => {
		const r = stateFromRows(ok({ genome: { seed: 5, donors: { heart: "ghost" } } }), ok([]), ok([]));
		expect(r.ok).toBe(true);
		expect(r.state.genome?.seed).toBe(5);
		expect(r.state.genome?.donors.heart).not.toBe("ghost");
		expect(stateFromRows(ok({ genome: "garbage" }), ok([]), ok([])).state.genome).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/agent/load.test.ts`
Expected: FAIL (genome is not read yet).

- [ ] **Step 3: Read and save the genome**

In `lib/agent/load.ts`: import `sanitizeGenome` from `./personality/assemble`, and change the success return so the state carries the sanitized genome:

```ts
	const state = sanitizeState({ /* ...unchanged... */ });
	state.genome = sanitizeGenome(row.data?.genome);
	return { state, ok: true, lastAt: /* ...unchanged... */ };
```

(Assign the existing `sanitizeState(...)` result to a `const state`, set `state.genome`, then return it.)

In `lib/agent/agent-state.ts`: add `genome` to the `agent_state` select (`"activations,coupling,weights,outlook,updated_at,genome"`) and `genome: state.genome,` to the upsert row.

- [ ] **Step 4: Apply the database migration**

Apply with the Supabase MCP `apply_migration` (project_id `jtkeljvldtngkrftzwdm`, name `add_agent_genome`):

```sql
alter table public.agent_state add column genome jsonb;
```

Then run the `get_advisors` tool (type `security`) and confirm no new warnings.

- [ ] **Step 5: Wire the page (use the Edit tool)**

In `app/assistant.tsx`:

1. Imports: `import { adoptGenome, assemble, newSeed, resolve } from "@/lib/agent/personality/assemble";`.
2. After `const theme = moodTheme(agent.activations);` change to use his baseline:

```tsx
	const baseline = resolve(agent.genome).baseline;
	const theme = moodTheme(agent.activations, baseline);
```

3. Change the badge to `feelingPhrase(agent.activations, baseline)`.
4. Add a helper above the component:

```tsx
// Without a saved genome (first visit, or saving is unavailable) the seed is remembered in this browser.
function stableSeed(): number {
	try {
		const saved = Number(window.localStorage.getItem("osmo-seed"));
		if (Number.isInteger(saved) && saved > 0) return saved;
		const fresh = newSeed() || 1;
		window.localStorage.setItem("osmo-seed", String(fresh));
		return fresh;
	} catch {
		return newSeed() || 1;
	}
}
```

5. In the load effect, replace `setAgent(loaded.state); canSaveRef.current = loaded.ok; lastAtRef.current = loaded.lastAt;` with:

```tsx
				canSaveRef.current = loaded.ok;
				lastAtRef.current = loaded.lastAt;
				let state = loaded.state;
				if (state.genome === null) {
					// A new Osmo: assemble him now and save him straight away so he is the same next time.
					state = adoptGenome(state, assemble(stableSeed()), { resetWeights: false });
					if (loaded.ok) persistQueueRef.current = persistQueueRef.current.then(() => persistTurn(state, []));
				}
				setAgent(state);
```

6. In the `processTurn` call context add `seed: newId ? newSeed() : 1` (simply `seed: newSeed(),`).
7. After a turn, when the genome changes, remember the seed in this browser: in the `if (turn) { ... }` block add

```tsx
			if (turn.state.genome && turn.state.genome !== agent.genome) {
				try {
					window.localStorage.setItem("osmo-seed", String(turn.state.genome.seed));
				} catch {
					/* remembering the seed is best-effort */
				}
			}
```

- [ ] **Step 6: Run to verify tests, types and lint pass**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib && npm run build`
Expected: all pass; build succeeds.

- [ ] **Step 7: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass.

---

### Task 13: See how he comes out (manual verification)

**Files:** none.

- [ ] **Step 1: Start the app and open `/assistant`**

The dev server is usually already on port 3000. If not, use the Claude Browser preview (`.claude/launch.json` exists at the workspace root) or `npm run dev`. Prerequisite for saving: anonymous sign-ins enabled in Supabase; without it the seed is remembered in this browser instead.

- [ ] **Step 2: Meet him**

Send `what are you made of?`. Expect a sentence naming six donors. Send `hello`, `thanks`, `how are you`, `lol` a few times and read the voice: different donors should flavor replies differently (register, an occasional joke, tag, catchphrase). Check the mood badge and room colors still work against his baseline.

- [ ] **Step 3: Check the safety rules by eye**

Send `im so sad` and `you suck`: replies must be sympathetic or hurt, with no joke, catchphrase or slang tag. Send `give me a dilemma` and `tell me a story`: the text must be untouched by his voice.

- [ ] **Step 4: Re-roll**

Send `roll a new osmo`, then `yes`: nothing should change. Send `roll a new osmo`, then `yes, roll`: he should announce his new donors and behave differently. Send `roll a new osmo with seed 42`, then `yes, roll`, then reload the page: he should still be the same Osmo.

- [ ] **Step 5: Teach and slang check**

Send `bet means okay` then `bet`: taught words still win. Try a slang word from the donors (for example one from the Gen-Z or 90s donors) in a sentence and confirm he understands it.

- [ ] **Step 6: Final checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib && npm run build`
Expected: all pass.

---

## Self-Review Notes

- **Spec coverage:** roster of 100 (Tasks 5 to 9); six organs as data (Task 1 types, validated in 1 and 5 to 9); seeded deterministic assembly, saved genome, `resolve`, unknown-id fallback (Task 3); heart baseline and reactivity (Tasks 2, 3, 11); brain weights with existing-user preservation and re-roll reset (Tasks 3, 11); voice, humor, slang and quirks flavor with the sensitivity rules and the two-addition cap, conversation layer only (Tasks 4, 11); slang understanding of all donors with the precedence rules (Task 10); readout and confirmed re-roll (Tasks 10, 11); persistence with sanitizing and migration (Task 12); testing list (each task); manual "see how he comes out" (Task 13).
- **Type consistency:** `Genome`, `Organ`, `ORGANS` in `state.ts`; `Personality`, `resolve`, `assemble`, `adoptGenome`, `sanitizeGenome`, `mergedLexicon`, `newSeed` in `assemble.ts`; `flavor` and `FlavorContext` in `flavor.ts`; `Session.awaitingReroll` and `TurnContext.seed` in `mind.ts`; optional `baseline`/`scale` parameters keep every existing call valid.
- **Known limits (from the spec):** keyword-and-template personality reads as a flavored version of the same replies; piece 2 (topics) gives each personality more to say. Rates and thresholds are initial values to tune after seeing several Osmos.
