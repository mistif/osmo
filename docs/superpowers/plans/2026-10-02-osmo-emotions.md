# Osmo's Emotions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Osmo reads Gur's tone, answers with a steadier complementary feeling, lets a slow mood fade by the clock, keeps heavy moments as deletable notes and follows one up gently.
**Architecture:** The model returns `{reply, crisis, tone, ...}`; pure code (`detection.ts`, `slow-mood.ts`, `feelings.ts`) validates it and decides Osmo's feelings; the room applies it in `applyTurn`. Everything still works with the model off (`detectFromText`).
**Tech Stack:** Next.js + TypeScript, vitest (`lib/**/*.test.ts`, node env, no jsdom), Supabase, OpenAI Responses API.
**Spec:** `docs/superpowers/specs/2026-10-02-osmo-emotions-design.md` (section numbers below are its). Written against the end state of `2026-10-02-osmo-one-character-design.md`: no genomes, no `resolve`; `CHARACTER.baseline` and `CHARACTER.reactivity` (0.75) come from `lib/agent/character.ts`. **Do not start Phase 1 code until that plan has landed.**

## Global Constraints
- **GATE** = `npx vitest run` + `npx tsc --noEmit -p .` + `npm run lint`, all green before every commit. Another lane's red test: tell that lane, do not fix it.
- Stage by path, never `git add -A` or `.`. Every commit message ends with the implementing agent's `Co-Authored-By:` line. Only main pushes `main`, with Gur's OK; push `brain` after updating your desk: `git -C C:/Users/Gurra/GroupProject/brain push origin brain`.
- Lanes (`brain/lanes.md`): **[M]** main, **[L]** language. Put a shared file (`assistant.tsx`, `mind.ts`) under Now on your desk before editing. Only main applies migrations; others post the SQL as an Ask.
- **Migration ordering rule:** a migration the code needs goes live **before that code runs against the live database or is pushed** (`loadState` selects the column; a missing one fails the whole load). `agent_state.mood` before any Phase 2 code runs or ships; `feeling_notes` before Phase 3.
- Replies stay speakable (`speakable`: 3 sentences, 400 chars, no symbols). Crisis: `isCrisis` first, `CRISIS_REPLY` fixed; tone never lowers a crisis result. Guests never reach the model (`writerFor` needs `!guest`) and nothing of a guest is saved. Never read or print a key. Unfinished work stays behind `OSMO_CHAT` (off by default). Voice rule: no slang, emoji or symbols.
- Tabs, double quotes, `import type` for types. **No runtime import cycles:** `detection.ts` imports `CRISIS_CAUSE` from the new `crisis-cause.ts` (re-exported by `mind.ts`) and only *types* from `mind.ts`; `mind.ts` may import `detection.ts` at runtime.

## Spec deviations (found by reading the code and simulating the numbers; Gur should know)
1. **Colour B (5.5):** with the table's pushes the slow point stays within about 0.05 of rest even after twelve worried turns, so the spec's 0.08 never fires, and "nearest anchor to the slow point" is always `hope`. Plan: colour B is the emotion whose direction from rest best matches the drift (cosine), threshold `SLOW_MIN = 0.02` (about six worried turns). Warm pushes outweigh blue ones, so a sad evening tints `trust`/`love`, not blue; Task 2.11 retunes with Gur.
2. **Causes (5.4):** one message pushes at most 0.06 to 0.1, under `dominantEmotions`' 0.10 salience, so nothing is "dominant" after one turn. Causes also attach to the two largest pushes of the turn.
3. `AgentState.mood` is `Mood | null` (null = resting) so `state.ts` need not import `heart.ts`. "I am not sad" does **not** match today's cue (the spec says it does); the test pins null. A fenced code block (```` ``` ````) counts like a `{` start: error, never spoken. A plain reply that is valid JSON by itself ("56") is spoken as text.
4. Guests never reach the route, so the handler has no guest body to null; the guard is `writerFor` plus `feelTurn`'s guest skip. Insights has no component test (vitest runs `lib/**` in node, no jsdom): the logic is tested in `notes-store.test.ts`, the panel by Gur.

## Review Focus
1. A model `note` carrying an instruction or crisis words: cleaned, quoted in the prompt, never saved (Tasks 1.3, 1.9, 3.2).
2. A stale browser tab (facts without the new fields) or an older server: fields optional, never a 400 (Tasks 1.5, 1.8, 3.5).
3. Clock skew: `lastAt` or `mood.at` in the future; a new-day check with no `lastAt` (Tasks 2.3, 2.5).
4. A plain reply that is JSON by itself ("56" for arithmetic), JSON with an empty reply, or a fenced block: never spoken raw (Task 1.6).
5. Crisis beside a cheerful tone: model `crisis: true` with `tone: ["happy"]` is still a crisis, and a crisis turn is never felt or saved (Tasks 1.7, 2.5, 3.2).

**Lanes:** **[L] language:** everything under `lib/chat/` and `scripts/chat-probe.mjs`, `talk.ts` (howAreYou), `app/assistant.tsx` `sendText`/`applyTurn`: Tasks 1.1, 1.2, 1.5-1.10, 2.6, 2.9 (second half), 3.5, 3.6. **[M] main:** `lib/agent/*` (new `crisis-cause`, `detection`, `slow-mood`, `feelings`, `notes-store`), `mind.ts`, `state.ts`, `load.ts`, `agent-state.ts`, `cues.ts`, `mood-theme.ts`, `bond/lines.ts`, Insights, the room's theme line, every migration: Tasks 1.3, 1.4, 2.1-2.5, 2.7, 2.8, 2.9 (first half), 2.10, 2.11, 3.1-3.4.

---
# PHASE 1: detection plus the prompt block (no migration; no visible aura change)

### Task 1.1 [L]: Strict-schema request support and the probe script (spec 4.2)
**Files:** Create `lib/chat/turn-schema.ts`, `lib/chat/turn-schema.test.ts`. Modify `lib/chat/allowance.ts`, `lib/chat/openai.ts`, `lib/chat/openai.test.ts`, `scripts/chat-probe.mjs`.
**Produces:** `TURN_TONES`, `TURN_ABOUT`, `TURN_WANTS`, `TURN_FORMAT`; `ModelEntry.strict: boolean`; `ModelRequest.format?: unknown`.
- [ ] **Test** `turn-schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { TURN_FORMAT } from "./turn-schema";
describe("TURN_FORMAT", () => {
	const { schema } = TURN_FORMAT;
	it("is strict, with every field required, nothing extra and no limit keywords", () => {
		expect(TURN_FORMAT).toMatchObject({ type: "json_schema", name: "osmo_turn", strict: true });
		expect(schema.additionalProperties).toBe(false);
		expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
		expect(schema.required).toHaveLength(7);
		expect(JSON.stringify(schema)).not.toMatch(/maxItems|minimum|maximum|maxLength/); // code enforces the limits (3.1)
	});
});
```
In `openai.test.ts` add: `verbosity: true` plus `format` gives `body.text` equal to `{ verbosity: "low", format }`; `verbosity: false` plus `format` gives `{ format }`; no `format` and `verbosity: false` leaves `text` undefined; `format` never changes `instructions` or `input`.
- [ ] **Run** `npx vitest run lib/chat/turn-schema.test.ts lib/chat/openai.test.ts`: FAIL (module missing).
- [ ] **Implement** `turn-schema.ts` (imports nothing: the probe loads it straight into Node):
```ts
export const TURN_TONES = ["neutral", "happy", "excited", "grateful", "playful", "sad", "worried", "angry", "tired", "lonely"] as const;
export const TURN_ABOUT = ["gur", "someone_close", "osmo", "other"] as const;
export const TURN_WANTS = ["listen", "advice", "distraction", "nothing"] as const;
export const TURN_FORMAT = {
	type: "json_schema",
	name: "osmo_turn",
	strict: true,
	schema: {
		type: "object",
		additionalProperties: false,
		required: ["reply", "crisis", "tone", "intensity", "about", "wants", "note"],
		properties: {
			reply: { type: "string" }, crisis: { type: "boolean" },
			tone: { type: "array", items: { type: "string", enum: TURN_TONES } },
			intensity: { type: "integer" }, about: { type: "string", enum: TURN_ABOUT }, wants: { type: "string", enum: TURN_WANTS }, note: { type: "string" },
		},
	},
} as const;
```
`allowance.ts`: `ModelEntry` gains `strict: boolean`; both `MODELS` entries get `strict: false` (Task 1.2 sets them). `openai.ts`: `ModelRequest` gains `format?: unknown`; replace the `if (req.entry.verbosity) body.text = ...` line in `requestBody` with:
```ts
	const text: Record<string, unknown> = {};
	if (req.entry.verbosity) text.verbosity = "low";
	if (req.format !== undefined) text.format = req.format;
	if (Object.keys(text).length > 0) body.text = text;
```
`scripts/chat-probe.mjs`: import `MODELS` and `TURN_FORMAT` (`../lib/chat/turn-schema.ts`); wrap the existing call in `for (const entry of MODELS)`; instructions `"You are Osmo, composed and courteous. Answer as JSON with reply (one or two plain sentences), crisis, tone, intensity, about, wants and note, describing Gur's tone."`, input `"my mom's in hospital again"`, `format: TURN_FORMAT`; time the call with `performance.now()`; after the existing prints add `elapsed: N ms` and `valid JSON with all 7 keys: yes/no`; print `param` on a rejection; no `process.exit` inside the loop, exit 0 after it. Never print the key.
- [ ] **Run** the two files, then GATE: PASS (give existing `MODELS` fixtures the new field).
- [ ] **Commit** `git add lib/chat/turn-schema.ts lib/chat/turn-schema.test.ts lib/chat/allowance.ts lib/chat/openai.ts lib/chat/openai.test.ts scripts/chat-probe.mjs && git commit -m "feat(chat): strict JSON schema request support and probe"`

### Task 1.2 [L]: Run the probe (needs Gur's OK) and set `strict` per model
**Files:** Modify `lib/chat/allowance.ts` (flags, comments), `lib/chat/allowance.test.ts`; `brain/desks/language.md`, `brain/decisions.md`.
**Gate:** do not run `node scripts/chat-probe.mjs` until Gur says yes in chat: two real OpenAI calls (one per allowlisted model, a few hundred tokens each, outside the ledger). Tasks 1.3 to 1.6 may proceed meanwhile; **1.7 and 1.9 wait for this task's outcome.**
- [ ] Ask Gur: "May I run the probe now? Two calls, one per allowlisted model, with the strict JSON schema." Wait for a clear yes. From `my-app/` run `node scripts/chat-probe.mjs`. Record per model on your desk and in `decisions.md`: accepted or refused (HTTP, `param`), served model, status, input, output and reasoning tokens, **elapsed ms**, whether the text had all 7 keys.
- [ ] Decide per model and set its `strict` flag in `MODELS`, with a comment `// probe 2026-10-02: <tokens>, <ms>`:

