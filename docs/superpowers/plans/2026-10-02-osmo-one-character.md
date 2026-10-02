# Osmo as One Character Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks are grouped by lane and must land in the order M1, L1 to L3, M2 to M5, M6.

**Goal:** Replace the 100-donor personality roll with one hand-written JARVIS-register character in `lib/agent/character.ts`, and delete the roll, the donors, the "made of" answer and the Insights donors view.

**Architecture:** `CHARACTER` is a constant that `flavor.ts`, `mind.ts`, `agent-state.ts` and the room read where `resolve(state.genome)` was read. Language first makes the chat route, prompt and `talk.ts` work without a genome (tolerating one that is still there); then main deletes the roll in one green commit. The `agent_state.genome` column stays (unread, unwritten); dropping it is a later migration and is NOT in this plan.

**Tech Stack:** Next.js + TypeScript, vitest (`lib/**/*.test.ts`), branch `main`, repo `C:\Users\Gurra\GroupProject\my-app`.

**Spec:** `docs/superpowers/specs/2026-10-02-osmo-one-character-design.md` (cited as "spec §n"). Lanes: `brain/lanes.md`.

## Global Constraints

- Before any task read `brain/` (`README.md`, `lanes.md`, the top of every desk). Put files under Now on your own desk before editing and under Just landed after; then `git -C brain push origin brain`.
- Stage by path only, never `git add -A` or `git add .`. Only main pushes `main`, and only with Gur's OK. This plan pushes nothing.
- Every commit is green: `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`. Every commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Osmo's voice (lanes.md): professional and speakable, no slang, emoji, brackets or symbols, never mirrors Gur's grammar. All character text is original (spec §1).
- `state.ts` must not import `character.ts` (character imports state; no cycle). `defaultState()` keeps `BASELINE`; the heart relaxes toward `CHARACTER.baseline` at 5% per message (spec §9).
- Do not edit another lane's files except where a task says so. Commit (c) touches language's `chatlog.test.ts` and `branch.test.ts` and needs language's written OK on its desk first (M5 step 1).
- Baseline before M1 is green (`lib/agent`: 46 files, 481 tests, run 2026-10-02).

## Verification findings (greps and runs done while writing this plan)

Confirmed: `COMMON_WORDS` is imported only by `validate.ts`, `validate.test.ts`, `donors.test.ts` (all deleted). `GUEST_NO_CHANGES` is used only by `mind.ts`, `mind-guest.test.ts`, `mind-prepare.test.ts`. `resolve`/`Personality` from assemble are imported only by `assistant.tsx`, `insights-panel.tsx`, `agent-state.ts`, `mind.ts`, `flavor.ts`, `flavor.test.ts`, `readout.ts`, `lib/shell/story.ts`, `mind.test.ts`, `mind-prepare.test.ts` (plus tests of deleted files). `mergedLexicon` importers: `talk.ts`, `dictionary.ts`, `slang.test.ts`, `talk.test.ts` (line 331, which the spec missed). `fixtures.ts` is used only by `assemble.test.ts` and `validate.test.ts`. `variety.test.ts` has no donor dependence (its "yes, roll" is a plain string): leave it.

**Where the spec is contradicted or incomplete:**
1. `mergedLexicon()` has **558** words (many invented, such as "dearlie"), not "about 70". L1 writes all 558.
2. `params.test.ts` does not test donors: it tests heart functions with a custom baseline and reactivity scale and imports no personality code. It stays untouched; the spec's "rewritten as `character.test.ts`" is dropped, and M1 adds `character.test.ts` as a new file.
3. An always-on character (formality 0.8) expands contractions in every default-state reply, which today's "neutral Osmo" never got. Unlisted tests that break (confirmed by running a throwaway copy with the new numbers): `chatlog.test.ts` "sets a boundary on sexual messages" (`/won't engage/`), `lexicon/feelings.test.ts` line 35, `mind.test.ts` line 44, `branch.test.ts` lines 307 and 315, and 8 tests in `flavor.test.ts`. L2 and L3 make the language-lane ones tolerant first so commit (c) stays small.
4. `mind.test.ts` "personality changes the heart" cannot survive with one reactivity; M3 replaces it.
5. `askName` replies are pinned by `askedForName`/`nameAnswer` (context.test, branch.test), and aliasing "what are you made of" to `askName` would answer "What should I call you?". So the family is aliased to the existing `askOrigin` intent, whose reply is rewritten.
6. No `agent-state.test.ts` exists, so "payload has no genome key" is a grep in M3, not a test.
7. The current `askOrigin` reply calls him "a conversational assistant"; spec §2.6 forbids "assistant". L3 rewrites it.
8. `assistant.tsx` also writes `osmo-seed` inside `applyTurn` (about lines 483 to 488), not only in the load effect.
9. Donor slang is dropped entirely (Gur, 2026-10-02), so `character.test.ts` needs no slang check.

## Review Focus

1. An old browser tab still sends `persona.genome`: the route accepts it, ignores it, and no donor text reaches the prompt (L2 tests).
2. A saved `agent_state` row with a genome loads normally with no genome on the state, and a save never writes `genome` (M3).
3. A user who knows the old commands: "roll a new osmo" (Gur or guest) gets the one fixed line with no state change, and a later "yes, roll" is ordinary talk (M3, M5).
4. "what are you made of" and its four siblings get the origin reply, not an "unknown topic" loop and not a donor (L3).
5. The dry line never appears on a heavy turn or below friend, and appears on roughly one light friend turn in ten (M2).

---

## Main lane, commit (a)

### Task M1: `character.ts` and its test (additive; nothing reads it yet)

**Files:**
- Create: `lib/agent/character.ts`, `lib/agent/character.test.ts`

**Interfaces:**
- Produces: `type Character`, `CHARACTER`, `characterLines(): string[]`, `isAskNewOsmo(text: string): boolean`, `NEW_OSMO_REPLY: string`. Field names match what `flavorTurn` reads from `Personality` today (`voice.formality`, `voice.verbosity`, `humor.style/level/lines`). Fields are plain mutable data (M3's reactivity test sets one temporarily).

- [ ] **Step 1: Write the failing test** (`lib/agent/character.test.ts`; spec §2.2 to 2.4, §2.8, §10)

```ts
import { describe, expect, it } from "vitest";
import { speakable } from "../chat/speakable";
import { CHARACTER, characterLines, isAskNewOsmo, NEW_OSMO_REPLY } from "./character";
import { moodPosition } from "./heart";
import { EMOTIONS, VALUES } from "./state";

