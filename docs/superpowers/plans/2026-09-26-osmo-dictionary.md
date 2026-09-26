# Osmo's Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Osmo a much bigger vocabulary: real definitions for word questions, a feelings thesaurus, about 250 more slang terms, reply variety, typo understanding and learning the user's vocabulary, all in a professional voice (like JARVIS) as plain speakable text.

**Architecture:**
- **Understanding is offline and instant.** A new `lib/agent/lexicon/` folder holds pure data and helpers: a 47k-word frequency list, the feelings thesaurus, the slang lists, a context-aware typo corrector and reply variety. `talk.ts`'s `normalize()` uses them.
- **Word questions go online.** `lib/agent/dictionary.ts` looks words up on Datamuse, with Wiktionary as backup. It gets `fetch` and the cache passed in, so it's testable. Results are cached per user in a new Supabase table.
- **The page awaits the lookup** and shows a thinking bubble. Every reply ends in one string, where a future `speak()` hook will go.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest (`npx vitest run`), Supabase (`@supabase/supabase-js`, MCP `apply_migration`), Datamuse and Wiktionary REST (no keys).

**Spec:** `docs/superpowers/specs/2026-09-26-osmo-dictionary-design.md`

## Global Constraints

- **Professional voice, like JARVIS.** Everything Osmo says is composed, polite, articulate and concise, with occasional dry wit. There is no slang, internet shorthand or emoji in his replies, and he never mirrors the user's grammar. He still *understands* slang and typos. (The personality session's flavor may add a rare, deadpan, framed slang joke; don't filter it out.)
- **Replies are plain, speakable text.** No markdown, emoji, brackets or slashes in anything Osmo says. Definitions are whole sentences ("Rizz is slang for…").
- **Understanding works offline.** Only word lookups use the network. Only the looked-up term is sent to `https://api.datamuse.com` or `https://en.wiktionary.org`, never the user's message.
- **Lookup time limit:** a lookup finishes or gives up within 4000 ms.
- **This folder is not a git repo.** No commit steps; each task ends with a test checkpoint.
- **Another Claude session owns** `lib/agent/personality/**`, `heart.ts`, `state.ts`, `cues.ts`, `brain.ts`, `dilemmas.ts`, `events.ts`, `mood-theme.ts`, `speech.ts`, `load.ts`, `agent-state.ts` and `app/assistant.module.css`. Do not edit them.
- **In `lib/agent/mind.ts`,** edit only:
  - the `TurnContext` type;
  - the one `applyCues(...)` line;
  - step 6 ("Everyday conversation").

  Re-read `mind.ts` right before each edit, and after the last one, message the other session: SendMessage to `uds:\\.\pipe\LOCAL\cc-msg-849c63168f616ef98e2e2e776051c97f`, one line.
- **In `app/assistant.tsx`,** edit only `sendMessage`, its helpers, and the message list or composer JSX. Re-read it before every edit; the user edits it too.
- **Style:** tabs, double quotes, short "why" comments like the surrounding code. Use the Edit/Write tools for any file with backslashes; shell heredocs have eaten `\b` in this repo.
- **Word list attribution:** the word-list data file must keep its CC-BY-SA-4.0 attribution header.

## Review Focus

1. **Spoken-style input:** "um what does ephemeral mean", no punctuation, a leading filler. Expected: it is still a word question (Task 7 test).
2. **A correctly spelled word Datamuse "corrects":** asking about "jiggle", a known word, returns "juggle". Expected: no "I believe you meant juggle"; Osmo tries Wiktionary with "jiggle" (Task 7 test).
3. **A lookup that never answers:** both sources hang. Expected: the "explain it and I'll remember" fallback within the time limit, and the composer usable again (Task 7 test, Task 9 check).
4. **Terms with apostrophes or hyphens:** "what does y'all mean", "define self-care". Expected: a lookup, with the term URL-encoded (Task 7 test).
5. **A typo next to a swear word or slur:** Expected: the corrector never offers a banned word as a guess (Task 4 test).

---

### Task 1: Word list

**Files:**
- Create: `scripts/build-word-list.mjs`
- Create (generated): `lib/agent/lexicon/words-data.ts`
- Create: `lib/agent/lexicon/words.ts`
- Test: `lib/agent/lexicon/words.test.ts`

**Interfaces:**
- Produces: `WORD_LIST: readonly string[]` (most common first); `isKnownWord(word: string): boolean`; `wordRank(word: string): number` (0 = most common; unknown = `WORD_LIST.length`).

- [ ] **Step 1: Write the failing test** `lib/agent/lexicon/words.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { isKnownWord, WORD_LIST, wordRank } from "./words";

describe("the word list", () => {
	it("holds about 47,000 plain lowercase words, most common first", () => {
		expect(WORD_LIST.length).toBeGreaterThan(45000);
		expect(WORD_LIST.length).toBeLessThan(50001);
		expect(WORD_LIST.every((w) => /^[a-z]+$/.test(w))).toBe(true);
		expect(WORD_LIST[0]).toBe("you");
		expect(wordRank("the")).toBeLessThan(wordRank("platypus"));
	});

	it("knows rare real words but not typos or new slang", () => {
		for (const w of ["jiggle", "gloomy", "suicidal", "platypus", "ephemeral", "pizza"]) expect(isKnownWord(w), w).toBe(true);
		for (const w of ["thnaks", "myslef", "sda", "rizz"]) expect(isKnownWord(w), w).toBe(false);
	});

	it("ranks unknown words after every known one", () => {
		expect(wordRank("qwzxv")).toBe(WORD_LIST.length);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/agent/lexicon/words.test.ts`
Expected: FAIL, cannot resolve `./words`.

- [ ] **Step 3: Write the build script** `scripts/build-word-list.mjs`

```js
// Builds lib/agent/lexicon/words-data.ts from the FrequencyWords English 50k list.
// Usage: node scripts/build-word-list.mjs path/to/en_50k.txt
import { readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2];
if (!source) throw new Error("Pass the path to en_50k.txt");
const words = [];
const seen = new Set();
for (const line of readFileSync(source, "utf8").split(/\r?\n/)) {
	const word = line.split(" ")[0];
	if (/^[a-z]+$/.test(word) && !seen.has(word)) {
		seen.add(word);
		words.push(word);
	}
}
const header = [
	"// The ~47,000 most common plain lowercase words in English film and TV subtitles, most common first.",
	"// Source: hermitdave/FrequencyWords, content/2018/en/en_50k.txt (built from OpenSubtitles 2018).",
	"// Content license: CC-BY-SA-4.0 (https://creativecommons.org/licenses/by-sa/4.0/), attribution: Hermit Dave.",
	"// Generated by scripts/build-word-list.mjs; do not edit by hand.",
].join("\n");
writeFileSync("lib/agent/lexicon/words-data.ts", `${header}\nexport const WORDS_TEXT =\n\t"${words.join(" ")}";\n`);
console.log(`wrote ${words.length} words`);
```

- [ ] **Step 4: Download the list and generate the data module** (about 610 KB download from GitHub; the user approved this source in the spec)

Run:
```bash
curl -sL -o "$TEMP/en_50k.txt" https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt
node scripts/build-word-list.mjs "$TEMP/en_50k.txt"
```
Expected: `wrote 469xx words` (about 46,900 to 47,000).

- [ ] **Step 5: Write** `lib/agent/lexicon/words.ts`

```ts
import { WORDS_TEXT } from "./words-data";

// Real words, most common first, so a word's index says how common it is (0 is "you").
export const WORD_LIST: readonly string[] = WORDS_TEXT.split(" ");
const RANK = new Map(WORD_LIST.map((word, i) => [word, i]));

export const isKnownWord = (word: string): boolean => RANK.has(word);

// Words not in the list count as rarer than any that are.
export const wordRank = (word: string): number => RANK.get(word) ?? WORD_LIST.length;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run lib/agent/lexicon/words.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

---

### Task 2: Feelings thesaurus

**Files:**
- Create: `lib/agent/lexicon/feelings.ts`
- Modify: `lib/agent/talk.ts`: export the feeling lists; make `feelingIntent` read the thesaurus
- Modify: `lib/agent/mind.ts`: the one `applyCues(...)` line (the other session agreed)
- Test: `lib/agent/lexicon/feelings.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `FEELING_SYNONYMS: Record<string, string>`, `feelingFor(word): string | null`, `withBaseFeelings(text): string`; `talk.ts` exports `NEGATIVE_FEELINGS`, `POSITIVE_FEELINGS` and `ALL_FEELINGS`.

- [ ] **Step 1: Write the failing test** `lib/agent/lexicon/feelings.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { newSession, processTurn } from "../mind";
import { defaultState } from "../state";
import { NEGATIVE_FEELINGS, parse, POSITIVE_FEELINGS } from "../talk";
import { FEELING_SYNONYMS, feelingFor, withBaseFeelings } from "./feelings";

const ctx = () => ({ now: 1_000_000, lastAt: null, uuid: () => "id" });

describe("the feelings thesaurus", () => {
	it("maps about 300 single words, each to a feeling talk.ts knows, never to itself", () => {
		const known = [...NEGATIVE_FEELINGS, ...POSITIVE_FEELINGS];
		expect(Object.keys(FEELING_SYNONYMS).length).toBeGreaterThanOrEqual(300);
		for (const [word, base] of Object.entries(FEELING_SYNONYMS)) {
			expect(/^[a-z]+$/.test(word), word).toBe(true);
			expect(known, `${word} -> ${base}`).toContain(base);
			expect(known, word).not.toContain(word);
		}
	});

	it("looks words up safely and can swap them for their feeling", () => {
		expect(feelingFor("gloomy")).toBe("sad");
		expect(feelingFor("constructor")).toBeNull();
		expect(withBaseFeelings("im so gloomy and Furious")).toBe("im so sad and angry");
	});
});

describe("Osmo understands thesaurus feelings", () => {
	it("keeps the user's word and takes good or bad news from the mapped feeling", () => {
		expect(parse("im gloomy").intent).toEqual({ type: "userFeeling", feeling: "gloomy", positive: false });
		expect(parse("i feel ecstatic").intent).toEqual({ type: "userFeeling", feeling: "ecstatic", positive: true });
		expect(parse("furious").intent).toEqual({ type: "userFeeling", feeling: "furious", positive: false });
	});

	it("replies with the user's word", () => {
		expect(processTurn(defaultState(), newSession(), "im gloomy", ctx()).reply).toMatch(/sorry you're feeling gloomy/i);
	});

	it("moves his mood like the base feeling would", () => {
		const gloomy = processTurn(defaultState(), newSession(), "im gloomy", ctx()).state.activations.sadness;
		const sad = processTurn(defaultState(), newSession(), "im sad", ctx()).state.activations.sadness;
		expect(gloomy).toBeCloseTo(sad, 5);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/agent/lexicon/feelings.test.ts`
Expected: FAIL, cannot resolve `./feelings`.

- [ ] **Step 3: Create** `lib/agent/lexicon/feelings.ts` with exactly this content