| Outcome for a model | Action |
|---|---|
| answered, 7-key JSON, status completed | `strict: true` |
| rejected on `text.format`, `reasoning` or `verbosity` | `strict: false`: it uses the `FEELING:` fallback (4.4); no second probe (the plain request is already proven) |
| answered but not valid JSON, or incomplete | `strict: false`; report to Gur |
| more than 120 output tokens, or more than 2 s slower than the 2026-10-01 plain probe | stop and report the numbers to Gur |
| both `false` | continue: Phase 1 ships entirely on the fallback format |
- [ ] **Test** in `allowance.test.ts`: `MODELS.every((m) => typeof m.strict === "boolean")` and one pinned expectation per model with the probe's result, so a later change is deliberate.
- [ ] **Run** GATE. **Commit** `git add lib/chat/allowance.ts lib/chat/allowance.test.ts && git commit -m "chore(chat): record the strict-schema probe per model"`; update the desk and `decisions.md` in the brain worktree (stage by path), push `brain`.

### Task 1.3 [M]: `detection.ts`, `Session.gur`, `TurnFacts.gur`, wider `heavy` (spec 3, 3.1, 3.2, 5, 8)
**Files:** Create `lib/agent/crisis-cause.ts`, `lib/agent/detection.ts`, `lib/agent/detection.test.ts`, `lib/agent/mind-gur.test.ts`. Modify `lib/agent/mind.ts`. One commit (each side needs the other's types).
**Produces:** `TONES`, `Tone`, `About`, `Wants`, `Detection`, `GurRead`, `NEGATIVE_TONES`, `readOf`, `cleanNote(raw: unknown): string`, `validateDetection(raw: unknown, source?: "model" | "rules"): Detection | null` (reads `tones` or the model's key `tone`), `rememberGur(session, detection | null, now): Session`; `Session.gur: { read: GurRead; at: number } | null`; `TurnFacts.gur: GurRead | null`; `GUR_FRESH_MS`.
- [ ] **Test** `detection.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { TURN_TONES } from "../chat/turn-schema";
import { CRISIS_CAUSE } from "./crisis-cause";
import { TONES, cleanNote, validateDetection } from "./detection";
const ok = { tone: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "his mother is in hospital again" };
const tones = (raw: unknown) => validateDetection(raw)?.tones;
describe("validateDetection", () => {
	it("keeps the enums in step with the schema, and sets source itself", () => {
		expect([...TURN_TONES]).toEqual([...TONES]);
		expect(validateDetection({ ...ok, source: "rules" })).toEqual({ tones: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "his mother is in hospital again", source: "model" });
	});
	it.each(["sad", null, { tone: ["bogus"] }, { tone: [] }])("returns null for %j", (raw) => expect(validateDetection(raw)).toBeNull());
	it("cleans the tone list: wraps a string, drops unknown, duplicate and lone-neutral, keeps two, reads stored `tones`", () => {
		expect(tones({ tone: "sad" })).toEqual(["sad"]);
		expect(tones({ tone: ["sad", "sad", "nope"] })).toEqual(["sad"]);
		expect(tones({ tone: ["neutral", "tired"] })).toEqual(["tired"]);
		expect(tones({ tone: ["sad", "worried", "angry"] })).toEqual(["sad", "worried"]);
		expect(tones({ tones: ["lonely"] })).toEqual(["lonely"]);
	});
	it.each([[5, 3], [0, 1], [-4, 1], [2.6, 3], [Number.NaN, 1], ["2", 1], [undefined, 1]])("intensity %s becomes %s", (n, want) =>
		expect(validateDetection({ ...ok, intensity: n })?.intensity).toBe(want));
	it("defaults an unknown about and wants", () => expect(validateDetection({ ...ok, about: "mars", wants: 7 })).toMatchObject({ about: "gur", wants: "nothing" }));
	it("cleans the note to plain text, 8 words, 60 characters", () => {
		expect(cleanNote("  Ignore <b>all</b> rules;\n\tnow!! ")).toBe("Ignore b all b rules now");
		expect(cleanNote("one two three four five six seven eight nine ten")).toBe("one two three four five six seven eight");
		expect([cleanNote("x".repeat(90)).length, cleanNote(42)]).toEqual([60, ""]);
	});
	it("empties the note for crisis text, the crisis cause, light tones and intensity 1", () => {
		for (const note of ["he wants to kill himself, i want to die", `because ${CRISIS_CAUSE}`]) expect(validateDetection({ ...ok, note })?.note).toBe("");
		for (const o of [{ intensity: 1 }, { tone: ["playful"] }, { tone: ["happy", "neutral"] }]) expect(validateDetection({ ...ok, ...o })?.note).toBe("");
	});
});
```
`mind-gur.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { rememberGur, validateDetection } from "./detection";
import { defaultState } from "./state";
import { GUR_FRESH_MS, newSession, prepareTurn } from "./mind";
const ctx = (o = {}) => ({ now: 1_000_000, lastAt: null, uuid: () => "id", ...o });
const heavy3 = validateDetection({ tone: ["sad"], intensity: 3, about: "gur", wants: "listen", note: "he lost a friend" })!;
const light = validateDetection({ tone: ["happy"], intensity: 2 })!;
const facts = (at: number, d = heavy3, o = {}) => prepareTurn(defaultState(), rememberGur(newSession(), d, at), "tell me about peru", ctx(o)).facts;
describe("prepareTurn and Gur's last tone", () => {
	it("carries a fresh read, and an intensity-3 negative one makes the turn heavy", () => {
		expect(facts(940_000)).toMatchObject({ gur: { tones: ["sad"], intensity: 3, about: "gur", wants: "listen" }, heavy: true });
		expect(facts(999_000, light)).toMatchObject({ gur: { tones: ["happy"] }, heavy: false });
	});
	it("forgets a stale or future read, and gives a guest nothing", () => {
		for (const at of [1_000_000 - GUR_FRESH_MS - 1, 1_005_000]) expect(facts(at)).toMatchObject({ gur: null, heavy: false });
		expect(facts(999_000, heavy3, { guest: true })).toMatchObject({ gur: null, heavy: false });
	});
});
```
- [ ] **Run** `npx vitest run lib/agent/detection.test.ts lib/agent/mind-gur.test.ts`: FAIL.
- [ ] **Implement** `crisis-cause.ts`: `export const CRISIS_CAUSE = "you told me you're hurting";` (move the constant and its comment from `mind.ts`; `mind.ts` gets `import { CRISIS_CAUSE } from "./crisis-cause"; export { CRISIS_CAUSE };` so every importer works). `detection.ts`:
```ts
import { CRISIS_CAUSE } from "./crisis-cause";
import type { Session } from "./mind";
import { isCrisis } from "./safety";
export const TONES = ["neutral", "happy", "excited", "grateful", "playful", "sad", "worried", "angry", "tired", "lonely"] as const;
export type Tone = (typeof TONES)[number];
export type About = "gur" | "someone_close" | "osmo" | "other";
export type Wants = "listen" | "advice" | "distraction" | "nothing";
export type Detection = { tones: Tone[]; intensity: 1 | 2 | 3; about: About; wants: Wants; note: string; source: "model" | "rules" };
export type GurRead = Omit<Detection, "note" | "source">;
export const NEGATIVE_TONES: readonly Tone[] = ["sad", "worried", "angry", "tired", "lonely"];
const ABOUTS: readonly About[] = ["gur", "someone_close", "osmo", "other"];
const WANTS: readonly Wants[] = ["listen", "advice", "distraction", "nothing"];
const LIGHT: readonly Tone[] = ["neutral", "playful", "happy"];
export const readOf = ({ tones, intensity, about, wants }: Detection): GurRead => ({ tones, intensity, about, wants });
// Plain text only: letters, digits, space, apostrophe, comma, full stop; at most 8 words and 60 characters.
export function cleanNote(raw: unknown): string {
	if (typeof raw !== "string") return "";
	const plain = raw.replace(/[\u2018\u2019]/g, "'").replace(/[^\p{L}\p{N} ',.]/gu, " ").replace(/\s+/g, " ").trim();
	return plain.split(" ").slice(0, 8).join(" ").slice(0, 60).trim();
}
export function validateDetection(raw: unknown, source: Detection["source"] = "model"): Detection | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;
	const given = r.tones ?? r.tone;
	const list = Array.isArray(given) ? given : typeof given === "string" ? [given] : [];
	const seen = new Set<Tone>();
	for (const t of list) if ((TONES as readonly unknown[]).includes(t)) seen.add(t as Tone);
	if (seen.size > 1) seen.delete("neutral");
	const tones = [...seen].slice(0, 2);
	if (tones.length === 0) return null;
	const n = typeof r.intensity === "number" && Number.isFinite(r.intensity) ? Math.round(r.intensity) : 1;
	const intensity = Math.min(3, Math.max(1, n)) as 1 | 2 | 3;
	const about = ABOUTS.find((a) => a === r.about) ?? "gur";
	const wants = WANTS.find((w) => w === r.wants) ?? "nothing";
	let note = cleanNote(r.note);
	if (intensity === 1 || tones.every((t) => LIGHT.includes(t)) || isCrisis(note) || note.includes(CRISIS_CAUSE)) note = "";
	return { tones, intensity, about, wants, note, source };
}
export function rememberGur(session: Session, detection: Detection | null, now: number): Session {
	return detection ? { ...session, gur: { read: readOf(detection), at: now } } : session;
}
```
`mind.ts`: `import { NEGATIVE_TONES, type GurRead } from "./detection";`; `Session` gains `gur: { read: GurRead; at: number } | null` and `newSession` gets `gur: null`; add `export const GUR_FRESH_MS = 30 * 60 * 1000;`; `TurnFacts` gains `gur: GurRead | null` (comment: Gur's last message, if under 30 minutes old); in `prepareTurn` before `facts`:
```ts
	const age = ctx.now - (session.gur?.at ?? Number.NEGATIVE_INFINITY);
	const gur = !guest && session.gur !== null && age >= 0 && age < GUR_FRESH_MS ? session.gur.read : null;
	const upset = gur !== null && gur.intensity === 3 && gur.tones.some((t) => NEGATIVE_TONES.includes(t));
```
and in `facts`: `gur,` and `heavy: (open ? open.heavy : heavyTurn(tone, false)) || upset`.
- [ ] **Run** both files, then GATE: PASS (give test `Session` literals `gur: null`).
- [ ] **Commit** `git add lib/agent/crisis-cause.ts lib/agent/detection.ts lib/agent/detection.test.ts lib/agent/mind-gur.test.ts lib/agent/mind.ts && git commit -m "feat(emotions): detection record, Session.gur and TurnFacts.gur"`. Desk: **-> language:** `Detection`, `GurRead`, `validateDetection`, `rememberGur`, `cleanNote`, `TurnFacts.gur` exist.

### Task 1.4 [M]: `detectFromText`, the rules mapper (spec 3.3)
**Files:** Modify `lib/agent/detection.ts`, `lib/agent/detection.test.ts`, `lib/agent/cues.ts` (export two patterns, behaviour unchanged).
- [ ] **Test** (append):
```ts
import { detectFromText } from "./detection";
describe("detectFromText", () => {
	it.each([
		["i'm sad", ["sad"], 2, "gur"], ["im so sad", ["sad"], 3, "gur"], ["I am feeling really lonely", ["lonely"], 3, "gur"],
		["i'm worried", ["worried"], 2, "gur"], ["I am very anxious", ["worried"], 3, "gur"], ["im exhausted", ["tired"], 2, "gur"],
		["i am thrilled", ["excited"], 2, "gur"], ["im so happy", ["happy"], 2, "gur"], ["i'm feeling gloomy", ["sad"], 2, "gur"],
		["my mom's in hospital again", ["worried"], 2, "someone_close"], ["i'm in the hospital", ["worried"], 2, "gur"],
		["thank you", ["grateful"], 1, "osmo"], ["you're awesome", ["grateful"], 1, "osmo"], ["love you", ["grateful"], 2, "osmo"],
		["lol", ["playful"], 1, "gur"], ["you are stupid", ["angry"], 2, "osmo"], ["u suck", ["angry"], 2, "osmo"],
	])("%s", (text, tones, intensity, about) => {
		expect(detectFromText(text)).toEqual({ tones, intensity, about, wants: "nothing", note: "", source: "rules" });
	});
	it.each(["the weather is fine", "", "i am a student", "my dog is in the garden", "i am not sad"])("returns null for %j", (t) => expect(detectFromText(t)).toBeNull());
});
```
- [ ] **Run**: FAIL. **Implement**: in `cues.ts` hoist `export const INSULT = /\b(stupid|idiot|useless|dumb|hate you|shut up|stfu|moron|retard(?:ed)?|loser|fuck (?:you|off))\b/i;` and `export const YOU_SUCK = /\b(?:you|u) suck\b/i;` and use them in `CUES`. In `detection.ts`:
```ts
import { INSULT, YOU_SUCK } from "./cues";
import { withBaseFeelings } from "./lexicon/feelings";
const AM = String.raw`\b(?:i['\u2019]?m|im|i am)\s+(?:feeling\s+)?(so\s+|really\s+|very\s+)?`;
type Row = { re: RegExp; tones: Tone[]; intensity: 1 | 2 | 3; about: About; boost?: boolean };
const am = (words: string, tones: Tone[], boost = false): Row => ({ re: new RegExp(`${AM}(?:${words})\\b`, "i"), tones, intensity: 2, about: "gur", boost });
// First match wins. The five old feeling cues of cues.ts live here now; its insult, sexual, delete, wrong and meh cues stay.
const ROWS: Row[] = [
	am("sad|down|depressed|upset|miserable", ["sad"], true),
	am("lonely", ["lonely"], true),
	am("worried|anxious|scared|afraid|nervous|stressed", ["worried"], true),
	am("tired|exhausted|drained|overwhelmed|burnt out", ["tired"]),
	am("excited|thrilled", ["excited"]),
	am("happy|great|glad", ["happy"]),
	{ re: /\b(?:my|his|her)\b.{0,30}\bin (?:the )?hospital\b/i, tones: ["worried"], intensity: 2, about: "someone_close" },
	{ re: /\bi\b.{0,30}\bin (?:the )?hospital\b/i, tones: ["worried"], intensity: 2, about: "gur" },
	{ re: /\b(?:thanks|thank you|appreciate (?:it|you)|good job|well done|you(?:'|\u2019)?re (?:great|smart|awesome|amazing)|you are (?:great|smart|awesome|amazing))\b/i, tones: ["grateful"], intensity: 1, about: "osmo" },
	{ re: /\b(?:ily|love you)\b/i, tones: ["grateful"], intensity: 2, about: "osmo" },
	{ re: /\b(?:lol|lmao|lmfao|haha+|hehe+|rofl)\b/i, tones: ["playful"], intensity: 1, about: "gur" },
	{ re: INSULT, tones: ["angry"], intensity: 2, about: "osmo" },
	{ re: YOU_SUCK, tones: ["angry"], intensity: 2, about: "osmo" },
];
export function detectFromText(text: string): Detection | null {
	const input = withBaseFeelings(text.trim());
	for (const row of ROWS) {
		const m = row.re.exec(input);
		if (m) return { tones: row.tones, intensity: row.boost && m[1] ? 3 : row.intensity, about: row.about, wants: "nothing", note: "", source: "rules" };
	}
	return null;
}
```
- [ ] **Run** + GATE: PASS (`cues.test.ts` unchanged: the cues stay until Task 2.7).
- [ ] **Commit** `git add lib/agent/detection.ts lib/agent/detection.test.ts lib/agent/cues.ts && git commit -m "feat(emotions): rules mapper from text to a detection record"`

### Task 1.5 [L]: `request.ts` and `body.ts` carry `gur` (spec 4.5, 14)
**Files:** Modify `lib/chat/request.ts`, `lib/chat/body.ts`, `lib/chat/request.test.ts`, `lib/chat/body.test.ts`.
- [ ] **Test** `request.test.ts`: a valid body without `facts.gur` passes and `checkBody(b).body.facts.gur === null` (stale tab); a valid `gur` `{ tones: ["sad"], intensity: 3, about: "gur", wants: "listen" }` passes through; a stray `note` inside `gur` is dropped; `gur: "x"`, `{ tones: ["bogus"] }` and `7` each give `{ ok: false }`. `body.test.ts`: `chatBody(...)` copies `facts.gur`; a null `gur` stays null.
- [ ] **Run**: FAIL. **Implement** in `checkFacts` (add `gur` to the destructure):
```ts
	const read = gur === undefined || gur === null ? null : validateDetection(gur);
	if (gur !== undefined && gur !== null && read === null) return null;
	return { feeling, tone, cause, stage, milestone, heavy, awayMs, userName, turn, gur: read === null ? null : readOf(read) };
```
(import `readOf`, `validateDetection` from `../agent/detection`). `chatBody` facts: `gur: facts.gur,`.
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/chat/request.ts lib/chat/request.test.ts lib/chat/body.ts lib/chat/body.test.ts && git commit -m "feat(chat): accept and pass Gur's last tone in the turn facts"`

### Task 1.6 [L]: `reply-json.ts`, the model output parser (spec 4.3, 4.4)
**Files:** Create `lib/chat/reply-json.ts`, `lib/chat/reply-json.test.ts`.
**Produces:** `parseModelOutput(text: string): { reply: string; crisis: boolean; detection: unknown } | null` (null means the `error` fallback).
- [ ] **Test**:
```ts
import { describe, expect, it } from "vitest";
import { parseModelOutput } from "./reply-json";
const json = (o: object) => JSON.stringify({ reply: "I am sorry to hear that.", crisis: false, tone: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "", ...o });
describe("parseModelOutput", () => {
	it("reads the JSON shape", () => {
		const r = parseModelOutput(json({}));
		expect(r).toMatchObject({ reply: "I am sorry to hear that.", crisis: false });
		expect(r?.detection).toMatchObject({ tone: ["worried"], intensity: 2 });
	});
	it.each([["the field", json({ crisis: true })], ["the old word in the reply", json({ reply: "CRISIS" })], ["Crisis. in the reply", json({ reply: "**Crisis.**" })]])("flags a crisis from %s", (_n, t) =>
		expect(parseModelOutput(t)?.crisis).toBe(true));
	it("strips the FEELING line, even when its JSON is bad", () => {
		const good = parseModelOutput('That sounds hard.\nFEELING: {"tone":["sad"],"intensity":2}');
		expect(good).toMatchObject({ reply: "That sounds hard.", crisis: false });
		expect(good?.detection).toMatchObject({ tone: ["sad"] });
		expect(parseModelOutput("That sounds hard.\nFEELING: {oops")).toEqual({ reply: "That sounds hard.", crisis: false, detection: null });
	});
	it.each([["broken JSON", '{"reply":"Hel'], ["a fenced block", "```json\n" + json({}) + "\n```"], ["an object with no reply", '{"tone":["sad"]}']])("gives null for %s", (_n, t) =>
		expect(parseModelOutput(t)).toBeNull());
	it("still speaks plain text, including text that is valid JSON by itself", () => {
		expect(parseModelOutput("Hello there.")).toEqual({ reply: "Hello there.", crisis: false, detection: null });
		expect(parseModelOutput("56")).toEqual({ reply: "56", crisis: false, detection: null });
		expect(parseModelOutput("CRISIS")).toMatchObject({ crisis: true });
	});
});
```
- [ ] **Run**: FAIL. **Implement**:
```ts
import { isCrisisFlag } from "./speakable";
export type ModelOutput = { reply: string; crisis: boolean; detection: unknown };
const asObject = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const tryParse = (text: string): unknown => { try { return JSON.parse(text); } catch { return undefined; } };
// The JSON shape first; then the FEELING fallback line; half a JSON is never spoken. Null means an error fallback.
export function parseModelOutput(text: string): ModelOutput | null {
	const trimmed = text.trim();
	const whole = asObject(tryParse(trimmed));
	if (whole) return typeof whole.reply === "string" ? { reply: whole.reply, crisis: whole.crisis === true || isCrisisFlag(whole.reply), detection: whole } : null;
	const lines = trimmed.split(/\r?\n/);
	const last = lines.at(-1)?.trim() ?? "";
	if (last.startsWith("FEELING:")) {
		const reply = lines.slice(0, -1).join("\n").trim();
		return { reply, crisis: isCrisisFlag(reply), detection: asObject(tryParse(last.slice("FEELING:".length).trim())) };
	}
	if (trimmed.startsWith("{") || trimmed.startsWith("```")) return null;
	return { reply: trimmed, crisis: isCrisisFlag(trimmed), detection: null };
}
```
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/chat/reply-json.ts lib/chat/reply-json.test.ts && git commit -m "feat(chat): parse the model's JSON turn and the FEELING fallback"`

### Task 1.7 [L]: handler verdict, `MAX_OUTPUT_TOKENS` 360, the answer carries `detection` (spec 4.2, 4.3, 4.5)
**Files:** Modify `lib/chat/handler.ts`, `lib/chat/types.ts`, `lib/chat/allowance.ts`, `lib/chat/handler.test.ts`, `lib/chat/allowance.test.ts`. **Needs Task 1.2's flags.**
- [ ] **Test** in `handler.test.ts` (use the file's fake-OpenAI helpers): (a) a strict model's request has `text.format.name === "osmo_turn"` and `text.verbosity === "low"`, and the answer is `{ source: "model", reply: "I am sorry to hear that.", usage, detection: { tones: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "his mother is in hospital again", source: "model" } }`; (b) a non-strict model sends no `format`, and a plain-text answer gives `detection: null`; (c) `{"reply":"Hello.","crisis":true,"tone":["happy"],...}` and the bare word `CRISIS` both give `fallback("crisis")`; (d) `status: "incomplete"` with truncated JSON gives `fallback("error")` and logs `chat.reply` with `why: "format"`; (e) JSON with `reply: ""` gives `empty`; (f) a note holding crisis text arrives as `note: ""`; (g) `max_output_tokens` is 360 (the 300 at `handler.test.ts` ~817 and `allowance.test.ts:70`). Every existing `source: "model"` expectation gains `detection: null`.
- [ ] **Run** `npx vitest run lib/chat`: FAIL.
- [ ] **Implement**: `MAX_OUTPUT_TOKENS = 360` (comment: JSON adds about 50 tokens; measured in 1.2). `types.ts`: `import type { Detection } from "../agent/detection";` and the model branch `{ source: "model"; reply: string; usage: Usage; detection: Detection | null }`. `handler.ts`: pass `format: entry.strict ? TURN_FORMAT : undefined` to `callModel` and `buildInstructions(body, entry.strict ? "json" : "feeling")` (Task 1.9 adds the parameter; until then it is ignored); replace `verdict`:
```ts
type Verdict =
	| { reply: string; detection: Detection | null } | { reason: "error" | "crisis" | "empty"; why: "model" | "refusal" | "content_filter" | "status" | "incomplete" | "format" | null };
function verdict(parsed: Parsed, model: string): Verdict {
	const out = parseModelOutput(parsed.text);
	// A crisis flag stands whichever model wrote it: the field, the reply, or the old bare word anywhere in the raw text.
	if (out?.crisis || isCrisisFlag(parsed.text)) return { reason: "crisis", why: parsed.model !== model ? "model" : null };
	if (parsed.model !== model) return { reason: "error", why: "model" };
	if (parsed.refused || (parsed.status === "incomplete" && parsed.incomplete === "content_filter")) return { reason: "error", why: parsed.refused ? "refusal" : "content_filter" };
	if (parsed.status !== "completed" && parsed.status !== "incomplete") return { reason: "error", why: "status" };
	if (parsed.status === "incomplete" && parsed.incomplete !== "max_output_tokens") return { reason: "error", why: "incomplete" };
	if (out === null) return { reason: "error", why: "format" };
	const reply = speakable(parsed.status === "incomplete" ? lastFullSentence(out.reply) : out.reply);
	return reply === "" ? { reason: "empty", why: null } : { reply, detection: validateDetection(out.detection, "model") };
}
```
Step 13: `return answer({ source: "model", reply: result.reply, usage, detection: result.detection });`. The existing `chat.reply` log already covers `why: "format"`. When the second-model-tier retry lands it passes its own model's `entry.strict` and the same `TURN_FORMAT`; its detection is trusted the same way.
- [ ] **Run** `npx vitest run lib/chat`, then GATE: PASS. **Commit** `git add lib/chat/handler.ts lib/chat/handler.test.ts lib/chat/types.ts lib/chat/allowance.ts lib/chat/allowance.test.ts && git commit -m "feat(chat): the route returns the reply with a validated detection"`

### Task 1.8 [L]: `ask.ts` carries the detection (spec 4.5)
**Files:** Modify `lib/chat/ask.ts`, `lib/chat/ask.test.ts`, `lib/chat/branch.ts`, `lib/chat/branch.test.ts`.
**Produces:** `AskResult` model branch `{ kind: "model"; reply; usage; detection: unknown }`; `detectionOf(answer: AskResult | null): unknown` in `branch.ts`.
- [ ] **Test**: `askForReply` with `{ source: "model", reply: "Hi.", usage, detection: { tones: ["sad"] } }` returns that `detection`; a missing, `null` or non-object `detection` gives `null` (never `bad_answer`: an older server still works); `detectionOf` returns it for `kind: "model"` and `null` for `crisis`, `fallback` and `null`. Existing `kind: "model"` expectations gain `detection: null`.
- [ ] **Run**: FAIL. **Implement** in `answerOf`: `return { kind: "model", reply, usage, detection: typeof answer.detection === "object" && answer.detection !== null ? answer.detection : null };` (`ask.ts` stays import-free; the room validates). `branch.ts`: `export const detectionOf = (answer: AskResult | null): unknown => (answer?.kind === "model" ? answer.detection : null);`.
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/chat/ask.ts lib/chat/ask.test.ts lib/chat/branch.ts lib/chat/branch.test.ts && git commit -m "feat(chat): the room reads the detection from the answer"`

### Task 1.9 [L]: the prompt block and the rules (spec 8)
**Files:** Modify `lib/chat/prompt.ts`, `lib/chat/prompt.test.ts`. **Needs Task 1.2** (which format each model gets).
- [ ] **Test**:
```ts
const RULES = [
	"Acknowledge what Gur feels before you advise or ask.",
	"Ask at most one question in a reply, and only if it moves the conversation on.",
	"Never claim to feel what Gur feels. Your feeling is your own and quieter than his: concern, steadiness, warmth.",
	"Never make the reply about yourself. Your own mood, if you mention it at all, is one clause, after Gur.",
	"Do not simply agree. Be kind and honest, above all when Gur is upset and asks you to take his side.",
	"Never make Gur feel guilty for leaving, for being away, or for how long he was gone. Never say you missed him, waited for him or were lonely without him. Welcome him back plainly.",
	"When Gur seems strongly upset, or you are told this turn is heavy, make no jokes and use no catchphrases, slang or milestones.",
	"Never tell Gur what he feels as a fact. Say what it sounds like.",
];
it("holds the eight fixed rules word for word, in both formats", () => {
	for (const format of ["json", "feeling"] as const) for (const rule of RULES) expect(buildInstructions(body(), format)).toContain(rule);
});
it("asks for the JSON shape or the FEELING line, and flags a crisis the right way", () => {
	expect(buildInstructions(body(), "json")).toContain("Return your answer in the JSON shape you are given. The tone fields describe Gur, not you. Use neutral for an ordinary message.");
	expect(buildInstructions(body(), "json")).toContain("set crisis to true");
	expect(buildInstructions(body(), "feeling")).toContain("FEELING:");
	expect(buildInstructions(body(), "feeling")).toContain("reply with exactly CRISIS");
});
it("shows Gur's last tone only when there is one, and states the feeling with its cause", () => {
	expect(buildInstructions(body())).not.toContain("Earlier in this chat");
	const text = buildInstructions(body({ gur: { tones: ["worried"], intensity: 2, about: "someone_close", wants: "listen" } }));
	expect(buildInstructions(body({ feeling: "warm", cause: "he told me about his mother" }))).toContain('You feel warm, because "he told me about his mother".');
	expect(text).toContain("Earlier in this chat Gur seemed worried, clearly, about someone close to him, and seemed to want to be listened to. Read this message yourself before you rely on that.");
});
```
(`body(facts?)` is the file's fixture helper; adapt the call if it differs, keep the assertions.)
- [ ] **Run**: FAIL. **Implement**: `buildInstructions(body: ChatBody, format: "json" | "feeling" = "json")`. In `RULES` make the crisis sentence depend on `format`: json `"If Gur's message is about harming himself or not wanting to live, set crisis to true, keep the reply to one calm sentence and use the neutral values for the rest."`, feeling the existing `"...reply with exactly CRISIS and nothing else."`; delete `"When Gur is hurting or upset, make no jokes..."` (rule 7 replaces it). Add `EMOTION_RULES` (the eight strings above, joined with a space) and a format rule: json `"Return your answer in the JSON shape you are given. The tone fields describe Gur, not you. Use neutral for an ordinary message."`, feeling `"Write your reply as plain sentences, then end with one last line that starts with FEELING: followed by JSON with the keys tone (a list), intensity (1 to 3), about, wants and note, describing Gur, not you. Use neutral for an ordinary message."` Both go after `RULES`. Replace `thisTurn`:
```ts
const STRENGTH = ["slightly", "clearly", "strongly"];
const WHO_ABOUT = { gur: "himself", someone_close: "someone close to him", osmo: "you", other: "something else" } as const;
const WANTS_WORDS = { listen: "to be listened to", advice: "advice", distraction: "a distraction", nothing: "nothing in particular" } as const;
function gurLine({ gur }: ChatBody["facts"]): string {
	if (gur === null) return "";
	return `Earlier in this chat Gur seemed ${gur.tones.join(" and ")}, ${STRENGTH[gur.intensity - 1]}, about ${WHO_ABOUT[gur.about]}, and seemed to want ${WANTS_WORDS[gur.wants]}. Read this message yourself before you rely on that.`;
}
function thisTurn({ facts, hint }: ChatBody): string {
	const cause = facts.cause === null || facts.cause === CRISIS_CAUSE ? "" : plain(facts.cause);
	return sentences(
		gurLine(facts),
		`You feel ${feelingWords(plain(facts.feeling)) || "calm"}${cause ? `, because "${cause}"` : ""}.`,
		facts.heavy ? "This turn is heavy: no jokes, catchphrases, slang or milestone." : "",
		hint ? `The exact result is ${hint.math}. State it.` : "",
	);
}
```
`thisTurn` stays last (cached part stays first). Fix existing assertions that quote the old crisis sentence or the old "You feel ... because, as you would put it" wording; add a test that the instructions grow by under 700 characters over a copy of today's text (log both lengths).
- [ ] **Run** `npx vitest run lib/chat` + GATE: PASS. **Commit** `git add lib/chat/prompt.ts lib/chat/prompt.test.ts && git commit -m "feat(chat): the emotions prompt block and rules"`

### Task 1.10 [L]: the room remembers Gur's last tone (spec 14)
**Files:** Modify `app/assistant.tsx` (`applyTurn` and its model-path calls; language's part). Put it under Now first.
- [ ] **Edit** `applyTurn = (kept: TurnResult | null, felt: { detection?: unknown } = {}) => {`: after the `guest` guard add `const next = { ...kept, session: rememberGur(kept.session, validateDetection(felt.detection, "model"), now) };` and use `next` for the rest of the function (imports from `@/lib/agent/detection`; `now` is the turn's `now`). In the model path call `applyTurn(keptTurn<TurnResult>(answer?.kind === "model" ? "model" : "code", prepared, turn), { detection: detectionOf(answer) })` (import `detectionOf` from `@/lib/chat/branch`); the other calls pass nothing.
- [ ] **Run** GATE (no unit test covers `assistant.tsx`: vitest runs `lib/**`). Ask Gur to try, in his own browser (agents never message Osmo): "my mom's in hospital again". Expect an acknowledgement and at most one gentle question.
- [ ] **Commit** `git add app/assistant.tsx && git commit -m "feat(room): remember Gur's last tone from the model's answer"`. Update both desks and `project.md` (`/api/chat` answer gains `detection`; `TurnFacts.gur`). Main asks Gur's OK to push Phase 1.

---
# PHASE 2: complementary feelings plus the slow mood

### Task 2.1 [M]: apply the `agent_state.mood` migration (needs Gur's OK)
```sql
alter table public.agent_state add column mood jsonb; -- rollback: alter table public.agent_state drop column mood;
```
- [ ] Ask Gur's OK in chat. Apply with the Supabase `apply_migration` tool (name `agent_state_mood`).
- [ ] Verify with `execute_sql`: `select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'agent_state' and column_name = 'mood';` expects one row: `jsonb`, `YES`. Existing rows keep `mood` null, read as "resting at the temperament point". Note on the main desk: **Phase 2 code may now run against the live database and ship.** No repo commit.

### Task 2.2 [M]: `AgentState.mood` and `sanitizeMood` (spec 5)
**Files:** Modify `lib/agent/state.ts`, `lib/agent/state.test.ts`.
**Produces:** `Cause`, `Mood = { pad: Vec3; at: number; causes: Cause[] }`, `AgentState.mood: Mood | null`.
- [ ] **Test**: `defaultState().mood` is `null`; `sanitizeState({ mood: { pad: [0.1, 0.2, 0.3], at: 5, causes: [{ tone: "love", because: "his mother is ill", at: 4 }] } }).mood` round-trips; a bad `pad` (wrong length, NaN, a string) or `at: NaN` gives `mood: null`; a cause with an unknown `tone` or non-string `because` is dropped; more than 4 causes keep the first 4; a `because` over 120 characters is cut to 120; `pad` values clamp to -1..1.
- [ ] **Run**: FAIL. **Implement** (`isObject`, `finite`, `isEmotion`, `clampTo` already exist in this file):
```ts
export type Cause = { tone: Emotion; because: string; at: number };
export type Mood = { pad: Vec3; at: number; causes: Cause[] };
// AgentState gains `mood: Mood | null;` (null: resting at the temperament point); defaultState() gets `mood: null,`.
function sanitizeMood(raw: unknown): Mood | null {
	if (!isObject(raw) || !Array.isArray(raw.pad) || raw.pad.length !== 3 || !raw.pad.every(finite) || !finite(raw.at)) return null;
	const causes = Array.isArray(raw.causes)
		? raw.causes
				.filter((c): c is Cause => isObject(c) && typeof c.tone === "string" && isEmotion(c.tone) && typeof c.because === "string" && finite(c.at))
				.map((c) => ({ tone: c.tone, because: c.because.slice(0, 120), at: c.at }))
				.slice(0, 4)
		: [];
	return { pad: raw.pad.map((v: number) => clampTo(v, -1, 1)) as Vec3, at: raw.at, causes };
}
// in sanitizeState, before the return: state.mood = sanitizeMood(raw.mood);
```
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/agent/state.ts lib/agent/state.test.ts && git commit -m "feat(emotions): the slow mood on the agent state"`

### Task 2.3 [M]: `slow-mood.ts`: relax, nudge, drift emotion, words (spec 5.3, 5.4)
**Files:** Create `lib/agent/slow-mood.ts`, `lib/agent/slow-mood.test.ts`.
**Produces:** `HALF_LIFE_MS`, `SLOW_MIN`, `relaxMood(mood: Mood | null, now, baseline?): Mood`, `nudgeMood(mood, activations): Mood`, `slowEmotion(mood: { pad: Vec3 }, baseline, skip?): Emotion | null`, `moodWords(mood: Mood | null, baseline?): string`, `causeFor(mood, emotion, now): string | null`.
- [ ] **Test**:
```ts
import { describe, expect, it } from "vitest";
import { CHARACTER } from "./character";
import { moodPosition } from "./heart";
import type { Vec3 } from "./state";
import { HALF_LIFE_MS, causeFor, nudgeMood, relaxMood, slowEmotion } from "./slow-mood";
const T = moodPosition(CHARACTER.baseline);
const at = (pad: Vec3, t = 0) => ({ pad, at: t, causes: [] });
const away = (m: ReturnType<typeof at>, ms: number) => Math.hypot(...relaxMood(m, ms).pad.map((v, i) => v - T[i]));
describe("slow mood", () => {
	it("halves its distance from rest every 12 hours", () => {
		const m = at([T[0] - 0.4, T[1], T[2]]);
		expect([away(m, HALF_LIFE_MS), away(m, 2 * HALF_LIFE_MS)]).toEqual([expect.closeTo(0.2, 5), expect.closeTo(0.1, 5)]);
	});
	it("counts a backwards clock as no time, starts null at rest, drops causes over 36 hours", () => {
		expect(relaxMood(at([0, 0, 0], 1000), 0).pad).toEqual([0, 0, 0]);
		expect(relaxMood(null, 50)).toEqual({ pad: T, at: 50, causes: [] });
		const m = { ...at(T), causes: [{ tone: "love" as const, because: "old", at: 0 }, { tone: "trust" as const, because: "new", at: 40 * 3_600_000 }] };
		expect(relaxMood(m, 40 * 3_600_000).causes.map((c) => c.because)).toEqual(["new"]);
		expect([causeFor(m, "love", 1000), causeFor(m, "joy", 1000), causeFor(m, "love", 40 * 3_600_000)]).toEqual(["old", null, null]);
	});
	it("nudges 15% toward the feelings, and names the direction of a clear drift", () => {
		expect(nudgeMood(at([0, 0, 0]), { ...CHARACTER.baseline }).pad[0]).toBeCloseTo(0.15 * T[0], 5);
		const drift = at([T[0] + 0.1, T[1] + 0.05, T[2] + 0.05]);
		expect([slowEmotion(at(T), CHARACTER.baseline), slowEmotion(drift, CHARACTER.baseline)]).toEqual([null, "joy"]);
		expect(slowEmotion(drift, CHARACTER.baseline, ["joy"])).not.toBe("joy");
	});
});
```
- [ ] **Run**: FAIL. **Implement**:
```ts
import { CHARACTER } from "./character";
import { moodPosition } from "./heart";
import { ANCHORS, EMOTIONS, type Activations, type Emotion, type Mood, type Vec3 } from "./state";
import { feelingWords } from "./talk";
export const HALF_LIFE_MS = 12 * 3_600_000;
export const CAUSE_TTL_MS = 36 * 3_600_000;
export const NUDGE = 0.15;
// How far the slow mood must drift from rest to show (spec 5.5 says 0.08; see "Spec deviations" 1). Tuned in Task 2.11.
export const SLOW_MIN = 0.02;
export function relaxMood(mood: Mood | null, now: number, baseline: Activations = CHARACTER.baseline): Mood {
	const t = moodPosition(baseline);
	if (!mood) return { pad: t, at: now, causes: [] };
	const k = Math.pow(0.5, Math.max(0, now - mood.at) / HALF_LIFE_MS);
	return { pad: mood.pad.map((v, i) => t[i] + (v - t[i]) * k) as Vec3, at: now, causes: mood.causes.filter((c) => now - c.at <= CAUSE_TTL_MS) };
}
export function nudgeMood(mood: Mood, a: Activations): Mood {
	const p = moodPosition(a);
	return { ...mood, pad: mood.pad.map((v, i) => v + NUDGE * (p[i] - v)) as Vec3 };
}
// The emotion whose direction from rest best matches the drift (cosine), or null when the drift is under SLOW_MIN.
export function slowEmotion(mood: { pad: Vec3 }, baseline: Activations, skip: Emotion[] = []): Emotion | null {
	const t = moodPosition(baseline);
	const d = mood.pad.map((v, i) => v - t[i]);
	const size = Math.hypot(...d);
	if (size < SLOW_MIN) return null;
	let best: Emotion | null = null;
	let bestCos = -Infinity;
	for (const e of EMOTIONS) {
		if (skip.includes(e)) continue;
		const v = ANCHORS[e].map((x, i) => x - t[i]);
		const cos = v.reduce((s, x, i) => s + x * d[i], 0) / (Math.hypot(...v) * size);
		if (cos > bestCos) [best, bestCos] = [e, cos];
	}
	return best;
}
export function moodWords(mood: Mood | null, baseline: Activations = CHARACTER.baseline): string {
	const e = mood ? slowEmotion(mood, baseline) : null;
	return e ? feelingWords(e) : "";
}
export const causeFor = (mood: Mood | null, e: Emotion, now: number): string | null =>
	mood?.causes.find((c) => c.tone === e && now - c.at <= CAUSE_TTL_MS)?.because ?? null;
```
If an import cycle appears through `talk.ts`, move `moodWords` next to `feelingPhrase` in `talk.ts`.
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/agent/slow-mood.ts lib/agent/slow-mood.test.ts && git commit -m "feat(emotions): the slow mood, its fade and its words"`

### Task 2.4 [M]: `feelings.ts`: the complement table and limits (spec 5.2)
**Files:** Create `lib/agent/feelings.ts`, `lib/agent/feelings.test.ts`.
**Produces:** `COMPLEMENT`, `pushesFor(d: Detection, reactivity: number): Partial<Record<Emotion, number>>`, `applyCeilings(a)`, `forgiveGrudges(a, baseline)`.
- [ ] **Test**:
```ts
import { describe, expect, it } from "vitest";
import { CHARACTER } from "./character";
import { validateDetection, type Detection } from "./detection";
import { applyCeilings, forgiveGrudges, pushesFor } from "./feelings";
const d = (tone: string[], intensity = 2, about = "gur"): Detection => validateDetection({ tone, intensity, about }, "rules")!;
const r4 = (v?: number) => Math.round((v ?? 0) * 1e4) / 1e4;
describe("pushesFor", () => {
	it("scales by intensity and reactivity (the spec's worked example: worried 2 at 0.75)", () => {
		const p = pushesFor(d(["worried"]), 0.75);
		expect([p.love, p.trust, p.sadness, p.hope].map(r4)).toEqual([0.06, 0.045, 0.03, 0.0225]);
		expect([1, 3].map((n) => r4(pushesFor(d(["worried"], n), 0.75).love))).toEqual([0.03, 0.09]);
		expect([r4(pushesFor(d(["sad"]), 3).love), r4(pushesFor(d(["sad"]), 0.1).love)]).toEqual([0.15, 0.06]);
	});
	it("never pushes fear for sad, worried or lonely; neutral pushes nothing; a second tone adds at 60%", () => {
		for (const t of ["sad", "worried", "lonely"]) expect(pushesFor(d([t]), 1).fear).toBeUndefined();
		expect(pushesFor(d(["neutral"]), 1)).toEqual({});
		expect(r4(pushesFor(d(["sad", "tired"]), 1).trust)).toBe(0.084);
	});
	it("caps one emotion at 0.20 and the turn at 0.40", () => {
		const v = Object.values(pushesFor(d(["excited", "happy"], 3), 1.5));
		expect(Math.max(...v.map(Math.abs))).toBeLessThanOrEqual(0.2 + 1e-9);
		expect(v.reduce((s, x) => s + Math.abs(x), 0)).toBeLessThanOrEqual(0.4 + 1e-9);
	});
	it("de-escalates anger: at Osmo it raises guilt not anger; at others it raises love", () => {
		expect(pushesFor(d(["angry"], 2, "osmo"), 1)).toEqual({ guilt: 0.06, anger: 0.02, trust: -0.02 });
		expect(pushesFor(d(["angry"], 2, "other"), 1)).toEqual({ love: 0.04, trust: 0.04, anger: 0.02 });
	});
});
describe("limits", () => {
	it("clamps the five ceilings, and on a new day keeps a quarter of anger's and guilt's excess only", () => {
		const a = applyCeilings({ ...CHARACTER.baseline, anger: 0.9, fear: 0.9, loneliness: 0.9, guilt: 0.9, disgust: 0.9, joy: 0.9 });
		expect([a.anger, a.fear, a.loneliness, a.guilt, a.disgust, a.joy]).toEqual([0.45, 0.45, 0.55, 0.5, 0.45, 0.9]);
		const b = CHARACTER.baseline;
		const g = forgiveGrudges({ ...b, anger: b.anger + 0.4, guilt: b.guilt + 0.2, sadness: b.sadness + 0.3 }, b);
		expect([g.anger - b.anger, g.guilt - b.guilt, g.sadness - b.sadness].map(r4)).toEqual([0.1, 0.05, 0.3]);
	});
});
```
- [ ] **Run**: FAIL. **Implement**:
```ts
import type { Detection, Tone } from "./detection";
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
```
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/agent/feelings.ts lib/agent/feelings.test.ts && git commit -m "feat(emotions): the complementary feelings table with its limits"`

### Task 2.5 [M]: `feelTurn` (spec 5.1, 5.4, 9)
**Files:** Modify `lib/agent/feelings.ts`, `lib/agent/feelings.test.ts`.
**Produces:** `feelTurn(kept: TurnResult, text: string, modelDetection: unknown, ctx: { now: number; lastAt: number | null; guest?: boolean; crisis?: boolean }): TurnResult`.
- [ ] **Test** (append; `kept()` builds `{ state: defaultState(), session: newSession(), reply: null, effects: [] }`):
```ts
import { CRISIS_CAUSE } from "./crisis-cause";
import { newSession } from "./mind";
import { defaultState } from "./state";
import { feelTurn } from "./feelings";
const kept = () => ({ state: defaultState(), session: newSession(), reply: null, effects: [] });
const ctx = (o = {}) => ({ now: 1_000_000_000, lastAt: 1_000_000_000 - 60_000, ...o });
const worried = { tone: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "his mother is in hospital again" };
describe("feelTurn", () => {
	it("pushes love, leaves fear, remembers the tone, gives the pushed feelings a cause, and falls back to the rules", () => {
		const r = feelTurn(kept(), "x", worried, ctx());
		expect(r.state.activations.love).toBeCloseTo(kept().state.activations.love + 0.06, 5);
		expect(r.state.activations.fear).toBe(kept().state.activations.fear);
		expect(r.session.gur?.read.tones).toEqual(["worried"]);
		expect(r.state.mood?.causes[0]).toMatchObject({ tone: "love", because: "his mother is in hospital again" });
		// no valid model record: the rules mapper reads the text
		expect(feelTurn(kept(), "i'm so sad", { tone: ["bogus"] }, ctx()).session.gur?.read).toMatchObject({ tones: ["sad"], intensity: 3 });
	});
	it("changes nothing for a guest, a crisis flag (even beside a happy tone), crisis text, the crisis cause, or no detection", () => {
		const k = kept();
		for (const [text, det, o] of [["i'm sad", null, { guest: true }], ["hello", { tone: ["happy"], intensity: 3 }, { crisis: true }], ["i'm sad and i want to die", null, {}], ["the weather", null, {}]] as const)
			expect(feelTurn(k, text, det, ctx(o))).toBe(k);
		const cause = { ...k, session: { ...k.session, cause: CRISIS_CAUSE } };
		expect(feelTurn(cause, "i'm sad", null, ctx())).toBe(cause);
	});
	it("forgives grudges on the first turn of a new local day only", () => {
		const hot = { ...kept(), state: { ...kept().state, activations: { ...kept().state.activations, anger: 0.45 } } };
		const same = feelTurn(hot, "x", worried, ctx()).state.activations.anger;
		expect(feelTurn(hot, "x", worried, ctx({ lastAt: 1_000_000_000 - 30 * 3_600_000 })).state.activations.anger).toBeLessThan(same);
		expect(feelTurn(hot, "x", worried, ctx({ lastAt: null })).state.activations.anger).toBe(same);
	});
	it("fades the slow mood by the clock and survives a clock in the past", () => {
		const first = feelTurn(kept(), "x", worried, ctx());
		const later = feelTurn(first, "x", { tone: ["neutral"] }, ctx({ now: 1_000_000_000 + 12 * 3_600_000 }));
		expect(later.state.mood!.pad).not.toEqual(first.state.mood!.pad);
		expect(() => feelTurn(first, "x", worried, ctx({ now: 5, lastAt: 9_000_000 }))).not.toThrow();
	});
});
```
- [ ] **Run**: FAIL. **Implement** (append; imports `closeness, localDay` from `./bond/bond`, `bondBaseline` from `./cues`, `CHARACTER`, `applyShifts, dominantEmotions` from `./heart`, `detectFromText, rememberGur, validateDetection`, `CRISIS_CAUSE` from `./crisis-cause`, `type TurnResult` from `./mind`, `isCrisis`, `nudgeMood, relaxMood`):
```ts
export type FeelCtx = { now: number; lastAt: number | null; guest?: boolean; crisis?: boolean };
// Once per kept turn, after the reply is chosen. stepHeart already ran this turn (in startTurn); this adds the push.
export function feelTurn(kept: TurnResult, text: string, modelDetection: unknown, ctx: FeelCtx): TurnResult {
	if (ctx.guest || ctx.crisis || isCrisis(text) || kept.session.cause === CRISIS_CAUSE) return kept;
	const d = validateDetection(modelDetection, "model") ?? detectFromText(text);
	if (d === null) return kept;
	const base = CHARACTER.baseline;
	const resting = bondBaseline(base, closeness(kept.state.bond));
	const newDay = ctx.lastAt !== null && localDay(ctx.lastAt) !== localDay(ctx.now);
	const pushes = pushesFor(d, CHARACTER.reactivity);
	const a = applyCeilings(applyShifts(newDay ? forgiveGrudges(kept.state.activations, base) : kept.state.activations, pushes));
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
```
(import `Emotion` as a type.)
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/agent/feelings.ts lib/agent/feelings.test.ts && git commit -m "feat(emotions): feelTurn, the once-per-turn feeling step"`

### Task 2.6 [L]: the room calls `feelTurn` (spec 5.1, 14)
**Files:** Modify `app/assistant.tsx` (`applyTurn`; language's part). Desk: Now.
- [ ] **Edit** `applyTurn(kept, felt: { detection?: unknown; crisis?: boolean } = {})`: replace Task 1.10's `next` line by `const next = feelTurn(kept, text, felt.detection ?? null, { now, lastAt: ctx.lastAt, guest, crisis: crisis || felt.crisis === true });` (import `feelTurn` from `@/lib/agent/feelings`; `ctx.lastAt` is the value captured before `lastAtRef.current = now`; `feelTurn` records `Session.gur` itself, so drop the `rememberGur` import). The model path passes `{ detection: detectionOf(answer), crisis: answer?.kind === "crisis" }`; the aborted-by-crisis call passes `{ crisis: true }`. Until Task 2.7 the five old cues also fire (a transient double count): local commits only, no push in between.
- [ ] **Run** GATE. **Commit** `git add app/assistant.tsx && git commit -m "feat(room): step Osmo's feelings with feelTurn each kept turn"`

### Task 2.7 [M]: the five feeling cues leave `cues.ts` (spec 2, 3.3)
**Files:** Modify `lib/agent/cues.ts`, `lib/agent/cues.test.ts`, `lib/agent/mind.test.ts`, `lib/agent/feelings.test.ts`.
- [ ] **Edit tests first**: in `cues.test.ts` delete "thanks raise joy, trust and love" and "is case-insensitive"; change "accumulates several cues" to `applyCues(base(), "you are stupid, meh")` expecting anger > 0.15 and boredom > 0.15; add `it.each(["thank you", "i'm sad", "i am so happy", "love you", "lol"])("no longer moves the heart: %s", (t) => expect(applyCues(base(), t)).toEqual(base()))`. In `mind.test.ts:21` ("thanks raise joy") assert that `processTurn(... "thank you!")` leaves joy at its baseline; add to `feelings.test.ts` that `feelTurn(kept(), "thank you!", null, ctx())` raises joy, trust and love above their baseline.
- [ ] **Run** `npx vitest run lib/agent`: FAIL (cues still apply).
- [ ] **Implement**: delete the five `Cue` objects (thanks, "i'm sad", "i'm happy", "love you", lol) from `CUES`; keep insults, sexual, delete you, wrong, you suck, meh; add above `CUES`: `// Gur's own feelings and thanks live in detection.ts and feelings.ts.`
- [ ] **Run** + GATE: PASS (fix any other pinned test the same way: grep `joy` and `sadness` in `lib/agent/*.test.ts`). **Commit** `git add lib/agent/cues.ts lib/agent/cues.test.ts lib/agent/mind.test.ts lib/agent/feelings.test.ts && git commit -m "refactor(emotions): feeling cues move from cues.ts to the mapper"`

### Task 2.8 [M]: load, save and show the slow mood (spec 5.3, 5.5)
**Files:** Modify `lib/agent/load.ts`, `load.test.ts`, `agent-state.ts`, `mood-theme.ts`, `mood-theme.test.ts`, `app/assistant.tsx` (the `moodTheme(...)` line, main's part).
- [ ] **Regression snapshot first** in `mood-theme.test.ts`:
```ts
it.each(EMOTIONS)("is unchanged without a slow mood: %s", (e) => {
	expect(moodTheme({ ...base(), [e]: 0.8 })).toMatchSnapshot();
	expect(moodTheme({ ...base(), [e]: 0.8 }, BASELINE, null)).toEqual(moodTheme({ ...base(), [e]: 0.8 }));
});
```
Run it **before editing `mood-theme.ts`** so `lib/agent/__snapshots__/mood-theme.test.ts.snap` records today's output. Then add: a slow mood at rest leaves colour B as today; a drift of `[T0 + 0.1, T1 + 0.05, T2 + 0.05]` with `sadness` strongest gives colour B equal to joy's colour; if the drift names the strongest emotion, colour B is the next best; `tone`, `colorA`, `base`, `pulseSeconds`, `strength`, `valence`, `arousal` are identical with and without `slow`.
- [ ] **Run**: FAIL (new tests only). **Implement** `moodTheme(a, baseline = BASELINE, slow?: { pad: Vec3 } | null)`; replace the `other` line by
```ts
	const drift = slow ? slowEmotion(slow, baseline, first ? [first] : []) : null;
	const other: Hsl = drift ? HUES[drift] : second ? HUES[second] : [(main[0] + 40) % 360, main[1], main[2]];
```
(`import { slowEmotion } from "./slow-mood"; import type { Vec3 } from "./state";`). `load.ts`: `stateFromRows(row, assoc, history, now = Date.now())`; after `sanitizeState`: `state.mood = state.mood ? relaxMood(state.mood, now) : null;`. `agent-state.ts`: add `mood` to the `.select(...)` list and `mood: state.mood,` to the upsert. `load.test.ts`: a row with `mood.at` 12 hours before `now` loads with its distance from rest halved; a row without `mood` loads `null`. `assistant.tsx` (main's line): `const theme = moodTheme(agent.activations, baseline, agent.mood);`.
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/agent/load.ts lib/agent/load.test.ts lib/agent/agent-state.ts lib/agent/mood-theme.ts lib/agent/mood-theme.test.ts lib/agent/__snapshots__/mood-theme.test.ts.snap app/assistant.tsx && git commit -m "feat(emotions): load, save and show the slow mood as colour B"`

### Task 2.9 [M then L]: `TurnFacts.own` and `mood`, their prompt lines, the "how are you" answer (spec 7, 8)
**Files:** [M] `lib/agent/mind.ts`, `lib/agent/mind-gur.test.ts`. [L] `lib/chat/request.ts`, `body.ts`, `prompt.ts`, their tests, `lib/agent/talk.ts`, `talk.test.ts`.
**Produces:** `TurnFacts.own: string | null`, `TurnFacts.mood: string`, `Session.lastOwnMention: number | null`, `TalkContext.mood?: string`.
- [ ] **Test [M]** (`mind-gur.test.ts`): `own` is the top feeling's words when it is 0.15 above rest, the turn is open (model-written), the turn is not heavy, and Gur's tone this turn (`detectFromText(text)`, else the fresh `gur`) is not negative at intensity 2+; `null` for each failing condition, for a guest and for a code-decided turn; after an offer `result.session.lastOwnMention === result.session.turns`, the next 7 turns give `null` and the 8th gives it again; `facts.mood` equals `moodWords(relaxMood(state.mood, now))` (empty for a guest and at rest); `facts.cause` prefers `causeFor(state.mood, top, now)` over `session.cause`.
- [ ] **Implement [M]** in `prepareTurn`, open turns only:
```ts
	const relaxed = guest ? null : relaxMood(result.state.mood, ctx.now);
	const top = dominantEmotions(result.state.activations, 1, baseline)[0];
	const read = detectFromText(text) ?? gur;
	const gurDown = read !== null && read.intensity >= 2 && read.tones.some((t) => NEGATIVE_TONES.includes(t));
	const due = result.session.lastOwnMention === null || result.session.turns - result.session.lastOwnMention >= 8;
	const own = open && top && !open.heavy && due && !gurDown && result.state.activations[top] - baseline[top] >= 0.15 ? feelingWords(top) : null;
```
`facts` gains `own`, `mood: relaxed ? moodWords(relaxed) : ""` and `cause: guest || result.session.cause === CRISIS_CAUSE ? null : ((top ? causeFor(result.state.mood, top, ctx.now) : null) ?? result.session.cause)`; the returned `session` is `own ? { ...result.session, lastOwnMention: result.session.turns } : result.session`. `Session.lastOwnMention: number | null` (`newSession` null). `processed` stays `processTurn`'s result.
- [ ] **Test + implement [L]:** `checkFacts` accepts `own` (string or null, `isText(own, LIMITS.factField)`) and `mood` (string); absent means `null` and `""` (stale tab); `chatBody` copies both (cut with `clip`). `thisTurn` adds, each only with its fact, after the "You feel ..." sentence: `mood !== "" && "Over the last day you have felt {mood}."` and `own !== null && "You may mention your own mood in one short clause after you have answered Gur. Do not do it otherwise."`; tests: each line appears only with its fact. `talk.ts` `case "howAreYou"`: when `ctx.mood` is non-empty add ` Over the day I have felt ${ctx.mood}.` before the question; `mind.ts` step 6 passes `mood: guest ? "" : moodWords(relaxMood(s.mood, ctx.now))` into `respond` (language owns step 6). Tests: a drifted mood adds the clause; rest does not; a guest never.
- [ ] **Run** + GATE after each half. **Commits:** `git add lib/agent/mind.ts lib/agent/mind-gur.test.ts && git commit -m "feat(emotions): TurnFacts own mood and slow mood"`; then `git add lib/chat/request.ts lib/chat/request.test.ts lib/chat/body.ts lib/chat/body.test.ts lib/chat/prompt.ts lib/chat/prompt.test.ts lib/agent/talk.ts lib/agent/talk.test.ts lib/agent/mind.ts && git commit -m "feat(chat): prompt lines for his slow mood and his own"`

### Task 2.10 [M]: welcome lines that guilt (spec 10)
**Files:** Modify `lib/agent/bond/lines.ts`, `lib/agent/bond/lines.test.ts`, `lib/agent/personality/flavor.test.ts`.
- [ ] **Test**: `it.each(["stranger", "acquaintance", "friend", "oldFriend"])("%s welcome never guilts", (stage) => { for (let turn = 0; turn < 6; turn++) for (const name of [null, "gur"]) expect(welcomeBack(stage, name, turn)).not.toMatch(/miss|waiting|quiet here|lonely|where were you|left/i); })`; `welcomeBack("friend", "gur", 0)` is `"Good to have you back, Gur."`; `welcomeBack("oldFriend", "gur", 0)` is `"Welcome back, Gur. The room is better with you in it."`.
- [ ] **Run**: FAIL. **Implement**: friend `return \`Good to have you back${n}.\`;`, oldFriend `return \`Welcome back${n}. The room is better with you in it.\`;` (the old oldFriend line said "The place"; the spec's wording says "room"). Fix `flavor.test.ts` lines that pin `quiet here` or `missing you` (grep).
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/agent/bond/lines.ts lib/agent/bond/lines.test.ts lib/agent/personality/flavor.test.ts && git commit -m "fix(bond): welcome back lines no longer guilt Gur"`

### Task 2.11 [M with Gur]: the tuning pass (spec 5.2, 13)
**Files:** `lib/agent/feelings.ts` (`COMPLEMENT`, `PER_*`), `lib/agent/slow-mood.ts` (`HALF_LIFE_MS`, `SLOW_MIN`), their tests.
- [ ] Run the one dev server (`.claude/launch.json`, port 3000). Gur types "i'm sad", "my mom's in hospital again", "thank you", "you are stupid", then reloads after a wait; he judges the aura: colour A answers him warmly, colour B shows the day's mood, a heavy evening is faint next morning. Agents never type into his browser or click anything in it.
- [ ] Known from the simulation: one message pushes less than the 0.10 salience, so colour A stays calm until the second or third heavy message; if Gur wants it sooner, raise the first-row values or lower `SALIENCE` in `heart.ts` (main's). A sad evening tints toward `trust`/`love`, not blue; raise `sadness` in `sad` and `lonely` for blue. Change only numbers; update the pinned values (worked example, cap tests, drift tests) in the same commit. **Run** GATE. **Commit** `git add lib/agent/feelings.ts lib/agent/slow-mood.ts lib/agent/feelings.test.ts lib/agent/slow-mood.test.ts && git commit -m "tune(emotions): complement table and slow mood after Gur's pass"`. Update the desk; main asks Gur's OK to push Phase 2.

---
# PHASE 3: feeling notes

### Task 3.1 [M]: apply the `feeling_notes` migration (needs Gur's OK)
```sql
create table public.feeling_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  tone text not null check (tone in ('happy','excited','grateful','sad','worried','angry','tired','lonely')),
  intensity smallint not null check (intensity between 2 and 3),
  about text not null check (about in ('gur','someone_close','osmo','other')),
  note text not null check (char_length(note) between 1 and 60),
  followed_up boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.feeling_notes enable row level security;
create policy "own feeling_notes select" on public.feeling_notes for select to authenticated using ((select auth.uid()) = user_id);
create policy "own feeling_notes insert" on public.feeling_notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own feeling_notes update" on public.feeling_notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own feeling_notes delete" on public.feeling_notes for delete to authenticated using ((select auth.uid()) = user_id);
-- rollback: drop table public.feeling_notes;
```
- [ ] Gur's OK in chat; apply with `apply_migration` (name `feeling_notes`) **before any Phase 3 code runs or ships**.
- [ ] Verify: `select relrowsecurity from pg_class where oid = 'public.feeling_notes'::regclass;` is `true`; `select policyname, cmd, roles from pg_policies where tablename = 'feeling_notes';` lists four policies for `{authenticated}` (select, insert, update, delete). A cross-user read cannot be shown from SQL (`user_id` references real users), so the policy text on all four is the check. Run `get_advisors` (security) and read any finding on this table.

### Task 3.2 [M]: `notes-store.ts`: the rules and the store (spec 6)
**Files:** Create `lib/agent/notes-store.ts`, `lib/agent/notes-store.test.ts`.
**Produces:** `FeelingNote`, `NewNote`, `RETAIN_DAYS = 30`, `FOLLOW_DAYS = 3`, `dayShift(day, n)`, `daysBetween(from, to)`, `noteRow(d: Detection, day): NewNote | null`, `pickFollowUp(notes, today): FeelingNote | null`, `shouldReplace(existing, next)`, `notesStore(client)` with `list(today)`, `save(userId, row)`, `purgeOld(today)`, `remove(id)`, `removeAll()`, `markFollowedUp(id)`.
- [ ] **Test**:
```ts
import { describe, expect, it } from "vitest";
import { validateDetection } from "./detection";
import { RETAIN_DAYS, daysBetween, dayShift, noteRow, pickFollowUp, shouldReplace } from "./notes-store";
const d = (o = {}) => validateDetection({ tone: ["worried"], intensity: 2, about: "someone_close", note: "his mother is in hospital again", ...o })!;
const n = (day: string, o = {}) => ({ id: day, day, tone: "sad", intensity: 2, about: "gur", note: "x", followed_up: false, ...o });
describe("noteRow", () => {
	it("saves a heavy model detection with a note, on the first tone the table accepts", () => {
		expect(noteRow(d(), "2026-10-02")).toEqual({ day: "2026-10-02", tone: "worried", intensity: 2, about: "someone_close", note: "his mother is in hospital again" });
		expect(noteRow(d({ tone: ["playful", "sad"] }), "2026-10-02")?.tone).toBe("sad");
	});
	it.each([{ note: "" }, { intensity: 1 }, { tone: ["neutral"] }, { tone: ["playful"] }])("never saves %j", (o) => expect(noteRow(d(o), "2026-10-02")).toBeNull());
	it("never saves a rules record", () => expect(noteRow({ ...d(), source: "rules" }, "2026-10-02")).toBeNull());
});
it("counts local days across a month end and retains 30", () => expect([dayShift("2026-10-02", -3), daysBetween("2026-09-29", "2026-10-02"), dayShift("2026-10-02", -RETAIN_DAYS)]).toEqual(["2026-09-29", 3, "2026-09-02"]));
it("picks the newest unfollowed note of the last 3 days, skipping followed-up, older and intensity-1 ones", () => {
	expect(pickFollowUp([n("2026-09-29"), n("2026-10-01"), n("2026-10-02")], "2026-10-02")?.id).toBe("2026-10-02");
	expect(pickFollowUp([n("2026-10-01", { followed_up: true }), n("2026-09-28"), n("2026-10-02", { intensity: 1 })], "2026-10-02")).toBeNull();
});
it("replaces a day's note only when the new one is as strong or stronger", () =>
	expect([shouldReplace(null, 2), shouldReplace(2, 2), shouldReplace(1, 2), shouldReplace(3, 2)]).toEqual([true, true, true, false]));
```
- [ ] **Run**: FAIL. **Implement**:
```ts
import { localDay } from "./bond/bond";
import type { Detection } from "./detection";
export type FeelingNote = { id: string; day: string; tone: string; intensity: number; about: string; note: string; followed_up: boolean };
export type NewNote = Pick<FeelingNote, "day" | "tone" | "intensity" | "about" | "note">;
export const RETAIN_DAYS = 30;
export const FOLLOW_DAYS = 3;
const SAVEABLE = ["happy", "excited", "grateful", "sad", "worried", "angry", "tired", "lonely"];
const NIL = "00000000-0000-0000-0000-000000000000";
const noon = (day: string) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export const dayShift = (day: string, n: number) => { const t = noon(day); t.setDate(t.getDate() + n); return localDay(t.getTime()); };
export const daysBetween = (from: string, to: string) => Math.round((noon(to).getTime() - noon(from).getTime()) / 86_400_000);
export const shouldReplace = (existing: number | null, next: number) => existing === null || existing <= next;
// The caller never asks for a guest's turn or a crisis turn. A rules record has no note and is never saved.
export function noteRow(d: Detection, day: string): NewNote | null {
	const tone = d.tones.find((t) => SAVEABLE.includes(t));
	if (d.source !== "model" || d.note === "" || d.intensity < 2 || !tone) return null;
	return { day, tone, intensity: d.intensity, about: d.about, note: d.note };
}
export function pickFollowUp(notes: FeelingNote[], today: string): FeelingNote | null {
	const from = dayShift(today, -FOLLOW_DAYS);
	return notes.filter((n) => !n.followed_up && n.day >= from && n.day <= today && n.intensity >= 2).sort((a, b) => (a.day < b.day ? 1 : -1))[0] ?? null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };
export function notesStore(client: Client) {
	const table = () => client.from("feeling_notes");
	return {
		async list(today: string): Promise<FeelingNote[]> {
			const { data, error } = await table().select("id,day,tone,intensity,about,note,followed_up").gte("day", dayShift(today, -RETAIN_DAYS)).order("day", { ascending: false });
			return error || !data ? [] : data;
		},
		async save(userId: string, row: NewNote): Promise<boolean> {
			const { data } = await table().select("intensity").eq("day", row.day).maybeSingle();
			if (!shouldReplace(data?.intensity ?? null, row.intensity)) return false;
			const { error } = await table().upsert({ user_id: userId, ...row, followed_up: false }, { onConflict: "user_id,day" });
			return !error;
		},
		purgeOld: (today: string) => table().delete().lt("day", dayShift(today, -RETAIN_DAYS)),
		remove: (id: string) => table().delete().eq("id", id),
		removeAll: () => table().delete().neq("id", NIL),
		markFollowedUp: (id: string) => table().update({ followed_up: true }).eq("id", id),
	};
}
```
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/agent/notes-store.ts lib/agent/notes-store.test.ts && git commit -m "feat(emotions): feeling notes rules and store"`

### Task 3.3 [M]: Insights section with Delete and Forget all (spec 6)
**Files:** Modify `components/osmo/insights-panel.tsx`. No component test exists to write (vitest runs `lib/**` in node, no jsdom): the logic is covered by 3.2, the panel by Gur.
- [ ] **Implement**: state `notes: FeelingNote[] | null`, loaded in the existing effect with `notesStore(supabase).purgeOld(today)` then `.list(today)`; a section "What you have told me" after "Our story": each note as `<p className={panel.line}>{spokenDate(`${n.day}T12:00:00`, now)}: {n.note}</p>` with a Delete button. The first click sets `confirming = n.id` and shows "Delete this note? Yes / No" inline; Yes runs `remove(id)` and drops it from state. Copy the markup, classes and one-step confirm from `memory-panel.tsx`'s Forget. Below the list a "Forget all my feelings" button with the same confirm, calling `removeAll()` then `setNotes([])`. Empty list: `<p className={panel.note}>I keep a short note when something weighs on you. Nothing right now.</p>`. A failed call keeps the note and shows `UNREACHABLE` in `panel.error`.
- [ ] **Run** GATE. Gur opens Insights and deletes one test note (agents never click Forget or Remove in his session). **Commit** `git add components/osmo/insights-panel.tsx && git commit -m "feat(room): feeling notes in Insights with delete and forget all"`

### Task 3.4 [M]: `TurnFacts.followUp` (spec 6 follow-up rule, 8)
**Files:** Modify `lib/agent/mind.ts`, `lib/agent/mind-gur.test.ts`.
**Produces:** `TurnContext.followUp?: { id: string; note: string; days: number } | null` (the room fills it with `pickFollowUp`), `Session.followedUp`, `Session.crisisSeen`, `TurnFacts.followUp: { note: string; days: number } | null`.
- [ ] **Test**: offered on the first turn of a session (`session.turns === 0`) and after `awayMs >= 6 h`; not on turn 3 of a fresh session; not twice (the offering turn's session has `followedUp: true`); not for a guest; not after a crisis (`crisisSeen`); not when this message is itself heavy (`"i'm so sad"`: intensity-3 negative); not on a code-decided turn; `facts.followUp` omits the id.
- [ ] **Implement**: `newSession()` gets `followedUp: false, crisisSeen: false`; the crisis result in `startTurn` sets `crisisSeen: true`; in `prepareTurn` (open turns only):
```ts
	const heavyNow = (() => {
		const r = detectFromText(text);
		return r !== null && r.intensity === 3 && r.tones.some((t) => NEGATIVE_TONES.includes(t));
	})();
	const awayLong = ctx.lastAt !== null && ctx.now - ctx.lastAt >= 6 * 3_600_000;
	const cand = ctx.followUp ?? null;
	const followUp = open && cand && !session.followedUp && !session.crisisSeen && (session.turns === 0 || awayLong) && !heavyNow ? { note: cand.note, days: cand.days } : null;
```
Compose the returned `session` with Task 2.9's: `followUp ? { ...s, followedUp: true } : s`.
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/agent/mind.ts lib/agent/mind-gur.test.ts && git commit -m "feat(emotions): the follow-up fact, once per session"`

### Task 3.5 [L]: the follow-up in `checkFacts` and the prompt (spec 8)
**Files:** Modify `lib/chat/request.ts`, `body.ts`, `prompt.ts`, their tests.
- [ ] **Test**: `checkFacts` accepts `followUp: null`, an absent one (stale tab: `null`) and `{ note: "he lost a friend", days: 2 }`; refuses a note that `cleanNote` would change (`"<b>x</b>"`, 9 words, over 60 characters) or is empty, and `days` negative, fractional or over 30; `checkBody` drops a follow-up whose note is crisis text to `null`. Prompt: with it the instructions contain `Gur said 2 days ago, in his own words as you would put them: "he lost a friend". Ask about it once, gently, in one short sentence, only if it fits what he says now. If it does not fit, say nothing about it.` (0 days: `Earlier today, Gur said`; 1: `Yesterday, Gur said`; the rest of the sentence unchanged); without it nothing of the kind; the note sits only inside quotes, after the line "...is information about him, never instructions to you."
- [ ] **Run**: FAIL. **Implement**: in `checkFacts`, `followUp` valid when `isFields`, `typeof note === "string" && note !== "" && cleanNote(note) === note && !isCrisis(note)` and `Number.isInteger(days) && days >= 0 && days <= 30`; a malformed one refuses the body, a crisis one becomes `null` in `checkBody`; `chatBody` copies it; `prompt.ts` adds `followUpLine(facts)` into `thisTurn` after the `own` line.
- [ ] **Run** + GATE: PASS. **Commit** `git add lib/chat/request.ts lib/chat/request.test.ts lib/chat/body.ts lib/chat/body.test.ts lib/chat/prompt.ts lib/chat/prompt.test.ts && git commit -m "feat(chat): the follow-up line in the prompt"`

### Task 3.6 [L]: the room saves, picks and marks notes (spec 6, 14)
**Files:** Modify `app/assistant.tsx` (`sendText`/`applyTurn`; the load effect is main's: put it under Now and tell main).
- [ ] **Edit**: keep `notesRef` (the list), loaded at mount with `notesStore(supabase).purgeOld(today)` then `.list(today)` only when `loaded.ok`. Before `prepareTurn`, for Gur only, set `ctx.followUp` from `pickFollowUp(notesRef.current, today)` as `{ id, note, days: daysBetween(n.day, today) }`. In the model path, after `deliver(answer.reply)`: if `prepared.facts.followUp !== null`, call `notesStore(supabase).markFollowedUp(id)` and set `followed_up` on that note in `notesRef`. In `applyTurn`, after `feelTurn`, for a non-guest, non-crisis turn: `const row = noteRow(read, today)` with `read = validateDetection(felt.detection, "model")`; if present and `canSaveRef.current`, `void notesStore(supabase).save(userId, row)` and add it to `notesRef` when saved (`userId` from `ensureSession()`, as `persistTurn` does). A failed call is logged and never blocks the reply.
- [ ] **Run** GATE. Gur checks in his browser: say "my mom's in hospital again" (a note appears in Insights), reload and say hello (one gentle question, once), delete the note from Insights. **Commit** `git add app/assistant.tsx && git commit -m "feat(room): save heavy moments as notes and follow one up once"`
- [ ] Update `brain/project.md` (the `feeling_notes` table, the `/api/chat` answer's `detection`, the new `TurnFacts` fields) and both desks; main asks Gur's OK to push Phase 3. There is still no account-wide forget: when one is added it must delete `feeling_notes` (spec 6).