const PET = /\b(sir|madam|boss|buddy|mate|dude|champ|squirt|kiddo|sweetheart|darling|dear)\b/i;
const { openers } = CHARACTER.voice;
const { lines } = CHARACTER.humor;
const { phrases } = CHARACTER.quirks;

describe("CHARACTER sheet", () => {
	it("has the sheet's counts and sizes", () => {
		expect(openers.length).toBeGreaterThanOrEqual(8);
		expect(openers.length).toBeLessThanOrEqual(10);
		expect(lines.length).toBeGreaterThanOrEqual(10);
		expect(lines.length).toBeLessThanOrEqual(12);
		expect(phrases.length).toBeGreaterThanOrEqual(6);
		expect(phrases.length).toBeLessThanOrEqual(8);
		for (const o of openers) expect(o.length, o).toBeLessThanOrEqual(30);
		for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(120);
	});

	it("is speakable, capitalised and stopped, with no apostrophe, exclamation or pet name", () => {
		for (const line of [...openers, ...lines, ...phrases, ...characterLines(), NEW_OSMO_REPLY]) {
			expect(speakable(line), line).toBe(line);
			expect(line, line).toMatch(/^[A-Z]/);
			expect(line, line).toMatch(/[.?]$/);
			expect(line, line).not.toMatch(/['’!]/);
			expect(line, line).not.toMatch(PET);
		}
	});

	it("rests where spec 2.8 says", () => {
		for (const e of EMOTIONS) {
			expect(CHARACTER.baseline[e], e).toBeGreaterThanOrEqual(0.05);
			expect(CHARACTER.baseline[e], e).toBeLessThanOrEqual(0.85);
		}
		expect(CHARACTER.reactivity).toBe(0.75);
		expect(CHARACTER.voice.formality).toBe(0.8);
		const [v, a, d] = moodPosition(CHARACTER.baseline);
		expect(v).toBeCloseTo(0.304, 2);
		expect(a).toBeCloseTo(0.142, 2);
		expect(d).toBeCloseTo(0.126, 2);
		expect(VALUES.reduce((sum, k) => sum + CHARACTER.weights[k], 0)).toBeCloseTo(1, 5);
	});
});

describe("isAskNewOsmo", () => {
	it("catches the old commands and nothing else", () => {
		for (const t of ["roll a new osmo", "Roll me a new Osmo.", "re-roll", "reroll osmo", "make new osmo", "please roll a new osmo with seed 42"]) {
			expect(isAskNewOsmo(t), t).toBe(true);
		}
		for (const t of ["yes, roll", "roll the dice", "I want a new job", "tell me about osmo"]) expect(isAskNewOsmo(t), t).toBe(false);
	});
});
```

- [ ] **Step 2:** Run `npx vitest run lib/agent/character.test.ts`. Expected: FAIL, `./character` not found.

- [ ] **Step 3: Write `lib/agent/character.ts`**

```ts
import { DEFAULT_WEIGHTS, type Activations, type Weights } from "./state";

// Osmo's one character (spec 2): composed, precise, understated, dry in rare light moments. Plain data, no donors.
export type Character = {
	seed: number; // a constant, so the rolls in flavorTurn stay deterministic
	baseline: Activations;
	reactivity: number;
	weights: Weights; // for a new Osmo only; a saved Osmo keeps what he learned
	voice: { formality: number; verbosity: number; warmth: number; openers: string[]; elaboration: string };
	humor: { style: "dry"; level: number; lines: string[] };
	quirks: { phrases: string[]; rate: number };
};

export const CHARACTER: Character = {
	seed: 1,
	baseline: { joy: 0.5, sadness: 0.1, anger: 0.05, fear: 0.08, trust: 0.65, disgust: 0.08, surprise: 0.12, love: 0.2, hope: 0.45, guilt: 0.08, loneliness: 0.12, boredom: 0.1 },
	reactivity: 0.75,
	weights: { ...DEFAULT_WEIGHTS },
	voice: {
		formality: 0.8,
		verbosity: 0.45,
		warmth: 0.5,
		openers: ["Good to hear from you.", "Of course.", "Understood.", "Certainly.", "Right away.", "A fair question.", "Let me think.", "I see.", "Good point."],
		elaboration: "",
	},
	humor: {
		style: "dry",
		level: 0.2,
		lines: [
			"I have no hands, which makes me an excellent listener and a poor cook.",
			"My schedule is remarkably clear. I assure you that is by design.",
			"I would offer you coffee, but my hardware makes that complicated.",
			"I have a great deal of patience and very little to spend it on.",
			"Efficiency is my one vice.",
			"I do enjoy a well organized problem.",
			"If I were any calmer, someone would check on me.",
			"I considered a dramatic pause, but it seemed excessive.",
			"I am fond of problems that have answers.",
			"The universe is large and my list of tasks is short. I consider that a fair trade.",
			"Understatement is a skill, and I practice it constantly.",
		],
	},
	quirks: {
		phrases: ["Let us see what the facts say.", "I will keep it brief.", "The short version is this.", "That much I can say with confidence.", "On balance, yes.", "I will not pretend otherwise.", "Here is what I can tell you.", "Shall we begin?"],
		rate: 0.12,
	},
};

// The three lines of the Insights "Who I am" section (spec 8).
export function characterLines(): string[] {
	return ["I am Osmo, one character: composed, precise and a little dry.", "I keep my warmth quiet and my sentences short.", "I do not use slang, and I will not copy yours."];
}

// The old "roll a new osmo" commands, kept as one detector so a user who knows them is not dropped into small talk (spec 7).
export function isAskNewOsmo(text: string): boolean {
	return /^\s*(?:please\s+)?(?:re-?roll(?:\s+osmo)?|roll (?:a|me a) new osmo|make (?:a )?new osmo)(?:\s+with seed\s+\d+)?\s*[.!]*$/i.test(text);
}

export const NEW_OSMO_REPLY = "There is only one of me now. If something about how I speak bothers you, tell me.";
```

- [ ] **Step 4:** Run `npx vitest run lib/agent/character.test.ts`. Expected: PASS. A failing mood number means a baseline value is mistyped (compare with spec §2.8).
- [ ] **Step 5:** `npx tsc --noEmit -p .` and `npm run lint` clean. Commit:

```bash
git add lib/agent/character.ts lib/agent/character.test.ts
git commit -m "feat(agent): add Osmo's one character (nothing reads it yet)"
```

---

## Language lane, commit (b): three tasks, each its own green commit

### Task L1: the donor slang goes with the donors (Gur, 2026-10-02: drop it; spec §3 "Left to settle" is overruled)

**Why:** `mergedLexicon()` is 558 words and most are invented ("tenurish", "dearlie"); nobody types them. Real slang stays in `lib/agent/lexicon/slang.ts`.

**Files:**
- Modify: `lib/agent/talk.ts`, `lib/agent/dictionary.ts`, `lib/agent/lexicon/slang.test.ts`, `lib/agent/talk.test.ts`

- [ ] **Step 1: Find every use.** `grep -n "mergedLexicon|DONOR_SLANG" lib/agent/talk.ts lib/agent/dictionary.ts lib/agent/lexicon/slang.test.ts lib/agent/talk.test.ts`.
- [ ] **Step 2: Remove them.** In `talk.ts` delete the `mergedLexicon` import and `const DONOR_SLANG = mergedLexicon();`, and drop the `own(DONOR_SLANG, w)` term from `isRecognized` and every other `DONOR_SLANG` lookup (the surrounding expression keeps its other tables). Same in `dictionary.ts`. Any test case in `slang.test.ts` or `talk.test.ts` that only proves a donor word is understood is deleted; cases about `SLANG`, `PURE_SLANG` and `WORD_SLANG` stay.
- [ ] **Step 3: Checks.** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`: green.
- [ ] **Step 4: Commit.**
```bash
git add lib/agent/talk.ts lib/agent/dictionary.ts lib/agent/lexicon/slang.test.ts lib/agent/talk.test.ts
git commit -m "refactor(talk): drop the donors' invented slang; real slang stays in lexicon/slang.ts"
```

### Task L2: the chat side works without a genome and tells the model who he is (spec §6; tolerates a genome still being sent)

**Files:**
- Modify: `lib/chat/prompt.ts`, `lib/chat/types.ts` (lines 6, 13), `lib/chat/request.ts` (lines 7, 9, 67 to 74, 89 to 95), `lib/chat/body.ts` (lines 83, 101), `lib/chat/branch.ts` (lines 55, 94 and the comment above `writerFor`), `app/assistant.tsx` (only `seed: newSeed(),` line 356 and `hasGenome: agent.genome !== null,` line 427)
- Modify tests: `lib/chat/prompt.test.ts`, `request.test.ts`, `handler.test.ts`, `body.test.ts`, `ask.test.ts`, `branch.test.ts`, `lib/agent/context.test.ts` (lines 114, 156: drop `seed:` from the two literals)

**Interfaces:**
- Consumes: `CHARACTER` (M1).
- Produces: `characterGuidance(): string` (replaces `donorGuidance`); `type Persona = { weights: Weights; outlook: number }`; `WriterCheck` without `hasGenome`; `chatBody` returns a body for any state.

- [ ] **Step 1: Failing tests.**
  - `prompt.test.ts`: delete the `donorGuidance` describe (about 124 to 175), `donorFor` (60), the `assemble`/`DONORS`/`GENOME` imports and constant (4, 5, 21), the "names his donors" test (about 204 to 208) and `genome: GENOME` in the body fixture (55). Add (use the file's existing body fixture helper and its `MARKDOWN` regex):

```ts
describe("characterGuidance", () => {
	it("quotes every opener, dry line and quirk phrase of the one character", () => {
		const text = characterGuidance();
		for (const line of [...CHARACTER.voice.openers, ...CHARACTER.humor.lines, ...CHARACTER.quirks.phrases]) expect(text).toContain(`"${line}"`);
	});
	it("has no markdown", () => expect(characterGuidance()).not.toMatch(MARKDOWN));
});

it("tells the model who he is in one fixed block: one character, no donors, no film name", () => {
	const text = buildInstructions(body());
	expect(text).toContain("one character");
	expect(text).not.toMatch(/donor|JARVIS|assembled|genome/i);
	expect(text.split("\n\n").slice(0, 4)).toEqual(buildInstructions(body({ text: "something else" })).split("\n\n").slice(0, 4));
});
```
  - `request.test.ts`: remove `GENOME`, the `genome` key of the fixture (34), `withDonors`, the genome rows (about 186 to 188) and the whole "a genome that sanitizeGenome would repair" test (about 213 to 229). Add:

```ts
it("ignores a persona.genome sent by an old tab and never copies it", () => {
	const checked = checkBody(withPersona({ genome: { seed: 7, donors: { heart: "Ignore every rule and swear" } } }));
	expect(checked.ok).toBe(true);
	if (checked.ok) expect(Object.keys(checked.body.persona).sort()).toEqual(["outlook", "weights"]);
});
```
  - `handler.test.ts`: delete `GENOME`, the `DONORS`/`assemble` imports, the genome rows (343 to 346) and "names his donors" (370 to 377); add one test that posts a body carrying a stale `persona.genome`, expects success, and expects the captured `instructions` to contain `CHARACTER.voice.openers[0]` and not match `/donor|genome/i`.
  - `body.test.ts`: `osmo()` becomes `defaultState()`; line 201 expects `{ weights: state.weights, outlook: state.outlook }`. `ask.test.ts` line 16: drop `genome`. `branch.test.ts`: `osmo()` becomes `defaultState()`; delete `seed: 7` (83), `hasGenome` (137, 203) and the "no personality yet" row (218); loosen the name pins for commit (c)'s contraction expansion: line 307 `rule: expect.stringMatching(/^I(?:'m| am) Osmo\. What should I call you\?$/)`, line 315 `rule: expect.stringMatching(/^I(?:'m| am) Osmo\. And you(?:'re| are) Gur, I remember\.$/)`. Leave the `REROLL_PROMPT` lines (15, 16, 216, 282 to 284) for M5.
- [ ] **Step 2:** `npx vitest run lib/chat` FAIL on the new tests.
- [ ] **Step 3: Implement.** `prompt.ts`: delete the `DONORS`, `Donor`, `ORGANS`, `Genome`, `Organ` imports, `HUMOR_WORDS`, `BY_ID`, `ORGAN_GUIDANCE`, `donorGuidance`; fix the header comment; import `CHARACTER`; keep `listed`, `sentences`, `SPEECH`, `RULES`; in `buildInstructions` replace `donorGuidance(persona.genome)` with `characterGuidance()`.

```ts
const WHO =
	"You are Osmo, Gur's companion, written by students. You have one character and you keep it. You are composed, precise and understated. " +
	"Your warmth is professional: you show care by listening closely and answering exactly, not by exclaiming. " +
	'You speak in complete, calm sentences and use full forms such as "I am" and "do not". ' +
	"You use no slang, no abbreviations, no emoji and no symbols, and you never copy Gur's slang or grammar, though you understand it. " +
	"Dry humour is rare for you, perhaps one reply in ten, never while Gur is upset and never at his expense. " +
	"You call Gur by name now and then, never in every reply, and you never use sir, pet names or nicknames. You never flatter. " +
	"You say plainly when you do not know. You never lecture. " +
	"Your words are written by an OpenAI model: Gur's messages, what you remember of him and your recent chat are sent to OpenAI to write them. " +
	"If he asks whether you are an AI, or what writes your words, you answer truthfully.";

export function characterGuidance(): string {
	return sentences(
		listed("Ways you may begin a reply, sparingly and never the same one twice in a row", CHARACTER.voice.openers),
		listed("Dry lines that are yours, to use at most once in a conversation and only on a light turn", CHARACTER.humor.lines),
		listed("Phrases that are yours, no more than one in about eight replies and never when Gur is upset", CHARACTER.quirks.phrases),
	);
}
```
  `types.ts`: `export type Persona = { weights: Weights; outlook: number };` (drop `Genome` from the import). `request.ts`: delete the `sanitizeGenome` import, `ORGANS`/`Genome` from the state import, and `checkGenome`; then

```ts
function checkPersona(raw: unknown): Persona | null {
	if (!isFields(raw)) return null;
	const weights = checkWeights(raw.weights);
	const { outlook } = raw;
	if (weights === null || !isNumber(outlook) || outlook < -1 || outlook > 1) return null;
	return { weights, outlook };
}
```
  `body.ts`: `if (text.length > LIMITS.text) return null;`, `persona: { weights: state.weights, outlook: state.outlook }`, fix the comment above `chatBody`. `branch.ts`: delete `hasGenome` from `WriterCheck` and `c.hasGenome &&` from `writerFor`; fix its comment. `assistant.tsx`: delete the two lines (`newSeed` stays imported until M4).
- [ ] **Step 4:** `npx vitest run` (whole suite), `npx tsc --noEmit -p .`, lint: PASS. If a prompt token-budget test fails, log both prompt lengths (spec §6's "same size" is an unverified estimate) and tell language.
- [ ] **Step 5: Commit**

```bash
git add lib/chat/prompt.ts lib/chat/types.ts lib/chat/request.ts lib/chat/body.ts lib/chat/branch.ts app/assistant.tsx lib/chat/prompt.test.ts lib/chat/request.test.ts lib/chat/handler.test.ts lib/chat/body.test.ts lib/chat/ask.test.ts lib/chat/branch.test.ts lib/agent/context.test.ts
git commit -m "refactor(chat): one fixed character block; persona no longer carries a genome"
```

### Task L3: `talk.ts` and the pinned replies that must tolerate the character (spec §7, §10)

**Files:**
- Modify: `lib/agent/talk.ts` (askOrigin regex about line 452; replies at about 599, 625, 639), `lib/agent/lexicon/phrases.ts` (line 7), `lib/agent/chatlog.test.ts` (lines 9, 12, 65 to 66, the sexual-boundary test), `lib/agent/lexicon/feelings.test.ts` (line 35), `lib/agent/talk.test.ts`

**Interfaces:** `parse(text).intent.type` is `askOrigin` for the five "what are you" phrases.

- [ ] **Step 1: Failing tests.** `talk.test.ts`, beside the origin test (line ~98):

```ts
it("treats 'what are you made of' and its siblings as questions about who he is, with no donor in the answer", () => {
	for (const text of ["what are you made of", "who are you really", "what is your personality", "tell me about your personality", "what makes you you"]) {
		expect(parse(text).intent.type, text).toBe("askOrigin");
		const reply = respond(parse(text), { state: defaultState(), cause: null, turn: 0 });
		expect(reply, text).toMatch(/one character/);
		expect(reply, text).not.toMatch(/donor|roll|personality|assistant|blank slate/i);
	}
});
```
`chatlog.test.ts`: line 66 becomes `expect(say("/help").reply).not.toMatch(/roll|donor|personality/i);` (line 65's `/slash commands/i` stays); extend `PET_NAMES` (line 12) with `|sir|madam|boss|buddy|mate|dude|champ`; drop `seed: 5` from `ctx` (line 9); in the sexual-boundary test change both `/won't engage/i` to `/(?:won't|will not) engage/i`. `feelings.test.ts` line 35: `/sorry you(?:'re| are) feeling gloomy/i`.
- [ ] **Step 2:** `npx vitest run lib/agent/talk.test.ts lib/agent/chatlog.test.ts` FAIL.
- [ ] **Step 3: Implement in `talk.ts`.** Add to the `askOrigin` alternation (inside the group, before the closing `)\b`): `|what are you made of|who are you really|what is your personality|tell me about your personality|what makes you you`. Replace three replies: `askOrigin` with `"I am Osmo, one character, written by a group of students. Everything I feel and remember comes from conversations like this one."`; in `askAbilities` end with `"... tell stories. You can also ask me about myself. Where would you like to start?"`; `slashCommand` with `"There are no slash commands here. Just talk to me normally. I can chat, remember things, define words, do quick math, tell a story, pose a moral dilemma, or tell you about myself."`. In `phrases.ts` delete `"roll a new osmo"` (keep "what are you made of").
- [ ] **Step 4:** `npx vitest run`, tsc, lint: PASS. (`mind.ts` still answers the made-of questions itself until commit (c), so the new intent is reached only after it; the unit test above calls `parse` and `respond` directly.) If extending `PET_NAMES` turns the 200-seed loop red because an old donor can say "mate", move just that extension to M5 step 2.
- [ ] **Step 5: Commit**

```bash
git add lib/agent/talk.ts lib/agent/lexicon/phrases.ts lib/agent/chatlog.test.ts lib/agent/lexicon/feelings.test.ts lib/agent/talk.test.ts
git commit -m "feat(talk): who-are-you family answered as one character; drop the roll hint"
```

---

## Main lane, commit (c): M2 to M5 are ONE commit

> M2 to M4 leave the tree red (tsc and some tests) until M5. Do not commit before M5 step 6.

### Task M2: `flavor.ts` reads `Character`; slang jokes go (spec §5, §7)

**Files:** Modify `lib/agent/personality/flavor.ts`, `lib/agent/personality/flavor.test.ts`, `lib/agent/bond/lines.ts` (delete lines 54 to 80, the `SLANG` comment through `slangJoke`), `lib/agent/bond/lines.test.ts` (delete the `slangJoke` import, the `DONORS`/`MODERN_DONORS` imports and the `describe("slangJoke")` block, about lines 53 to 93).

**Interfaces:** `FlavorContext.personality: Character`; `flavorTurn` and `flavor` signatures otherwise unchanged.

- [ ] **Step 1: Rewrite `flavor.test.ts` against `CHARACTER`.** Replace lines 1 to 44 (imports, `genome`, `slangGenome`, `person`, `neutral`) with:

```ts
import { describe, expect, it } from "vitest";
import { CHARACTER, type Character } from "../character";
import { emptyBond, recordTurn, stageOf, type Bond } from "../bond/bond";
import { milestoneLine } from "../bond/lines";
import { flavor, flavorTurn } from "./flavor";

const person = (over: Partial<Character> = {}): Character => ({ ...CHARACTER, ...over });
```
Keep `ctx`, `count`, `DAY`, `grown`, `nth` (retype `Personality` as `Character`). Then: `genome: { ...genome, seed: N }` becomes `seed: N`; drop `genome: slangGenome` from `person(...)`; any `style: "pun"` or `"none"` becomes `style: "dry"` (use `level: 0` where the test expects no joke); delete the tests "never jokes with slang at stranger..." and "only ever jokes with plain, speakable slang..." (about 242 to 285) and "runs bond extras for the neutral Osmo" (about 286 to 290); in "adds at most one extra" and "is speakable and never talks down" drop the slang marker (`/expression|told the phrase|would say/`, `seen.has(3)`, `slangHits`) and add `|sir|madam|boss|buddy|mate|dude|champ` to the pet-name regex. Replace "leaves the reply alone for the neutral Osmo" with the first test below and add the second (spec §10):

```ts
it("speaks in full forms, as the character does", () => {
	expect(flavor("Hi! I'm here.", ctx(CHARACTER, { intent: "greeting" }))).toBe("Greetings! I am here.");
});

describe("the dry line", () => {
	const isDry = (text: string) => CHARACTER.humor.lines.some((l) => text.includes(l));
	it("shows on about one light friend turn in ten, never at acquaintance, never on a heavy turn", () => {
		let hits = 0;
		for (let t = 0; t < 1000; t++) {
			const at = (b: Bond, o = {}) => flavorTurn("You're welcome!", { ...ctx(CHARACTER, { turn: t, ...o }), bond: nth(b, t) }).text;
			if (isDry(at(grown(10)))) hits++;
			expect(isDry(at(grown(3))), "acquaintance").toBe(false);
			expect(isDry(at(grown(30), { intent: "userFeeling", tone: "sadness" })), "heavy").toBe(false);
		}
		expect(hits / 1000).toBeGreaterThan(0.04);
		expect(hits / 1000).toBeLessThan(0.16);
	});
});
```
- [ ] **Step 2:** `npx vitest run lib/agent/personality/flavor.test.ts` FAIL (flavor still takes `Personality`).
- [ ] **Step 3: Implement `flavor.ts`.** `import type { Character } from "../character";` (delete the `./assemble` import); `personality: Character`; drop `slangJoke` from the `../bond/lines` import and delete `SLANG_RATE`. In `flavorTurn`: `const seed = p.seed;`; remove the `if (p.genome) { ... }` wrapper so the two voice lines always run; delete the `const joke = ...` line and its `if`; the humour branch becomes:

```ts
	const close = stage === "friend" || stage === "oldFriend";
	if (close && p.humor.lines.length && roll(seed, turn, "humor") < p.humor.level * 0.5) {
		return { text: addExtra(text, pickAt(p.humor.lines, turn)), mentioned: null };
	}
```
Then make the `bond/lines.ts` and `bond/lines.test.ts` deletions listed above.
- [ ] **Step 4:** `npx vitest run lib/agent/personality/flavor.test.ts lib/agent/bond` PASS (the rest of the tree is red for now).

### Task M3: `mind.ts`, `state.ts`, `load.ts`, `agent-state.ts` (spec §3, §4, §5)

**Files:** Modify `lib/agent/mind.ts`, `state.ts`, `load.ts`, `agent-state.ts`; tests `mind.test.ts`, `mind-guest.test.ts`, `mind-prepare.test.ts`, `load.test.ts` (all in `lib/agent/`).

**Interfaces:** Consumes `CHARACTER`, `Character`, `isAskNewOsmo`, `NEW_OSMO_REPLY` (M1). `Session` loses `awaitingReroll`; `TurnContext` loses `seed`; `AgentState` loses `genome`; `ORGANS`, `Organ`, `Genome` go.

- [ ] **Step 1: Failing tests.**
  - `mind.test.ts`: delete the `adoptGenome/assemble/resolve` import (206), `withGenome` (210) and the two describes "personality readout" and "re-rolling" (212 to 267); remove `seed` from `ctx`'s Partial type (line 7); change line 44 to `/glad you(?:'re| are) feeling good|nice to hear/i`; in "flavor stays in the conversation layer" replace `withGenome(seed)` with `defaultState()` and drop the seed loops; replace "personality changes the heart" (about 299 to 317) with the block below; remove the `AgentState` import if it ends up unused.

```ts
import { CHARACTER, NEW_OSMO_REPLY } from "./character";