```ts
// Feeling words Osmo has no pattern for, each mapped to a feeling talk.ts already knows.
// The reply keeps the user's own word ("gloomy"); the mapped feeling decides mood and whether it is good or bad news.
export const FEELING_SYNONYMS: Record<string, string> = {
	abandoned: "lonely", accomplished: "proud", achy: "sick", adored: "loved",
	afraid: "scared", aggravated: "annoyed", agitated: "upset", ailing: "sick",
	alarmed: "scared", alone: "lonely", amped: "excited", antsy: "anxious",
	apathetic: "bored", appreciated: "loved", appreciative: "grateful", apprehensive: "anxious",
	awkward: "embarrassed", balanced: "calm", beaming: "happy", beat: "tired",
	betrayed: "hurt", bitter: "angry", blah: "bored", blank: "numb",
	blissful: "happy", blue: "sad", bothered: "upset", brilliant: "great",
	brokenhearted: "heartbroken", bubbly: "happy", burdened: "stressed", burnt: "exhausted",
	buzzing: "excited", capable: "proud", carefree: "chill", centered: "calm",
	cherished: "loved", chuffed: "happy", collected: "calm", comfortable: "relaxed",
	comfy: "relaxed", composed: "calm", concerned: "worried", confident: "proud",
	contrite: "ashamed", cooked: "overwhelmed", cool: "fine", cozy: "relaxed",
	crabby: "annoyed", cranky: "annoyed", crappy: "terrible", crestfallen: "sad",
	cross: "angry", crummy: "terrible", dazed: "shook", defeated: "hopeless",
	dejected: "sad", delighted: "happy", depleted: "drained", desolate: "depressed",
	despairing: "depressed", despondent: "sad", detached: "numb", determined: "hopeful",
	devastated: "heartbroken", disappointed: "bummed", disconnected: "numb", discouraged: "frustrated",
	disheartened: "sad", disillusioned: "bummed", dismal: "miserable", dispirited: "sad",
	distressed: "upset", disturbed: "upset", doleful: "sad", dope: "great",
	downcast: "sad", downhearted: "sad", dreadful: "terrible", drowsy: "tired",
	eager: "excited", easygoing: "relaxed", ecstatic: "happy", edgy: "anxious",
	elated: "happy", empowered: "proud", encouraged: "hopeful", energetic: "excited",
	energized: "excited", enraged: "angry", enthusiastic: "excited", envious: "jealous",
	euphoric: "happy", exasperated: "annoyed", excluded: "lonely", fab: "great",
	fabulous: "great", fatigued: "tired", fearful: "scared", feverish: "sick",
	flooded: "overwhelmed", flustered: "embarrassed", forgotten: "lonely", forlorn: "sad",
	fortunate: "blessed", frantic: "anxious", frazzled: "stressed", fretful: "anxious",
	fretting: "worried", fried: "exhausted", friendless: "lonely", frightened: "scared",
	fulfilled: "happy", fuming: "angry", furious: "angry", giddy: "happy",
	gleeful: "happy", gloomy: "sad", glum: "sad", grand: "great",
	grieving: "sad", groggy: "tired", grouchy: "annoyed", grumpy: "annoyed",
	guilty: "ashamed", harried: "stressed", healed: "better", healing: "better",
	heartsick: "heartbroken", heated: "angry", heavyhearted: "sad", helpless: "hopeless",
	hesitant: "nervous", hollow: "numb", horrid: "awful", horrified: "scared",
	hostile: "angry", humbled: "grateful", humiliated: "ashamed", ill: "sick",
	improved: "better", incensed: "angry", incredible: "great", indifferent: "bored",
	indignant: "angry", infuriated: "angry", injured: "hurt", insecure: "anxious",
	inspired: "hopeful", insulted: "hurt", intimidated: "scared", irate: "angry",
	irked: "annoyed", irritable: "annoyed", irritated: "annoyed", isolated: "lonely",
	jittery: "anxious", jolly: "happy", joyful: "happy", joyous: "happy",
	jubilant: "happy", jumpy: "anxious", keen: "excited", knackered: "tired",
	laidback: "relaxed", lethargic: "tired", lighthearted: "happy", listless: "bored",
	livid: "angry", lonesome: "lonely", lousy: "terrible", lovesick: "heartbroken",
	low: "sad", lucky: "blessed", marvellous: "great", marvelous: "great",
	melancholic: "sad", melancholy: "sad", mellow: "relaxed", merry: "happy",
	miffed: "annoyed", morose: "sad", mortified: "ashamed", motivated: "hopeful",
	mournful: "sad", nauseous: "sick", neglected: "lonely", nice: "good",
	offended: "hurt", optimistic: "hopeful", outraged: "angry", outstanding: "great",
	overjoyed: "happy", overloaded: "stressed", overworked: "stressed", panicking: "anxious",
	panicky: "anxious", paranoid: "anxious", peaceful: "relaxed", peeved: "annoyed",
	perturbed: "upset", petrified: "scared", phenomenal: "great", pissed: "angry",
	pleasant: "good", pleased: "happy", pooped: "tired", poorly: "sick",
	positive: "good", possessive: "jealous", powerless: "hopeless", preoccupied: "worried",
	pressured: "stressed", protected: "calm", psyched: "excited", queasy: "sick",
	rad: "great", radiant: "happy", raging: "angry", rattled: "upset",
	reassured: "hopeful", recovered: "better", recovering: "better", refreshed: "relaxed",
	regretful: "ashamed", relieved: "hopeful", remorseful: "ashamed", resentful: "angry",
	rested: "relaxed", restless: "anxious", restored: "relaxed", rotten: "terrible",
	sadder: "sad", saddest: "sad", safe: "calm", salty: "annoyed",
	satisfied: "happy", secure: "calm", seething: "angry", serene: "relaxed",
	settled: "calm", shaken: "upset", shaky: "anxious", shattered: "exhausted",
	sheepish: "ashamed", shitty: "terrible", shocked: "shook", sickly: "sick",
	skittish: "nervous", sleepy: "tired", slighted: "hurt", sluggish: "tired",
	smiley: "happy", somber: "sad", sombre: "sad", sore: "hurt",
	sorrowful: "sad", spent: "drained", spooked: "scared", startled: "scared",
	steady: "calm", stellar: "great", strained: "stressed", stuck: "frustrated",
	stung: "hurt", stunned: "shook", sunny: "happy", super: "great",
	supported: "loved", swamped: "stressed", tearful: "sad", teary: "sad",
	tense: "anxious", terrific: "great", terrified: "scared", testy: "annoyed",
	thankful: "grateful", threatened: "scared", thwarted: "frustrated", timid: "nervous",
	tranquil: "relaxed", triumphant: "proud", troubled: "upset", twitchy: "anxious",
	unbothered: "chill", uneasy: "anxious", unenthused: "bored", unhappy: "sad",
	uninspired: "bored", uninterested: "bored", unloved: "lonely", unmotivated: "bored",
	unsafe: "scared", unsettled: "anxious", unwanted: "lonely", unwell: "sick",
	upbeat: "happy", uptight: "anxious", validated: "proud", valued: "loved",
	vexed: "angry", victorious: "proud", wanted: "loved", weary: "tired",
	weepy: "sad", wiped: "tired", wistful: "sad", woeful: "sad",
	worn: "tired", wounded: "hurt", wretched: "miserable", zen: "relaxed",
};

// The feeling a word stands for, or null.
export function feelingFor(word: string): string | null {
	return Object.hasOwn(FEELING_SYNONYMS, word) ? FEELING_SYNONYMS[word] : null;
}

// Swaps thesaurus words for their feeling, so mood cues written for "sad" also fire on "gloomy".
export function withBaseFeelings(text: string): string {
	return text.replace(/[A-Za-z]+/g, (w) => feelingFor(w.toLowerCase()) ?? w);
}
```

- [ ] **Step 4: Export the feeling lists from `talk.ts`**

In `lib/agent/talk.ts`, change `const NEGATIVE_FEELINGS = (` to `export const NEGATIVE_FEELINGS = (`, `const POSITIVE_FEELINGS = (` to `export const POSITIVE_FEELINGS = (`, and `const ALL_FEELINGS = ` to `export const ALL_FEELINGS = `.

- [ ] **Step 5: Read the thesaurus in `feelingIntent`** (inside `parse`, in `talk.ts`)

Add `import { feelingFor } from "./lexicon/feelings";` to the imports, and replace

```ts
	const feelingIntent = (word: string | undefined, type: "userFeeling" | "feelingFromOsmo"): Parsed | null => {
		const feeling = word ? matchFeeling(word) : null;
		return feeling ? done({ type, feeling, positive: POSITIVE_FEELINGS.includes(feeling) }) : null;
	};
```

with

```ts
	const feelingIntent = (word: string | undefined, type: "userFeeling" | "feelingFromOsmo"): Parsed | null => {
		if (!word) return null;
		// A thesaurus word keeps the user's own word ("gloomy"); its mapped feeling says if it is good or bad.
		const base = ALL_FEELINGS.includes(word) ? null : feelingFor(word);
		if (base) return done({ type, feeling: word, positive: POSITIVE_FEELINGS.includes(base) });
		const feeling = matchFeeling(word);
		return feeling ? done({ type, feeling, positive: POSITIVE_FEELINGS.includes(feeling) }) : null;
	};
```

- [ ] **Step 6: Let mood cues see the base feeling** (`lib/agent/mind.ts`, one line only; re-read the file first)

Add `import { withBaseFeelings } from "./lexicon/feelings";` and change

```ts
	activations = applyCues(activations, trimmed, p.reactivity);
```

to

```ts
	activations = applyCues(activations, withBaseFeelings(trimmed), p.reactivity);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run lib/agent/lexicon/feelings.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass. If a talk or mind test now reads an existing word as a feeling, check the word against the thesaurus. Remove the thesaurus entry if the word is ambiguous (for example "grounded"), rather than changing the test.

---

### Task 3: Slang lists

**Files:**
- Create: `lib/agent/lexicon/slang.ts`
- Modify: `lib/agent/talk.ts`: `normalize()` rewrites pure slang
- Test: `lib/agent/lexicon/slang.test.ts`

**Interfaces:**
- Consumes: `isKnownWord` (Task 1).
- Produces: `PURE_SLANG: Record<string, string>`, `WORD_SLANG: Record<string, string>`, `PURE_SLANG_IN_WORD_LIST: Set<string>`.

- [ ] **Step 1: Write the failing test** `lib/agent/lexicon/slang.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { mergedLexicon } from "../personality/assemble";
import { normalize, SLANG } from "../talk";
import { PURE_SLANG, PURE_SLANG_IN_WORD_LIST, WORD_SLANG } from "./slang";
import { isKnownWord } from "./words";