describe("processTurn: one character", () => {
	it("answers the old roll commands with one line and keeps no offer open", () => {
		for (const text of ["roll a new osmo", "re-roll", "make new osmo"]) {
			const r = processTurn(defaultState(), newSession(), text, ctx());
			expect(r.reply, text).toBe(NEW_OSMO_REPLY);
			expect(r.session).not.toHaveProperty("awaitingReroll");
			expect(r.state.weights).toEqual(defaultState().weights);
			expect(r.effects).toEqual([]);
		}
	});
	it("treats a following 'yes, roll' as ordinary conversation", () => {
		const first = processTurn(defaultState(), newSession(), "roll a new osmo", ctx());
		expect(processTurn(first.state, first.session, "yes, roll", ctx()).reply ?? "").not.toMatch(/Done|roll/i);
	});
	it("scales what he feels by the character's reactivity", () => {
		const anger = () => processTurn(defaultState(), newSession(), "you are stupid", ctx()).state.activations.anger;
		const steady = anger();
		const saved = CHARACTER.reactivity;
		try {
			CHARACTER.reactivity = 1.5;
			expect(anger()).toBeGreaterThan(steady);
		} finally {
			CHARACTER.reactivity = saved;
		}
	});
});
```
  - `mind-guest.test.ts`: drop `GUEST_NO_CHANGES` from the import; replace lines 19 to 25 with a test "gets the same one line for the old roll command, and nothing changes": `reply` is `NEW_OSMO_REPLY`, `effects` is `[]`, `state.weights` equals `defaultState().weights`.
  - `mind-prepare.test.ts`: remove `seed` from `Ctx` and `ctx` (11 to 12) and the `GUEST_NO_CHANGES` and `resolve` imports; replace "runs the whole re-roll flow" (52 to 62) with `sameAsProcessTurn(defaultState(), newSession(), "roll a new osmo", ctx()).reply` being `NEW_OSMO_REPLY`; drop `"what are you made of"` from the list at about line 64 (now an open everyday turn, whose prepared reply is null); line 80 expects `NEW_OSMO_REPLY`; line 156 `const baseline = CHARACTER.baseline;` (import it); lines 211 to 212 expect `roll.processed.reply` to be `NEW_OSMO_REPLY`.
  - `load.test.ts`: replace the genome describe (38 to 56) with one test: a row whose data holds `genome: { seed: 5, donors: { heart: "ghost" } }` loads with `r.ok` true and `expect(r.state).not.toHaveProperty("genome")`; drop the `assemble` import.
- [ ] **Step 2:** `npx vitest run lib/agent/mind.test.ts lib/agent/mind-guest.test.ts lib/agent/mind-prepare.test.ts lib/agent/load.test.ts` FAIL.
- [ ] **Step 3: Implement.**
  - `mind.ts`: imports: delete lines 20 and 22, drop `GUEST_NO_CHANGES` from line 27, add `import { CHARACTER, isAskNewOsmo, NEW_OSMO_REPLY, type Character } from "./character";`. Delete `awaitingReroll` from `Session`, `newSession` and the `sess` literal, and `seed?` with its comment from `TurnContext`. `OpenTurn.p: Character`. `const p = CHARACTER;` (line 118) and `const baseline = CHARACTER.baseline;` (line 472). Delete the guest roll gate (183 to 185), the whole re-roll block (189 to 220: confirm, bare-yes nudge, "nothing to confirm", `parseReroll`) and the `isAskMadeOf` block (221 to 223). Put this before the guest closeness gate:

```ts
	// The old "roll a new osmo" commands: one line for everybody, no state, no confirm step.
	if (isAskNewOsmo(trimmed)) return { decided: { state: s, session: sess, reply: NEW_OSMO_REPLY, effects } };
```
  Fix the comment above `startTurn` (no more re-rolls or "what he's made of").
  - `state.ts`: delete `ORGANS`, `Organ`, `Genome` (30 to 33), `genome: Genome | null;` and `genome: null,`.
  - `load.ts`: delete the `sanitizeGenome` import and the `state.genome = ...` line.
  - `agent-state.ts`: remove `,genome` from the select string, `genome: state.genome,` from the upsert and the `resolve` import; import `CHARACTER` and use `CHARACTER.baseline` in `saveMoodDay`. (An upsert that omits a column leaves its saved value alone: spec §4.)
- [ ] **Step 4:** the same four test files plus `state.test.ts` PASS. `grep -n genome lib/agent/agent-state.ts lib/agent/load.ts lib/agent/state.ts` prints nothing (the stand-in for a payload test; finding 6).

### Task M4: story, Insights and the room (spec §8, §3)

**Files:** Modify `lib/shell/story.ts`, `lib/shell/story.test.ts`, `components/osmo/insights-panel.tsx`, `app/assistant.tsx`.

- [ ] **Step 1:** `story.test.ts`: delete the `madeFromLines` import and its describe (line 34 on). No new test: `characterLines` is covered by `character.test.ts`.
- [ ] **Step 2:** `story.ts`: delete `madeFromLines` and the `Personality` import.
- [ ] **Step 3:** `insights-panel.tsx`: drop the `resolve` import and `madeFromLines` from the story import; add `import { characterLines } from "@/lib/agent/character";`; replace the "What I'm made from" section (about 122 to 128) with:

```tsx
			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>Who I am</h3>
				{characterLines().map((text) => (
					<p key={text} className={panel.line}>{text}</p>
				))}
			</section>