describe("the slang lists", () => {
	it("keeps pure slang out of ordinary English, apart from a checked allowlist", () => {
		for (const word of Object.keys(PURE_SLANG)) {
			if (isKnownWord(word)) expect(PURE_SLANG_IN_WORD_LIST.has(word), word).toBe(true);
		}
		for (const word of PURE_SLANG_IN_WORD_LIST) expect(Object.hasOwn(PURE_SLANG, word), word).toBe(true);
	});

	it("never repeats slang Osmo already had", () => {
		const donor = mergedLexicon();
		for (const word of Object.keys(PURE_SLANG)) {
			expect(Object.hasOwn(SLANG, word), word).toBe(false);
			expect(Object.hasOwn(donor, word), word).toBe(false);
			expect(Object.hasOwn(WORD_SLANG, word), word).toBe(false);
		}
	});

	it("uses one lowercase token and a short plain meaning", () => {
		for (const [word, meaning] of Object.entries({ ...PURE_SLANG, ...WORD_SLANG })) {
			expect(/^[a-z0-9]+$/.test(word), word).toBe(true);
			expect(/^[a-z ]+$/.test(meaning) && meaning.split(" ").length <= 6, `${word}: ${meaning}`).toBe(true);
		}
		expect(Object.keys(PURE_SLANG).length).toBeGreaterThanOrEqual(180);
		expect(Object.keys(WORD_SLANG).length).toBeGreaterThanOrEqual(60);
	});

	it("rewrites pure slang but never slang that is also a normal word", () => {
		expect(normalize("istg im hangry")).toBe("i swear to god i am hungry and angry");
		expect(normalize("lowk tired")).toBe("kind of tired");
		expect(normalize("I ate pizza")).toBe("i ate pizza");
		expect(normalize("that movie was mid")).toBe("that movie was mid");
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/agent/lexicon/slang.test.ts`
Expected: FAIL, cannot resolve `./slang`.

- [ ] **Step 3: Create** `lib/agent/lexicon/slang.ts` with exactly this content

```ts
// Modern slang, in two lists with different rules.

// Pure slang: tokens with no ordinary-English meaning. normalize() rewrites these to their meaning, like SLANG.
export const PURE_SLANG: Record<string, string> = {
	adorbs: "adorable", adulting: "doing grown up tasks", af: "very",
	afaik: "as far as i know", aight: "alright", asf: "very",
	aurafarming: "acting cool on purpose", ayo: "hey", ayy: "hey",
	bae: "sweetheart", bangin: "really good", bbl: "be back later",
	bbs: "be back soon", bestie: "best friend", bf: "boyfriend",
	bff: "best friend", bffl: "best friends for life", bffr: "be for real",
	bffs: "best friends", bfn: "bye for now", bops: "good songs",
	bougie: "fancy", boujee: "fancy", brokie: "someone with no money",
	bromance: "a close male friendship", brt: "be right there", capping: "lying",
	chonk: "a chubby animal", chonky: "chubby", clapback: "a sharp comeback",
	convo: "conversation", copium: "denial", crashout: "losing your temper",
	cringey: "embarrassing", deadass: "seriously", ded: "laughing hard",
	deets: "details", dms: "direct messages", doggo: "dog",
	ez: "easy", fav: "favorite", fave: "favorite",
	finna: "going to", fml: "my life is hard", fomo: "fear of missing out",
	frfr: "for real", fs: "for sure", ftw: "for the win",
	fwiw: "for what it is worth", fyp: "for you page", gatekeep: "keep something to yourself",
	gatekeeping: "keeping something to yourself", gf: "girlfriend", ggs: "good games",
	girlboss: "an ambitious woman", girlie: "a girl", glhf: "good luck have fun",
	glowup: "a big improvement", gng: "friends", goated: "the best",
	gorg: "gorgeous", grwm: "get ready with me", gtfo: "get out",
	gyat: "wow", hangry: "hungry and angry", hbd: "happy birthday",
	hby: "how about you", heckin: "very", hella: "very",
	highk: "really", hilar: "hilarious", hmu: "hit me up",
	hopium: "false hope", icl: "i cannot lie", idc: "i do not care",
	idek: "i do not even know", idts: "i do not think so", ight: "alright",
	iirc: "if i remember correctly", ikr: "i know right", iktr: "i know that is right",
	ilu: "i love you", imho: "in my honest opinion", imu: "i miss you",
	imy: "i miss you", innit: "is it not", istfg: "i swear to god",
	istg: "i swear to god", iykyk: "if you know you know", jit: "a young person",
	jomo: "joy of missing out", lmk: "let me know", looksmaxxing: "improving your looks",
	lowk: "kind of", mandem: "friends", mewing: "a jaw posture trend",
	mfw: "my face when", mkay: "okay", mog: "outshine",
	mogging: "outshining someone", moots: "mutual followers", nbd: "no big deal",
	newb: "beginner", ngmi: "not going to make it", nocap: "no lie",
	noice: "nice", noob: "beginner", npc: "a boring person",
	nvmd: "never mind", obv: "obviously", omfg: "oh my god",
	oml: "oh my lord", ong: "on god", oomf: "one of my followers",
	ootd: "outfit of the day", opp: "an enemy", opps: "enemies",
	otw: "on the way", perf: "perfect", pfp: "profile picture",
	pmo: "that makes me mad", pog: "awesome", pookie: "sweetheart",
	pov: "point of view", presh: "precious", pupper: "puppy",
	pwned: "beaten badly", ratioed: "outnumbered in replies", ridic: "ridiculous",
	rizzed: "charmed", rizzing: "charming", rizzler: "a charming person",
	rizzless: "without charm", sadge: "sad", sesh: "session",
	shawty: "a girl", sheesh: "wow", shooketh: "shocked",
	simp: "someone too eager to please", situationship: "an undefined relationship", skibidi: "silly",
	skrrt: "leaving fast", sksksk: "laughing", smdh: "shaking my head",
	smol: "small and cute", smth: "something", stanning: "being a big fan",
	sth: "something", sussy: "suspicious", tbch: "to be completely honest",
	tbt: "throwback", tf: "the heck", tfw: "that feeling when",
	tmi: "too much information", totes: "totally", tryhard: "someone trying too hard",
	tryna: "trying to", ttfn: "bye for now", ttly: "totally",
	ttys: "talk to you soon", tuff: "cool", uwu: "cute",
	vibey: "atmospheric", wagmi: "we are all going to make it", wagwan: "what is up",
	wbk: "we been knew", wdym: "what do you mean", whatev: "whatever",
	wth: "what the heck", wtv: "whatever", wya: "where are you at",
	yaas: "yes", yapper: "someone who talks too much", yas: "yes",
	yass: "yes", yeet: "throw hard", yessir: "yes",
	yk: "you know", ykw: "you know what", ykwim: "you know what i mean",
	yolo: "you only live once", yw: "you are welcome", zoomer: "a young person",
};

// Slang that is also an ordinary word ("I ate pizza"). Never rewritten; only used to answer "what does mid mean".
export const WORD_SLANG: Record<string, string> = {
	ate: "did amazing", aura: "coolness", bait: "obvious",
	banger: "a great song", bare: "lots of", based: "true to yourself",
	basic: "unoriginal", bet: "okay", bop: "a good song",
	bro: "a close friend", buff: "strengthen", buggin: "acting crazy",
	cap: "a lie", clout: "fame or influence", clutch: "perfectly timed",
	cooked: "doomed or done for", cringe: "embarrassing", crying: "laughing hard",
	dead: "laughing hard", drip: "stylish clothes", dub: "a win",
	era: "a phase", extra: "over the top", fax: "facts",
	fire: "really good", flex: "show off", gaslight: "make someone doubt reality",
	gassed: "excited", ghosted: "suddenly ignored", ghosting: "suddenly ignoring someone",
	glazing: "overpraising someone", goat: "the greatest of all time", ick: "a sudden turn off",
	legit: "real or genuine", lit: "exciting or fun", long: "tedious",
	mid: "mediocre or average", mood: "relatable", mother: "an icon",
	nerf: "weaken", op: "overpowered", peak: "the best",
	pressed: "upset", prob: "problem or probably", purr: "agreed",
	ratio: "more replies than likes", receipts: "proof", rent: "living in your head",
	salty: "bitter or annoyed", savage: "brutally honest", screaming: "laughing hard",
	shook: "shocked", sigma: "a lone wolf", sis: "a close friend",
	slaps: "is really good", slay: "did great", snatched: "looking great",
	spill: "share the gossip", stan: "be a huge fan of", sweaty: "trying too hard",
	tea: "gossip", trash: "really bad", tweaking: "acting crazy",
	unhinged: "wild", valid: "fair or acceptable", vibe: "a feeling or atmosphere",
	vibes: "the feeling of a place", yap: "talk too much", yapping: "talking too much",
	zesty: "flamboyant",
};

// Pure-slang keys that the subtitle word list happens to contain. Safe to rewrite anyway.
export const PURE_SLANG_IN_WORD_LIST = new Set([
	"af", "aight", "bae", "bangin", "bbs", "bestie", "bf", "bff", "bffs", "bromance", "deets", "ez", "fave", "fs", "girlie", "hella", "ight", "innit", "noob", "ong", "pookie", "sesh", "sheesh", "tmi", "totes", "tuff", "yas", "yessir", "yolo",
]);
```

- [ ] **Step 4: Rewrite pure slang in `normalize()`** (`lib/agent/talk.ts`)

Add `import { PURE_SLANG } from "./lexicon/slang";`. In `normalize`, change

```ts
		.map((w) => taught[w] ?? SLANG[w] ?? DONOR_SLANG[w] ?? w)
```

to

```ts
		.map((w) => taught[w] ?? SLANG[w] ?? DONOR_SLANG[w] ?? PURE_SLANG[w] ?? w)
```

(Task 5 replaces this line again; keep the order: taught, built-in, donor, pure.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/agent/lexicon/slang.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

---

### Task 4: The typo corrector (pure module)

**Files:**
- Create: `lib/agent/lexicon/phrases.ts`
- Create: `lib/agent/lexicon/banned.ts`
- Create: `lib/agent/lexicon/spelling.ts`
- Test: `lib/agent/lexicon/spelling.test.ts`

**Interfaces:**
- Produces:
  - `SpellContext = { recent?: readonly string[]; protect?: ReadonlySet<string> }`
  - `SpellConfig = { known; candidates; rank; phrases; slotWords; banned }`
  - `typoCost(a, b, max): number`
  - `createCorrector(config): (words: readonly string[], ctx?: SpellContext) => string[]`
  - `PHRASES: readonly string[]`
  - `BANNED_WORDS: ReadonlySet<string>`

- [ ] **Step 1: Write the failing test** `lib/agent/lexicon/spelling.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { createCorrector, typoCost, type SpellConfig } from "./spelling";

// A tiny, fully controlled vocabulary, so each rule can be tested on its own.
const vocab = ["you", "your", "our", "the", "thanks", "what", "have", "home", "sad", "sea", "pizza", "pita", "myself", "feeling", "slurx"];
const other = ["how", "are", "i", "am", "is", "name", "a", "dog", "kill", "want", "to"];
const config: SpellConfig = {
	known: (w) => vocab.includes(w) || other.includes(w),
	candidates: vocab,
	rank: (w) => (vocab.includes(w) ? 100 : 50000),
	phrases: ["how are you", "what is your name", "i am feeling"],
	slotWords: new Set(["sad"]),
	banned: new Set(["slurx"]),
};
const fix = createCorrector(config);

describe("typoCost", () => {
	it("makes typo-shaped slips cheap", () => {
		expect(typoCost("teh", "the", 1)).toBeCloseTo(0.6);
		expect(typoCost("piza", "pizza", 1)).toBeCloseTo(0.6);
		expect(typoCost("thsnks", "thanks", 1)).toBeCloseTo(0.6);
		expect(typoCost("hame", "have", 1)).toBeCloseTo(1);
		expect(typoCost("abc", "xyz", 1)).toBe(Infinity);
	});
});

describe("createCorrector", () => {
	it("fixes a short word only when the phrase around it makes it clear", () => {
		expect(fix(["how", "are", "yuo"])).toEqual(["how", "are", "you"]);
		expect(fix(["gur"])).toEqual(["gur"]);
	});

	it("prefers a feeling where a feeling is expected", () => {
		expect(fix(["i", "am", "sda"])).toEqual(["i", "am", "sad"]);
	});

	it("leaves a tie alone, and lets the recent conversation break it", () => {
		expect(fix(["i", "hame"])).toEqual(["i", "hame"]);
		expect(fix(["i", "hame"], { recent: ["home"] })).toEqual(["i", "home"]);
	});

	it("never changes known, protected or non-letter words", () => {
		expect(fix(["the", "sea"])).toEqual(["the", "sea"]);
		expect(fix(["how", "are", "yuo"], { protect: new Set(["yuo"]) })).toEqual(["how", "are", "yuo"]);
		expect(fix(["2day"])).toEqual(["2day"]);
	});

	it("never offers a banned word as a guess", () => {
		expect(fix(["slurz"])).toEqual(["slurz"]);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/agent/lexicon/spelling.test.ts`
Expected: FAIL, cannot resolve `./spelling`.

- [ ] **Step 3: Create** `lib/agent/lexicon/phrases.ts`

```ts
// Phrases Osmo expects, written the way normalize() leaves them. The typo guesser prefers a word that completes one.
export const PHRASES: readonly string[] = [
	"how are you", "how are you doing", "how is it going", "how have you been", "what is up", "what is your name",
	"what are you doing", "what are you up to", "what can you do", "what are you made of", "who are you",
	"thank you", "thank you so much", "thanks a lot", "i love you", "i miss you", "i am feeling", "i feel",
	"good morning", "good night", "good afternoon", "see you later", "talk to you later", "nice to meet you",
	"tell me a story", "give me a dilemma", "roll a new osmo", "what does it mean", "i do not know",
	"i do not understand", "i am sorry", "no problem", "of course", "never mind", "you are welcome",
	"what do you mean", "are you there", "my name is", "call me", "i want to", "i am going to", "do you know",
	"can you help me", "i need help", "i am so", "i am really", "what is the meaning of",
];
```

- [ ] **Step 4: Create** `lib/agent/lexicon/banned.ts`

```ts
// Swear words and slurs. Recognized (never "corrected"), but never offered as a typo guess
// and never defined in a lookup, so a slip of the keyboard can't turn into one.
export const BANNED_WORDS: ReadonlySet<string> = new Set([
	"fuck", "fucking", "fucked", "fucker", "shit", "shitty", "bitch", "bitches", "cunt", "dick", "dicks", "cock", "pussy",
	"slut", "whore", "fag", "fags", "faggot", "nigger", "nigga", "niggas", "retard", "retarded", "spic", "chink", "kike",
	"tranny", "twat", "wanker", "bastard", "asshole", "motherfucker", "dyke", "coon", "gook", "wetback", "raghead",
]);
```

- [ ] **Step 5: Create** `lib/agent/lexicon/spelling.ts`

```ts
// Educated guesses for misspelled words: how close the spelling is, how common the word is,
// and context (the phrase it sits in, the kind of word expected there, and what was said recently).

export type SpellContext = {
	// Words from the last few messages; a guess that matches one is likelier.
	recent?: readonly string[];
	// Words that must never change: the user's name, words they taught, names in the message.
	protect?: ReadonlySet<string>;
};

export type SpellConfig = {
	known: (word: string) => boolean; // recognized words are never changed
	candidates: readonly string[]; // possible guesses
	rank: (word: string) => number; // 0 = most common
	phrases: readonly string[]; // phrases Osmo expects, as normalized text
	slotWords: ReadonlySet<string>; // words expected after "i am", "i feel", "feeling"
	banned: ReadonlySet<string>; // never offered as a guess
};

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
// Keys next to each other on a QWERTY keyboard, including the staggered rows above and below.
const NEIGHBORS = new Map<string, Set<string>>();
ROWS.forEach((row, r) => {
	[...row].forEach((key, c) => {
		const near = [row[c - 1], row[c + 1], ROWS[r - 1]?.[c], ROWS[r - 1]?.[c + 1], ROWS[r + 1]?.[c - 1], ROWS[r + 1]?.[c]];
		NEIGHBORS.set(key, new Set(near.filter((k): k is string => !!k)));
	});
});

// Edit distance where typo-shaped slips cost 0.6 instead of 1: swapping two letters, doubling or
// dropping a repeated letter, and hitting the key next door. Infinity once it passes `max`.
export function typoCost(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return Infinity;
	const d: number[][] = [];
	for (let i = 0; i <= a.length; i++) d.push([i, ...new Array<number>(b.length).fill(0)]);
	for (let j = 0; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		let rowBest = Infinity;
		for (let j = 1; j <= b.length; j++) {
			const x = a[i - 1];
			const y = b[j - 1];
			const sub = x === y ? 0 : NEIGHBORS.get(x)?.has(y) ? 0.6 : 1;
			const drop = x === a[i - 2] ? 0.6 : 1;
			const add = y === b[j - 2] ? 0.6 : 1;
			let v = Math.min(d[i - 1][j] + drop, d[i][j - 1] + add, d[i - 1][j - 1] + sub);
			if (i > 1 && j > 1 && x !== y && x === b[j - 2] && a[i - 2] === y) v = Math.min(v, d[i - 2][j - 2] + 0.6);
			d[i][j] = v;
			rowBest = Math.min(rowBest, v);
		}
		if (rowBest > max + 1e-9) return Infinity;
	}
	const cost = d[a.length][b.length];
	return cost <= max + 1e-9 ? cost : Infinity;
}

// Longer words can take one more slip.
const maxEdits = (word: string) => (word.length >= 7 ? 2 : 1);

const MODIFIERS = new Set(["so", "really", "very", "super", "pretty", "kind", "of", "a", "bit", "little", "quite"]);

// True right after "i am", "i feel" or "feeling", allowing "so", "really" and the like in between.
function inFeelingSlot(words: readonly string[], i: number): boolean {
	for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
		if (words[k] === "am" || words[k] === "feel" || words[k] === "feeling") return true;
		if (!MODIFIERS.has(words[k])) return false;
	}
	return false;
}

// How many of the neighbors (two either side) line up with a phrase that contains the guess.
function phraseFit(words: readonly string[], i: number, guess: string, phrases: readonly string[][]): number {
	let best = 0;
	for (const phrase of phrases) {
		phrase.forEach((w, k) => {
			if (w !== guess) return;
			let matches = 0;
			for (const off of [-2, -1, 1, 2]) if (phrase[k + off] !== undefined && phrase[k + off] === words[i + off]) matches++;
			best = Math.max(best, matches);
		});
	}
	return best;
}

// Guesses rarer than this all count the same.
const RARE = 60000;
// A guess must score at least this well, and beat the runner-up by at least MARGIN, or the word stays as typed.
const MAX_SCORE = 6.5;
const MARGIN = 1;

export function createCorrector(config: SpellConfig) {
	const phrases = config.phrases.map((p) => p.split(" "));
	const nearbyCache = new Map<string, { word: string; cost: number }[]>();

	// Every candidate within reach of a word, with its spelling cost. Cached per word.
	const nearby = (word: string) => {
		const cached = nearbyCache.get(word);
		if (cached) return cached;
		const max = maxEdits(word);
		const found: { word: string; cost: number }[] = [];
		for (const candidate of config.candidates) {
			if (candidate === word || config.banned.has(candidate)) continue;
			const cost = typoCost(word, candidate, max);
			if (cost !== Infinity) found.push({ word: candidate, cost });
		}
		if (nearbyCache.size > 2000) nearbyCache.clear();
		nearbyCache.set(word, found);
		return found;
	};

	return function correctTypos(words: readonly string[], ctx: SpellContext = {}): string[] {
		const out = [...words];
		const recent = new Set(ctx.recent ?? []);
		for (let i = 0; i < out.length; i++) {
			const word = out[i];
			if (!/^[a-z]+$/.test(word) || config.known(word) || ctx.protect?.has(word)) continue;
			const slot = inFeelingSlot(out, i);
			const scored = nearby(word)
				.map(({ word: guess, cost }) => {
					const fit = phraseFit(out, i, guess, phrases);
					const slotted = slot && config.slotWords.has(guess);
					const score =
						cost * 3 +
						Math.log10(Math.min(config.rank(guess), RARE) + 10) -
						fit * 1.2 -
						(slotted ? 2 : 0) -
						(recent.has(guess) ? 1.5 : 0);
					return { guess, fit, slotted, score };
				})
				.sort((x, y) => x.score - y.score);
			const [best, next] = scored;
			if (!best || best.score > MAX_SCORE || (next && next.score - best.score < MARGIN)) continue;
			// Short words are too easy to mangle ("gur", "idk") without a phrase or a feeling slot to go on.
			if (word.length <= 3 && best.fit < 2 && !best.slotted) continue;
			out[i] = best.guess;
		}
		return out;
	};
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/agent/lexicon/spelling.test.ts`
Expected: PASS (6 tests). If `fix(["i", "hame"])` is corrected instead of left alone, check that `have` and `home` both cost 1 and share rank 100. The tie must fall under `MARGIN`.

- [ ] **Step 7: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass.

---

### Task 5: Osmo reads typos (wire the corrector in)

**Files:**
- Modify: `lib/agent/talk.ts`: `normalize`, `parse`, `understand`, and one corrector instance
- Modify: `lib/agent/safety.ts`: `isCrisis` also checks the corrected text
- Modify: `lib/agent/mind.ts`: `TurnContext.recent`, and step 6 passes a spell context
- Test: `lib/agent/typos.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces:
  - `normalize(text, taught = {}, spell: SpellContext | false = {})` (`false` means no typo fixing)
  - `parse(original, taught = {}, spell: SpellContext = {})`
  - `understand(original, taught = {}, spell: SpellContext = {})`
  - `TurnContext.recent?: string[]`

- [ ] **Step 1: Write the failing test** `lib/agent/typos.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { newSession, processTurn } from "./mind";
import { isCrisis } from "./safety";
import { defaultState } from "./state";
import { normalize, parse } from "./talk";

const ctx = () => ({ now: 1_000_000, lastAt: null, uuid: () => "id" });

describe("Osmo reads typos", () => {
	it("fixes common typos from the spelling, the phrase and the kind of word expected", () => {
		expect(normalize("how are yuo")).toBe("how are you");
		expect(normalize("im feelign sda")).toBe("i am feeling sad");
		expect(normalize("thnaks")).toBe("thanks");
		expect(normalize("whats yuor name")).toBe("what is your name");
		expect(normalize("i hvae a dog")).toBe("i have a dog");
		expect(normalize("whta")).toBe("what");
	});

	it("uses the recent conversation to break a close call", () => {
		expect(normalize("i want piza", {}, { recent: ["pizza"] })).toBe("i want pizza");
	});

	it("leaves names, slang, rare words and numbers alone", () => {
		for (const text of ["gur", "yeet", "rizz", "petrichor", "ok", "lol", "2day", "i have 3 cats", "jiggle"]) {
			expect(normalize(text), text).toBe(normalize(text, {}, false));
		}
		expect(normalize("my dog Nala is cute")).toBe("my dog nala is cute");
		expect(normalize("gurr", {}, { protect: new Set(["gurr"]) })).toBe("gurr");
		expect(normalize("gurr", { gurr: "friend" })).toBe("friend");
	});

	it("catches a crisis message even with a typo", () => {
		expect(isCrisis("i want to kill myslef")).toBe(true);
		expect(isCrisis("i want to kill time")).toBe(false);
	});

	it("understands a message with typos end to end", () => {
		expect(parse("how are yuo").intent.type).toBe("howAreYou");
		expect(processTurn(defaultState(), newSession(), "thnaks", ctx()).reply).toMatch(/anytime|no problem|of course/i);
		expect(processTurn(defaultState(), newSession(), "i want piza", { ...ctx(), recent: ["pizza"] }).reply).toBeNull();
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/agent/typos.test.ts`
Expected: FAIL (for example `expected 'how are yuo' to be 'how are you'`).

- [ ] **Step 3: Build one corrector in `talk.ts`**

Add the imports:

```ts
import { BANNED_WORDS } from "./lexicon/banned";
import { FEELING_SYNONYMS, feelingFor } from "./lexicon/feelings";
import { PHRASES } from "./lexicon/phrases";
import { PURE_SLANG, WORD_SLANG } from "./lexicon/slang";
import { createCorrector, type SpellContext } from "./lexicon/spelling";
import { isKnownWord, WORD_LIST, wordRank } from "./lexicon/words";
```

(Keep the existing `feelingFor` and `PURE_SLANG` imports merged into these lines; no duplicates.) Directly **after** the line that defines `ALL_FEELINGS`, add:

```ts
const own = (table: Record<string, string>, word: string) => (Object.hasOwn(table, word) ? table[word] : undefined);
const PHRASE_WORDS = new Set(PHRASES.flatMap((p) => p.split(" ")));
const FEELING_WORDS = new Set([...ALL_FEELINGS, ...Object.keys(FEELING_SYNONYMS)]);

// One typo guesser for everything Osmo reads. A word he recognizes is never changed.
const fixTypos = createCorrector({
	known: (w) =>
		isKnownWord(w) ||
		FEELING_WORDS.has(w) ||
		PHRASE_WORDS.has(w) ||
		own(SLANG, w) !== undefined ||
		own(DONOR_SLANG, w) !== undefined ||
		own(PURE_SLANG, w) !== undefined ||
		own(WORD_SLANG, w) !== undefined,
	candidates: [...new Set([...WORD_LIST, ...FEELING_WORDS, ...PHRASE_WORDS])],
	rank: wordRank,
	phrases: PHRASES,
	slotWords: FEELING_WORDS,
	banned: BANNED_WORDS,
});

// Words the guesser must leave alone: the context's list, anything the user taught,
// and capitalized words mid-sentence, which are probably names ("my dog Nala").
function protectedWords(text: string, taught: Record<string, string>, spell: SpellContext): Set<string> {
	const keep = new Set<string>(spell.protect ?? []);
	for (const [word, meaning] of Object.entries(taught)) {
		keep.add(word);
		for (const w of meaning.toLowerCase().split(/\s+/)) keep.add(w);
	}
	let sentenceStart = true;
	for (const token of text.split(/\s+/)) {
		const bare = token.replace(/[^A-Za-z]/g, "");
		if (!sentenceStart && /^[A-Z][a-z]+$/.test(bare)) keep.add(bare.toLowerCase());
		if (token) sentenceStart = /[.!?]$/.test(token);
	}
	return keep;
}
```

- [ ] **Step 4: Fix typos inside `normalize`** (`talk.ts`)

Change the signature to

```ts
export function normalize(text: string, taught: Record<string, string> = {}, spell: SpellContext | false = {}): string {
```

and replace the body's final `return t ... .trim();` chain with:

```ts
	const lookUp = (w: string) => own(taught, w) ?? own(SLANG, w) ?? own(DONOR_SLANG, w) ?? own(PURE_SLANG, w) ?? w;
	const mapped = t
		.replace(/[^\w\s]/g, " ")
		.split(/\s+/)
		.filter(Boolean)
		.map(unstretch)
		.map(lookUp)
		.filter(Boolean)
		.join(" ")
		.split(" ");
	const words = spell === false ? mapped : fixTypos(mapped, { recent: spell.recent, protect: protectedWords(text, taught, spell) });
	return words
		// A corrected word can itself be slang ("ngl"), so look it up again.
		.map((w, i) => (w === mapped[i] ? w : lookUp(w)))
		.join(" ")
		// "ur" is "your" in "ur name" but "you are" in "ur so smart".
		.replace(/\byour (?=(?:so|really|very|pretty|super|such|not|welcome|right|wrong|the best|kind|nice|smart|sweet|cool|funny|great|awesome|amazing|helpful|stupid|dumb|useless|annoying|mean|weird|good|bad)\b)/g, "you are ")
		.replace(/\s+/g, " ")
		.trim();
```

Copy the `your (?=...)` regex from the current file exactly as it is if it has changed since this plan was written. `own()` also fixes an old bug where "constructor" read a prototype value.

- [ ] **Step 5: Pass the spell context through `parse` and `understand`** (`talk.ts`)

- `export function parse(original: string, taught: Record<string, string> = {}): Parsed {` becomes `export function parse(original: string, taught: Record<string, string> = {}, spell: SpellContext = {}): Parsed {`.
- Inside it, `let words = normalize(original, taught);` becomes `let words = normalize(original, taught, spell);`.
- `export function understand(original: string, taught: Record<string, string> = {}): Parsed[] {` becomes `export function understand(original: string, taught: Record<string, string> = {}, spell: SpellContext = {}): Parsed[] {`.
- Inside `understand`, `parse(original, taught)` becomes `parse(original, taught, spell)` and `.map((c) => parse(c, taught))` becomes `.map((c) => parse(c, taught, spell))`.

- [ ] **Step 6: Check crisis on the corrected text too** (`lib/agent/safety.ts`)

Replace

```ts
export function isCrisis(text: string): boolean {
	return CRISIS.test(normalize(text));
}
```

with

```ts
// Checked as typed, then again with typos fixed ("kill myslef"). Fixing typos can only add a match.
export function isCrisis(text: string): boolean {
	return CRISIS.test(normalize(text, {}, false)) || CRISIS.test(normalize(text));
}
```

- [ ] **Step 7: Give `processTurn` the recent words** (`lib/agent/mind.ts`; re-read it first, then edit only these two spots)

In `TurnContext`, after `seed?: number;` add:

```ts
	// Words from the last few messages, so a typo can be read in context ("piza" after talking about pizza).
	recent?: string[];
```

In step 6, replace

```ts
	const parts = understand(trimmed, ctx.slang);
```

with

```ts
	const spell = { recent: ctx.recent, protect: ctx.userName ? new Set([ctx.userName.toLowerCase()]) : undefined };
	const parts = understand(trimmed, ctx.slang, spell);
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run lib/agent/typos.test.ts`
Expected: PASS (5 tests). If "petrichor" or "jiggle" changes, the corrector found a close word under `MAX_SCORE`. Look at that candidate's score before changing any constant, and record any change as a ruling.

- [ ] **Step 9: Checkpoint (the whole suite matters here)**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass. The corrector now runs on every message, so an existing test can break if a sentence contains a word outside the list. Fix the corrector or the vocabulary, not the test, unless the new reading is plainly right. Record any such case as a ruling.

---

### Task 6: Learning the user's vocabulary

**Files:**
- Modify: `lib/agent/lexicon/spelling.ts`: `SpellContext.personal`, `MIN_USES`
- Create: `lib/agent/lexicon/vocabulary.ts`
- Modify: `lib/agent/talk.ts`: export `isRecognized` and `unfamiliarWords`
- Modify: `lib/agent/mind.ts`: `TurnContext.vocabulary`, and step 6 passes it on (re-read the file first)
- Test: extend `lib/agent/lexicon/spelling.test.ts`; create `lib/agent/lexicon/vocabulary.test.ts`

**Interfaces:**
- Consumes: `createCorrector`, `SpellContext` (Task 4); `normalize` with a spell context (Task 5).
- Produces:
  - `SpellContext.personal?: ReadonlyMap<string, number>` (word → uses)
  - `MIN_USES = 2`
  - `learnWords(vocab: Readonly<Record<string, number>>, words: readonly string[]): Record<string, number>`
  - `isRecognized(word): boolean`
  - `unfamiliarWords(text, taught = {}, spell = {}): string[]`
  - `TurnContext.vocabulary?: Record<string, number>`

- [ ] **Step 1: Write the failing tests**

Append to `lib/agent/lexicon/spelling.test.ts`:

```ts
describe("the user's own words", () => {
	it("never changes a word the user has used enough, and reads a typo of it as that word", () => {
		const personal = new Map([["valo", 2]]);
		expect(fix(["valo"], { personal })).toEqual(["valo"]);
		expect(fix(["vlao"], { personal })).toEqual(["valo"]);
	});

	it("ignores a word used only once", () => {
		expect(fix(["vlao"], { personal: new Map([["valo", 1]]) })).toEqual(["vlao"]);
	});
});
```

Create `lib/agent/lexicon/vocabulary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalize, unfamiliarWords } from "../talk";
import { learnWords } from "./vocabulary";

describe("learning the user's vocabulary", () => {
	it("counts each unfamiliar word once per message", () => {
		expect(learnWords({}, ["valo", "valo", "nala"])).toEqual({ valo: 1, nala: 1 });
		expect(learnWords({ valo: 1 }, ["valo"])).toEqual({ valo: 2 });
	});

	it("only learns words Osmo doesn't know and wouldn't correct", () => {
		expect(unfamiliarWords("gg valo tonight with nala")).toEqual(["valo", "nala"]);
		expect(unfamiliarWords("my freind is here")).toEqual([]);
		expect(unfamiliarWords("i have 3 cats and a dog")).toEqual([]);
		expect(unfamiliarWords("zq")).toEqual([]);
	});

	it("makes a word the user's own after two messages", () => {
		let vocab = {};
		for (const text of ["valo later?", "more valo"]) vocab = learnWords(vocab, unfamiliarWords(text));
		expect(normalize("vlao tonight", {}, { personal: new Map(Object.entries(vocab)) })).toBe("valo tonight");
	});
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/agent/lexicon/spelling.test.ts lib/agent/lexicon/vocabulary.test.ts`
Expected: FAIL. `vlao` is not corrected, and `./vocabulary` and `unfamiliarWords` don't exist.

- [ ] **Step 3: Teach the corrector the user's words** (`lib/agent/lexicon/spelling.ts`)

Add `personal` to `SpellContext`:

```ts
	// How often the user has used words Osmo didn't know. At MIN_USES a word is theirs.
	personal?: ReadonlyMap<string, number>;
```

Add below the `SpellConfig` type:

```ts
// Messages a word must appear in before Osmo treats it as the user's own.
export const MIN_USES = 2;
```

In `correctTypos`, replace

```ts
		const out = [...words];
		const recent = new Set(ctx.recent ?? []);
		for (let i = 0; i < out.length; i++) {
			const word = out[i];
			if (!/^[a-z]+$/.test(word) || config.known(word) || ctx.protect?.has(word)) continue;
			const slot = inFeelingSlot(out, i);
			const scored = nearby(word)
```

with

```ts
		const out = [...words];
		const recent = new Set(ctx.recent ?? []);
		const yours = [...(ctx.personal ?? [])].filter(([, uses]) => uses >= MIN_USES).map(([w]) => w);
		const isYours = new Set(yours);
		for (let i = 0; i < out.length; i++) {
			const word = out[i];
			if (!/^[a-z]+$/.test(word) || config.known(word) || ctx.protect?.has(word) || isYours.has(word)) continue;
			const slot = inFeelingSlot(out, i);
			// The user's own words can be guesses too, and count as very common.
			const theirs = yours.flatMap((w) => {
				const cost = typoCost(word, w, maxEdits(word));
				return cost === Infinity ? [] : [{ word: w, cost }];
			});
			const scored = [...nearby(word), ...theirs]
```

and in the score calculation change `Math.log10(Math.min(config.rank(guess), RARE) + 10)` to `Math.log10(Math.min(isYours.has(guess) ? 0 : config.rank(guess), RARE) + 10)`.

- [ ] **Step 4: Create** `lib/agent/lexicon/vocabulary.ts`

```ts
// How many of the user's messages each unfamiliar word has appeared in. Understanding only:
// Osmo reads these words, but never adopts them in his own professional replies.
export function learnWords(vocab: Readonly<Record<string, number>>, words: readonly string[]): Record<string, number> {
	const next = { ...vocab };
	for (const word of new Set(words)) next[word] = (Object.hasOwn(next, word) ? next[word] : 0) + 1;
	return next;
}
```

- [ ] **Step 5: Export the recognizer and `unfamiliarWords`** (`lib/agent/talk.ts`)

Turn the corrector's `known` predicate into a named export, and use it in `createCorrector({ known: isRecognized, ... })`:

```ts
// A word Osmo recognizes: a real word, his slang, a feeling, or part of a phrase he expects.
export const isRecognized = (w: string): boolean =>
	isKnownWord(w) ||
	FEELING_WORDS.has(w) ||
	PHRASE_WORDS.has(w) ||
	own(SLANG, w) !== undefined ||
	own(DONOR_SLANG, w) !== undefined ||
	own(PURE_SLANG, w) !== undefined ||
	own(WORD_SLANG, w) !== undefined;
```

Then add, after `normalize`:

```ts
// Words in a message that Osmo neither recognizes nor would correct: names, in-jokes, new slang.
export function unfamiliarWords(text: string, taught: Record<string, string> = {}, spell: SpellContext = {}): string[] {
	const words = normalize(text, taught, spell).split(" ");
	return [...new Set(words.filter((w) => /^[a-z]{3,}$/.test(w) && !isRecognized(w)))];
}
```

(`normalize` has already fixed typos, so "freind" arrives as "friend" and is recognized.)

- [ ] **Step 6: Pass the vocabulary through `processTurn`** (`lib/agent/mind.ts`, `TurnContext` and step 6 only)

In `TurnContext`, after `recent?: string[];` add:

```ts
	// The user's own words and how often they've used them, so they are never taken for typos.
	vocabulary?: Record<string, number>;
```

In step 6, change

```ts
	const spell = { recent: ctx.recent, protect: ctx.userName ? new Set([ctx.userName.toLowerCase()]) : undefined };
```

to

```ts
	const spell = {
		recent: ctx.recent,
		protect: ctx.userName ? new Set([ctx.userName.toLowerCase()]) : undefined,
		personal: ctx.vocabulary ? new Map(Object.entries(ctx.vocabulary)) : undefined,
	};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run lib/agent/lexicon/spelling.test.ts lib/agent/lexicon/vocabulary.test.ts`
Expected: PASS. If `unfamiliarWords("gg valo tonight with nala")` also returns "gg", check that the donor lexicon still contains `gg`. Otherwise drop "gg" from the test sentence and record a ruling.

- [ ] **Step 8: Save the vocabulary in Supabase**

Apply the migration (MCP `apply_migration`, project_id `jtkeljvldtngkrftzwdm`, name `add_user_words`):

```sql
create table public.user_words (
	user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	word text not null,
	uses integer not null default 1,
	updated_at timestamptz not null default now(),
	primary key (user_id, word)
);
alter table public.user_words enable row level security;
create policy "own user_words" on public.user_words for all to authenticated
	using ((select auth.uid()) = user_id)
	with check ((select auth.uid()) = user_id);
```

Run `get_advisors` (security). Expected: nothing new. Then create `lib/agent/vocabulary-store.ts`:

```ts
import { ensureSession, supabase } from "../supabase";

// The user's own words (names, in-jokes, jargon) and how often they've used them, private per user.

export async function loadVocabulary(): Promise<Record<string, number>> {
	try {
		if (!(await ensureSession())) return {};
		const { data, error } = await supabase.from("user_words").select("word,uses").order("uses", { ascending: false }).limit(1000);
		if (error || !data) return {};
		return Object.fromEntries(data.map((row) => [row.word as string, row.uses as number]));
	} catch {
		return {};
	}
}

export async function saveVocabulary(changed: Record<string, number>): Promise<void> {
	const rows = Object.entries(changed).map(([word, uses]) => ({ word, uses, updated_at: new Date().toISOString() }));
	if (rows.length === 0) return;
	const { error } = await supabase.from("user_words").upsert(rows, { onConflict: "user_id,word" });
	if (error) console.error("Could not save the user's vocabulary", error);
}
```

- [ ] **Step 9: Checkpoint, then hand `mind.ts` back**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass. Message the other session: "Done in mind.ts for now (TurnContext.recent/vocabulary, step 6 spell context)."

---

### Task 7: The dictionary

**Files:**
- Create: `lib/agent/dictionary.ts`
- Test: `lib/agent/dictionary.test.ts`

**Interfaces:**
- Consumes:
  - `PURE_SLANG`, `WORD_SLANG` (Task 3)
  - `BANNED_WORDS` (Task 4)
  - `isKnownWord` (Task 1)
  - `SLANG` from `talk.ts`
  - `mergedLexicon` from `personality/assemble` (import only)
- Produces:
  - `parseLookup(text): string | null`
  - `lookupWord(term, deps): Promise<Lookup>`
  - `formatDefinition(lookup): string`
  - `cleanSenses(raw)`
  - types `Sense`, `Lookup`, `CachedLookup`, `LookupDeps`

- [ ] **Step 1: Write the failing test** `lib/agent/dictionary.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatDefinition, lookupWord, parseLookup, type CachedLookup, type LookupDeps } from "./dictionary";

type Route = unknown | "down" | "hang" | "error";
// A fake network: the first route whose key appears in the URL answers.
function network(routes: Record<string, Route>) {
	const calls: string[] = [];
	const fetch: LookupDeps["fetch"] = async (url) => {
		calls.push(url);
		const key = Object.keys(routes).find((k) => url.includes(k));
		const route = key === undefined ? undefined : routes[key];
		if (route === "down") throw new Error("offline");
		if (route === "hang") return new Promise(() => {});
		if (route === undefined || route === "error") return { ok: false, json: async () => ({}) };
		return { ok: true, json: async () => route };
	};
	return { fetch, calls };
}
const muse = (word: string, defs: string[]) => [{ word, defs }];
const wiki = (pos: string, html: string) => ({ en: [{ partOfSpeech: pos, definitions: [{ definition: html }] }] });

describe("parseLookup", () => {
	it("finds the term in word questions, typed or spoken", () => {
		expect(parseLookup("what does ephemeral mean?")).toBe("ephemeral");
		expect(parseLookup("um what does ephemeral mean")).toBe("ephemeral");
		expect(parseLookup("hey osmo define petrichor")).toBe("petrichor");
		expect(parseLookup("What's a platypus")).toBe("platypus");
		expect(parseLookup("what is love")).toBe("love");
		expect(parseLookup("meaning of no cap")).toBe("no cap");
		expect(parseLookup("what does y'all mean")).toBe("y'all");
		expect(parseLookup("define self-care")).toBe("self-care");
	});

	it("leaves other questions alone", () => {
		for (const text of ["what's up", "what is my name", "what is 2+2", "what is it", "what is the weather like", "hello", "what is your favorite color"]) {
			expect(parseLookup(text), text).toBeNull();
		}
	});
});

describe("lookupWord and formatDefinition", () => {
	const put = () => {
		const saved: CachedLookup[] = [];
		return { saved, cachePut: async (e: CachedLookup) => void saved.push(e) };
	};

	it("defines a word from Datamuse as a spoken sentence, and caches it", async () => {
		const { fetch } = network({ datamuse: muse("ephemeral", ["adj\tLasting for a short period of time. "]) });
		const { saved, cachePut } = put();
		const result = await lookupWord("ephemeral", { fetch, cachePut });
		expect(formatDefinition(result)).toBe("Ephemeral means lasting for a short period of time.");
		expect(saved).toEqual([{ term: "ephemeral", word: "ephemeral", definition: "Lasting for a short period of time.", partOfSpeech: "adjective", slang: false, source: "datamuse" }]);
	});

	it("says when a sense is slang, and reads nouns naturally", async () => {
		// A made-up word, so no built-in slang list answers first.
		const slang = network({ datamuse: muse("blorptastic", ["n\t(slang, of a person) The ability to attract a love interest. "]) });
		expect(formatDefinition(await lookupWord("blorptastic", { fetch: slang.fetch }))).toBe("Blorptastic is slang for the ability to attract a love interest.");
		const noun = network({ datamuse: muse("platypus", ["n\tA semiaquatic monotreme from eastern Australia. "]) });
		expect(formatDefinition(await lookupWord("platypus", { fetch: noun.fetch }))).toBe("A platypus is a semiaquatic monotreme from eastern Australia.");
	});

	it("guesses the word a typo meant", async () => {
		const { fetch } = network({ datamuse: muse("ephemeral", ["adj\tLasting for a short period of time."]) });
		expect(formatDefinition(await lookupWord("ephemrel", { fetch }))).toBe("I believe you meant ephemeral. It means lasting for a short period of time.");
	});

	it("does not 'correct' a real word; it asks Wiktionary instead", async () => {
		const { fetch, calls } = network({ datamuse: muse("juggle", ["v\tTo toss objects."]), wiktionary: wiki("Verb", "To <a href=\"/wiki/shake\">shake</a> rapidly.") });
		expect(formatDefinition(await lookupWord("jiggle", { fetch }))).toBe("Jiggle means to shake rapidly.");
		expect(calls.some((u) => u.includes("wiktionary") && u.includes("jiggle"))).toBe(true);
	});

	it("falls back to Wiktionary when Datamuse fails, stripping HTML", async () => {
		const { fetch } = network({ datamuse: "error", wiktionary: wiki("Noun", "The <b>smell</b> of rain on dry ground &amp; soil.") });
		expect(formatDefinition(await lookupWord("petrichor", { fetch }))).toBe("Petrichor is the smell of rain on dry ground & soil.");
	});

	it("offers to learn the word when both sources are down or silent", async () => {
		const down = network({ datamuse: "down", wiktionary: "down" });
		expect(formatDefinition(await lookupWord("zorpquux", { fetch: down.fetch }))).toBe('I\'m not familiar with "zorpquux". Could you explain it? I\'ll remember.');
		const hang = network({ datamuse: "hang", wiktionary: "hang" });
		const started = Date.now();
		const result = await lookupWord("zorpquux", { fetch: hang.fetch, timeoutMs: 50 });
		expect(result.kind).toBe("missing");
		expect(Date.now() - started).toBeLessThan(1000);
	});

	it("won't repeat offensive words, and doesn't cache them", async () => {
		const { fetch } = network({ datamuse: muse("zlur", ["n\t(offensive, ethnic slur) A slur.", "n\tSomething harmless."]) });
		const { saved, cachePut } = put();
		const result = await lookupWord("zlur", { fetch, cachePut });
		expect(formatDefinition(result)).toBe("I'd rather not repeat that word.");
		expect(saved).toEqual([]);
		const banned = network({});
		expect((await lookupWord("faggot", { fetch: banned.fetch })).kind).toBe("blocked");
		expect(banned.calls).toEqual([]);
	});

	it("answers from what the user taught, built-in slang and the cache without going online", async () => {
		const { fetch, calls } = network({});
		expect(formatDefinition(await lookupWord("bet", { fetch, taught: { bet: "okay" } }))).toBe("In your usage, bet means okay.");
		expect(formatDefinition(await lookupWord("mid", { fetch }))).toBe("Mid is slang for mediocre or average.");
		expect(formatDefinition(await lookupWord("istg", { fetch }))).toBe("Istg is slang for I swear to god.");
		const cached: CachedLookup = { term: "ephemrel", word: "ephemeral", definition: "Lasting for a short time.", partOfSpeech: "adjective", slang: false, source: "datamuse" };
		expect(formatDefinition(await lookupWord("ephemrel", { fetch, cacheGet: async () => cached }))).toBe("I believe you meant ephemeral. It means lasting for a short time.");
		expect(calls).toEqual([]);
	});

	it("keeps definitions short and speakable", async () => {
		const long = "A very long definition " + "that keeps going and going ".repeat(12) + "until the end.";
		const { fetch } = network({ datamuse: muse("wordy", [`adj\t(informal) ${long} (see also: talky)`]) });
		const text = formatDefinition(await lookupWord("wordy", { fetch }));
		expect(text.length).toBeLessThan(220);
		expect(text).not.toMatch(/[()[\]/]/);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/agent/dictionary.test.ts`
Expected: FAIL, cannot resolve `./dictionary`.

- [ ] **Step 3: Create** `lib/agent/dictionary.ts`

```ts
import { BANNED_WORDS } from "./lexicon/banned";
import { PURE_SLANG, WORD_SLANG } from "./lexicon/slang";
import { isKnownWord } from "./lexicon/words";
import { mergedLexicon } from "./personality/assemble";
import { SLANG } from "./talk";

// Word questions: "what does ephemeral mean", "define petrichor", "what's a platypus".
// Definitions come from Datamuse, then Wiktionary, and are cached per user. Replies are whole spoken sentences.

export type Sense = { text: string; pos: string | null; slang: boolean };
export type Lookup =
	| { kind: "found"; term: string; word: string; sense: Sense; source: "taught" | "slang" | "cache" | "datamuse" | "wiktionary" }
	| { kind: "blocked"; term: string }
	| { kind: "missing"; term: string };
export type CachedLookup = { term: string; word: string; definition: string; partOfSpeech: string | null; slang: boolean; source: string };
type Response = { ok: boolean; json: () => Promise<unknown> };
export type LookupDeps = {
	fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	taught?: Record<string, string>; // meanings the user taught, which win over any dictionary
	cacheGet?: (term: string) => Promise<CachedLookup | null>;
	cachePut?: (entry: CachedLookup) => Promise<void>;
	timeoutMs?: number;
};

const LOOKUP_MS = 4000;
const DONOR_SLANG = mergedLexicon();
// Openers people say before the question, typed or spoken.
const FILLER = /^(?:(?:um+|uh+|so|hey|ok|okay|osmo|hey osmo|yo)[,\s]+)+/;
// Words that make "what is X" small talk or a pronoun, not a word question ("what's up", "what is it").
const NOT_TERMS = new Set([
	"it", "this", "that", "up", "new", "wrong", "good", "happening", "going", "the", "a", "an", "me", "you", "him", "her",
	"them", "there", "here", "what", "who", "why", "how", "when", "where", "which", "so", "is", "today", "now",
]);
const TERM = /^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,2}$/;

export function parseLookup(text: string): string | null {
	const t = text
		.trim()
		.toLowerCase()
		.replace(/[’‘]/g, "'")
		.replace(/[?.!]+$/, "")
		.replace(/\s+/g, " ")
		.replace(FILLER, "");
	const m =
		t.match(/^(?:what does|what's|whats|what do)\s+"?(.+?)"?\s+mean$/) ??
		t.match(/^(?:define|definition of|meaning of|what is the meaning of|what's the meaning of|whats the meaning of)\s+"?(.+?)"?$/) ??
		t.match(/^(?:what is|what's|whats)\s+(?:a|an)\s+(.+)$/) ??
		t.match(/^(?:what is|what's|whats)\s+([a-z][a-z'-]*)$/);
	const term = m?.[1].trim();
	if (!term || !TERM.test(term)) return null;
	if (/^(?:my|your|his|her|their|our)\b/.test(term) || term.split(" ").every((w) => NOT_TERMS.has(w))) return null;
	return term;
}

const OFFENSIVE = /\b(?:vulgar|offensive|derogatory|slur|pejorative|obscene)\b/i;
const SLANGY = /\b(?:slang|informal|internet|colloquial)\b/i;
const POS: Record<string, string> = { n: "noun", v: "verb", adj: "adjective", adv: "adverb" };

// Turns raw senses into clean, speakable ones. Any offensive sense blocks the whole word.
export function cleanSenses(raw: { pos: string | null; text: string }[]): { senses: Sense[]; blocked: boolean } {
	const senses: Sense[] = [];
	for (const r of raw) {
		let text = r.text.trim();
		const labels: string[] = [];
		let label = text.match(/^\(([^)]*)\)\s*/);
		while (label) {
			labels.push(label[1]);
			text = text.slice(label[0].length);
			label = text.match(/^\(([^)]*)\)\s*/);
		}
		const tags = labels.join(", ");
		if (OFFENSIVE.test(tags) || OFFENSIVE.test(text.slice(0, 60))) return { senses: [], blocked: true };
		// Brackets would be read out loud, so asides go.
		text = text.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
		if (!text || /^(?:alternative|obsolete|archaic) (?:form|spelling) of\b|^(?:plural|misspelling) of\b/i.test(text)) continue;
		senses.push({ text, pos: r.pos, slang: SLANGY.test(tags) });
	}
	return { senses, blocked: false };
}

async function getJson(url: string, deps: LookupDeps, deadline: number): Promise<unknown | null> {
	const remaining = deadline - Date.now();
	if (remaining <= 0) return null;
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<null>((resolve) => {
		timer = setTimeout(() => {
			controller.abort();
			resolve(null);
		}, remaining);
	});
	try {
		const response = await Promise.race([deps.fetch(url, { signal: controller.signal }), timeout]);
		if (!response || !response.ok) return null;
		return await Promise.race([response.json(), timeout]);
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

type Source = { word: string; raw: { pos: string | null; text: string }[] };

async function fromDatamuse(term: string, deps: LookupDeps, deadline: number): Promise<Source | null> {
	const json = await getJson(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&md=dp&max=1`, deps, deadline);
	const first = Array.isArray(json) ? (json[0] as { word?: unknown; defs?: unknown } | undefined) : undefined;
	if (!first || typeof first.word !== "string") return null;
	const defs = Array.isArray(first.defs) ? first.defs.filter((d): d is string => typeof d === "string") : [];
	return {
		word: first.word,
		raw: defs.map((d) => {
			const [code, ...rest] = d.split("\t");
			return rest.length ? { pos: POS[code] ?? null, text: rest.join(" ") } : { pos: null, text: d };
		}),
	};
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&lt;": "<", "&gt;": ">" };
const stripHtml = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&(?:amp|quot|#39|nbsp|lt|gt);/g, (e) => ENTITIES[e]);

async function fromWiktionary(term: string, deps: LookupDeps, deadline: number): Promise<Source | null> {
	const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term.replace(/ /g, "_"))}`;
	const json = (await getJson(url, deps, deadline)) as { en?: { partOfSpeech?: string; definitions?: { definition?: string }[] }[] } | null;
	const raw = (json?.en ?? []).flatMap((entry) =>
		(entry.definitions ?? [])
			.filter((d) => typeof d.definition === "string")
			.map((d) => ({ pos: entry.partOfSpeech ? entry.partOfSpeech.toLowerCase() : null, text: stripHtml(d.definition!) })),
	);
	return raw.length ? { word: term, raw } : null;
}

const found = (term: string, word: string, sense: Sense, source: Extract<Lookup, { kind: "found" }>["source"]): Lookup => ({
	kind: "found",
	term,
	word,
	sense,
	source,
});

export async function lookupWord(term: string, deps: LookupDeps): Promise<Lookup> {
	const key = term.trim().toLowerCase();
	if (BANNED_WORDS.has(key)) return { kind: "blocked", term: key };
	const taught = deps.taught && Object.hasOwn(deps.taught, key) ? deps.taught[key] : undefined;
	if (taught) return found(key, key, { text: taught, pos: null, slang: false }, "taught");
	const builtIn = [WORD_SLANG, PURE_SLANG, SLANG, DONOR_SLANG].find((table) => Object.hasOwn(table, key));
	if (builtIn) return found(key, key, { text: builtIn[key], pos: null, slang: true }, "slang");

	const cached = await deps.cacheGet?.(key).catch(() => null);
	if (cached) return found(key, cached.word, { text: cached.definition, pos: cached.partOfSpeech, slang: cached.slang }, "cache");

	const deadline = Date.now() + (deps.timeoutMs ?? LOOKUP_MS);
	// The first clean sense from a source, cached; a blocked word stops the search.
	const tryFrom = async (from: Source | null, source: "datamuse" | "wiktionary"): Promise<Lookup | null> => {
		if (!from) return null;
		const { senses, blocked } = cleanSenses(from.raw);
		if (blocked) return { kind: "blocked", term: key };
		const sense = senses[0];
		if (!sense) return null;
		await deps
			.cachePut?.({ term: key, word: from.word, definition: sense.text, partOfSpeech: sense.pos, slang: sense.slang, source })
			.catch(() => undefined);
		return found(key, from.word, sense, source);
	};
	let muse = await fromDatamuse(key, deps, deadline);
	// Datamuse also fixes spelling. A real word must not be "corrected" into another one.
	if (muse && muse.word.toLowerCase() !== key && isKnownWord(key)) muse = null;
	return (
		(await tryFrom(muse, "datamuse")) ??
		(await tryFrom(await fromWiktionary(muse?.word ?? key, deps, deadline), "wiktionary")) ?? { kind: "missing", term: key }
	);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());

// One short clause: long definitions stop at a semicolon or a word boundary.
function shorten(text: string): string {
	let t = text.trim().replace(/[.;,\s]+$/, "");
	if (t.length > 160) {
		const semi = t.indexOf(";");
		t = semi > 20 && semi < 160 ? t.slice(0, semi) : t.slice(0, t.lastIndexOf(" ", 160));
	}
	return t;
}

export function formatDefinition(lookup: Lookup): string {
	if (lookup.kind === "blocked") return "I'd rather not repeat that word.";
	if (lookup.kind === "missing") return `I'm not familiar with "${lookup.term}". Could you explain it? I'll remember.`;
	const { term, word, sense, source } = lookup;
	const body = lowerFirst(shorten(sense.text)).replace(/\bi\b/g, "I");
	if (source === "taught") return `In your usage, ${word} means ${body}.`;
	const guessed = word.toLowerCase() !== term.toLowerCase();
	const subject = guessed ? "It" : cap(word);
	let sentence: string;
	if (sense.slang) sentence = `${subject} is slang ${/^to /.test(body) ? "meaning" : "for"} ${body}.`;
	else if (sense.pos === "noun" && /^(?:a|an) /.test(body)) sentence = `${/^[aeiou]/i.test(word) ? "An" : "A"} ${word} is ${body}.`;
	else if (sense.pos === "noun" && /^the /.test(body)) sentence = `${subject} is ${body}.`;
	else sentence = `${subject} means ${body}.`;
	return guessed ? `I believe you meant ${word}. ${sentence}` : sentence;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/agent/dictionary.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint lib/agent/dictionary.ts`
Expected: all pass, no lint errors.

---

### Task 8: The lookup cache in Supabase

**Files:**
- Database: migration `add_word_lookups` on project `jtkeljvldtngkrftzwdm`
- Create: `lib/agent/dictionary-store.ts`

**Interfaces:**
- Consumes: `CachedLookup` (Task 7).
- Produces: `getCachedLookup(term): Promise<CachedLookup | null>`, `putCachedLookup(entry): Promise<void>`.

- [ ] **Step 1: Apply the migration** (Supabase MCP `apply_migration`, project_id `jtkeljvldtngkrftzwdm`, name `add_word_lookups`)

```sql
create table public.word_lookups (
	user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	term text not null,
	word text not null,
	definition text not null,
	part_of_speech text,
	slang boolean not null default false,
	source text not null,
	created_at timestamptz not null default now(),
	primary key (user_id, term)
);
alter table public.word_lookups enable row level security;
create policy "own word_lookups" on public.word_lookups for all to authenticated
	using ((select auth.uid()) = user_id)
	with check ((select auth.uid()) = user_id);
```

- [ ] **Step 2: Check the advisors**

Run the MCP `get_advisors` tool (type `security`).
Expected: no new warnings about `word_lookups`. The existing "Leaked Password Protection Disabled" warning is not ours.

- [ ] **Step 3: Create** `lib/agent/dictionary-store.ts`

```ts
import { supabase } from "../supabase";
import type { CachedLookup } from "./dictionary";

// Osmo's cache of words he has looked up, one row per user and asked term (RLS keeps rows private).

export async function getCachedLookup(term: string): Promise<CachedLookup | null> {
	const { data, error } = await supabase
		.from("word_lookups")
		.select("term,word,definition,part_of_speech,slang,source")
		.eq("term", term)
		.maybeSingle();
	if (error || !data) return null;
	return {
		term: data.term,
		word: data.word,
		definition: data.definition,
		partOfSpeech: data.part_of_speech,
		slang: data.slang,
		source: data.source,
	};
}

export async function putCachedLookup(entry: CachedLookup): Promise<void> {
	const { error } = await supabase.from("word_lookups").upsert(
		{
			term: entry.term,
			word: entry.word,
			definition: entry.definition,
			part_of_speech: entry.partOfSpeech,
			slang: entry.slang,
			source: entry.source,
		},
		{ onConflict: "user_id,term" },
	);
	if (error) console.error("Could not cache a looked-up word", error);
}
```

- [ ] **Step 4: Checkpoint**

Run: `npx tsc --noEmit && npx eslint lib/agent/dictionary-store.ts`
Expected: clean. The store is exercised in Task 12's browser check.

---

### Task 9: The page asks the dictionary

**Files:**
- Modify: `app/assistant.tsx` (only `sendMessage`, its helpers, a vocabulary loader effect, the message list and the composer; re-read the file first)

**Interfaces:**
- Consumes:
  - `parseLookup`, `lookupWord`, `formatDefinition`, type `Lookup` (Task 7)
  - `getCachedLookup`, `putCachedLookup` (Task 8)
  - `TurnContext.recent` (Task 5)
  - `unfamiliarWords`, `learnWords`, `loadVocabulary`, `saveVocabulary`, `TurnContext.vocabulary` (Task 6)

- [ ] **Step 1: Add the imports**

```tsx
import { formatDefinition, lookupWord, parseLookup, type Lookup } from "@/lib/agent/dictionary";
import { getCachedLookup, putCachedLookup } from "@/lib/agent/dictionary-store";
import { learnWords } from "@/lib/agent/lexicon/vocabulary";
import { loadVocabulary, saveVocabulary } from "@/lib/agent/vocabulary-store";
```

Add `unfamiliarWords` to the existing `@/lib/agent/talk` import.

- [ ] **Step 2: Add the thinking state** next to the other `useState` calls in the component:

```tsx
	// True while Osmo looks a word up; the composer waits so replies stay in order.
	const [thinking, setThinking] = useState(false);
	// The user's own words and how often they've used them (understanding only).
	const [vocabulary, setVocabulary] = useState<Record<string, number>>({});
	useEffect(() => {
		void loadVocabulary().then(setVocabulary);
	}, []);
```

- [ ] **Step 3: In `sendMessage`, stop while thinking and pass recent words**

Change `if (!text) return;` to `if (!text || thinking) return;`. In the `processTurn(...)` context object, after `slang: slangMap,` add:

```tsx
					// The last few messages, so typos can be read in context.
					recent: messages.slice(-6).flatMap((m) => m.text.toLowerCase().match(/[a-z]+/g) ?? []),
					vocabulary,
```

Right after the `processTurn` call (after `lastAtRef.current = now;`), add:

```tsx
		// Learn the user's own words (names, in-jokes, jargon), never from a crisis message.
		if (!crisis) {
			const fresh = unfamiliarWords(text, slangMap);
			if (fresh.length > 0) {
				const next = learnWords(vocabulary, fresh);
				setVocabulary(next);
				if (canSaveRef.current) void saveVocabulary(Object.fromEntries(fresh.map((w) => [w, next[w]])));
			}
		}
```

- [ ] **Step 4: Decide whether this is a word question**

Right after `const mathResult = learnedFact ? null : calculateMath(text);` add:

```tsx
		// "what does X mean" and friends: looked up once nothing earlier has claimed the message.
		const lookupTerm =
			crisis || agentKnowledge.some((fact) => text.toLowerCase().includes(fact.key)) ? null : parseLookup(text);
		// Meanings the user taught win over any dictionary.
		const taughtMeanings = {
			...Object.fromEntries(
				memory
					.filter((fact) => !fact.key.startsWith("slang:") && !fact.key.includes(" ") && fact.key !== "name" && fact.key !== "likes")
					.map((fact) => [fact.key, fact.value]),
			),
			...slangMap,
		};
```

In the `if … else if …` chain, insert this branch just before the final `} else {` that calls `findUnknownTopic`:

```tsx
		} else if (lookupTerm) {
			response = ""; // filled in when the lookup finishes, below
```

- [ ] **Step 5: Deliver replies through one place, and await lookups**

Replace the block from `const newMessages: ChatMessage[] = [` through `setInput("");` (the end of `sendMessage`) with:

```tsx
		const userMessage: ChatMessage = { role: "user", text };
		setInput("");
		// Every reply ends here, typed out and spoken by the circle; a future voice hooks in here too.
		const deliver = (reply: string) => {
			const agentMessage: ChatMessage = { role: "agent", text: reply };
			stageRef.current?.style.setProperty("--voice", "0");
			setSpeaking(reduceMotionRef.current ? null : { index: messages.length + 1, chars: 0 });
			setMessages((current) => [...current, agentMessage]);
			void saveMessages([userMessage, agentMessage]);
		};
		setMessages((current) => [...current, userMessage]);
		if (lookupTerm && response === "") {
			setThinking(true);
			void lookupWord(lookupTerm, {
				fetch: (url, init) => fetch(url, init),
				taught: taughtMeanings,
				cacheGet: canSaveRef.current ? getCachedLookup : undefined,
				cachePut: canSaveRef.current ? putCachedLookup : undefined,
			})
				.catch((): Lookup => ({ kind: "missing", term: lookupTerm }))
				.then((result) => {
					if (result.kind === "missing") setPendingLearning(result.term);
					setThinking(false);
					deliver(formatDefinition(result));
				});
			return;
		}
		deliver(response);
```

(`messages.length + 1` is the agent reply's index: the user message lands at `messages.length`, and the composer is locked while a lookup runs, so nothing else can land in between.)

- [ ] **Step 6: Show the thinking bubble and lock the composer**

In the message list, just before `<li ref={latestMessageRef} className={styles.end} aria-hidden="true" />`, add:

```tsx
					{thinking && (
						<li className={`${styles.item} ${styles.agent}`} aria-live="polite">
							<p className={styles.bubble}>One moment…</p>
						</li>
					)}
```

On the composer, change the input's `disabled={!ready}` to `disabled={!ready || thinking}` and the button's `disabled={!ready}` to `disabled={!ready || thinking}`.

- [ ] **Step 7: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib && npm run build`
Expected: all pass, no lint errors, and the build succeeds.

---

### Task 10: A professional voice, like JARVIS

**Files:**
- Modify: `lib/agent/talk.ts`: the lines inside `respond()` and `fallbackReply()`
- Modify: `app/assistant.tsx`: the reply strings in `sendMessage`, `answerFromMemory` and the opening message (re-read it first)
- Modify: `lib/agent/talk.test.ts`, `lib/agent/chatlog.test.ts`: expectations that pin the old casual wording
- Test: create `lib/agent/voice.test.ts`

**Interfaces:**
- Consumes: the intents in `talk.ts`.
- Produces: no new names. `askedForName()` must still recognize the name question, and `nameCorrection()` must still recognize "Nice to meet you, X!" and "And you're X, I remember."

- [ ] **Step 1: Write the failing test** `lib/agent/voice.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { askedForName } from "./context";
import { defaultState } from "./state";
import { fallbackReply, parse, respond } from "./talk";

// Anything Osmo says himself is composed and professional: no slang, internet shorthand or emoji.
const CASUAL = /\b(?:lol|lmao|ngl|fr|tbh|bet|gonna|wanna|kinda|yo|yeah|nah|oof|wild|stoked|dude|bro|cool cool|wanna)\b|\p{Extended_Pictographic}/iu;
const SAMPLES = [
	"hi", "bye", "how are you", "what are you doing", "how are you feeling", "who are you", "what can you do", "thanks",
	"sorry", "you are smart", "you suck", "that was rude", "send nudes", "/help", "lol", "i love you", "i made you", "brb",
	"ok", "you are", "where are you from", "what do you mean", "you make me happy", "you make me sad", "im happy", "im sad",
];

describe("Osmo's voice", () => {
	it("stays professional in every conversation reply", () => {
		for (const text of SAMPLES) {
			for (let turn = 0; turn < 4; turn++) {
				const reply = respond(parse(text), { state: defaultState(), cause: null, turn, userName: turn % 2 ? "Gur" : null });
				expect(reply, text).not.toBeNull();
				expect(reply!, `${text} @${turn}`).not.toMatch(CASUAL);
				expect(reply!, text).toMatch(/^[A-Z]/);
			}
		}
	});

	it("keeps fallbacks professional", () => {
		for (let turn = 0; turn < 6; turn++) {
			expect(fallbackReply(turn, "blah blah"), `${turn}`).not.toMatch(CASUAL);
			expect(fallbackReply(turn, "why is the sky blue?"), `${turn}`).not.toMatch(CASUAL);
		}
	});

	it("still asks for the user's name in a way the name flow recognizes", () => {
		expect(askedForName(respond(parse("who are you"), { state: defaultState(), cause: null, turn: 0 })!)).toBe(true);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/agent/voice.test.ts`
Expected: FAIL on the casual lines (for example "Yo! What's up?" and "Bet. What's next?").

- [ ] **Step 3: Rewrite the lines in `respond()` and `fallbackReply()`** (`lib/agent/talk.ts`)

Keep every `case` and its logic as they are and change only the strings, as follows:

| Case | New wording |
|---|---|
| `greeting`, calm | `` `${pick(["Hello", "Good to see you", "Welcome back"], turn)}${shownName ? `, ${shownName}` : ""}. How can I help?` `` |
| `greeting`, not calm | `` `Hello${shownName ? `, ${shownName}` : ""}. I'll admit I'm feeling ${feeling} today. How are you?` `` |
| `farewell` | `` pick([`Goodbye${withName}. Take care.`, `Until next time${withName}.`], turn) `` |
| `howAreYou` | calm `"I'm doing well, thank you. How are you?"`, otherwise `` `Honestly, I'm feeling ${feeling}. How are you?` `` |
| `askActivity` | `"I'm here and ready to help. What are you working on?"` |
| `askFeeling`/`askWhyFeeling` | calm `"I'm calm at the moment. Nothing in particular is stirring. Why do you ask?"`. Cause: `` ` I believe it's because ${ctx.cause}.` `` or `" I'm not entirely sure why. It built up over our conversation."`, then `` `I'm feeling ${feeling}.${why} Thank you for asking.` `` |
| `askName` | with a name `` `I'm Osmo. And you're ${shownName}, I remember.` ``, otherwise `"I'm Osmo. What should I call you?"` |
| `askAbilities` | `"I can hold a conversation, remember what you tell me, define words, do quick math, work through moral dilemmas and tell stories. You can also ask what I'm made of. Where would you like to start?"` |
| `thanks` | `pick(["You're welcome.", "Happy to help.", "Anytime."], turn)` |
| `apology` | `pick(["No need to apologize.", "That's quite all right. Thank you for saying so."], turn)` |
| `compliment` | `pick(["Thank you. That's kind of you.", "I appreciate that, thank you."], turn)` |
| `insult` | `pick(["That's a little harsh. If I got something wrong, tell me what, and I'll do better.", "I'd rather we kept things civil. What's actually bothering you?"], turn)` |
| `rudeFeedback` | `pick(["You're right, that came across as rude. My apologies. Shall we start over?", "Fair point. That wasn't my best start, and I apologize. How can I help?"], turn)` |
| `sexual` | `"I won't engage with that. I'm happy to help with almost anything else."` |
| `slashCommand` | `"There are no slash commands here. Just talk to me normally. I can chat, remember things, define words, do quick math, tell a story, pose a moral dilemma, or explain what I'm made of. For a new personality, say roll a new osmo."` |
| `laughter` | `pick(["Glad that amused you.", "I'll take that as a compliment."], turn)` |
| `affection` | `"That means a great deal. I care about you too."` |
| `creator` | `"You made me? Then I owe you my existence. Thank you."` |
| `brb` | `"Of course. I'll be here."` |
| `ack` | `pick(["Understood. What's next?", "Very well. Is there anything else on your mind?"], turn)` |
| `incomplete` | `"Go on, I'm listening."` |
| `askOrigin` | `"I'm Osmo, a conversational assistant built by a group of students. I began as a blank slate, and everything I feel and remember comes from conversations like this one."` |
| `misunderstood` | `pick(["My apologies, I misunderstood. I'm still learning how people phrase things. Could you put it more simply?", "That's fair. I only recognize some phrasings so far. A shorter version would help."], turn)` |
| `feelingFromOsmo` | positive `` `That means a great deal. I'm glad talking with me makes you feel ${intent.feeling}.` ``, negative `` `I'm sorry I made you feel ${intent.feeling}. Tell me what went wrong, and I'll do better.` `` |
| `userFeeling` | hello prefix `"Hello. "`. Positive `` [`I'm glad you're feeling ${intent.feeling}. What's made it a good day?`, "That's good to hear. What's been going well?"] ``. Negative `` [`I'm sorry you're feeling ${intent.feeling}. Would you like to talk about what's going on?`, `That sounds difficult. I'm here if you'd like to talk about why you're feeling ${intent.feeling}.`] `` |
| `fallbackReply`, questions | `["That's a good question, but I don't have an answer yet. Could you ask it another way?", "I'm afraid that's beyond me for now. Could you try a simpler question?", "I can't answer that one yet. Is there something else I can help with?"]` |
| `fallbackReply`, statements | `["I'm not sure I follow. Could you rephrase that?", "I didn't quite catch that. Could you say it another way?", "That's new to me. What do you mean?", "I don't recognize that. If it's slang, you can teach me, for example: bet means okay."]` |

- [ ] **Step 4: Update the tests that pinned the old wording**
- `lib/agent/talk.test.ts`: `expect(r).toMatch(/^Hi!/);` becomes `expect(r).toMatch(/^Hello\./);`.
- `lib/agent/typos.test.ts` (Task 5): `/anytime|no problem|of course/i` becomes `/welcome|help|anytime/i`.
- `lib/agent/chatlog.test.ts`:
  - the insult regex `/stung|not cool|bothering/i` becomes `/harsh|civil|bothering/i`;
  - in the rude test, `/my bad|sorry/i` becomes `/apolog/i`, and the negative `/my bad|that came out rude|great start from me/i` becomes `/apolog|came across as rude|my best start/i`;
  - `/not going there/i` becomes `/won't engage/i` (both places);
  - `expect(lines[0]).toMatch(/lost me/i);` becomes `expect(lines[0]).toMatch(/not sure I follow/i);`.

Leave the tests that pin the personality session's strings (`/^Done\./`, `'"yes, roll"'`, `/roll a new osmo/i`) alone; that session will send the new strings before it changes them.

- [ ] **Step 5: Reword the page's own lines** (`app/assistant.tsx`; re-read first)

| Where | New wording |
|---|---|
| opening message | `"Hello, I'm Osmo. How can I help?"` |
| learned topic | `` `Understood. "${learning}" means ${text}. I'll remember that.` `` |
| corrected name | `` `My apologies, ${correctedName}. I've corrected that.` `` |
| answered name | unchanged: `` `Nice to meet you, ${answeredName}! I'll remember that.` `` (name corrections read this line) |
| found name | `` `You're ${foundName}. My apologies, I should have caught that.` `` |
| name not found | `"I looked back but couldn't find it. What's your name?"` |
| taught slang | `` `Understood. When you say "${taughtSlang.word}", I'll read it as "${taughtSlang.meaning}".` `` |
| learned fact | `` `Noted. Your ${learnedFact.key} is ${learnedFact.value}.` `` |
| math | `` `That comes to ${mathResult}.` `` |
| unknown topic | `` `I'm not familiar with "${unknownTopic}". Could you explain it? I'll remember.` `` |
| `answerFromMemory` list | `` `Here's what I remember: ${userMemory}.` `` (already professional; keep it) |

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/agent/voice.test.ts lib/agent/talk.test.ts lib/agent/chatlog.test.ts lib/agent/context.test.ts`
Expected: PASS.

- [ ] **Step 7: Checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib`
Expected: all pass. A failing test in a personality-owned file is the other session's to fix; message them with the failing assertion instead of editing it.

---

### Task 11: Reply variety

**Files:**
- Create: `lib/agent/lexicon/variety.ts`
- Modify: `lib/agent/mind.ts`, step 6 only (re-read it first)
- Test: `lib/agent/lexicon/variety.test.ts`

**Interfaces:**
- Produces: `vary(text: string, turn: number, keep?: ReadonlySet<string>): string`.

- [ ] **Step 1: Write the failing test** `lib/agent/lexicon/variety.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { vary } from "./variety";

describe("vary", () => {
	it("rotates words from its sets by turn, keeping capitals", () => {
		expect(vary("That sounds difficult.", 0)).toBe("That sounds difficult.");
		expect(vary("That sounds difficult.", 1)).toBe("That sounds hard.");
		expect(vary("Understood. What's next?", 1)).toBe("Noted. What's next?");
		expect(vary("I'm glad you're feeling good.", 1)).toBe("I'm pleased you're feeling good.");
	});

	it("never touches quotes, other words, or words the user used", () => {
		expect(vary('Say "yes, roll" and it is difficult.', 1)).toBe('Say "yes, roll" and it is hard.');
		expect(vary("That sounds difficult.", 1, new Set(["difficult"]))).toBe("That sounds difficult.");
		expect(vary("I'm feeling happy.", 3)).toBe("I'm feeling happy.");
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/agent/lexicon/variety.test.ts`
Expected: FAIL, cannot resolve `./variety`.

- [ ] **Step 3: Create** `lib/agent/lexicon/variety.ts`

```ts
// Words in Osmo's own replies that can stand in for each other, so he repeats himself less.
// Only interchangeable words in his professional register; feelings and anything meaning-bearing stay out.
const SETS: readonly (readonly string[])[] = [
	["glad", "pleased"],
	["difficult", "hard", "tough"],
	["understood", "noted"],
	["entirely", "completely"],
	["wonderful", "great"],
];

// Swaps set words by turn. Quoted text and words the user just used (keep) stay as they are.
export function vary(text: string, turn: number, keep: ReadonlySet<string> = new Set()): string {
	let n = 0;
	return text.replace(/"[^"]*"|[A-Za-z]+/g, (token) => {
		if (token.startsWith('"')) return token;
		const lower = token.toLowerCase();
		const set = SETS.find((s) => s.includes(lower));
		if (!set || keep.has(lower)) return token;
		const pick = set[(turn + n++) % set.length];
		return token[0] === token[0].toUpperCase() ? pick[0].toUpperCase() + pick.slice(1) : pick;
	});
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/agent/lexicon/variety.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Use it in step 6 of `processTurn`** (`lib/agent/mind.ts`; re-read first)

Add `import { vary } from "./lexicon/variety";` and add `normalize` to the existing `./talk` import. In step 6, change

```ts
			reply: flavor(combineReplies(spoken), {
```

to

```ts
			// Vary his own words, but never a word the user just used.
			reply: flavor(vary(combineReplies(spoken), session.turns, new Set(normalize(trimmed).split(" "))), {
```

- [ ] **Step 6: Checkpoint, then hand `mind.ts` back**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass. Then message the other session one line: "Done with mind.ts (TurnContext.recent, the applyCues line, step 6 vary/understand); it's all yours again."

---

### Task 12: Verify in the browser, then final review

**Files:** none.

- [ ] **Step 1: Full checkpoint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app lib && npm run build`
Expected: all pass.

- [ ] **Step 2: Try it on the page** (dev server on port 3000; open `/assistant` in the Claude Browser pane)

Send each and compare:
- "what does ephemeral mean": the "One moment…" bubble, then "Ephemeral means lasting for a short period of time." Send it again: an instant reply, and `select term, word, source from word_lookups` (MCP `execute_sql`) shows one row.
- "what does ephemrel mean": "I believe you meant ephemeral…"
- "what does mid mean": "Mid is slang for mediocre or average." (no network call)
- "im gloomy": "I'm sorry you're feeling gloomy. Would you like to talk about what's going on?"
- Vocabulary: send "valo tonight?" and then "more valo", then "vlao?". Osmo reads it as valo (it isn't treated as unknown), and `select word, uses from user_words` shows valo with 2 or more uses.
- Voice: "hi", "thanks", "lol", "you suck", "asdfgh". Every reply is composed and professional; no slang, "lol" or emoji from talk.ts.
- "how are yuo": his how-are-you answer.
- "I ate pizza": not treated as slang.
- "what's up": small talk, not a lookup.
- With Datamuse and Wiktionary blocked (DevTools "Block request URL", or offline): "what does zorpquux mean" gives the explain-and-I'll-remember reply within about 4 seconds, and the composer works again.

- [ ] **Step 3: Final whole-feature review** on the most capable model

Hand the reviewer:
- the spec and this plan;
- the new and changed files: `lib/agent/lexicon/*`, `dictionary.ts`, `dictionary-store.ts`, `vocabulary-store.ts`, `voice.test.ts`, and the changes in `talk.ts`, `safety.ts`, `mind.ts` and `assistant.tsx`;
- the Review Focus list above.

Fix Critical and Important findings test-first. Record minors.