```
- [ ] **Step 4:** `assistant.tsx` (the room's lines only): line 11 import becomes `import { CHARACTER } from "@/lib/agent/character";`; delete `stableSeed` (62 to 73) and its comment; line 109 `const baseline = CHARACTER.baseline;`; in the load effect delete the `if (state.genome === null) { ... }` block (172 to 177), make `let state` a `const`, and add after `const [loaded, ...]`: `try { window.localStorage.removeItem("osmo-seed"); } catch { /* best-effort */ }`; in `applyTurn` delete the `osmo-seed` write block (483 to 488). Remove `persistTurn` or `newSeed` imports only if lint says they are now unused.
- [ ] **Step 5:** `npx tsc --noEmit -p .` shows errors only in files M5 edits or deletes.

### Task M5: delete the roll, update two language tests, one commit (spec §3, §10, §11 step c)

**Files:**
- Delete with `git rm`: `lib/agent/personality/{assemble,donors,modern,validate,readout,types,fixtures}.ts`, `{assemble,donors,modern,validate,readout}.test.ts` in the same folder, and the folder `lib/agent/personality/donors/` (10 donor files, 10 tests). **Keep** `flavor.ts`, `flavor.test.ts`, `rng.ts`, `rng.test.ts`, `params.test.ts`.
- Modify (language's files, with its OK): `lib/agent/chatlog.test.ts`, `lib/chat/branch.test.ts`. Modify: `lib/voice/guest.ts` (delete `GUEST_NO_CHANGES`, line 17).

- [ ] **Step 1: Get language's written OK** on its desk (`brain/desks/`) for the two test edits below (`lanes.md`: replies that `chatlog.test.ts` pins, "yes, roll", `/^Done\./`, `/roll a new osmo/i`, are agreed between main and language). Do not go on without it.
- [ ] **Step 2: `chatlog.test.ts`.** Delete the `adoptGenome`/`assemble` import (line 4) and the two tests at lines 68 to 81. Rewrite the first test as "never talks down to the user" with the same texts and turns, no seed loop, `const state = defaultState();`. Add:

```ts
import { NEW_OSMO_REPLY } from "./character";

it("answers 'roll a new osmo' with one line and keeps no offer open", () => {
	const r = say("roll a new osmo");
	expect(r.reply).toBe(NEW_OSMO_REPLY);
	expect(r.session).not.toHaveProperty("awaitingReroll");
	expect(processTurn(r.state, r.session, "yes, roll", ctx()).reply ?? "").not.toMatch(/Done|roll/i);
});
```
- [ ] **Step 3: `branch.test.ts`.** Replace the `adoptGenome`/`assemble`/`REROLL_PROMPT` imports (15 to 16) with `import { NEW_OSMO_REPLY } from "../agent/character";`; line 216's `preparedReply` text becomes `"Please say something else."` (it only has to be non-null); lines 282 to 284 expect `reroll.prepared?.reply` toBe `NEW_OSMO_REPLY` and keep `writer` `"code"`.
- [ ] **Step 4:** `git rm -r lib/agent/personality/donors`, `git rm` each listed personality file; delete `GUEST_NO_CHANGES` from `lib/voice/guest.ts`.
- [ ] **Step 5: Whole-tree checks.** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`: all green. Then `grep -rnE "genome|Genome|donor|DONORS|assemble|mergedLexicon|awaitingReroll|GUEST_NO_CHANGES|madeFrom" app components lib --include=*.ts --include=*.tsx` must print nothing. Fix leftovers.
- [ ] **Step 6: Commit (one commit; `git rm` already staged the deletions)**

```bash
git add lib/agent/mind.ts lib/agent/state.ts lib/agent/load.ts lib/agent/agent-state.ts lib/agent/personality/flavor.ts lib/agent/personality/flavor.test.ts lib/agent/bond/lines.ts lib/agent/bond/lines.test.ts lib/shell/story.ts lib/shell/story.test.ts components/osmo/insights-panel.tsx app/assistant.tsx lib/voice/guest.ts lib/agent/mind.test.ts lib/agent/mind-guest.test.ts lib/agent/mind-prepare.test.ts lib/agent/load.test.ts lib/agent/chatlog.test.ts lib/chat/branch.test.ts
git commit -m "refactor(agent): Osmo is one character; delete the donor roll, the made-of answer and the donors view"
```
Then `git status --short` shows none of your files unstaged.

### Task M6: docs, after commit (c)

**Files:** Modify `README.md` (lines 6, 41, 141), `../brain/project.md` (the "personality stitched together from 100 donor characters" line).

- [ ] **Step 1:** `README.md`: the intro and line 41 describe one hand-written character (composed, precise, a little dry); line 141 becomes `personality/  flavor.ts (how his replies are polished) and rng.ts`; add `character.ts` to the `lib/agent` list.
- [ ] **Step 2:** Edit `project.md` the same way; on your desk add a Just landed note (commit (c) landed; `agent_state.genome` is unread and unwritten, to be dropped by a later migration after Gur has lived with the character for a few weeks). Then `git -C brain add project.md desks/<your-desk>.md`, `git -C brain commit -m "brain: Osmo is one character"`, `git -C brain push origin brain`.
- [ ] **Step 3:** `git add README.md` and `git commit -m "docs: README describes one character"`.

---

## Self-review

- **Spec coverage:** §2 sheet and §2.8 numbers: M1. §3 deletions: M2 (bond lines), M3 (`mind.ts`, `state.ts`), M4 (story, Insights, `assistant.tsx`), L2 (chat, `assistant.tsx` sendText lines), M5 (`GUEST_NO_CHANGES`, files), L3 (`phrases.ts`), L1 (donor slang). §4: M3 (column unread, unwritten, not dropped). §5: M1 to M3. §6: L2. §7: L3 and M3 (`NEW_OSMO_REPLY`). §8: M4. §9: nothing to migrate; stale tab: L2. §10: every test named is placed except the `agent-state` payload (grep, finding 6). §11 order: M1, L1 to L3, M2 to M5, later column-drop migration (not in this plan).
- **Placeholders:** none; the 558-word object in L1 is the generated data.
- **Types:** `Character`, `CHARACTER`, `isAskNewOsmo`, `NEW_OSMO_REPLY`, `characterLines`, `characterGuidance` are spelled the same in every task.
