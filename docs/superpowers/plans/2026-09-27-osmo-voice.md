# Osmo Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Osmo speaks his replies, wakes when he hears "Osmo", and tells Gur's voice from anyone else's. To a guest he is polite, private and learns nothing.

**Architecture:**
- **Pure, tested logic in `lib/voice/`:**
  - the conversation state machine;
  - the voiceprint math;
  - the audio features;
  - the wake-word streaming;
  - an engine that wires them together behind injected `VoiceDeps`.
- **Browser implementations in `lib/voice/web/`,** one job each. A future laptop or phone app replaces only these.
- **The room** (`app/assistant.tsx`) gets a thin hook, `components/osmo/use-voice.ts`, plus a Settings "Voice" section.
- **One ONNX runtime** (`onnxruntime-web`) runs both the wake-word detector and the speaker model on the device.
- **Guests:** a flag in the brain (`processTurn`), plus the language session's guest path in the chain.

**Tech Stack:**
- Next.js 16.3.6 (App Router), React 19, TypeScript, CSS modules.
- Supabase (`@supabase/supabase-js` 2.117.1).
- Vitest: node environment, `lib/**/*.test.ts` only, plus a separate voice-check config.
- `onnxruntime-web` 1.30.0.
- Models: openWakeWord v0.5.1 (melspectrogram + embedding), 3D-Speaker CAM++ English (speaker embeddings).
- Web Speech API: `speechSynthesis`, `SpeechRecognition`.

**Spec:** `docs/superpowers/specs/2026-09-27-osmo-voice-design.md`

## Global Constraints

**Git**
- The repo is on branch `main` (private GitHub `mistif/osmo`).
- Stage by exact path. Never `git add -A` or `git add .`; the language session commits its own files in the same tree.
- **Never push.** Pushing is Gur's call, and a push is a Vercel deploy.

**Commits**
- Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**File ownership**
- Never edit `lib/agent/talk.ts`, `context.ts`, `safety.ts`, `lib/facts.ts`, `lib/agent/lexicon/*`, `lib/agent/dictionary*.ts`, `lib/agent/vocabulary-store.ts`, `lib/agent/chatlog.test.ts`, `lib/agent/voice.test.ts`, or `sendText`/`sendMessage` and their helpers in `app/assistant.tsx`.
- In `app/assistant.tsx` and `lib/agent/mind.ts`, only the edits named in this plan's tasks are allowed.
- The language session ("Supabase database for conversations") makes the language-chain edits itself: `sendText`, `sendTextRef`, `onReplyRef`, the guest path, and `ChatMessage.speaker`. Implementers never make them.

**Database**
- Subagents never touch the live Supabase database. The controller applies migrations with the Supabase tools.
- The `messages.speaker` migration must be live before any push that contains code selecting `speaker`.

**The builder in the browser pane**
- The pane may hold Gur's real session.
- The builder never:
  - signs in or out;
  - sends Osmo a message;
  - clicks Lock, Remove, Forget, Remember, "Teach Osmo my voice", "Forget my voice" or the mic button;
  - edits memory.
- It may flip "Speak typed replies too" to check the switch, and must flip it back.

**Privacy**
- Audio is never stored or uploaded. Only voiceprint numbers go to Supabase.
- The microphone is never open without the listening line under the text box.
- Voice never unlocks Osmo and never stands in for the passkey.

**Runtime**
- `onnxruntime-web` pinned to exactly `1.30.0`.
- In the browser it's loaded only from `/ort/ort.wasm.min.mjs` via `import(/* webpackIgnore: true */ url)`, with `ort.env.wasm.wasmPaths = "/ort/"` and `ort.env.wasm.numThreads = 1`.
- No other speech or ML runtime is added.

**Models, all served from `public/models/`**
- `speaker/campplus-en.onnx`: sherpa-onnx `3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx`.
  - Input `x` is `[1, frames, 80]`; output `embedding` is `[1, 512]`.
  - Samples on the -1..1 scale, global-mean normalized fbank.
- `wake/melspectrogram.onnx` and `wake/embedding_model.onnx`: openWakeWord v0.5.1.
- `wake/osmo.onnx` arrives later from Gur.

**Imports**
- `lib/voice/*.ts` (not `web/`) use relative imports and no browser globals, because Vitest has no `@/` alias.
- `lib/voice/web/*` may import `@/lib/supabase`.

**Copy rules**
- Sentence case. Osmo speaks in the first person in Settings.
- No all-caps labels, no eyebrow labels, no "→" on buttons.
- Exact strings:
  - `Listening for "Osmo"`
  - `Listening…`
  - `I can't hear you. Allow the microphone for this site in your browser settings, then try again.`
  - `I can't find a microphone on this device.`
  - `Listening needs Chrome, Edge or Safari. I can still speak.`
  - `I couldn't load what I need to listen. Check your connection and try again.`
  - `That was too quiet to learn from. Try again somewhere quieter.`
  - `That one didn't sound like the others. Please read it again.`
  - `Couldn't save your voice. Try again.`
  - `Couldn't save that. Try again.`
  - `Listening stopped. Tap the mic to start again.`
  - `His wake word isn't trained yet.`
  - `Hello. I don't believe we've met.`
  - `I'm afraid only the person I belong to can change me.`
  - `That's between me and the person I belong to.`
  - `I keep my dilemmas for the person I belong to.`
  - `Someone else`
  - `Checking my voice…`
  - `I speak with {name} on this device.`
  - `This device has no English voice, so I'll only write.`
  - `I know your voice now.`
  - `I'll stop recognizing you on every device until you teach me again.`

**Visual tokens**
- Reuse the room's variables: `--bone`, `--ink`, `--aura-a`, `--aura-b`, `--base`, `--voice`.
- Errors in `#f2b8a2`.
- Bricolage Grotesque only.
- Focus outlines `2px solid var(--aura-a)`.
- `prefers-reduced-motion: reduce` removes the listening animation.

**Tests**
- After every task, `npx vitest run` and `npx tsc --noEmit -p .` pass, and `npm run lint` reports 0 errors (warnings allowed).
- From Task 8 on, `npm run voice:check` passes once the clips exist.

## Review Focus

- **A false wake-up with nothing said after it** (TV, a cough): he goes back to sleep silently within 4 s and sends nothing. Pinned by the machine's no-speech test (Task 6) and the engine's "wake then nothing" test (Task 7).
- **His own speech saying "Osmo" while he talks:** it never wakes him. Pinned by "wake is ignored while speaking" (Task 6) and the engine test "a wake while speaking is ignored" (Task 7).
- **Follow-ups from someone else:** a short follow-up after Gur was recognized stays Gur's, but a full sentence is judged again. Pinned by the `judge` tests (Task 3) and the engine carry-over test (Task 7).
- **Voiceprints from another model, or none at all:** they're never compared, and listening refuses to start without a taught voice. Pinned by the `bestScore` tests (Task 3) and the engine tests "listening needs a taught voice" and "forgetting the voice turns listening off" (Task 7).
- **A guest's "yes" or "yes, roll" while Gur's dilemma or re-roll offer is pending:** it neither answers nor consumes it. Pinned by the mind guest tests (Task 1).

## Decisions made while planning (controller rulings)

1. **Speaker model: 3D-Speaker CAM++ English.** In the planning check with Windows' David, Mark and Zira voices:
   - same voice (4-reading average vs a 5th reading): 0.92–0.93;
   - different voices: ≤ 0.38;
   - about 0.25 s per judgement in node;
   - wespeaker ResNet34 separated worse (up to 0.52) and ran at about 0.9 s.

   Task 8 commits that check as `npm run voice:check`. `MATCH_THRESHOLD = 0.5` and `READING_AGREEMENT = 0.5` start there and can be tuned after Gur's hand checks.
2. **Wake-word pipeline:** verified in planning with openWakeWord's `hey_jarvis` model on Windows TTS clips ("Hey Jarvis" 0.998, "Hey Travis" 0.31, an unrelated sentence 0.001). 1760 samples in gives 8 mel frames, as openWakeWord streams. `WAKE.threshold = 0.7` over 2 consecutive frames is the strict start.
3. **"Tapping the circle stops him":** the circle sits behind the conversation (`pointer-events: none`, `z-index: -1`), so the mic button becomes **Stop** while he speaks. Same intent, and keyboard-accessible.
4. **The listening line:** `Listening for "Osmo"` while waiting for the wake word, `Listening…` while hearing a message. Both mean the microphone is on.
5. **The microphone closes while he thinks and speaks,** so he physically can't hear himself. It reopens for the follow-up window, and follow-up audio is judged from that reopened stream.
6. **Added strings:** `I can't find a microphone on this device.` (no mic at all, not blocked) and `That one didn't sound like the others. Please read it again.` (the outlier re-read the spec requires).
7. **The guest greeting:** the voice hook decides "first in this conversation" and passes `greet` in `sendText`'s options; the language chain prefixes it with `greetGuest`.
8. **`dropped` also ends a follow-up window** when the recognizer gives up with nothing said.
9. **Division of work:** the language session makes the chain edits, as agreed. This plan's tasks consume their names: `sendTextRef`, `onReplyRef`, `ChatMessage.speaker`. The controller verifies those names on `main` before Task 10.

---

### Task 1: Guest rules and the brain's guest flag

**Files:**
- Create: `lib/voice/guest.ts`
- Test: `lib/voice/guest.test.ts`
- Modify: `lib/agent/mind.ts` (guest flag; the edits listed in Step 5 only)
- Test: `lib/agent/mind-guest.test.ts`
- Database (controller, not the implementer): migration `add_messages_speaker`

**Interfaces:**
- Consumes:
  - `MemoryFact` from `lib/facts.ts` (type only);
  - `processTurn`, `newSession` from `lib/agent/mind.ts`;
  - `emptyBond` from `lib/agent/bond/bond.ts`;
  - `DILEMMAS` from `lib/agent/dilemmas.ts`.
- Produces:
  - `type Speaker = "you" | "guest"`
  - `type Via = "typed" | "voice"`
  - `type SendOptions = { via: Via; speaker: Speaker; greet?: boolean }`
  - `GUEST_MEMORY: MemoryFact[]`
  - `GUEST_GREETING`, `GUEST_NO_CHANGES`, `GUEST_PRIVATE`, `GUEST_DILEMMA` (strings)
  - `ownerHistory<T extends { speaker?: "guest" }>(messages: T[]): T[]`
  - `greetGuest(reply: string, greet: boolean, crisis: boolean): string`
  - `TurnContext.guest?: boolean` in `lib/agent/mind.ts`

- [ ] **Step 1: Write the failing tests for the guest rules**

`lib/voice/guest.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { GUEST_GREETING, GUEST_MEMORY, greetGuest, ownerHistory } from "./guest";

describe("ownerHistory", () => {
	it("drops guests' lines and Osmo's replies to them, keeping the order", () => {
		const log = [
			{ role: "user", text: "hi" },
			{ role: "user", text: "I'm Sam", speaker: "guest" as const },
			{ role: "agent", text: "Hello.", speaker: "guest" as const },
			{ role: "agent", text: "Hello, Gur." },
		];
		expect(ownerHistory(log).map((m) => m.text)).toEqual(["hi", "Hello, Gur."]);
	});

	it("keeps everything when no guest has spoken", () => {
		const log = [{ text: "a" }, { text: "b" }];
		expect(ownerHistory(log)).toEqual(log);
	});

	it("returns an empty list for an empty log", () => {
		expect(ownerHistory([])).toEqual([]);
	});
});

describe("greetGuest", () => {
	it("opens a guest's first reply with the greeting", () => {
		expect(greetGuest("I'm well.", true, false)).toBe(`${GUEST_GREETING} I'm well.`);
	});

	it("leaves later replies alone", () => {
		expect(greetGuest("I'm well.", false, false)).toBe("I'm well.");
	});

	it("never greets over a crisis reply", () => {
		expect(greetGuest("Please call 988.", true, true)).toBe("Please call 988.");
	});
});

describe("GUEST_MEMORY", () => {
	it("is empty", () => {
		expect(GUEST_MEMORY).toEqual([]);
	});
});
```

- [ ] **Step 2: Write the failing tests for the brain's guest flag**

`lib/agent/mind-guest.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { defaultState } from "./state";
import { newSession, processTurn } from "./mind";
import { emptyBond } from "./bond/bond";
import { DILEMMAS } from "./dilemmas";
import { GUEST_DILEMMA, GUEST_NO_CHANGES, GUEST_PRIVATE } from "../voice/guest";

type Ctx = { now: number; lastAt: number | null; guest: boolean; userName: string | null };
const ctx = (o: Partial<Ctx> = {}) => ({ now: 1_000_000, lastAt: null, uuid: () => "id-1", guest: true, ...o });
const knownBond = { ...emptyBond(), metAt: "2026-09-01T10:00:00.000Z", messages: 40, days: 9, lastDay: "2026-09-20", nameKnown: true };
const withBond = () => ({ ...defaultState(), bond: knownBond });

describe("processTurn for someone who isn't Gur", () => {
	it("keeps the bond private", () => {
		expect(processTurn(withBond(), newSession(), "how close are we", ctx()).reply).toBe(GUEST_PRIVATE);
		expect(processTurn(withBond(), newSession(), "when did we meet", ctx()).reply).toBe(GUEST_PRIVATE);
	});

	it("can't re-roll him, even straight after Gur was offered one", () => {
		const offer = processTurn(defaultState(), newSession(), "roll a new osmo", ctx());
		expect(offer.reply).toBe(GUEST_NO_CHANGES);
		expect(offer.session.awaitingReroll).toBeNull();
		const waiting = { ...newSession(), awaitingReroll: { seed: 5 } };
		expect(processTurn(defaultState(), waiting, "yes, roll", ctx()).reply).toBe(GUEST_NO_CHANGES);
		expect(processTurn(defaultState(), waiting, "yes", ctx()).reply ?? "").not.toMatch(/yes, roll/);
	});

	it("doesn't answer Gur's pending dilemma with a yes", () => {
		const pending = { logId: "l", dilemmaId: DILEMMAS[0].id, decision: { chosen: 0 } } as never;
		const r = processTurn(defaultState(), { ...newSession(), pending }, "yes", ctx());
		expect(r.effects).toEqual([]);
		expect(r.state.weights).toEqual(defaultState().weights);
	});

	it("keeps dilemmas for Gur", () => {
		const r = processTurn(defaultState(), newSession(), "give me a dilemma", ctx());
		expect(r.reply).toBe(GUEST_DILEMMA);
		expect(r.effects).toEqual([]);
	});

	it("leaves the bond exactly as it was", () => {
		const r = processTurn(withBond(), newSession(), "i feel really happy today", ctx());
		expect(r.state.bond).toEqual(knownBond);
	});

	it("hears news without promising to remember it, and records nothing", () => {
		const r = processTurn(defaultState(), newSession(), "my dog died today", ctx());
		expect(r.reply ?? "").not.toMatch(/remember/i);
		expect(r.effects).toEqual([]);
	});

	it("still answers talk of suicide with care", () => {
		expect(processTurn(defaultState(), newSession(), "i want to kill myself", ctx()).reply).toMatch(/988/);
	});

	it("gets no welcome back and never hears Gur's name", () => {
		const r = processTurn(withBond(), newSession(), "hello", ctx({ lastAt: 0, now: 3 * 86_400_000, userName: null }));
		expect(r.reply ?? "").not.toMatch(/welcome back|good to see you again|good to have you back|there you are/i);
		expect(r.reply ?? "").not.toMatch(/gur/i);
	});

	it("changes nothing for Gur himself", () => {
		expect(processTurn(withBond(), newSession(), "how close are we", ctx({ guest: false })).reply).not.toBe(GUEST_PRIVATE);
	});
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/voice/guest.test.ts lib/agent/mind-guest.test.ts`
Expected: FAIL with "Failed to resolve import './guest'" / "../voice/guest".

- [ ] **Step 4: Write `lib/voice/guest.ts`**

```ts
// How Osmo treats a voice that isn't Gur's: polite, private, and learning nothing from it.
// Pure, so the room (app/assistant.tsx) and the brain (lib/agent/mind.ts) share one set of rules.

import type { MemoryFact } from "../facts";

// Who said a message: Gur ("you") or anyone else ("guest"). Typed messages are always Gur's.
export type Speaker = "you" | "guest";
// How a message arrived.
export type Via = "typed" | "voice";
// What the voice passes to the room's sendText. `greet` is true on a guest's first line in a conversation.
export type SendOptions = { via: Via; speaker: Speaker; greet?: boolean };

// A guest's turn sees no memory. Never mutated.
export const GUEST_MEMORY: MemoryFact[] = [];

export const GUEST_GREETING = "Hello. I don't believe we've met.";
export const GUEST_NO_CHANGES = "I'm afraid only the person I belong to can change me.";
export const GUEST_PRIVATE = "That's between me and the person I belong to.";
export const GUEST_DILEMMA = "I keep my dilemmas for the person I belong to.";

// Gur's own conversation: everything except guests' lines and Osmo's replies to them.
export function ownerHistory<T extends { speaker?: "guest" }>(messages: T[]): T[] {
	return messages.filter((message) => message.speaker !== "guest");
}

// The greeting opens a guest's first reply in a conversation, but never a crisis reply.
export function greetGuest(reply: string, greet: boolean, crisis: boolean): string {
	return greet && !crisis ? `${GUEST_GREETING} ${reply}` : reply;
}
```

- [ ] **Step 5: Add the guest flag to `lib/agent/mind.ts`**

Make exactly these edits:

(a) After the existing `import { causeOf, combineReplies, normalize, respond, understand } from "./talk";` line, add:
```ts
import { GUEST_DILEMMA, GUEST_NO_CHANGES, GUEST_PRIVATE } from "../voice/guest";
```

(b) In `TurnContext`, after the `vocabulary?: Record<string, number>;` member, add:
```ts
	// A voice that isn't Gur's: nothing of his is shared and the bond is left alone. The room discards the result's state.
	guest?: boolean;
```

(c) After the `acknowledge` function, add:
```ts
// A guest's news is acknowledged, but Osmo doesn't promise to remember it.
function acknowledgeGuest(event: StoryEvent): string {
	return event.valence === "happy" ? "That is wonderful news. I am glad for you." : "I am so sorry. That is a heavy thing to carry.";
}
```

(d) Rename `export function processTurn(` to `function takeTurn(`. Keep its parameters and body. Directly after the whole function, add:
```ts
export function processTurn(state: AgentState, session: Session, text: string, ctx: TurnContext): TurnResult {
	const result = takeTurn(state, session, text, ctx);
	// A guest's turn records nothing: no events, dilemmas or verdicts.
	return ctx.guest ? { ...result, effects: [] } : result;
}
```

(e) Replace:
```ts
	// Bond: every non-crisis message counts. Sharing a feeling, a life event, or a name deepens it.
	const hypothetical = WHAT_WOULD_YOU_DO.test(trimmed);
	const told = hypothetical ? [] : classifyUserEvents(trimmed);
	const feeling = understand(trimmed, ctx.slang).some((part) => part.intent.type === "userFeeling");
	s = {
		...s,
		bond: recordTurn(s.bond, { now: ctx.now, feeling, event: told.length > 0, nameKnown: !!ctx.userName, demo: DEMO }),
	};
```
with:
```ts
	// Bond: every non-crisis message from Gur counts. Sharing a feeling, a life event, or a name deepens it.
	// A guest's never does.
	const guest = ctx.guest === true;
	const hypothetical = WHAT_WOULD_YOU_DO.test(trimmed);
	const told = hypothetical ? [] : classifyUserEvents(trimmed);
	const feeling = understand(trimmed, ctx.slang).some((part) => part.intent.type === "userFeeling");
	if (!guest) {
		s = {
			...s,
			bond: recordTurn(s.bond, { now: ctx.now, feeling, event: told.length > 0, nameKnown: !!ctx.userName, demo: DEMO }),
		};
	}
```

(f) Replace:
```ts
	const target = session.pending ?? (verdict?.explicit ? session.last : null);
```
with:
```ts
	// Only Gur answers his own dilemmas.
	const target = guest ? null : (session.pending ?? (verdict?.explicit ? session.last : null));
```

(g) Directly before the comment `// Re-rolling the personality needs an explicit "yes, roll" straight after the offer.`, add:
```ts
	// Guests can't change him, and the bond is private.
	if (guest && (isConfirmRoll(trimmed) || parseReroll(trimmed))) {
		return { state: s, session: sess, reply: GUEST_NO_CHANGES, effects };
	}
	if (guest && (isAskCloseness(trimmed) || isAskMet(trimmed))) {
		return { state: s, session: sess, reply: GUEST_PRIVATE, effects };
	}
```

(h) Replace:
```ts
	if (session.awaitingReroll && /^(?:yes|yeah|yep|yup|ya|sure|ok|okay|do it|go for it)\W*$/i.test(trimmed)) {
```
with:
```ts
	if (!guest && session.awaitingReroll && /^(?:yes|yeah|yep|yup|ya|sure|ok|okay|do it|go for it)\W*$/i.test(trimmed)) {
```

(i) Directly after the line `if (told.length > 0) {`, add:
```ts
		if (guest) return { state: s, session: sess, reply: told.map(acknowledgeGuest).join(" "), effects };
```

(j) Directly after the line `if (asked || DILEMMA_TRIGGER.test(trimmed)) {`, add:
```ts
		if (guest) return { state: s, session: sess, reply: GUEST_DILEMMA, effects };
```

(k) In the `flavorTurn(...)` options object, replace these three members:
```ts
			bond: s.bond,
			userName: ctx.userName ?? null,
			awayMs,
```
with:
```ts
			// A guest is a stranger: no milestones, shared memories or welcome-backs.
			bond: guest ? undefined : s.bond,
			userName: guest ? null : (ctx.userName ?? null),
			awayMs: guest ? 0 : awayMs,
```

(l) Replace:
```ts
		return {
			state: { ...s, bond },
```
with:
```ts
		return {
			state: guest ? s : { ...s, bond },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/voice/guest.test.ts lib/agent/mind-guest.test.ts lib/agent/mind.test.ts`
Expected: PASS (the existing mind tests are unchanged).

- [ ] **Step 7: Run the full suite and type check**

Run: `npx vitest run` and `npx tsc --noEmit -p .`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/voice/guest.ts lib/voice/guest.test.ts lib/agent/mind.ts lib/agent/mind-guest.test.ts
git commit -m "feat: guest rules, and a brain that keeps Gur's things private from guests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9 (controller): Apply the migration, then tell the language session**

Apply migration `add_messages_speaker`:
```sql
alter table public.messages add column speaker text check (speaker in ('guest'));
```
Then message "Supabase database for conversations":
- `lib/voice/guest.ts` is on main (give the commit), and the `messages.speaker` column is live.
- Its exports are listed in Interfaces above, including `SendOptions = { via; speaker; greet? }`.
- `greet` comes from the voice.
- Ask it to make its agreed chain commit and send the diff for review before committing.

---

### Task 2: Voice text helpers (voices, messages, settings, device names)

**Files:**
- Create: `lib/voice/voices.ts`, `lib/voice/utterance.ts`, `lib/voice/settings.ts`, `lib/voice/device.ts`
- Test: `lib/voice/voices.test.ts`, `lib/voice/utterance.test.ts`, `lib/voice/settings.test.ts`, `lib/voice/device.test.ts`

**Interfaces:**
- Produces:
  - `type VoiceInfo = { name: string; lang: string; localService: boolean }`
  - `VOICE_SETTINGS = { rate: 1, pitch: 0.95 }`
  - `SPEECH_CHAR_MS: number`
  - `isMaleVoice(name: string): boolean`
  - `pickVoice<T extends VoiceInfo>(voices: readonly T[]): T | null`
  - `wordEnd(text: string, start: number): number`
  - `displayVoiceName(name: string): string`
  - `messageFrom(transcript: string): string`
  - `SILENCE_MS = 1000`
  - `heardEnough(lastChangeAt: number | null, now: number): boolean`
  - `type VoiceSettings = { listen: boolean; speakTyped: boolean }`
  - `DEFAULT_VOICE_SETTINGS`
  - `parseVoiceSettings(raw: string | null): VoiceSettings`
  - `deviceLabel(userAgent: string): string`

- [ ] **Step 1: Write the failing tests**

`lib/voice/voices.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { displayVoiceName, isMaleVoice, pickVoice, wordEnd } from "./voices";

const v = (name: string, lang: string, localService = true) => ({ name, lang, localService });

describe("pickVoice", () => {
	it("prefers an on-device British male voice", () => {
		const list = [v("Samantha", "en-US"), v("Google UK English Male", "en-GB", false), v("Daniel", "en-GB"), v("Microsoft David", "en-US")];
		expect(pickVoice(list)?.name).toBe("Daniel");
	});

	it("takes any on-device British voice before an American man", () => {
		const list = [v("Microsoft David - English (United States)", "en-US"), v("Microsoft Hazel - English (United Kingdom)", "en-GB")];
		expect(pickVoice(list)?.name).toBe("Microsoft Hazel - English (United Kingdom)");
	});

	it("takes an on-device American man next", () => {
		const list = [v("Microsoft Zira", "en-US"), v("Microsoft David", "en-US"), v("Google UK English Male", "en-GB", false)];
		expect(pickVoice(list)?.name).toBe("Microsoft David");
	});

	it("falls back to any on-device English voice", () => {
		expect(pickVoice([v("Google UK English Male", "en-GB", false), v("Microsoft Zira", "en-US")])?.name).toBe("Microsoft Zira");
	});

	it("uses a network voice only when nothing on the device speaks English", () => {
		expect(pickVoice([v("Microsoft Bengt", "sv-SE"), v("Google UK English Male", "en-GB", false)])?.name).toBe("Google UK English Male");
	});

	it("reads Android's underscore language tags", () => {
		expect(pickVoice([v("en-us-x-sfg", "en_US"), v("en-gb-x-rjs", "en_GB")])?.name).toBe("en-gb-x-rjs");
	});

	it("returns null without an English voice", () => {
		expect(pickVoice([v("Microsoft Bengt", "sv-SE")])).toBeNull();
		expect(pickVoice([])).toBeNull();
	});
});

describe("isMaleVoice", () => {
	it.each([
		["Google UK English Male", true],
		["Google UK English Female", false],
		["Microsoft George - English (United Kingdom)", true],
		["Daniel", true],
		["Samantha", false],
		["Markus", false],
	])("%s → %s", (name, male) => expect(isMaleVoice(name)).toBe(male));
});

describe("wordEnd", () => {
	it("finds where the word starting at a position ends", () => {
		expect(wordEnd("Good evening, sir.", 5)).toBe(13);
		expect(wordEnd("Hi", 0)).toBe(2);
	});

	it("moves on by one at the end of the text", () => {
		expect(wordEnd("Hi", 2)).toBe(3);
	});
});

describe("displayVoiceName", () => {
	it.each([
		["Microsoft George - English (United Kingdom)", "Microsoft George"],
		["Microsoft Ryan Online (Natural) - English (United Kingdom)", "Microsoft Ryan Online"],
		["Daniel", "Daniel"],
		["Google UK English Male", "Google UK English Male"],
	])("%s → %s", (name, shown) => expect(displayVoiceName(name)).toBe(shown));
});
```

`lib/voice/utterance.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { heardEnough, messageFrom, SILENCE_MS } from "./utterance";

describe("messageFrom", () => {
	it.each([
		["Osmo, what's the time?", "what's the time?"],
		["ozmo tell me a story", "tell me a story"],
		["Oz mo, how are you", "how are you"],
		["hey Osmo what's up", "what's up"],
		["Osmo", ""],
		["Osmo.", ""],
		["  osmo!  ", ""],
		["what's the time", "what's the time"],
		["I like Osmo", "I like Osmo"],
		["osmosis is a process", "osmosis is a process"],
	])("%j → %j", (heard, message) => expect(messageFrom(heard)).toBe(message));
});

describe("heardEnough", () => {
	it("waits until the words have stopped changing for a second", () => {
		expect(heardEnough(null, 5000)).toBe(false);
		expect(heardEnough(1000, 1000 + SILENCE_MS - 1)).toBe(false);
		expect(heardEnough(1000, 1000 + SILENCE_MS)).toBe(true);
	});
});
```

`lib/voice/settings.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_SETTINGS, parseVoiceSettings } from "./settings";

describe("parseVoiceSettings", () => {
	it("reads saved settings", () => {
		expect(parseVoiceSettings('{"listen":true,"speakTyped":true}')).toEqual({ listen: true, speakTyped: true });
		expect(parseVoiceSettings('{"listen":true}')).toEqual({ listen: true, speakTyped: false });
	});

	it("treats anything unreadable or not exactly true as off", () => {
		for (const raw of [null, "", "garbage", "null", "[1]", '{"listen":"yes"}']) {
			expect(parseVoiceSettings(raw)).toEqual(DEFAULT_VOICE_SETTINGS);
		}
	});
});
```

`lib/voice/device.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { deviceLabel } from "./device";

describe("deviceLabel", () => {
	it.each([
		["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", "Windows · Chrome"],
		["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0", "Windows · Edge"],
		["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "iPhone · Safari"],
		["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1", "iPhone · Chrome"],
		["Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:130.0) Gecko/20100101 Firefox/130.0", "Mac · Firefox"],
		["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36", "Android · Chrome"],
		["", "Unknown device · Browser"],
	])("%s", (agent, label) => expect(deviceLabel(agent)).toBe(label));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/voice/voices.test.ts lib/voice/utterance.test.ts lib/voice/settings.test.ts lib/voice/device.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write the four modules**

`lib/voice/voices.ts`:
```ts
// Which built-in voice Osmo speaks with, and how fast his words go by.
// Calm, British and male where the device has one; on-device voices first, so his replies aren't sent to a speech service.

export type VoiceInfo = { name: string; lang: string; localService: boolean };

// A steady voice: normal speed, a touch lower than the default pitch.
export const VOICE_SETTINGS = { rate: 1, pitch: 0.95 } as const;

// When a device reports no word timing, his text types out at roughly the speed he speaks (14 characters a second).
export const SPEECH_CHAR_MS = Math.round(1000 / 14);

const MALE_NAMES = [
	"daniel", "george", "arthur", "oliver", "ryan", "thomas", "alfie",
	"david", "mark", "guy", "james", "alex", "fred", "aaron", "tom",
	"eric", "roger", "christopher", "andrew", "brian", "steffan", "gordon",
];

const langTag = (lang: string) => lang.replace("_", "-").toLowerCase();
const english = (v: VoiceInfo) => langTag(v.lang).startsWith("en");
const british = (v: VoiceInfo) => langTag(v.lang) === "en-gb";
const american = (v: VoiceInfo) => langTag(v.lang) === "en-us";

export function isMaleVoice(name: string): boolean {
	const n = name.toLowerCase();
	if (/\bfemale\b/.test(n)) return false;
	if (/\bmale\b/.test(n)) return true;
	return MALE_NAMES.some((m) => new RegExp(`\\b${m}\\b`).test(n));
}

// The spec's order: on-device British man, on-device British, on-device American man, on-device English, any English.
const TIERS: ((v: VoiceInfo) => boolean)[] = [
	(v) => v.localService && british(v) && isMaleVoice(v.name),
	(v) => v.localService && british(v),
	(v) => v.localService && american(v) && isMaleVoice(v.name),
	(v) => v.localService && english(v),
	(v) => english(v),
];

export function pickVoice<T extends VoiceInfo>(voices: readonly T[]): T | null {
	for (const fits of TIERS) {
		const voice = voices.find(fits);
		if (voice) return voice;
	}
	return null;
}

// Where the word starting at `start` ends, for devices that report a word's start but not its length.
export function wordEnd(text: string, start: number): number {
	const match = /^\S+/.exec(text.slice(start));
	return start + (match ? match[0].length : 1);
}

// "Microsoft George - English (United Kingdom)" reads as "Microsoft George" in Settings.
export function displayVoiceName(name: string): string {
	return name.replace(/\s*-\s*English\b.*$/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}
```

`lib/voice/utterance.ts`:
```ts
// Pulling Gur's message out of what the recognizer heard, and deciding when he has finished.

// The wake word as a recognizer may spell it, at the very start only ("I like Osmo" is left alone).
const WAKE_PREFIX = /^\s*(?:hey\s+)?(?:osmo|ozmo|osmoe|asmo|oz\s?mo|os\s?mo)(?![\p{L}\p{N}])[\s,.!?:;-]*/iu;

export function messageFrom(transcript: string): string {
	return transcript.replace(WAKE_PREFIX, "").trim();
}

// Some recognizers keep listening after Gur stops; a second with no new words ends the message.
export const SILENCE_MS = 1000;

export function heardEnough(lastChangeAt: number | null, now: number): boolean {
	return lastChangeAt !== null && now - lastChangeAt >= SILENCE_MS;
}
```

`lib/voice/settings.ts`:
```ts
// The per-device voice settings as saved in localStorage. Anything unreadable falls back to off.

export type VoiceSettings = { listen: boolean; speakTyped: boolean };

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { listen: false, speakTyped: false };

export function parseVoiceSettings(raw: string | null): VoiceSettings {
	if (!raw) return DEFAULT_VOICE_SETTINGS;
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_VOICE_SETTINGS;
		const saved = value as Record<string, unknown>;
		return { listen: saved.listen === true, speakTyped: saved.speakTyped === true };
	} catch {
		return DEFAULT_VOICE_SETTINGS;
	}
}
```

`lib/voice/device.ts`:
```ts
// A readable name for the device that taught a voiceprint, from the browser's user agent: "Windows · Chrome".

export function deviceLabel(userAgent: string): string {
	const system = /iPhone/.test(userAgent)
		? "iPhone"
		: /iPad/.test(userAgent)
			? "iPad"
			: /Android/.test(userAgent)
				? "Android"
				: /Windows/.test(userAgent)
					? "Windows"
					: /Macintosh|Mac OS X/.test(userAgent)
						? "Mac"
						: /Linux/.test(userAgent)
							? "Linux"
							: "Unknown device";
	const browser = /Edg\//.test(userAgent)
		? "Edge"
		: /OPR\//.test(userAgent)
			? "Opera"
			: /Firefox\//.test(userAgent)
				? "Firefox"
				: /CriOS\/|Chrome\//.test(userAgent)
					? "Chrome"
					: /Safari\//.test(userAgent)
						? "Safari"
						: "Browser";
	return `${system} · ${browser}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/voice/voices.test.ts lib/voice/utterance.test.ts lib/voice/settings.test.ts lib/voice/device.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/voice/voices.ts lib/voice/voices.test.ts lib/voice/utterance.ts lib/voice/utterance.test.ts lib/voice/settings.ts lib/voice/settings.test.ts lib/voice/device.ts lib/voice/device.test.ts
git commit -m "feat: pick Osmo's voice, pull messages out of \"Osmo, ...\", and name devices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Voiceprints, loudness and the audio ring

**Files:**
- Create: `lib/voice/voiceprint.ts`, `lib/voice/levels.ts`, `lib/voice/ring.ts`
- Test: `lib/voice/voiceprint.test.ts`, `lib/voice/levels.test.ts`, `lib/voice/ring.test.ts`

**Interfaces:**
- Consumes: `Speaker` from `./guest`.
- Produces:
  - `MODEL_ID = "campplus-en-voxceleb-16k"`
  - `MATCH_THRESHOLD = 0.5`
  - `READING_AGREEMENT = 0.5`
  - `CARRY_OVER_SECONDS = 1.5`
  - `TEACHING_SENTENCES` (5 strings)
  - `type Voiceprint = { model: string; embedding: number[] }`
  - `cosine(a, b): number`
  - `averagePrint(readings): number[]`
  - `outliers(readings): number[]`
  - `bestScore(embedding, prints, model?): number`
  - `judge({ score, speechSeconds, ownerSoFar }): Speaker`
  - `MIN_READING_SECONDS = 2`
  - `READING_END_SILENCE_MS = 1200`
  - `READING_MAX_MS = 10000`
  - `stepLevels(samples: Float32Array): number[]`
  - `speechSeconds(samples: Float32Array): number`
  - `type ReadingProblem = "quiet" | "short" | null`
  - `readingProblem(samples): ReadingProblem`
  - `trailingSilenceMs(samples): number`
  - `readingDone(samples): boolean`
  - `trimSilence(samples): Float32Array`
  - `class SampleRing { constructor(capacity: number); get total(): number; push(samples: Int16Array): void; since(from: number): Int16Array }`

- [ ] **Step 1: Write the failing tests**

`lib/voice/voiceprint.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { averagePrint, bestScore, cosine, judge, MATCH_THRESHOLD, MODEL_ID, outliers } from "./voiceprint";

describe("cosine", () => {
	it("scores direction, not length", () => {
		expect(cosine([1, 0], [5, 0])).toBeCloseTo(1);
		expect(cosine([1, 0], [-2, 0])).toBeCloseTo(-1);
		expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
	});

	it("returns -1 for vectors that can't be compared", () => {
		expect(cosine([1, 0], [1, 0, 0])).toBe(-1);
		expect(cosine([0, 0], [1, 0])).toBe(-1);
		expect(cosine([], [])).toBe(-1);
	});
});

describe("averagePrint", () => {
	it("averages directions, so a loud reading doesn't outweigh a quiet one", () => {
		const print = averagePrint([[2, 0], [0, 5]]);
		expect(print[0]).toBeCloseTo(Math.SQRT1_2);
		expect(print[1]).toBeCloseTo(Math.SQRT1_2);
	});

	it("is empty for no readings", () => {
		expect(averagePrint([])).toEqual([]);
	});
});

describe("outliers", () => {
	it("finds the reading that doesn't sound like the rest", () => {
		expect(outliers([[1, 0.05, 0], [1, 0, 0.05], [1, 0.02, 0.02], [1, 0.03, 0], [0, 1, 0]])).toEqual([4]);
	});

	it("finds none when all readings agree, or when there is only one", () => {
		expect(outliers([[1, 0], [1, 0.1], [1, -0.1]])).toEqual([]);
		expect(outliers([[1, 0]])).toEqual([]);
	});
});

describe("bestScore", () => {
	it("takes the closest of several voiceprints from this model", () => {
		const prints = [
			{ model: MODEL_ID, embedding: [0, 1] },
			{ model: MODEL_ID, embedding: [1, 0.1] },
		];
		expect(bestScore([1, 0], prints)).toBeCloseTo(cosine([1, 0], [1, 0.1]));
	});

	it("never compares voiceprints from another model", () => {
		expect(bestScore([1, 0], [{ model: "some-older-model", embedding: [1, 0] }])).toBe(-1);
	});

	it("is -1 with no voiceprints at all", () => {
		expect(bestScore([1, 0], [])).toBe(-1);
	});
});

describe("judge", () => {
	it("is Gur at or above the threshold, and someone else below it", () => {
		expect(judge({ score: MATCH_THRESHOLD, speechSeconds: 3, ownerSoFar: false })).toBe("you");
		expect(judge({ score: MATCH_THRESHOLD - 0.01, speechSeconds: 3, ownerSoFar: false })).toBe("guest");
		expect(judge({ score: -1, speechSeconds: 3, ownerSoFar: false })).toBe("guest");
	});

	it("keeps a short follow-up Gur's once he has been recognized", () => {
		expect(judge({ score: 0.1, speechSeconds: 1, ownerSoFar: true })).toBe("you");
	});

	it("judges a full-sentence follow-up again", () => {
		expect(judge({ score: 0.1, speechSeconds: 2, ownerSoFar: true })).toBe("guest");
	});

	it("never carries over before Gur has been recognized", () => {
		expect(judge({ score: 0.1, speechSeconds: 1, ownerSoFar: false })).toBe("guest");
	});
});
```

`lib/voice/levels.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { readingDone, readingProblem, speechSeconds, trailingSilenceMs, trimSilence } from "./levels";

const RATE = 16000;
const tone = (seconds: number, amp = 0.3) =>
	Float32Array.from({ length: Math.round(RATE * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / RATE));
const silence = (seconds: number) => new Float32Array(Math.round(RATE * seconds));
const join = (...parts: Float32Array[]) => {
	const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
};

describe("speechSeconds", () => {
	it("counts the loud part of a recording", () => {
		expect(speechSeconds(tone(3))).toBeCloseTo(3, 1);
		expect(speechSeconds(join(silence(1), tone(2), silence(1)))).toBeCloseTo(2, 1);
	});
});

describe("readingProblem", () => {
	it("accepts two seconds of clear speech or more", () => {
		expect(readingProblem(tone(3))).toBeNull();
	});

	it("calls a whisper too quiet", () => {
		expect(readingProblem(tone(3, 0.005))).toBe("quiet");
	});

	it("calls one second of speech too short", () => {
		expect(readingProblem(join(tone(1), silence(2)))).toBe("short");
	});
});

describe("trailingSilenceMs", () => {
	it("measures the quiet after the last speech", () => {
		expect(trailingSilenceMs(join(tone(2), silence(1)))).toBeCloseTo(1000, -2);
		expect(trailingSilenceMs(tone(2))).toBe(0);
	});
});

describe("readingDone", () => {
	it("ends a reading after speech and 1.2 seconds of quiet", () => {
		expect(readingDone(join(tone(2), silence(1.3)))).toBe(true);
		expect(readingDone(join(tone(2), silence(0.5)))).toBe(false);
	});

	it("keeps waiting in silence, until the time limit", () => {
		expect(readingDone(silence(3))).toBe(false);
		expect(readingDone(silence(10))).toBe(true);
	});
});

describe("trimSilence", () => {
	it("cuts long silence around speech, keeping 100 ms on each side", () => {
		const trimmed = trimSilence(join(silence(1), tone(2), silence(1)));
		expect(trimmed.length / RATE).toBeCloseTo(2.2, 1);
	});

	it("is empty for a silent recording", () => {
		expect(trimSilence(silence(2)).length).toBe(0);
	});
});
```

`lib/voice/ring.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { SampleRing } from "./ring";

describe("SampleRing", () => {
	it("returns what was pushed since a position", () => {
		const ring = new SampleRing(8);
		ring.push(Int16Array.of(1, 2, 3));
		ring.push(Int16Array.of(4, 5));
		expect(ring.total).toBe(5);
		expect(Array.from(ring.since(0))).toEqual([1, 2, 3, 4, 5]);
		expect(Array.from(ring.since(3))).toEqual([4, 5]);
	});

	it("keeps only the newest samples once full", () => {
		const ring = new SampleRing(4);
		ring.push(Int16Array.of(1, 2, 3, 4, 5, 6));
		expect(Array.from(ring.since(0))).toEqual([3, 4, 5, 6]);
		expect(Array.from(ring.since(4))).toEqual([5, 6]);
	});

	it("returns nothing for a position that hasn't happened yet", () => {
		const ring = new SampleRing(4);
		ring.push(Int16Array.of(1, 2));
		expect(ring.since(10).length).toBe(0);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/voice/voiceprint.test.ts lib/voice/levels.test.ts lib/voice/ring.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write the three modules**

`lib/voice/voiceprint.ts`:
```ts
// Telling Gur's voice from anyone else's. The numbers come from the planning check with 3D-Speaker CAM++:
// the same voice scored 0.92 or more, and different voices at most 0.38 (see docs/osmo-voice-models.md).

import type { Speaker } from "./guest";

// Which model made an embedding. Voiceprints from any other model are never compared.
export const MODEL_ID = "campplus-en-voxceleb-16k";
// At or above this, the voice is Gur's. Anything else, including unsure, is someone else.
export const MATCH_THRESHOLD = 0.5;
// While teaching, each reading must be at least this close to the average of the others.
export const READING_AGREEMENT = 0.5;
// Follow-ups shorter than this keep the conversation's speaker once Gur has been recognized.
export const CARRY_OVER_SECONDS = 1.5;

// Read aloud while teaching: about 30 seconds in all, each with over two seconds of speech.
export const TEACHING_SENTENCES = [
	"The morning light came through the kitchen window.",
	"I'd like to hear about the weather this weekend.",
	"Please remind me to call my sister after lunch.",
	"Numbers like forty-two are easy to say out loud.",
	"Osmo, this is my voice. Remember how it sounds.",
] as const;

export type Voiceprint = { model: string; embedding: number[] };

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
	if (a.length !== b.length || a.length === 0) return -1;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return na === 0 || nb === 0 ? -1 : dot / Math.sqrt(na * nb);
}

function unit(v: ArrayLike<number>): number[] {
	let norm = 0;
	for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
	norm = Math.sqrt(norm);
	return Array.from(v, (x) => (norm === 0 ? 0 : x / norm));
}

// The voiceprint of several readings: the average of their directions.
export function averagePrint(readings: readonly ArrayLike<number>[]): number[] {
	if (readings.length === 0) return [];
	const units = readings.map(unit);
	return unit(units[0].map((_, i) => units.reduce((sum, u) => sum + u[i], 0)));
}

// Readings that don't sound like the rest (a cough, someone else talking), by index.
export function outliers(readings: readonly ArrayLike<number>[]): number[] {
	if (readings.length < 2) return [];
	return readings.flatMap((reading, i) =>
		cosine(reading, averagePrint(readings.filter((_, j) => j !== i))) < READING_AGREEMENT ? [i] : [],
	);
}

// How close a voice is to Gur's closest voiceprint from this model; -1 when there is none to compare.
export function bestScore(embedding: ArrayLike<number>, prints: readonly Voiceprint[], model: string = MODEL_ID): number {
	return prints.filter((p) => p.model === model).reduce((best, p) => Math.max(best, cosine(embedding, p.embedding)), -1);
}

export function judge(input: { score: number; speechSeconds: number; ownerSoFar: boolean }): Speaker {
	if (input.ownerSoFar && input.speechSeconds < CARRY_OVER_SECONDS) return "you";
	return input.score >= MATCH_THRESHOLD ? "you" : "guest";
}
```

`lib/voice/levels.ts`:
```ts
// How much of a recording is speech, from its loudness in 20 ms steps. Samples are 16 kHz on the -1..1 scale.

const RATE = 16000;
const STEP = 320; // 20 ms
// Below this, a step is silence whatever else is going on.
const QUIET_RMS = 0.01;
// 100 ms of quiet kept on each side when trimming.
const PAD_STEPS = 5;

export const MIN_READING_SECONDS = 2;
export const READING_END_SILENCE_MS = 1200;
export const READING_MAX_MS = 10_000;

export function stepLevels(samples: Float32Array): number[] {
	const levels: number[] = [];
	for (let at = 0; at + STEP <= samples.length; at += STEP) {
		let sum = 0;
		for (let i = at; i < at + STEP; i++) sum += samples[i] * samples[i];
		levels.push(Math.sqrt(sum / STEP));
	}
	return levels;
}

// Loud enough to count as speech: well above silence, and within 20 dB of the loudest step.
function speechFloor(levels: number[]): number {
	return Math.max(QUIET_RMS * 1.5, levels.reduce((max, l) => Math.max(max, l), 0) * 0.1);
}

export function speechSeconds(samples: Float32Array): number {
	const levels = stepLevels(samples);
	const floor = speechFloor(levels);
	return (levels.filter((l) => l >= floor).length * STEP) / RATE;
}

export type ReadingProblem = "quiet" | "short" | null;

export function readingProblem(samples: Float32Array): ReadingProblem {
	const peak = stepLevels(samples).reduce((max, l) => Math.max(max, l), 0);
	if (peak < QUIET_RMS * 2) return "quiet";
	return speechSeconds(samples) < MIN_READING_SECONDS ? "short" : null;
}

export function trailingSilenceMs(samples: Float32Array): number {
	const levels = stepLevels(samples);
	const floor = speechFloor(levels);
	let quiet = 0;
	for (let i = levels.length - 1; i >= 0 && levels[i] < floor; i--) quiet++;
	return (quiet * STEP * 1000) / RATE;
}

// A reading ends after some speech followed by 1.2 s of quiet, or at the time limit.
export function readingDone(samples: Float32Array): boolean {
	if ((samples.length * 1000) / RATE >= READING_MAX_MS) return true;
	return speechSeconds(samples) >= 0.5 && trailingSilenceMs(samples) >= READING_END_SILENCE_MS;
}

// The recording from its first to its last step of speech, with 100 ms kept on each side.
export function trimSilence(samples: Float32Array): Float32Array {
	const levels = stepLevels(samples);
	const floor = speechFloor(levels);
	const first = levels.findIndex((l) => l >= floor);
	if (first === -1) return new Float32Array(0);
	let last = levels.length - 1;
	while (levels[last] < floor) last--;
	return samples.slice(Math.max(0, (first - PAD_STEPS) * STEP), Math.min(samples.length, (last + 1 + PAD_STEPS) * STEP));
}
```

`lib/voice/ring.ts`:
```ts
// The last few seconds of microphone audio, addressed by a running sample count,
// so the voice check can look back at the wake word after the detector heard it.

export class SampleRing {
	private readonly data: Int16Array;
	private written = 0;

	constructor(capacity: number) {
		this.data = new Int16Array(capacity);
	}

	// How many samples have ever been pushed. A past value marks a position in the stream.
	get total(): number {
		return this.written;
	}

	push(samples: Int16Array): void {
		for (let i = 0; i < samples.length; i++) this.data[(this.written + i) % this.data.length] = samples[i];
		this.written += samples.length;
	}

	// Samples from position `from` up to now. Audio that has already been overwritten is skipped.
	since(from: number): Int16Array {
		const start = Math.min(this.written, Math.max(from, this.written - this.data.length, 0));
		const out = new Int16Array(this.written - start);
		for (let i = 0; i < out.length; i++) out[i] = this.data[(start + i) % this.data.length];
		return out;
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/voice/voiceprint.test.ts lib/voice/levels.test.ts lib/voice/ring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/voice/voiceprint.ts lib/voice/voiceprint.test.ts lib/voice/levels.ts lib/voice/levels.test.ts lib/voice/ring.ts lib/voice/ring.test.ts
git commit -m "feat: voiceprint matching, speech loudness and the recent-audio ring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Speaker features (fbank, resampling, WAV, embeddings)

**Files:**
- Create: `lib/voice/runtime.ts`, `lib/voice/fbank.ts`, `lib/voice/resample.ts`, `lib/voice/wav.ts`, `lib/voice/speaker.ts`
- Test: `lib/voice/fbank.test.ts`, `lib/voice/resample.test.ts`, `lib/voice/wav.test.ts`, `lib/voice/speaker.test.ts`

**Interfaces:**
- Produces:
  - `type OrtLike = { Tensor: new (type: "float32", data: Float32Array, dims: readonly number[]) => unknown }`
  - `type SessionLike = { readonly inputNames: readonly string[]; readonly outputNames: readonly string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { readonly data: unknown }>> }`
  - `FBANK_BINS = 80`
  - `fbank(samples: Float32Array, options?: { meanNormalize?: boolean }): { feats: Float32Array; frames: number }`
  - `class Downsampler { constructor(fromRate: number, toRate?: number); push(input: Float32Array): Float32Array }`
  - `toInt16(samples: Float32Array): Int16Array`
  - `readWav(bytes: Uint8Array): { rate: number; samples: Int16Array }`
  - `embedVoice(ort: OrtLike, session: SessionLike, samples: Float32Array): Promise<number[]>`

- [ ] **Step 1: Write the failing tests**

`lib/voice/fbank.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { FBANK_BINS, fbank } from "./fbank";

const tone = (hz: number, seconds: number, amp = 0.5) =>
	Float32Array.from({ length: Math.round(16000 * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / 16000));

describe("fbank", () => {
	it("makes one frame per 10 ms after the first 25 ms", () => {
		expect(fbank(new Float32Array(16000)).frames).toBe(98);
		expect(fbank(new Float32Array(400)).frames).toBe(1);
		const short = fbank(new Float32Array(399));
		expect(short.frames).toBe(0);
		expect(short.feats.length).toBe(0);
	});

	it("puts a 1 kHz tone's energy in the mel bin around 1 kHz", () => {
		const { feats, frames } = fbank(tone(1000, 1), { meanNormalize: false });
		const average = Array.from({ length: FBANK_BINS }, (_, b) => {
			let sum = 0;
			for (let f = 0; f < frames; f++) sum += feats[f * FBANK_BINS + b];
			return sum / frames;
		});
		const peak = average.indexOf(Math.max(...average));
		expect([26, 27]).toContain(peak);
	});

	it("subtracts each bin's mean over the recording by default", () => {
		const { feats, frames } = fbank(tone(440, 1));
		for (let b = 0; b < FBANK_BINS; b++) {
			let sum = 0;
			for (let f = 0; f < frames; f++) sum += feats[f * FBANK_BINS + b];
			expect(Math.abs(sum / frames)).toBeLessThan(1e-3);
		}
	});

	it("stays finite on silence", () => {
		const { feats } = fbank(new Float32Array(8000), { meanNormalize: false });
		expect(feats.every((x) => Number.isFinite(x))).toBe(true);
	});
});
```

`lib/voice/resample.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { Downsampler, toInt16 } from "./resample";

function feed(down: Downsampler, input: Float32Array, chunk = 128) {
	const parts: number[] = [];
	for (let at = 0; at < input.length; at += chunk) parts.push(...down.push(input.subarray(at, at + chunk)));
	return parts;
}

describe("Downsampler", () => {
	it("turns 48 kHz into 16 kHz across small chunks without drift", () => {
		const out = feed(new Downsampler(48000), new Float32Array(4800).fill(0.5));
		expect(Math.abs(out.length - 1600)).toBeLessThanOrEqual(1);
		expect(out.every((x) => Math.abs(x - 0.5) < 1e-6)).toBe(true);
	});

	it("keeps time at 44.1 kHz too", () => {
		const out = feed(new Downsampler(44100), new Float32Array(44100));
		expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(1);
	});

	it("passes 16 kHz through", () => {
		expect(feed(new Downsampler(16000), Float32Array.of(0.1, 0.2, 0.3))).toEqual([
			expect.closeTo(0.1, 6),
			expect.closeTo(0.2, 6),
			expect.closeTo(0.3, 6),
		]);
	});

	it("refuses to raise a lower rate", () => {
		expect(() => new Downsampler(8000)).toThrow();
	});
});

describe("toInt16", () => {
	it("scales and clamps", () => {
		expect(Array.from(toInt16(Float32Array.of(1.5, -1.5, 0, 0.5)))).toEqual([32767, -32768, 0, 16384]);
	});
});
```

`lib/voice/wav.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { readWav } from "./wav";

function wav(samples: number[], { rate = 16000, channels = 1, bits = 16, fmtSize = 16 } = {}) {
	const data = samples.length * 2;
	const buffer = new ArrayBuffer(12 + 8 + fmtSize + 8 + data);
	const view = new DataView(buffer);
	const tag = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
	tag(0, "RIFF");
	view.setUint32(4, buffer.byteLength - 8, true);
	tag(8, "WAVE");
	tag(12, "fmt ");
	view.setUint32(16, fmtSize, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * channels * 2, true);
	view.setUint16(32, channels * 2, true);
	view.setUint16(34, bits, true);
	const dataAt = 20 + fmtSize;
	tag(dataAt, "data");
	view.setUint32(dataAt + 4, data, true);
	samples.forEach((s, i) => view.setInt16(dataAt + 8 + i * 2, s, true));
	return new Uint8Array(buffer);
}

describe("readWav", () => {
	it("reads 16-bit mono samples and the rate", () => {
		const { rate, samples } = readWav(wav([1, -2, 300]));
		expect(rate).toBe(16000);
		expect(Array.from(samples)).toEqual([1, -2, 300]);
	});

	it("reads Windows' 18-byte format chunk", () => {
		expect(Array.from(readWav(wav([7, 8], { fmtSize: 18 })).samples)).toEqual([7, 8]);
	});

	it("rejects stereo and anything that isn't a WAV file", () => {
		expect(() => readWav(wav([1, 2], { channels: 2 }))).toThrow();
		expect(() => readWav(new Uint8Array(40))).toThrow();
	});
});
```

`lib/voice/speaker.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { embedVoice } from "./speaker";

class FakeTensor {
	constructor(
		readonly type: string,
		readonly data: Float32Array,
		readonly dims: readonly number[],
	) {}
}

function fakeSession() {
	const feeds: Record<string, unknown>[] = [];
	return {
		feeds,
		inputNames: ["x"],
		outputNames: ["embedding"],
		run: async (input: Record<string, unknown>) => {
			feeds.push(input);
			return { embedding: { data: Float32Array.of(0.5, -0.25, 1) } };
		},
	};
}

describe("embedVoice", () => {
	it("feeds the model 80-bin features for every frame and returns its embedding", async () => {
		const session = fakeSession();
		const embedding = await embedVoice({ Tensor: FakeTensor }, session, new Float32Array(16000).fill(0.1));
		expect(embedding).toEqual([0.5, -0.25, 1]);
		const tensor = session.feeds[0].x as FakeTensor;
		expect(tensor.type).toBe("float32");
		expect(tensor.dims).toEqual([1, 98, 80]);
		expect(tensor.data.length).toBe(98 * 80);
	});

	it("refuses audio shorter than one frame", async () => {
		await expect(embedVoice({ Tensor: FakeTensor }, fakeSession(), new Float32Array(300))).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/voice/fbank.test.ts lib/voice/resample.test.ts lib/voice/wav.test.ts lib/voice/speaker.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write the five modules**

`lib/voice/runtime.ts`:
```ts
// The small part of the ONNX runtime these modules use, so the same code runs on onnxruntime-web in the browser,
// on its node build in the voice check, and on fakes in tests.

export type OrtLike = {
	Tensor: new (type: "float32", data: Float32Array, dims: readonly number[]) => unknown;
};

export type SessionLike = {
	readonly inputNames: readonly string[];
	readonly outputNames: readonly string[];
	run(feeds: Record<string, unknown>): Promise<Record<string, { readonly data: unknown }>>;
};
```

`lib/voice/fbank.ts`:
```ts
// Kaldi-style log mel filterbank features, the input 3D-Speaker CAM++ was trained on:
// 25 ms frames every 10 ms, DC removed, pre-emphasis 0.97, Povey window, 512-point FFT, power spectrum,
// 80 mel bins from 20 Hz to 8 kHz, natural log; then each bin's mean over the recording is subtracted.
// Samples are 16 kHz on the -1..1 scale.

export const FBANK_BINS = 80;

const RATE = 16000;
const FRAME = 400;
const SHIFT = 160;
const FFT = 512;
const LOW_HZ = 20;
const HIGH_HZ = 8000;
const PREEMPH = 0.97;
const FLOOR = 1.1920929e-7; // float epsilon, as Kaldi uses

const mel = (hz: number) => 1127 * Math.log(1 + hz / 700);

const WINDOW = Float64Array.from({ length: FRAME }, (_, i) => Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)), 0.85));

// One triangle per bin over the FFT's frequencies: the first FFT bin it covers, and its weights from there.
const FILTERS = Array.from({ length: FBANK_BINS }, (_, b) => {
	const low = mel(LOW_HZ);
	const delta = (mel(HIGH_HZ) - low) / (FBANK_BINS + 1);
	const left = low + b * delta;
	const center = left + delta;
	const right = center + delta;
	const weights: number[] = [];
	let first = -1;
	for (let i = 0; i < FFT / 2; i++) {
		const m = mel((i * RATE) / FFT);
		if (m > left && m < right) {
			if (first < 0) first = i;
			weights.push(m <= center ? (m - left) / (center - left) : (right - m) / (right - center));
		}
	}
	return { first: Math.max(first, 0), weights: Float64Array.from(weights) };
});

function fftInPlace(re: Float64Array, im: Float64Array): void {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const angle = (-2 * Math.PI) / len;
		const wr = Math.cos(angle);
		const wi = Math.sin(angle);
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			for (let k = 0; k < len / 2; k++) {
				const a = i + k;
				const b = a + len / 2;
				const vr = re[b] * cr - im[b] * ci;
				const vi = re[b] * ci + im[b] * cr;
				re[b] = re[a] - vr;
				im[b] = im[a] - vi;
				re[a] += vr;
				im[a] += vi;
				const next = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = next;
			}
		}
	}
}

export function fbank(samples: Float32Array, options: { meanNormalize?: boolean } = {}): { feats: Float32Array; frames: number } {
	const frames = samples.length < FRAME ? 0 : 1 + Math.floor((samples.length - FRAME) / SHIFT);
	const feats = new Float32Array(frames * FBANK_BINS);
	const re = new Float64Array(FFT);
	const im = new Float64Array(FFT);
	for (let f = 0; f < frames; f++) {
		re.fill(0);
		im.fill(0);
		let mean = 0;
		for (let i = 0; i < FRAME; i++) {
			re[i] = samples[f * SHIFT + i];
			mean += re[i];
		}
		mean /= FRAME;
		for (let i = 0; i < FRAME; i++) re[i] -= mean;
		for (let i = FRAME - 1; i > 0; i--) re[i] -= PREEMPH * re[i - 1];
		re[0] -= PREEMPH * re[0];
		for (let i = 0; i < FRAME; i++) re[i] *= WINDOW[i];
		fftInPlace(re, im);
		for (let b = 0; b < FBANK_BINS; b++) {
			const { first, weights } = FILTERS[b];
			let energy = 0;
			for (let k = 0; k < weights.length; k++) {
				const i = first + k;
				energy += weights[k] * (re[i] * re[i] + im[i] * im[i]);
			}
			feats[f * FBANK_BINS + b] = Math.log(Math.max(energy, FLOOR));
		}
	}
	if (options.meanNormalize !== false && frames > 0) {
		for (let b = 0; b < FBANK_BINS; b++) {
			let sum = 0;
			for (let f = 0; f < frames; f++) sum += feats[f * FBANK_BINS + b];
			const binMean = sum / frames;
			for (let f = 0; f < frames; f++) feats[f * FBANK_BINS + b] -= binMean;
		}
	}
	return { feats, frames };
}
```

`lib/voice/resample.ts`:
```ts
// Microphones run at 44.1 or 48 kHz; the models want 16 kHz. Averages each output sample's span of input,
// and keeps its fractional position between chunks so time doesn't drift.

export class Downsampler {
	private readonly ratio: number;
	private carry = new Float32Array(0);
	private position = 0;

	constructor(fromRate: number, toRate = 16000) {
		if (fromRate < toRate) throw new Error(`Can't raise ${fromRate} Hz to ${toRate} Hz`);
		this.ratio = fromRate / toRate;
	}

	push(input: Float32Array): Float32Array {
		const buffer = new Float32Array(this.carry.length + input.length);
		buffer.set(this.carry);
		buffer.set(input, this.carry.length);
		const out: number[] = [];
		while (this.position + this.ratio <= buffer.length) {
			const start = Math.floor(this.position);
			const end = Math.floor(this.position + this.ratio);
			let sum = 0;
			for (let i = start; i < end; i++) sum += buffer[i];
			out.push(end > start ? sum / (end - start) : buffer[start]);
			this.position += this.ratio;
		}
		const used = Math.floor(this.position);
		this.carry = buffer.slice(used);
		this.position -= used;
		return Float32Array.from(out);
	}
}

export function toInt16(samples: Float32Array): Int16Array {
	return Int16Array.from(samples, (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767))));
}
```

`lib/voice/wav.ts`:
```ts
// Reading the 16-bit mono WAV clips the voice check uses.

export function readWav(bytes: Uint8Array): { rate: number; samples: Int16Array } {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
	if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file");
	let at = 12;
	let rate = 0;
	let bits = 0;
	let channels = 0;
	let samples: Int16Array | null = null;
	while (at + 8 <= bytes.length) {
		const id = tag(at);
		const size = view.getUint32(at + 4, true);
		if (id === "fmt ") {
			channels = view.getUint16(at + 10, true);
			rate = view.getUint32(at + 12, true);
			bits = view.getUint16(at + 22, true);
		}
		if (id === "data") {
			const copy = bytes.slice(at + 8, at + 8 + size);
			samples = new Int16Array(copy.buffer, 0, Math.floor(copy.byteLength / 2));
		}
		at += 8 + size + (size % 2);
	}
	if (!samples || bits !== 16 || channels !== 1) throw new Error("Expected 16-bit mono PCM");
	return { rate, samples };
}
```

`lib/voice/speaker.ts`:
```ts
// A voice embedding from 16 kHz samples (-1..1), using the speaker model's own features.
// The runtime is passed in, so the browser and the voice check share this code.

import { FBANK_BINS, fbank } from "./fbank";
import type { OrtLike, SessionLike } from "./runtime";

export async function embedVoice(ort: OrtLike, session: SessionLike, samples: Float32Array): Promise<number[]> {
	const { feats, frames } = fbank(samples);
	if (frames === 0) throw new Error("Too short to recognize a voice");
	const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", feats, [1, frames, FBANK_BINS]) });
	return Array.from(outputs[session.outputNames[0]].data as Float32Array);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/voice/fbank.test.ts lib/voice/resample.test.ts lib/voice/wav.test.ts lib/voice/speaker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/voice/runtime.ts lib/voice/fbank.ts lib/voice/fbank.test.ts lib/voice/resample.ts lib/voice/resample.test.ts lib/voice/wav.ts lib/voice/wav.test.ts lib/voice/speaker.ts lib/voice/speaker.test.ts
git commit -m "feat: speaker features, resampling and voice embeddings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wake-word streaming and the wake gate

**Files:**
- Create: `lib/voice/wake-stream.ts`, `lib/voice/wake.ts`, `lib/voice/wake-models.ts`
- Test: `lib/voice/wake-stream.test.ts`, `lib/voice/wake.test.ts`, `lib/voice/wake-models.test.ts`

**Interfaces:**
- Consumes: `OrtLike`, `SessionLike` from `./runtime`.
- Produces:
  - `type WakeModels = { mel(samples: Float32Array): Promise<Float32Array>; embed(window: Float32Array): Promise<Float32Array>; score(features: Float32Array): Promise<number> }`
  - `CHUNK = 1280`, `CONTEXT = 480`
  - `class WakeStream { constructor(models: WakeModels); push(samples: Int16Array): Promise<number[]> }`
  - `WAKE = { threshold: 0.7, frames: 2, cooldownMs: 2000, noSpeechMs: 4000 }`
  - `class WakeGate { feed(score: number, now: number): boolean; reset(): void }`
  - `wakeModels(ort: OrtLike, sessions: { mel: SessionLike; embed: SessionLike; keyword: SessionLike }): WakeModels`

- [ ] **Step 1: Write the failing tests**

`lib/voice/wake-stream.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CHUNK, CONTEXT, WakeStream, type WakeModels } from "./wake-stream";

function fakeModels() {
	const calls = { mel: [] as Float32Array[], embed: [] as Float32Array[], score: [] as Float32Array[] };
	const models: WakeModels = {
		mel: async (samples) => {
			calls.mel.push(samples.slice());
			return new Float32Array(8 * 32).fill(10);
		},
		embed: async (window) => {
			calls.embed.push(window.slice());
			return new Float32Array(96).fill(calls.embed.length);
		},
		score: async (features) => {
			calls.score.push(features.slice());
			return 0.5;
		},
	};
	return { models, calls };
}

const ramp = (length: number, from = 0) => Int16Array.from({ length }, (_, i) => from + i);

describe("WakeStream", () => {
	it("runs the mel model on 480 samples of context plus each new 80 ms chunk", async () => {
		const { models, calls } = fakeModels();
		const stream = new WakeStream(models);
		await stream.push(ramp(1000));
		expect(calls.mel).toHaveLength(0);
		await stream.push(ramp(1560, 1000));
		expect(calls.mel).toHaveLength(2);
		expect(calls.mel[0].length).toBe(CONTEXT + CHUNK);
		expect(Array.from(calls.mel[0].subarray(0, CONTEXT))).toEqual(new Array(CONTEXT).fill(0));
		expect(calls.mel[0][CONTEXT]).toBe(0);
		expect(Array.from(calls.mel[1].subarray(0, CONTEXT))).toEqual(Array.from(ramp(CONTEXT, CHUNK - CONTEXT)));
		expect(calls.mel[1][CONTEXT]).toBe(CHUNK);
	});

	it("gives the embedding model the last 76 mel frames, transformed like openWakeWord (x / 10 + 2)", async () => {
		const { models, calls } = fakeModels();
		await new WakeStream(models).push(ramp(CHUNK));
		const window = calls.embed[0];
		expect(window.length).toBe(76 * 32);
		expect(window[0]).toBe(1);
		expect(window[(76 - 9) * 32]).toBe(1);
		expect(window[(76 - 8) * 32]).toBe(3);
		expect(window[76 * 32 - 1]).toBe(3);
	});

	it("scores once 16 embeddings exist, then after every chunk, newest last", async () => {
		const { models, calls } = fakeModels();
		const scores = await new WakeStream(models).push(ramp(CHUNK * 20));
		expect(scores).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
		expect(calls.score[0].length).toBe(16 * 96);
		expect(calls.score[0][0]).toBe(1);
		expect(calls.score[0][16 * 96 - 1]).toBe(16);
	});
});
```

`lib/voice/wake.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { WAKE, WakeGate } from "./wake";

const high = WAKE.threshold + 0.1;

describe("WakeGate", () => {
	it("needs two strong frames in a row", () => {
		const gate = new WakeGate();
		expect(gate.feed(high, 0)).toBe(false);
		expect(gate.feed(high, 80)).toBe(true);
	});

	it("starts counting again after a weak frame", () => {
		const gate = new WakeGate();
		gate.feed(high, 0);
		gate.feed(0.1, 80);
		expect(gate.feed(high, 160)).toBe(false);
	});

	it("won't wake again within the cooldown", () => {
		const gate = new WakeGate();
		gate.feed(high, 0);
		expect(gate.feed(high, 80)).toBe(true);
		gate.feed(high, 1000);
		expect(gate.feed(high, 1080)).toBe(false);
		expect(gate.feed(high, 80 + WAKE.cooldownMs)).toBe(true);
	});
});
```

`lib/voice/wake-models.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { wakeModels } from "./wake-models";

class FakeTensor {
	constructor(
		readonly type: string,
		readonly data: Float32Array,
		readonly dims: readonly number[],
	) {}
}

function session(input: string, output: string, result: Float32Array) {
	const feeds: FakeTensor[] = [];
	return {
		feeds,
		inputNames: [input],
		outputNames: [output],
		run: async (given: Record<string, unknown>) => {
			feeds.push(given[input] as FakeTensor);
			return { [output]: { data: result } };
		},
	};
}

describe("wakeModels", () => {
	it("shapes each model's input the way openWakeWord's models expect", async () => {
		const mel = session("input", "output", new Float32Array(8 * 32));
		const embed = session("input_1", "conv2d_19", new Float32Array(96));
		const keyword = session("x.1", "53", Float32Array.of(0.8));
		const models = wakeModels({ Tensor: FakeTensor }, { mel, embed, keyword });
		await models.mel(new Float32Array(1760));
		await models.embed(new Float32Array(76 * 32));
		expect(await models.score(new Float32Array(16 * 96))).toBeCloseTo(0.8);
		expect(mel.feeds[0].dims).toEqual([1, 1760]);
		expect(embed.feeds[0].dims).toEqual([1, 76, 32, 1]);
		expect(keyword.feeds[0].dims).toEqual([1, 16, 96]);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/voice/wake-stream.test.ts lib/voice/wake.test.ts lib/voice/wake-models.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Write the three modules**

`lib/voice/wake-stream.ts`:
```ts
// openWakeWord's streaming features, computed the way its Python library does, with the models passed in.
// Audio is 16 kHz int16 in any chunk sizes. Every 1280 samples (80 ms), the mel model sees 480 samples of
// context plus the new chunk, giving 8 frames. The embedding model sees the last 76 frames (transformed x / 10 + 2),
// and once 16 embeddings exist the wake-word model scores them.

export type WakeModels = {
	mel(samples: Float32Array): Promise<Float32Array>;
	embed(window: Float32Array): Promise<Float32Array>;
	score(features: Float32Array): Promise<number>;
};

export const CHUNK = 1280;
export const CONTEXT = 480;
const MEL_BINS = 32;
const MEL_WINDOW = 76;
const EMBED_SIZE = 96;
const FEATURE_FRAMES = 16;

export class WakeStream {
	private readonly models: WakeModels;
	private pending = new Float32Array(0);
	private context = new Float32Array(CONTEXT);
	private mels: Float32Array[] = Array.from({ length: MEL_WINDOW }, () => new Float32Array(MEL_BINS).fill(1));
	private features: Float32Array[] = [];

	constructor(models: WakeModels) {
		this.models = models;
	}

	// Scores for every whole chunk now available, oldest first.
	async push(samples: Int16Array): Promise<number[]> {
		const joined = new Float32Array(this.pending.length + samples.length);
		joined.set(this.pending);
		joined.set(samples, this.pending.length);
		const scores: number[] = [];
		let at = 0;
		for (; joined.length - at >= CHUNK; at += CHUNK) {
			const input = new Float32Array(CONTEXT + CHUNK);
			input.set(this.context);
			input.set(joined.subarray(at, at + CHUNK), CONTEXT);
			this.context = input.slice(-CONTEXT);
			const frames = await this.models.mel(input);
			for (let f = 0; f + MEL_BINS <= frames.length; f += MEL_BINS) {
				this.mels.push(frames.slice(f, f + MEL_BINS).map((v) => v / 10 + 2));
			}
			this.mels = this.mels.slice(-MEL_WINDOW);
			const window = new Float32Array(MEL_WINDOW * MEL_BINS);
			this.mels.forEach((row, i) => window.set(row, i * MEL_BINS));
			this.features.push(await this.models.embed(window));
			this.features = this.features.slice(-FEATURE_FRAMES);
			if (this.features.length === FEATURE_FRAMES) {
				const x = new Float32Array(FEATURE_FRAMES * EMBED_SIZE);
				this.features.forEach((row, i) => x.set(row, i * EMBED_SIZE));
				scores.push(await this.models.score(x));
			}
		}
		this.pending = joined.slice(at);
		return scores;
	}
}
```

`lib/voice/wake.ts`:
```ts
// When a run of detector scores counts as hearing "Osmo". Strict to start with: raise `threshold` if he still wakes too often.

export const WAKE = {
	// A frame this sure or more counts.
	threshold: 0.7,
	// This many counting frames in a row wake him (2 × 80 ms).
	frames: 2,
	// No second wake-up within this long.
	cooldownMs: 2000,
	// After waking, he goes back to sleep if no speech starts within this long.
	noSpeechMs: 4000,
} as const;

export class WakeGate {
	private run = 0;
	private lastWake = Number.NEGATIVE_INFINITY;

	feed(score: number, now: number): boolean {
		this.run = score >= WAKE.threshold ? this.run + 1 : 0;
		if (this.run >= WAKE.frames && now - this.lastWake >= WAKE.cooldownMs) {
			this.lastWake = now;
			this.run = 0;
			return true;
		}
		return false;
	}

	reset(): void {
		this.run = 0;
	}
}
```

`lib/voice/wake-models.ts`:
```ts
// The three openWakeWord models as a WakeModels, on any runtime shaped like onnxruntime-web.

import type { OrtLike, SessionLike } from "./runtime";
import type { WakeModels } from "./wake-stream";

export function wakeModels(ort: OrtLike, sessions: { mel: SessionLike; embed: SessionLike; keyword: SessionLike }): WakeModels {
	const run = async (session: SessionLike, data: Float32Array, dims: number[]) => {
		const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", data, dims) });
		return outputs[session.outputNames[0]].data as Float32Array;
	};
	return {
		mel: (samples) => run(sessions.mel, samples, [1, samples.length]),
		embed: (window) => run(sessions.embed, window, [1, 76, 32, 1]),
		score: async (features) => (await run(sessions.keyword, features, [1, 16, 96]))[0],
	};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/voice/wake-stream.test.ts lib/voice/wake.test.ts lib/voice/wake-models.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/voice/wake-stream.ts lib/voice/wake-stream.test.ts lib/voice/wake.ts lib/voice/wake.test.ts lib/voice/wake-models.ts lib/voice/wake-models.test.ts
git commit -m "feat: openWakeWord streaming features and a strict wake gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The conversation state machine

**Files:**
- Create: `lib/voice/machine.ts`
- Test: `lib/voice/machine.test.ts`

**Interfaces:**
- Consumes: `Speaker`, `Via` from `./guest`; `WAKE` from `./wake`.
- Produces:
  - `type Mode = "off" | "paused" | "sleeping" | "awake" | "thinking" | "speaking" | "followup"`
  - `type VoiceState = { mode; listening; since; heard; owner; greeted; conversation }`
  - `type VoiceEvent` (the union below)
  - `FOLLOW_UP_MS = 6000`
  - `initialVoice(now?: number): VoiceState`
  - `step(state, event): VoiceState`. It returns the same object when nothing changes.
  - `detectorOn(state)`, `recognizerOn(state)`, `micOpen(state)` (all return booleans)

- [ ] **Step 1: Write the failing tests**

`lib/voice/machine.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { detectorOn, FOLLOW_UP_MS, initialVoice, micOpen, recognizerOn, step, type VoiceEvent, type VoiceState } from "./machine";
import { WAKE } from "./wake";

const run = (events: VoiceEvent[], start: VoiceState = initialVoice(0)) => events.reduce(step, start);
const listening = () => run([{ type: "listen", on: true, now: 0 }]);
const inConversation = () =>
	run(
		[
			{ type: "wake", now: 10 },
			{ type: "speech", now: 20 },
			{ type: "judged", speaker: "you" },
			{ type: "sent", now: 30 },
		],
		listening(),
	);

describe("step", () => {
	it("starts off, and sleeps once listening is on", () => {
		expect(initialVoice().mode).toBe("off");
		expect(listening().mode).toBe("sleeping");
	});

	it("wakes from sleep, and ignores a wake while awake, thinking or speaking", () => {
		const awake = step(listening(), { type: "wake", now: 1 });
		expect(awake.mode).toBe("awake");
		expect(step(awake, { type: "wake", now: 2 })).toBe(awake);
		const thinking = inConversation();
		expect(step(thinking, { type: "wake", now: 40 })).toBe(thinking);
		const speaking = step(thinking, { type: "reply", via: "voice", spoken: true, now: 50 });
		expect(step(speaking, { type: "wake", now: 60 })).toBe(speaking);
		expect(step(initialVoice(), { type: "wake", now: 1 }).mode).toBe("off");
	});

	it("goes back to sleep silently when nothing is said after waking", () => {
		const awake = step(listening(), { type: "wake", now: 1000 });
		expect(step(awake, { type: "tick", now: 1000 + WAKE.noSpeechMs - 1 }).mode).toBe("awake");
		expect(step(awake, { type: "tick", now: 1000 + WAKE.noSpeechMs }).mode).toBe("sleeping");
	});

	it("keeps listening while Gur is still talking", () => {
		const talking = run([{ type: "wake", now: 0 }, { type: "speech", now: 100 }], listening());
		expect(step(talking, { type: "tick", now: 60_000 }).mode).toBe("awake");
	});

	it("thinks, speaks, then listens for a follow-up that ends after six seconds", () => {
		const thinking = inConversation();
		expect(thinking.mode).toBe("thinking");
		const speaking = step(thinking, { type: "reply", via: "voice", spoken: true, now: 40 });
		expect(speaking.mode).toBe("speaking");
		const followup = step(speaking, { type: "spoken", now: 100 });
		expect(followup.mode).toBe("followup");
		expect(step(followup, { type: "tick", now: 100 + FOLLOW_UP_MS - 1 }).mode).toBe("followup");
		const rested = step(followup, { type: "tick", now: 100 + FOLLOW_UP_MS });
		expect(rested.mode).toBe("sleeping");
		expect(rested.owner).toBe(false);
	});

	it("keeps Gur recognized through a follow-up", () => {
		const followup = run(
			[
				{ type: "reply", via: "voice", spoken: true, now: 40 },
				{ type: "spoken", now: 50 },
				{ type: "speech", now: 60 },
			],
			inConversation(),
		);
		expect(followup.mode).toBe("awake");
		expect(followup.owner).toBe(true);
	});

	it("goes straight to the follow-up when the device can't speak", () => {
		expect(step(inConversation(), { type: "reply", via: "voice", spoken: false, now: 40 }).mode).toBe("followup");
	});

	it("rests when a message is dropped, awake, thinking or in a follow-up", () => {
		expect(step(step(listening(), { type: "wake", now: 1 }), { type: "dropped", now: 2 }).mode).toBe("sleeping");
		expect(step(inConversation(), { type: "dropped", now: 40 }).mode).toBe("sleeping");
		const followup = run([{ type: "reply", via: "voice", spoken: false, now: 40 }], inConversation());
		expect(step(followup, { type: "dropped", now: 50 }).mode).toBe("sleeping");
	});

	it("remembers a guest was greeted, until the conversation ends", () => {
		const greeted = step(step(listening(), { type: "wake", now: 1 }), { type: "greeted" });
		expect(greeted.greeted).toBe(true);
		expect(step(greeted, { type: "dropped", now: 2 }).greeted).toBe(false);
	});

	it("speaks a typed reply from sleep, then sleeps again without a follow-up", () => {
		const speaking = step(listening(), { type: "reply", via: "typed", spoken: true, now: 5 });
		expect(speaking.mode).toBe("speaking");
		expect(step(speaking, { type: "spoken", now: 9 }).mode).toBe("sleeping");
		const awake = step(listening(), { type: "wake", now: 1 });
		expect(step(awake, { type: "reply", via: "typed", spoken: true, now: 2 })).toBe(awake);
	});

	it("stops speaking when asked", () => {
		const speaking = step(listening(), { type: "reply", via: "typed", spoken: true, now: 5 });
		expect(step(speaking, { type: "stop", now: 6 }).mode).toBe("sleeping");
	});

	it("starts a conversation from the mic button even when not listening, and ends back off", () => {
		const awake = step(initialVoice(), { type: "mic", now: 0 });
		expect(awake.mode).toBe("awake");
		expect(step(awake, { type: "tick", now: WAKE.noSpeechMs }).mode).toBe("off");
	});

	it("pauses while the page is hidden, and resumes listening when it comes back", () => {
		const paused = step(listening(), { type: "hidden", now: 1 });
		expect(paused.mode).toBe("paused");
		expect(step(paused, { type: "visible", now: 2 }).mode).toBe("sleeping");
		const micOnly = step(initialVoice(), { type: "mic", now: 0 });
		expect(step(micOnly, { type: "hidden", now: 1 }).mode).toBe("off");
		expect(step(initialVoice(), { type: "hidden", now: 1 }).mode).toBe("off");
	});

	it("turns everything off when listening is switched off mid-conversation", () => {
		const off = step(inConversation(), { type: "listen", on: false, now: 50 });
		expect(off.mode).toBe("off");
		expect(off.listening).toBe(false);
	});

	it("returns the same state when nothing changes", () => {
		const s = listening();
		expect(step(s, { type: "tick", now: 5 })).toBe(s);
		expect(step(s, { type: "judged", speaker: "guest" })).toBe(s);
	});
});

describe("what runs in each mode", () => {
	it("runs the detector only while sleeping, and the recognizer only while awake or in a follow-up", () => {
		const sleeping = listening();
		const awake = step(sleeping, { type: "wake", now: 1 });
		const thinking = inConversation();
		expect([detectorOn(sleeping), recognizerOn(sleeping), micOpen(sleeping)]).toEqual([true, false, true]);
		expect([detectorOn(awake), recognizerOn(awake), micOpen(awake)]).toEqual([false, true, true]);
		expect([detectorOn(thinking), recognizerOn(thinking), micOpen(thinking)]).toEqual([false, false, false]);
		expect(micOpen(initialVoice())).toBe(false);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/voice/machine.test.ts`
Expected: FAIL with "Failed to resolve import './machine'".

- [ ] **Step 3: Write `lib/voice/machine.ts`**

```ts
// Osmo's side of a spoken conversation, as a pure state machine. The engine (./engine.ts) feeds it events
// and opens or closes the microphone, detector and recognizer to match the mode.

import type { Speaker, Via } from "./guest";
import { WAKE } from "./wake";

export type Mode = "off" | "paused" | "sleeping" | "awake" | "thinking" | "speaking" | "followup";

export type VoiceState = {
	mode: Mode;
	// "Listen for 'Osmo'" is on.
	listening: boolean;
	// When the current mode began (ms).
	since: number;
	// Speech has started since he began listening.
	heard: boolean;
	// This conversation has recognized Gur.
	owner: boolean;
	// A guest has been greeted in this conversation.
	greeted: boolean;
	// The reply being spoken belongs to a spoken conversation, so a follow-up window comes after it.
	conversation: boolean;
};

export type VoiceEvent =
	| { type: "listen"; on: boolean; now: number }
	| { type: "wake"; now: number }
	| { type: "mic"; now: number }
	| { type: "speech"; now: number }
	| { type: "judged"; speaker: Speaker }
	| { type: "greeted" }
	| { type: "sent"; now: number }
	| { type: "dropped"; now: number }
	| { type: "reply"; via: Via; spoken: boolean; now: number }
	| { type: "spoken"; now: number }
	| { type: "stop"; now: number }
	| { type: "hidden"; now: number }
	| { type: "visible"; now: number }
	| { type: "tick"; now: number };

// After he finishes a spoken reply, he listens this long for a follow-up without the wake word.
export const FOLLOW_UP_MS = 6000;

export function initialVoice(now = 0): VoiceState {
	return { mode: "off", listening: false, since: now, heard: false, owner: false, greeted: false, conversation: false };
}

// Back to waiting: asleep if listening is on, otherwise off. The conversation is over.
function rest(s: VoiceState, now: number): VoiceState {
	return { ...s, mode: s.listening ? "sleeping" : "off", since: now, heard: false, owner: false, greeted: false, conversation: false };
}

export const detectorOn = (s: VoiceState) => s.mode === "sleeping";
export const recognizerOn = (s: VoiceState) => s.mode === "awake" || s.mode === "followup";
// The microphone, and the listening line under the text box, are on exactly when one of them runs.
export const micOpen = (s: VoiceState) => detectorOn(s) || recognizerOn(s);

export function step(s: VoiceState, e: VoiceEvent): VoiceState {
	switch (e.type) {
		case "listen": {
			if (!e.on) return rest({ ...s, listening: false }, e.now);
			if (s.listening) return s;
			return s.mode === "off" ? { ...s, listening: true, mode: "sleeping", since: e.now } : { ...s, listening: true };
		}
		case "wake":
			return s.mode === "sleeping" ? { ...s, mode: "awake", since: e.now, heard: false } : s;
		case "mic":
			return s.mode === "off" || s.mode === "sleeping" || s.mode === "followup" ? { ...s, mode: "awake", since: e.now, heard: false } : s;
		case "speech":
			if (s.mode === "awake") return s.heard ? s : { ...s, heard: true };
			if (s.mode === "followup") return { ...s, mode: "awake", since: e.now, heard: true };
			return s;
		case "judged":
			return e.speaker === "you" && !s.owner ? { ...s, owner: true } : s;
		case "greeted":
			return s.greeted ? s : { ...s, greeted: true };
		case "sent":
			return s.mode === "awake" ? { ...s, mode: "thinking", since: e.now } : s;
		case "dropped":
			return s.mode === "awake" || s.mode === "thinking" || s.mode === "followup" ? rest(s, e.now) : s;
		case "reply":
			if (s.mode === "thinking") {
				return e.spoken
					? { ...s, mode: "speaking", since: e.now, conversation: true }
					: { ...s, mode: "followup", since: e.now, heard: false };
			}
			if (e.spoken && e.via === "typed" && (s.mode === "off" || s.mode === "sleeping")) {
				return { ...s, mode: "speaking", since: e.now, conversation: false };
			}
			return s;
		case "spoken":
			if (s.mode !== "speaking") return s;
			return s.conversation ? { ...s, mode: "followup", since: e.now, heard: false } : rest(s, e.now);
		case "stop":
			return s.mode === "speaking" ? rest(s, e.now) : s;
		case "hidden": {
			if (s.mode === "off" || s.mode === "paused") return s;
			const rested = rest(s, e.now);
			return rested.mode === "sleeping" ? { ...rested, mode: "paused" } : rested;
		}
		case "visible":
			return s.mode === "paused" ? { ...s, mode: "sleeping", since: e.now } : s;
		case "tick":
			if (s.mode === "awake" && !s.heard && e.now - s.since >= WAKE.noSpeechMs) return rest(s, e.now);
			if (s.mode === "followup" && e.now - s.since >= FOLLOW_UP_MS) return rest(s, e.now);
			return s;
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/voice/machine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/voice/machine.ts lib/voice/machine.test.ts
git commit -m "feat: the spoken-conversation state machine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The voice engine (tested with fakes)

**Files:**
- Create: `lib/voice/engine.ts`
- Test: `lib/voice/engine.test.ts`

**Interfaces:**
- Consumes:
  - from Tasks 1–6: `SendOptions`, `Speaker`, `Via`, `speechSeconds`, `trimSilence`, `step`/`initialVoice`/`detectorOn`/`micOpen`/`recognizerOn`, `SampleRing` (type), `messageFrom`, `bestScore`, `judge`, `Voiceprint`, `MODEL_ID` (tests).
- Produces (Tasks 9–11 rely on these names):
  - error strings `MIC_BLOCKED`, `NO_MIC`, `MODEL_FAILED`, `LISTENING_STOPPED`;
  - `WAKE_AUDIO_SAMPLES = 16000`, `MAX_FAILURES = 3`, `WORD_TIMING_WAIT_MS = 800`;
  - `class MicError extends Error { readonly problem: "blocked" | "unavailable" }`;
  - types `HearProblem`, `HearHooks`, `Hearing`, `MicHandle`, `Detector`, `SayHooks`, `Spoken`, `VoiceDeps`, `SpeechHooks`, `SendText`, `VoiceConfig`, `VoiceView`;
  - `class VoiceEngine`:
    - `constructor(deps: VoiceDeps, emit: (view: VoiceView) => void)`;
    - arrow-property methods, stable for React: `view`, `configure(config)`, `micPress()`, `stop()`, `tick()`, `visibility(hidden)`, `onReply(reply, via)`, `clearError()`, `dispose()`.

- [ ] **Step 1: Write the failing tests**

`lib/voice/engine.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import {
	LISTENING_STOPPED,
	MIC_BLOCKED,
	MicError,
	VoiceEngine,
	WORD_TIMING_WAIT_MS,
	type HearHooks,
	type SayHooks,
	type VoiceConfig,
	type VoiceDeps,
	type VoiceView,
} from "./engine";
import type { SendOptions } from "./guest";
import { FOLLOW_UP_MS } from "./machine";
import { SampleRing } from "./ring";
import { MODEL_ID } from "./voiceprint";
import { WAKE } from "./wake";

type FakeMic = { ring: SampleRing; closed: boolean; onAudio: (s: Int16Array) => void; close(): void };

function harness(over: Partial<VoiceConfig> = {}, options: { micFailure?: MicError } = {}) {
	let now = 1000;
	let embedding = [1, 0];
	let wake: (() => void) | null = null;
	const timers: { at: number; run: () => void; live: boolean }[] = [];
	const mics: FakeMic[] = [];
	const fed: number[] = [];
	const embedded: number[] = [];
	const hearings: { hooks: HearHooks; aborted: boolean }[] = [];
	const said: { text: string; hooks: SayHooks; cancelled: boolean }[] = [];
	const sent: { text: string; options: SendOptions }[] = [];
	const chimes = { count: 0 };
	const deps: VoiceDeps = {
		now: () => now,
		later: (run, ms) => {
			const timer = { at: now + ms, run, live: true };
			timers.push(timer);
			return () => {
				timer.live = false;
			};
		},
		openMic: async (onAudio) => {
			if (options.micFailure) throw options.micFailure;
			const mic: FakeMic = {
				ring: new SampleRing(16000 * 12),
				closed: false,
				onAudio,
				close() {
					mic.closed = true;
				},
			};
			mics.push(mic);
			return mic;
		},
		createDetector: async (onWake) => {
			wake = onWake;
			return { feed: (samples) => fed.push(samples.length) };
		},
		hear: async (hooks) => {
			const hearing = { hooks, aborted: false };
			hearings.push(hearing);
			return { stop() {}, abort: () => void (hearing.aborted = true) };
		},
		embed: async (samples) => {
			embedded.push(samples.length);
			return embedding;
		},
		say: (text, hooks) => {
			const line = { text, hooks, cancelled: false };
			said.push(line);
			return {
				cancel() {
					line.cancelled = true;
					hooks.onEnd();
				},
			};
		},
		chime: () => void chimes.count++,
	};
	const views: VoiceView[] = [];
	const engine = new VoiceEngine(deps, (view) => views.push(view));
	const speech = { onSpeechStart: vi.fn(), onNoWordTiming: vi.fn(), onWord: vi.fn(), onSpeechEnd: vi.fn() };
	const config: VoiceConfig = {
		listen: true,
		wakeReady: true,
		prints: [{ model: MODEL_ID, embedding: [1, 0] }],
		canSpeak: true,
		speakTyped: false,
		sendText: (text, sendOptions) => {
			sent.push({ text, options: sendOptions });
			return true;
		},
		speech,
		listenOff: vi.fn(),
		needTeaching: vi.fn(),
		...over,
	};
	engine.configure(config);
	return {
		engine,
		config,
		mics,
		fed,
		embedded,
		hearings,
		said,
		sent,
		chimes,
		speech,
		mode: () => engine.view().state.mode,
		flush: () => new Promise((resolve) => setTimeout(resolve, 0)),
		advance(ms: number) {
			now += ms;
			for (const t of timers) if (t.live && t.at <= now) {
				t.live = false;
				t.run();
			}
			engine.tick();
		},
		// Speech-like audio into the newest microphone: a steady tone, loud enough to count as speech.
		talk(samples = 32000) {
			const mic = mics.at(-1)!;
			const pcm = Int16Array.from({ length: samples }, (_, i) => Math.round(Math.sin(i / 5) * 8000));
			mic.ring.push(pcm);
			mic.onAudio(pcm);
		},
		wake: () => wake?.(),
		setEmbedding(next: number[]) {
			embedding = next;
		},
	};
}

// Wake, say something, and wait for it to be judged and sent.
async function converse(h: ReturnType<typeof harness>, text: string, samples = 32000) {
	h.wake();
	await h.flush();
	h.talk(samples);
	const hear = h.hearings.at(-1)!.hooks;
	hear.onSpeech();
	hear.onText(text);
	hear.onDone(text);
	await h.flush();
}

// Finish speaking a voice reply and let the follow-up microphone open.
async function replyAndFollowUp(h: ReturnType<typeof harness>, reply = "Of course.") {
	h.engine.onReply(reply, "voice");
	h.said.at(-1)!.hooks.onEnd();
	await h.flush();
}

describe("VoiceEngine", () => {
	it("opens the microphone and the detector when listening is on, and feeds audio only while asleep", async () => {
		const h = harness();
		await h.flush();
		expect(h.mode()).toBe("sleeping");
		expect(h.mics).toHaveLength(1);
		h.talk(1280);
		expect(h.fed).toEqual([1280]);
	});

	it("wakes, hears Gur, recognizes him and sends his message", async () => {
		const h = harness();
		await h.flush();
		await converse(h, "Osmo, what's the time");
		expect(h.chimes.count).toBe(1);
		expect(h.sent).toEqual([{ text: "what's the time", options: { via: "voice", speaker: "you", greet: false } }]);
		expect(h.mode()).toBe("thinking");
		expect(h.mics[0].closed).toBe(true);
	});

	it("judges the wake word's audio together with the message", async () => {
		const h = harness();
		await h.flush();
		h.talk(48000);
		h.wake();
		await h.flush();
		h.talk(16000);
		const hear = h.hearings[0].hooks;
		hear.onSpeech();
		hear.onDone("hello");
		await h.flush();
		expect(h.embedded[0]).toBe(32000);
	});

	it("greets a guest once per conversation and tells the room who spoke", async () => {
		const h = harness();
		await h.flush();
		h.setEmbedding([0, 1]);
		await converse(h, "Osmo, who are you");
		await replyAndFollowUp(h);
		h.talk(32000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("and what can you do");
		await h.flush();
		expect(h.sent.map((s) => s.options)).toEqual([
			{ via: "voice", speaker: "guest", greet: true },
			{ via: "voice", speaker: "guest", greet: false },
		]);
	});

	it("speaks a spoken conversation's reply, passes word timing to the room, then listens for a follow-up without a chime", async () => {
		const h = harness();
		await h.flush();
		await converse(h, "Osmo, hello");
		h.engine.onReply("Good evening.", "voice");
		expect(h.mode()).toBe("speaking");
		expect(h.said[0].text).toBe("Good evening.");
		expect(h.speech.onSpeechStart).toHaveBeenCalled();
		h.said[0].hooks.onWord(0, 4);
		expect(h.speech.onWord).toHaveBeenCalledWith(4);
		h.said[0].hooks.onEnd();
		expect(h.speech.onSpeechEnd).toHaveBeenCalled();
		expect(h.mode()).toBe("followup");
		await h.flush();
		expect(h.mics).toHaveLength(2);
		expect(h.hearings).toHaveLength(2);
		expect(h.chimes.count).toBe(1);
		h.advance(FOLLOW_UP_MS);
		expect(h.mode()).toBe("sleeping");
		expect(h.hearings[1].aborted).toBe(true);
	});

	it("types the reply at speaking pace when the device gives no word timing", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("Hello there.", "typed");
		h.advance(WORD_TIMING_WAIT_MS);
		expect(h.speech.onNoWordTiming).toHaveBeenCalledTimes(1);
		const timed = harness({ speakTyped: true });
		await timed.flush();
		timed.engine.onReply("Hello there.", "typed");
		timed.said[0].hooks.onWord(0, 5);
		timed.advance(WORD_TIMING_WAIT_MS);
		expect(timed.speech.onNoWordTiming).not.toHaveBeenCalled();
	});

	it("goes back to sleep silently after a wake-up with nothing said", async () => {
		const h = harness();
		await h.flush();
		h.wake();
		await h.flush();
		h.advance(WAKE.noSpeechMs);
		expect(h.mode()).toBe("sleeping");
		expect(h.sent).toEqual([]);
		expect(h.hearings[0].aborted).toBe(true);
	});

	it("sends nothing when only the wake word was heard", async () => {
		const h = harness();
		await h.flush();
		await converse(h, "Osmo");
		expect(h.sent).toEqual([]);
		expect(h.mode()).toBe("sleeping");
	});

	it("goes back to sleep when the room refuses the message", async () => {
		const h = harness({ sendText: () => false });
		await h.flush();
		await converse(h, "Osmo, hi");
		expect(h.mode()).toBe("sleeping");
	});

	it("speaks typed replies only when asked to, with no follow-up after", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("Hello.", "typed");
		expect(h.mode()).toBe("speaking");
		h.said[0].hooks.onEnd();
		expect(h.mode()).toBe("sleeping");
		expect(h.hearings).toHaveLength(0);
		const quiet = harness();
		await quiet.flush();
		quiet.engine.onReply("Hello.", "typed");
		expect(quiet.said).toHaveLength(0);
	});

	it("listens for a follow-up straight away when the device has no voice", async () => {
		const h = harness({ canSpeak: false });
		await h.flush();
		await converse(h, "Osmo, hello");
		h.engine.onReply("Good evening.", "voice");
		expect(h.said).toHaveLength(0);
		expect(h.mode()).toBe("followup");
	});

	it("turns listening off with a clear message when the microphone is blocked", async () => {
		const h = harness({}, { micFailure: new MicError("blocked") });
		await h.flush();
		expect(h.engine.view().error).toBe(MIC_BLOCKED);
		expect(h.config.listenOff).toHaveBeenCalled();
		expect(h.mode()).toBe("off");
	});

	it("restarts the recognizer quietly, and stops after three failures in a row", async () => {
		const h = harness();
		await h.flush();
		h.wake();
		await h.flush();
		h.hearings[0].hooks.onProblem("network");
		expect(h.hearings).toHaveLength(2);
		expect(h.engine.view().error).toBeNull();
		h.hearings[1].hooks.onProblem("network");
		h.hearings[2].hooks.onProblem("network");
		expect(h.engine.view().error).toBe(LISTENING_STOPPED);
		expect(h.mode()).toBe("sleeping");
	});

	it("gives the recognizer the microphone to itself when it needs it, judging the wake word's audio", async () => {
		const h = harness();
		await h.flush();
		h.talk(16000);
		h.wake();
		await h.flush();
		h.hearings[0].hooks.onProblem("audio");
		expect(h.mics[0].closed).toBe(true);
		expect(h.hearings).toHaveLength(2);
		h.hearings[1].hooks.onSpeech();
		h.hearings[1].hooks.onDone("what's up");
		await h.flush();
		expect(h.embedded[0]).toBe(16000);
		expect(h.sent[0].options.speaker).toBe("you");
	});

	it("closes everything while the page is hidden, and listens again when it's back", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("Hello.", "typed");
		h.engine.visibility(true);
		expect(h.said[0].cancelled).toBe(true);
		expect(h.speech.onSpeechEnd).toHaveBeenCalled();
		expect(h.mode()).toBe("paused");
		h.engine.visibility(false);
		await h.flush();
		expect(h.mode()).toBe("sleeping");
		expect(h.mics.at(-1)!.closed).toBe(false);
	});

	it("stops speaking when asked and reveals the whole reply", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("A long answer.", "typed");
		h.engine.stop();
		expect(h.said[0].cancelled).toBe(true);
		expect(h.speech.onSpeechEnd).toHaveBeenCalled();
		expect(h.mode()).toBe("sleeping");
	});

	it("keeps a short follow-up Gur's, but judges a full sentence again", async () => {
		const h = harness();
		await h.flush();
		await converse(h, "Osmo, hello");
		await replyAndFollowUp(h);
		h.setEmbedding([0, 1]);
		h.talk(16000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("yes");
		await h.flush();
		expect(h.sent[1].options.speaker).toBe("you");
		await replyAndFollowUp(h);
		h.talk(32000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("tell me what he said about work");
		await h.flush();
		expect(h.sent[2].options).toEqual({ via: "voice", speaker: "guest", greet: true });
	});

	it("asks for teaching when the mic is pressed before Osmo knows Gur's voice", async () => {
		const h = harness({ listen: false, prints: [] });
		await h.flush();
		h.engine.micPress();
		expect(h.config.needTeaching).toHaveBeenCalledWith("mic");
		expect(h.hearings).toHaveLength(0);
	});

	it("starts a conversation from the mic button with listening off, and closes the microphone after", async () => {
		const h = harness({ listen: false });
		await h.flush();
		expect(h.mics).toHaveLength(0);
		h.engine.micPress();
		await h.flush();
		expect(h.mode()).toBe("awake");
		expect(h.hearings).toHaveLength(1);
		expect(h.mics).toHaveLength(1);
		h.advance(WAKE.noSpeechMs);
		expect(h.mode()).toBe("off");
		expect(h.mics[0].closed).toBe(true);
	});

	it("ignores a wake while he is speaking", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("Hello, I'm Osmo.", "typed");
		h.wake();
		expect(h.chimes.count).toBe(0);
		expect(h.mode()).toBe("speaking");
	});

	it("listening needs a taught voice", async () => {
		const h = harness({ prints: [] });
		await h.flush();
		expect(h.config.listenOff).toHaveBeenCalled();
		expect(h.mode()).toBe("off");
		expect(h.mics).toHaveLength(0);
	});

	it("forgetting the voice turns listening off", async () => {
		const h = harness();
		await h.flush();
		h.engine.configure({ ...h.config, prints: [] });
		expect(h.config.listenOff).toHaveBeenCalled();
		expect(h.mode()).toBe("off");
		expect(h.mics[0].closed).toBe(true);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/voice/engine.test.ts`
Expected: FAIL with "Failed to resolve import './engine'".

- [ ] **Step 3: Write `lib/voice/engine.ts`**

```ts
// Osmo's listening and speaking, wired together: the machine (./machine.ts) decides what should happen,
// and this carries it out. The browser's pieces arrive as VoiceDeps, so tests run it with fakes
// and a laptop or phone app can swap in native ones.

import type { SendOptions, Speaker, Via } from "./guest";
import { speechSeconds, trimSilence } from "./levels";
import { detectorOn, initialVoice, micOpen, recognizerOn, step, type VoiceEvent, type VoiceState } from "./machine";
import type { SampleRing } from "./ring";
import { messageFrom } from "./utterance";
import { bestScore, judge, type Voiceprint } from "./voiceprint";

export const MIC_BLOCKED = "I can't hear you. Allow the microphone for this site in your browser settings, then try again.";
export const NO_MIC = "I can't find a microphone on this device.";
export const MODEL_FAILED = "I couldn't load what I need to listen. Check your connection and try again.";
export const LISTENING_STOPPED = "Listening stopped. Tap the mic to start again.";

// The second of audio before the detector fired holds "Osmo" itself; it's judged together with the message.
export const WAKE_AUDIO_SAMPLES = 16000;
// Recognizer failures in a row before listening gives up.
export const MAX_FAILURES = 3;
// How long to wait for word timing before his text types out at speaking pace instead.
export const WORD_TIMING_WAIT_MS = 800;
// The speaker model needs at least one 25 ms frame.
const MIN_EMBED_SAMPLES = 400;

export class MicError extends Error {
	readonly problem: "blocked" | "unavailable";

	constructor(problem: "blocked" | "unavailable") {
		super(`Microphone ${problem}`);
		this.problem = problem;
	}
}

export type HearProblem = "blocked" | "audio" | "network" | "other";
export type HearHooks = {
	onSpeech(): void;
	onText(text: string): void;
	// The whole transcript once the recognizer ends ("" when nothing was said). Not called after a problem or abort.
	onDone(text: string): void;
	onProblem(problem: HearProblem): void;
};
export type Hearing = { stop(): void; abort(): void };
export type MicHandle = { readonly ring: SampleRing; close(): void };
export type Detector = { feed(samples: Int16Array): void };
export type SayHooks = { onWord(start: number, end: number): void; onEnd(): void };
export type Spoken = { cancel(): void };

export type VoiceDeps = {
	now(): number;
	// Runs `run` after `ms`; returns a cancel.
	later(run: () => void, ms: number): () => void;
	openMic(onAudio: (samples: Int16Array) => void): Promise<MicHandle>;
	createDetector(onWake: () => void): Promise<Detector>;
	hear(hooks: HearHooks): Promise<Hearing>;
	// A voice embedding for 16 kHz samples on the -1..1 scale.
	embed(samples: Float32Array): Promise<number[]>;
	say(text: string, hooks: SayHooks): Spoken;
	chime(): void;
};

// How the room shows his speech.
export type SpeechHooks = {
	onSpeechStart(): void;
	onNoWordTiming(): void;
	onWord(end: number): void;
	onSpeechEnd(): void;
};
export type SendText = (text: string, options: SendOptions) => boolean;

export type VoiceConfig = {
	// "Listen for 'Osmo'" is on (and the voiceprints have loaded).
	listen: boolean;
	// The trained "osmo" detector exists.
	wakeReady: boolean;
	// Gur's voiceprints; empty means Osmo hasn't been taught his voice.
	prints: Voiceprint[];
	// The device has a voice to speak with.
	canSpeak: boolean;
	speakTyped: boolean;
	sendText: SendText;
	speech: SpeechHooks;
	// Switch "Listen for 'Osmo'" off (it lives in the device settings).
	listenOff(): void;
	// Open Settings at "Teach Osmo my voice".
	needTeaching(reason: "mic"): void;
};

export type VoiceView = { state: VoiceState; liveText: string | null; error: string | null };

export class VoiceEngine {
	private readonly deps: VoiceDeps;
	private readonly emit: (view: VoiceView) => void;
	private state: VoiceState;
	private config: VoiceConfig | null = null;
	private mic: MicHandle | null = null;
	private micOpening = false;
	// The newest microphone's recent audio, kept after it closes so the voice check can still read it.
	private ring: SampleRing | null = null;
	private detector: Detector | null = null;
	private detectorLoading = false;
	private hearing: Hearing | null = null;
	// Bumped whenever the recognizer is stopped or replaced, so its late callbacks are ignored.
	private hearingId = 0;
	// Where the current message's audio starts in `ring`.
	private mark = 0;
	private failures = 0;
	// Safari may not share the microphone with its recognizer; then the detector's stream closes while it listens.
	private exclusive = false;
	private hidden = false;
	private spoken: Spoken | null = null;
	private speakingNow: object | null = null;
	private liveText: string | null = null;
	private error: string | null = null;

	constructor(deps: VoiceDeps, emit: (view: VoiceView) => void) {
		this.deps = deps;
		this.emit = emit;
		this.state = initialVoice(deps.now());
	}

	readonly view = (): VoiceView => ({ state: this.state, liveText: this.liveText, error: this.error });

	readonly configure = (config: VoiceConfig): void => {
		this.config = config;
		const want = config.listen && config.wakeReady;
		if (want && config.prints.length === 0) {
			// Listening needs a taught voice, so the second check always runs while the microphone is on.
			config.listenOff();
			if (this.state.listening) this.send({ type: "listen", on: false, now: this.deps.now() });
			return;
		}
		if (want !== this.state.listening) this.send({ type: "listen", on: want, now: this.deps.now() });
		if (want && !this.detector && !this.detectorLoading) void this.loadDetector();
	};

	readonly micPress = (): void => {
		const config = this.config;
		if (!config) return;
		if (config.prints.length === 0) {
			config.needTeaching("mic");
			return;
		}
		this.error = null;
		const before = this.state;
		const next = this.send({ type: "mic", now: this.deps.now() });
		if (next.mode === "awake" && before.mode !== "awake") this.startHearing(this.markNow());
		else this.publish();
	};

	readonly stop = (): void => {
		this.send({ type: "stop", now: this.deps.now() });
	};

	readonly tick = (): void => {
		this.send({ type: "tick", now: this.deps.now() });
	};

	readonly visibility = (hidden: boolean): void => {
		this.hidden = hidden;
		this.send({ type: hidden ? "hidden" : "visible", now: this.deps.now() });
	};

	readonly onReply = (reply: string, via: Via): void => {
		const config = this.config;
		if (!config) return;
		const wanted = (via === "voice" || config.speakTyped) && config.canSpeak;
		const before = this.state;
		const next = this.send({ type: "reply", via, spoken: wanted, now: this.deps.now() });
		// A new typed reply replaces one he is still saying.
		const replacing = before.mode === "speaking" && next.mode === "speaking" && via === "typed" && wanted;
		if ((next.mode === "speaking" && before.mode !== "speaking") || replacing) this.speak(reply);
	};

	readonly clearError = (): void => {
		if (this.error === null) return;
		this.error = null;
		this.publish();
	};

	// Closes everything and starts over as "off"; the next configure reopens what's needed.
	readonly dispose = (): void => {
		this.stopHearing();
		this.mic?.close();
		this.mic = null;
		const spoken = this.spoken;
		this.spoken = null;
		spoken?.cancel();
		this.detector = null;
		this.state = initialVoice(this.deps.now());
	};

	private send(event: VoiceEvent): VoiceState {
		const before = this.state;
		const next = step(before, event);
		if (next === before) return before;
		this.state = next;
		this.sync(before, next);
		this.publish();
		return next;
	}

	private publish(): void {
		this.emit(this.view());
	}

	private wantsMic(state: VoiceState): boolean {
		if (this.hidden) return false;
		return this.exclusive ? detectorOn(state) : micOpen(state);
	}

	// Opens and closes what each mode needs.
	private sync(before: VoiceState, next: VoiceState): void {
		if (this.wantsMic(next)) {
			if (!this.mic && !this.micOpening) void this.openMic();
		} else if (this.mic) {
			this.mic.close();
			this.mic = null;
		}
		if (recognizerOn(before) && !recognizerOn(next)) this.stopHearing();
		if (before.mode === "speaking" && next.mode !== "speaking" && this.spoken) {
			const spoken = this.spoken;
			this.spoken = null;
			spoken.cancel();
		}
		if (next.mode === "followup" && before.mode !== "followup") this.startHearing(this.markNow());
	}

	private async openMic(): Promise<void> {
		this.micOpening = true;
		try {
			const mic = await this.deps.openMic((samples) => {
				if (detectorOn(this.state) && !this.hidden) this.detector?.feed(samples);
			});
			this.micOpening = false;
			if (!this.wantsMic(this.state) || this.mic) {
				mic.close();
				return;
			}
			this.mic = mic;
			this.ring = mic.ring;
		} catch (error) {
			this.micOpening = false;
			this.fail(error instanceof MicError && error.problem === "blocked" ? MIC_BLOCKED : NO_MIC);
		}
	}

	private async loadDetector(): Promise<void> {
		this.detectorLoading = true;
		try {
			this.detector = await this.deps.createDetector(() => this.onWake());
		} catch {
			this.fail(MODEL_FAILED);
		} finally {
			this.detectorLoading = false;
		}
	}

	private onWake(): void {
		if (this.state.mode !== "sleeping" || this.hidden) return;
		this.deps.chime();
		const mark = this.mic ? Math.max(0, this.mic.ring.total - WAKE_AUDIO_SAMPLES) : 0;
		this.send({ type: "wake", now: this.deps.now() });
		this.startHearing(mark);
	}

	// Where the next message's audio starts: now on the open microphone, or at the start of the next one.
	private markNow(): number {
		if (this.mic) return this.mic.ring.total;
		return this.exclusive && this.ring ? this.ring.total : 0;
	}

	private startHearing(mark: number): void {
		this.stopHearing();
		this.mark = mark;
		this.liveText = "";
		const id = this.hearingId;
		void this.deps
			.hear({
				onSpeech: () => {
					if (id === this.hearingId) this.send({ type: "speech", now: this.deps.now() });
				},
				onText: (text) => {
					if (id !== this.hearingId) return;
					this.liveText = messageFrom(text);
					this.publish();
				},
				onDone: (text) => {
					void this.finish(id, text);
				},
				onProblem: (problem) => this.heardProblem(id, problem),
			})
			.then((hearing) => {
				if (id === this.hearingId) this.hearing = hearing;
				else hearing.abort();
			})
			.catch(() => this.heardProblem(id, "other"));
		this.publish();
	}

	private stopHearing(): void {
		this.hearingId += 1;
		this.hearing?.abort();
		this.hearing = null;
		this.liveText = null;
	}

	private async finish(id: number, text: string): Promise<void> {
		if (id !== this.hearingId) return;
		this.hearing = null;
		this.liveText = null;
		const message = messageFrom(text);
		if (!message) {
			this.send({ type: "dropped", now: this.deps.now() });
			this.publish();
			return;
		}
		this.failures = 0;
		if (this.state.mode === "followup") this.send({ type: "speech", now: this.deps.now() });
		const speaker = await this.whoSpoke();
		if (id !== this.hearingId || this.state.mode !== "awake") return;
		this.send({ type: "judged", speaker });
		const greet = speaker === "guest" && !this.state.greeted;
		if (greet) this.send({ type: "greeted" });
		const accepted = this.config?.sendText(message, { via: "voice", speaker, greet }) ?? false;
		this.send({ type: accepted ? "sent" : "dropped", now: this.deps.now() });
	}

	private async whoSpoke(): Promise<Speaker> {
		const pcm = this.ring ? this.ring.since(this.mark) : new Int16Array(0);
		const audio = trimSilence(Float32Array.from(pcm, (sample) => sample / 32768));
		let score = -1;
		if (audio.length >= MIN_EMBED_SAMPLES) {
			try {
				score = bestScore(await this.deps.embed(audio), this.config?.prints ?? []);
			} catch {
				// Unsure counts as someone else.
			}
		}
		return judge({ score, speechSeconds: speechSeconds(audio), ownerSoFar: this.state.owner });
	}

	private heardProblem(id: number, problem: HearProblem): void {
		if (id !== this.hearingId) return;
		this.hearing = null;
		if (problem === "blocked") {
			this.fail(MIC_BLOCKED);
			return;
		}
		if (problem === "audio" && !this.exclusive) {
			this.exclusive = true;
			this.mic?.close();
			this.mic = null;
			this.startHearing(this.mark);
			return;
		}
		this.failures += 1;
		if (this.failures >= MAX_FAILURES) {
			this.failures = 0;
			this.error = LISTENING_STOPPED;
			this.send({ type: "dropped", now: this.deps.now() });
			this.publish();
			return;
		}
		if (recognizerOn(this.state)) this.startHearing(this.mark);
	}

	private fail(message: string): void {
		this.error = message;
		this.config?.listenOff();
		this.send({ type: "listen", on: false, now: this.deps.now() });
		this.publish();
	}

	private speak(text: string): void {
		const speech = this.config?.speech;
		if (!speech) return;
		const token = {};
		this.speakingNow = token;
		let timed = false;
		speech.onSpeechStart();
		const cancelWait = this.deps.later(() => {
			if (this.speakingNow === token && !timed) speech.onNoWordTiming();
		}, WORD_TIMING_WAIT_MS);
		let spoken: Spoken | null = null;
		spoken = this.deps.say(text, {
			onWord: (_start, end) => {
				if (this.speakingNow !== token) return;
				timed = true;
				speech.onWord(end);
			},
			onEnd: () => {
				if (this.speakingNow !== token) return;
				this.speakingNow = null;
				cancelWait();
				speech.onSpeechEnd();
				if (spoken && this.spoken === spoken) {
					this.spoken = null;
					this.send({ type: "spoken", now: this.deps.now() });
				}
			},
		});
		this.spoken = spoken;
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/voice/engine.test.ts`
Expected: PASS. If a test fails, fix `engine.ts`, not the test, unless the test contradicts the spec. Report any such contradiction.

- [ ] **Step 5: Run the full suite and type check**

Run: `npx vitest run` and `npx tsc --noEmit -p .`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/voice/engine.ts lib/voice/engine.test.ts
git commit -m "feat: the voice engine that carries out the conversation machine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Models, runtime files and the voice check

**Files:**
- Modify: `package.json` (dependency and scripts), `.gitignore`, `.gitattributes`
- Create:
  - `scripts/copy-ort.mjs`
  - `scripts/voice-clips.ps1`
  - `vitest.voice.config.mts`
  - `scripts/voice-check.test.ts`
  - `docs/osmo-voice-models.md`
- Create (binary, downloaded):
  - `public/models/speaker/campplus-en.onnx`
  - `public/models/wake/melspectrogram.onnx`
  - `public/models/wake/embedding_model.onnx`

**Interfaces:**
- Consumes: `readWav` (Task 4), `embedVoice` (Task 4), `averagePrint`/`cosine`/`MATCH_THRESHOLD` (Task 3), `WakeStream` (Task 5), `wakeModels` (Task 5), `WAKE` (Task 5).
- Produces:
  - the `onnxruntime-web@1.30.0` dependency;
  - `/ort/ort.wasm.min.mjs`, `/ort/ort-wasm-simd-threaded.mjs` and `/ort/ort-wasm-simd-threaded.wasm`, served at dev and build time;
  - the model URLs `/models/speaker/campplus-en.onnx`, `/models/wake/melspectrogram.onnx` and `/models/wake/embedding_model.onnx`;
  - the script `npm run voice:check`.

- [ ] **Step 1: Install the runtime (exact version)**

Run: `npm install --save-exact onnxruntime-web@1.30.0`
Expected: `package.json` dependencies gain `"onnxruntime-web": "1.30.0"`.

- [ ] **Step 2: Serve the runtime from Osmo's own site**

`scripts/copy-ort.mjs`:
```js
// Copies the ONNX runtime out of node_modules into public/ort, so Osmo's own site serves it (nothing third-party).
// Runs before `dev` and `build`; public/ort is git-ignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const from = join(process.cwd(), "node_modules", "onnxruntime-web", "dist");
const to = join(process.cwd(), "public", "ort");
mkdirSync(to, { recursive: true });
for (const file of ["ort.wasm.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
	copyFileSync(join(from, file), join(to, file));
}
```

In `package.json` `scripts`, change `dev` and `build`, and add `voice:check`:
```json
"dev": "node scripts/copy-ort.mjs && next dev",
"build": "node scripts/copy-ort.mjs && next build",
"voice:check": "vitest run --config vitest.voice.config.mts",
```

Append to `.gitignore`:
```
# ONNX runtime copied from node_modules at dev/build time
/public/ort/
# Speech clips made by scripts/voice-clips.ps1 for the voice check
/scripts/voice-clips/
```

Append to `.gitattributes`:
```
*.onnx binary
*.wasm binary
```

- [ ] **Step 3: Download the three model files**

Run (from `my-app`):
```bash
mkdir -p public/models/speaker public/models/wake
curl -L -o public/models/speaker/campplus-en.onnx https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx
curl -L -o public/models/wake/melspectrogram.onnx https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/melspectrogram.onnx
curl -L -o public/models/wake/embedding_model.onnx https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/embedding_model.onnx
ls -l public/models/speaker public/models/wake
```
Expected sizes: 29596978, about 1.09 MB and about 1.33 MB bytes.

- [ ] **Step 4: Write the clip script**

`scripts/voice-clips.ps1`:
```powershell
# Makes the speech clips the voice check uses, with this PC's own Windows voices, and downloads openWakeWord's
# "hey jarvis" model to stand in for the "osmo" detector until Gur trains it. Output: scripts/voice-clips/ (git-ignored).
# Run from my-app: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/voice-clips.ps1
$ErrorActionPreference = "Stop"
$out = Join-Path $PSScriptRoot "voice-clips"
New-Item -ItemType Directory -Force $out | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
	$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($operation, [Type]$type) { $asTask.MakeGenericMethod($type).Invoke($null, @($operation)).Result }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
function Say([string]$voice, [string]$text, [string]$file) {
	$synth.Voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq "Microsoft $voice" } | Select-Object -First 1
	if (-not $synth.Voice) { throw "The voice Microsoft $voice is not installed" }
	$stream = Await ($synth.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
	$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
	$null = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
	$bytes = New-Object byte[] $stream.Size
	$reader.ReadBytes($bytes)
	[IO.File]::WriteAllBytes((Join-Path $out $file), $bytes)
}

$sentences = @(
	"The morning light came through the kitchen window while the kettle slowly began to boil.",
	"I would like to hear about the weather this weekend, and whether it will rain on Saturday.",
	"Please remind me to call my sister after lunch, because I promised to help her move.",
	"Numbers like forty two and seventeen are easy to say, but hard to remember later.",
	"Osmo, what do you think about the book I was reading yesterday evening?"
)
foreach ($voice in "David", "Mark", "Zira") {
	for ($i = 0; $i -lt $sentences.Count; $i++) { Say $voice $sentences[$i] "$voice-$($i + 1).wav" }
	Say $voice "Osmo." "$voice-osmo.wav"
}
Say "Mark" "Hey Jarvis. What time is it?" "hey-jarvis.wav"
Say "Mark" "Hey Travis. What time is it?" "hey-travis.wav"
Invoke-WebRequest -UseBasicParsing "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/hey_jarvis_v0.1.onnx" -OutFile (Join-Path $out "hey_jarvis_v0.1.onnx")
Write-Output "Clips written to $out"
```

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/voice-clips.ps1`
Expected: `Clips written to …\scripts\voice-clips`, and 20 `.wav` files plus `hey_jarvis_v0.1.onnx` in that folder.

- [ ] **Step 5: Write the voice check**

`vitest.voice.config.mts`:
```ts
import { defineConfig } from "vitest/config";

// The voice check runs the real models on clips from scripts/voice-clips.ps1. Kept out of the normal suite.
export default defineConfig({
	test: { include: ["scripts/voice-check.test.ts"], environment: "node", testTimeout: 180_000 },
});
```

`scripts/voice-check.test.ts`:
```ts
// Runs Osmo's real models on the Windows-voice clips (scripts/voice-clips.ps1): the speaker model must tell
// the voices apart fast enough, and the wake-word pipeline must fire on its phrase and nothing else.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-web";
import { beforeAll, describe, expect, it } from "vitest";
import { embedVoice } from "../lib/voice/speaker";
import { averagePrint, cosine, MATCH_THRESHOLD } from "../lib/voice/voiceprint";
import { WAKE } from "../lib/voice/wake";
import { wakeModels } from "../lib/voice/wake-models";
import { WakeStream } from "../lib/voice/wake-stream";
import { readWav } from "../lib/voice/wav";

ort.env.wasm.numThreads = 1;
const ROOT = process.cwd();
const CLIPS = join(ROOT, "scripts", "voice-clips");
const VOICES = ["David", "Mark", "Zira"];

const clip = (name: string) => {
	const { rate, samples } = readWav(new Uint8Array(readFileSync(join(CLIPS, `${name}.wav`))));
	if (rate !== 16000) throw new Error(`${name}.wav is ${rate} Hz, not 16000`);
	return samples;
};
const float = (samples: Int16Array) => Float32Array.from(samples, (s) => s / 32768);
const session = (path: string) => ort.InferenceSession.create(new Uint8Array(readFileSync(join(ROOT, path))));

beforeAll(() => {
	if (!existsSync(join(CLIPS, "David-1.wav"))) {
		throw new Error("No clips yet. Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/voice-clips.ps1");
	}
});

describe("speaker model (3D-Speaker CAM++)", () => {
	it("scores the same voice far above different voices, fast enough to judge every message", async () => {
		const speaker = await session("public/models/speaker/campplus-en.onnx");
		const embeddings: Record<string, number[]> = {};
		const times: number[] = [];
		for (const voice of VOICES) {
			for (const n of [1, 2, 3, 4, 5]) {
				const started = performance.now();
				embeddings[`${voice}-${n}`] = await embedVoice(ort, speaker, float(clip(`${voice}-${n}`)));
				times.push(performance.now() - started);
			}
		}
		const table = VOICES.map((voice) => {
			const print = averagePrint([1, 2, 3, 4].map((n) => embeddings[`${voice}-${n}`]));
			return Object.fromEntries(VOICES.map((other) => [other, Number(cosine(print, embeddings[`${other}-5`]).toFixed(2))]));
		});
		console.table(Object.fromEntries(VOICES.map((voice, i) => [`${voice}'s voiceprint`, table[i]])));
		times.sort((a, b) => a - b);
		console.log(`median judgement: ${times[Math.floor(times.length / 2)].toFixed(0)} ms`);
		VOICES.forEach((voice, i) =>
			VOICES.forEach((other) => {
				if (voice === other) expect(table[i][other]).toBeGreaterThan(0.8);
				else expect(table[i][other]).toBeLessThan(MATCH_THRESHOLD);
			}),
		);
		expect(times[Math.floor(times.length / 2)]).toBeLessThan(300);
	});
});

describe("wake word pipeline", () => {
	it("fires on its phrase and stays quiet on other speech", async () => {
		const trained = existsSync(join(ROOT, "public/models/wake/osmo.onnx"));
		const keywordPath = trained ? "public/models/wake/osmo.onnx" : "scripts/voice-clips/hey_jarvis_v0.1.onnx";
		const positives = trained ? ["David-osmo", "Mark-osmo", "Zira-osmo"] : ["hey-jarvis"];
		const negatives = trained ? ["David-2", "Mark-3", "Zira-4"] : ["hey-travis", "David-2"];
		const [mel, embed, keyword] = await Promise.all([
			session("public/models/wake/melspectrogram.onnx"),
			session("public/models/wake/embedding_model.onnx"),
			session(keywordPath),
		]);
		const best = async (name: string) => {
			const stream = new WakeStream(wakeModels(ort, { mel, embed, keyword }));
			const speech = clip(name);
			const padded = new Int16Array(16000 + speech.length + 16000);
			padded.set(speech, 16000);
			let top = 0;
			for (let at = 0; at < padded.length; at += 1000) {
				for (const score of await stream.push(padded.subarray(at, at + 1000))) top = Math.max(top, score);
			}
			return top;
		};
		for (const name of positives) {
			const score = await best(name);
			console.log(`${name}: ${score.toFixed(3)}`);
			expect(score).toBeGreaterThanOrEqual(WAKE.threshold);
		}
		for (const name of negatives) {
			const score = await best(name);
			console.log(`${name}: ${score.toFixed(3)}`);
			expect(score).toBeLessThan(0.5);
		}
	});
});
```

- [ ] **Step 6: Run the voice check**

Run: `npm run voice:check`
Expected: PASS.
- The table shows about 0.9 on the diagonal and below 0.5 elsewhere.
- The median judgement is under 300 ms.
- "hey-jarvis" scores above 0.9, and "hey-travis" and "David-2" score below 0.5.

If only the timing assertion fails, run it once more and report both runs' numbers.

- [ ] **Step 7: Check that the runtime copies and the site builds**

Run: `node scripts/copy-ort.mjs && ls public/ort` and then `npm run build`
Expected: the three `ort` files listed, and a successful build.

- [ ] **Step 8: Document the models**

`docs/osmo-voice-models.md`:
```markdown
# Osmo's voice models

Everything runs on the device, with `onnxruntime-web` 1.30.0 served from Osmo's own site (`public/ort`, copied from `node_modules` by `scripts/copy-ort.mjs`).

**`public/models/speaker/campplus-en.onnx`**
- Turns a voice into a voiceprint (512 numbers).
- Source: 3D-Speaker CAM++, `iic/speech_campplus_sv_en_voxceleb_16k`, as exported by sherpa-onnx: https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx
- License: Apache-2.0 (3D-Speaker).

**`public/models/wake/melspectrogram.onnx`**
- Turns audio into the detector's features.
- Source: openWakeWord v0.5.1 release.
- License: Apache-2.0.

**`public/models/wake/embedding_model.onnx`**
- Speech embeddings for the detector (Google's speech embedding).
- Source: openWakeWord v0.5.1 release.
- License: Apache-2.0.

**`public/models/wake/osmo.onnx`**
- Hears "Osmo".
- Source: trained by Gur with openWakeWord's notebook (`docs/osmo-wake-word.md`).
- License: Gur's.

openWakeWord's own pre-trained wake words (such as `hey_jarvis`, CC BY-NC-SA 4.0) are used only by the voice check, from the git-ignored `scripts/voice-clips/`. They are never served.

## The check

Speaker model input: 80-bin Kaldi-style fbank (`lib/voice/fbank.ts`) of 16 kHz samples on the -1..1 scale, with each bin's mean subtracted; tensor `x` is `[1, frames, 80]`. Output: `embedding`, `[1, 512]`.

Planning run on 2026-09-27, with the Windows voices David, Mark and Zira (a 4-reading voiceprint against a 5th reading):
- the same voice scored 0.92–0.93;
- different voices scored at most 0.38;
- each judgement took about 0.25 s.

`MATCH_THRESHOLD` (0.5) and `READING_AGREEMENT` (0.5) in `lib/voice/voiceprint.ts` start from these numbers. Tune them after real-voice checks.

To run it again:

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/voice-clips.ps1
    npm run voice:check

Once `public/models/wake/osmo.onnx` exists, the check tests it on "Osmo." in all three voices instead of the stand-in "hey jarvis".
```

- [ ] **Step 9: Run the full suite, type check and lint**

Run: `npx vitest run`, `npx tsc --noEmit -p .` and `npm run lint`
Expected: all pass, with 0 lint errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore .gitattributes scripts/copy-ort.mjs scripts/voice-clips.ps1 vitest.voice.config.mts scripts/voice-check.test.ts docs/osmo-voice-models.md public/models/speaker/campplus-en.onnx public/models/wake/melspectrogram.onnx public/models/wake/embedding_model.onnx
git commit -m "feat: on-device voice models, the served runtime, and a repeatable voice check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 11 (controller): Restart the dev server**

`npm run dev` now copies the runtime first. In the browser pane, run this with javascript_tool on the room's origin:
```js
const ort = await import("/ort/ort.wasm.min.mjs");
ort.env.wasm.wasmPaths = "/ort/";
ort.env.wasm.numThreads = 1;
const bytes = new Uint8Array(await (await fetch("/models/speaker/campplus-en.onnx")).arrayBuffer());
const s = await ort.InferenceSession.create(bytes);
[s.inputNames, s.outputNames];
```
Expected: `[["x"], ["embedding"]]`.

---

### Task 9: The browser's voice parts

**Files:**
- Create:
  - `public/voice/pcm-worklet.js`
  - `lib/voice/web/ort.ts`
  - `lib/voice/web/mic.ts`
  - `lib/voice/web/speaker-id.ts`
  - `lib/voice/web/transcriber.ts`
  - `lib/voice/web/wake-detector.ts`
  - `lib/voice/web/chime.ts`
  - `lib/voice/web/say.ts`
  - `lib/voice/web/settings-store.ts`
  - `lib/voice/web/voiceprints.ts`
  - `lib/voice/web/deps.ts`
- Database (controller): migration `add_voiceprints`

**Interfaces:**
- Consumes:
  - `VoiceDeps`, `MicHandle`, `Detector`, `Hearing`, `HearHooks`, `HearProblem`, `SayHooks`, `Spoken`, `MicError` from `lib/voice/engine.ts`;
  - `Downsampler`, `toInt16`, `SampleRing`, `embedVoice`, `WakeStream`, `WakeGate`, `wakeModels`, `heardEnough`, `pickVoice`, `VOICE_SETTINGS`, `wordEnd`, `parseVoiceSettings`, `DEFAULT_VOICE_SETTINGS`, `deviceLabel`, `MODEL_ID`, `Voiceprint`.
- Produces:
  - `loadOrt()`, `loadModel(url)`
  - `openMic(onAudio): Promise<MicHandle>`
  - `voiceEmbedding(samples: Float32Array): Promise<number[]>`
  - `canListen(): boolean`, `preferOnDevice(): Promise<boolean>`, `hear(hooks): Promise<Hearing>`
  - `WAKE_MODEL_URL`, `wakeWordTrained(): Promise<boolean>`, `createDetector(onWake): Promise<Detector>`
  - `chime(): void`
  - `speechAvailable()`, `chooseVoice(): Promise<SpeechSynthesisVoice | null>`, `chosenVoice()`, `unlockSpeech()`, `say(text, voice, hooks): Spoken`
  - `getVoiceSettings()`, `serverVoiceSettings()`, `subscribeVoiceSettings(listener)`, `setVoiceSettings(patch)`
  - `loadVoiceprints(): Promise<Voiceprint[] | null>`, `saveVoiceprint(embedding): Promise<boolean>`, `forgetVoiceprints(): Promise<boolean>`
  - `webVoiceDeps(): VoiceDeps`

These modules use browser APIs, so they have no unit tests. Their logic lives in the tested modules above. The gate here is the type check, lint, build and a browser load check.

- [ ] **Step 1 (controller): Apply migration `add_voiceprints`**

```sql
create table public.voiceprints (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	device text not null,
	model text not null,
	embedding real[] not null,
	created_at timestamptz not null default now()
);
alter table public.voiceprints enable row level security;
create policy "own voiceprints" on public.voiceprints for all to authenticated
	using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```

- [ ] **Step 2: Write the microphone parts**

`public/voice/pcm-worklet.js`:
```js
/* global AudioWorkletProcessor, registerProcessor */
// Hands the microphone's raw samples to the page in small batches. Its output stays silent.
class PcmTap extends AudioWorkletProcessor {
	process(inputs) {
		const channel = inputs[0] && inputs[0][0];
		if (channel) this.port.postMessage(channel.slice(0));
		return true;
	}
}
registerProcessor("pcm-tap", PcmTap);
```

`lib/voice/web/mic.ts`:
```ts
// The one microphone stream: 16 kHz mono int16 in small batches, with the last 12 seconds kept for the voice check.

import { MicError, type MicHandle } from "../engine";
import { Downsampler, toInt16 } from "../resample";
import { SampleRing } from "../ring";

export async function openMic(onAudio: (samples: Int16Array) => void): Promise<MicHandle> {
	if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
		throw new MicError("unavailable");
	}
	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({
			audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
		});
	} catch (error) {
		const name = error instanceof DOMException ? error.name : "";
		throw new MicError(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "unavailable");
	}
	const context = new AudioContext();
	try {
		await context.audioWorklet.addModule("/voice/pcm-worklet.js");
	} catch {
		stream.getTracks().forEach((track) => track.stop());
		void context.close();
		throw new MicError("unavailable");
	}
	const source = context.createMediaStreamSource(stream);
	const tap = new AudioWorkletNode(context, "pcm-tap");
	const down = new Downsampler(context.sampleRate);
	const ring = new SampleRing(16000 * 12);
	tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
		const samples = toInt16(down.push(event.data));
		ring.push(samples);
		onAudio(samples);
	};
	source.connect(tap);
	// The tap's output is silence; connecting it keeps the browser pulling audio through it.
	tap.connect(context.destination);
	if (context.state === "suspended") await context.resume().catch(() => undefined);
	return {
		ring,
		close() {
			tap.port.onmessage = null;
			source.disconnect();
			tap.disconnect();
			stream.getTracks().forEach((track) => track.stop());
			void context.close();
		},
	};
}
```

- [ ] **Step 3: Write the runtime and model loaders**

`lib/voice/web/ort.ts`:
```ts
// The ONNX runtime, served from Osmo's own site (public/ort, copied by scripts/copy-ort.mjs) and loaded at run time,
// never bundled. One thread, so the page needs no cross-origin isolation.

import type * as Ort from "onnxruntime-web";

const RUNTIME_URL = "/ort/ort.wasm.min.mjs";
let runtime: Promise<typeof Ort> | null = null;

export function loadOrt(): Promise<typeof Ort> {
	if (!runtime) {
		runtime = (async () => {
			const ort = (await import(/* webpackIgnore: true */ RUNTIME_URL)) as typeof Ort;
			ort.env.wasm.wasmPaths = "/ort/";
			ort.env.wasm.numThreads = 1;
			return ort;
		})();
		runtime.catch(() => {
			runtime = null;
		});
	}
	return runtime;
}

export async function loadModel(url: string): Promise<{ ort: typeof Ort; session: Ort.InferenceSession }> {
	const ort = await loadOrt();
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Couldn't load ${url} (${response.status})`);
	const session = await ort.InferenceSession.create(new Uint8Array(await response.arrayBuffer()));
	return { ort, session };
}
```

`lib/voice/web/speaker-id.ts`:
```ts
// Gur's voice, or not: the speaker model loads on first use and stays loaded.

import { embedVoice } from "../speaker";
import { loadModel } from "./ort";

export const SPEAKER_MODEL_URL = "/models/speaker/campplus-en.onnx";
let model: ReturnType<typeof loadModel> | null = null;

function speakerModel(): ReturnType<typeof loadModel> {
	if (!model) {
		model = loadModel(SPEAKER_MODEL_URL);
		model.catch(() => {
			model = null;
		});
	}
	return model;
}

// A voice embedding for 16 kHz samples on the -1..1 scale.
export async function voiceEmbedding(samples: Float32Array): Promise<number[]> {
	const { ort, session } = await speakerModel();
	return embedVoice(ort, session, samples);
}
```

`lib/voice/web/wake-detector.ts`:
```ts
// The "osmo" detector: openWakeWord's two feature models plus Gur's trained model, fed from the microphone.

import type { Detector } from "../engine";
import { WakeGate } from "../wake";
import { wakeModels } from "../wake-models";
import { WakeStream } from "../wake-stream";
import { loadModel } from "./ort";

export const WAKE_MODEL_URL = "/models/wake/osmo.onnx";

// The detector exists only once Gur has trained it (docs/osmo-wake-word.md).
export async function wakeWordTrained(): Promise<boolean> {
	try {
		return (await fetch(WAKE_MODEL_URL, { method: "HEAD" })).ok;
	} catch {
		return false;
	}
}

export async function createDetector(onWake: () => void): Promise<Detector> {
	const [mel, embed, keyword] = await Promise.all([
		loadModel("/models/wake/melspectrogram.onnx"),
		loadModel("/models/wake/embedding_model.onnx"),
		loadModel(WAKE_MODEL_URL),
	]);
	const stream = new WakeStream(wakeModels(mel.ort, { mel: mel.session, embed: embed.session, keyword: keyword.session }));
	const gate = new WakeGate();
	let queue: Promise<void> = Promise.resolve();
	return {
		feed(samples) {
			// One batch at a time, in order. A failed run is skipped rather than stopping the detector.
			queue = queue
				.then(async () => {
					for (const score of await stream.push(samples)) if (gate.feed(score, performance.now())) onWake();
				})
				.catch(() => undefined);
		},
	};
}
```

- [ ] **Step 4: Write the recognizer, chime and speaking voice**

`lib/voice/web/transcriber.ts`:
```ts
// Turning Gur's speech into text with the browser's own recognizer, on the device where Chrome can.
// TypeScript's DOM types don't include speech recognition yet, so the few parts used are typed here.

import type { HearHooks, Hearing } from "../engine";
import { heardEnough } from "../utterance";

type Alternative = { transcript: string };
type Result = { isFinal: boolean; length: number; [index: number]: Alternative };
type ResultEvent = { resultIndex: number; results: { length: number; [index: number]: Result } };
type Recognizer = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	processLocally?: boolean;
	onresult: ((event: ResultEvent) => void) | null;
	onspeechstart: (() => void) | null;
	onerror: ((event: { error: string }) => void) | null;
	onend: (() => void) | null;
	start(): void;
	stop(): void;
	abort(): void;
};
type Options = { langs: string[]; processLocally: boolean };
type RecognizerClass = {
	new (): Recognizer;
	available?(options: Options): Promise<string>;
	install?(options: Options): Promise<boolean>;
};

const LANG = "en-US";

function recognizerClass(): RecognizerClass | null {
	if (typeof window === "undefined") return null;
	const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Chrome, Edge and Safari can listen; Firefox can't.
export const canListen = (): boolean => recognizerClass() !== null;

let local: Promise<boolean> | null = null;

// Chrome can recognize English entirely on the device once its offline pack is installed; it installs it when it can.
export function preferOnDevice(): Promise<boolean> {
	if (!local) {
		local = (async () => {
			const R = recognizerClass();
			if (!R?.available) return false;
			try {
				const options = { langs: [LANG], processLocally: true };
				const status = await R.available(options);
				if (status === "available") return true;
				if ((status === "downloadable" || status === "downloading") && R.install) return await R.install(options);
			} catch {
				// Fall back to the browser's default recognizer.
			}
			return false;
		})();
	}
	return local;
}

export async function hear(hooks: HearHooks): Promise<Hearing> {
	const R = recognizerClass();
	if (!R) {
		hooks.onProblem("other");
		return { stop() {}, abort() {} };
	}
	const onDevice = await preferOnDevice();
	const recognizer = new R();
	recognizer.lang = LANG;
	recognizer.continuous = false;
	recognizer.interimResults = true;
	if (onDevice) recognizer.processLocally = true;

	let text = "";
	let lastChange: number | null = null;
	let spoke = false;
	let finished = false;
	let failed = false;
	const speech = () => {
		if (spoke) return;
		spoke = true;
		hooks.onSpeech();
	};
	const timer = setInterval(() => {
		if (heardEnough(lastChange, Date.now())) recognizer.stop();
	}, 200);

	recognizer.onspeechstart = speech;
	recognizer.onresult = (event) => {
		speech();
		let all = "";
		for (let i = 0; i < event.results.length; i++) all += event.results[i][0].transcript;
		if (all !== text) {
			text = all;
			lastChange = Date.now();
			hooks.onText(text);
		}
	};
	recognizer.onerror = (event) => {
		if (event.error === "no-speech" || event.error === "aborted") return;
		failed = true;
		hooks.onProblem(
			event.error === "not-allowed" || event.error === "service-not-allowed"
				? "blocked"
				: event.error === "audio-capture"
					? "audio"
					: event.error === "network"
						? "network"
						: "other",
		);
	};
	recognizer.onend = () => {
		clearInterval(timer);
		if (finished) return;
		finished = true;
		if (!failed) hooks.onDone(text.trim());
	};
	try {
		recognizer.start();
	} catch {
		clearInterval(timer);
		finished = true;
		hooks.onProblem("other");
	}
	return {
		stop: () => recognizer.stop(),
		abort: () => {
			finished = true;
			clearInterval(timer);
			recognizer.abort();
		},
	};
}
```

`lib/voice/web/chime.ts`:
```ts
// A soft two-note chime when he wakes, made with Web Audio so there's no sound file to load.

let context: AudioContext | null = null;

export function chime(): void {
	try {
		context ??= new AudioContext();
		const ctx = context;
		const start = ctx.currentTime;
		[660, 880].forEach((hz, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const at = start + i * 0.12;
			osc.type = "sine";
			osc.frequency.value = hz;
			gain.gain.setValueAtTime(0, at);
			gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
			osc.connect(gain).connect(ctx.destination);
			osc.start(at);
			osc.stop(at + 0.4);
		});
	} catch {
		// A missing chime never stops him listening.
	}
}
```

`lib/voice/web/say.ts`:
```ts
// Osmo's spoken voice: the device's speech synthesis, with word timing for the circle.

import type { SayHooks, Spoken } from "../engine";
import { pickVoice, VOICE_SETTINGS, wordEnd } from "../voices";

let chosen: SpeechSynthesisVoice | null = null;
let current: SpeechSynthesisUtterance | null = null;

export function speechAvailable(): boolean {
	return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Chrome fills the voice list asynchronously, so wait for it once (at most 1.5 s).
function voices(): Promise<SpeechSynthesisVoice[]> {
	const now = window.speechSynthesis.getVoices();
	if (now.length > 0) return Promise.resolve(now);
	return new Promise((resolve) => {
		const done = () => resolve(window.speechSynthesis.getVoices());
		window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
		setTimeout(done, 1500);
	});
}

export async function chooseVoice(): Promise<SpeechSynthesisVoice | null> {
	if (!speechAvailable()) return null;
	chosen = pickVoice(await voices());
	return chosen;
}

export const chosenVoice = (): SpeechSynthesisVoice | null => chosen;

// An iPhone only lets a page speak after a tap has started speech once; a silent line does that.
export function unlockSpeech(): void {
	if (speechAvailable()) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

export function say(text: string, voice: SpeechSynthesisVoice | null, hooks: SayHooks): Spoken {
	const synth = window.speechSynthesis;
	// The previous line's handlers go first, so its ending can't be mistaken for this one's.
	if (current) {
		current.onboundary = null;
		current.onend = null;
		current.onerror = null;
	}
	synth.cancel();
	const utterance = new SpeechSynthesisUtterance(text);
	if (voice) {
		utterance.voice = voice;
		utterance.lang = voice.lang;
	}
	utterance.rate = VOICE_SETTINGS.rate;
	utterance.pitch = VOICE_SETTINGS.pitch;
	let ended = false;
	const end = () => {
		if (ended) return;
		ended = true;
		if (current === utterance) current = null;
		hooks.onEnd();
	};
	utterance.onboundary = (event) => {
		if (event.name === "sentence") return;
		hooks.onWord(event.charIndex, event.charLength ? event.charIndex + event.charLength : wordEnd(text, event.charIndex));
	};
	utterance.onend = end;
	utterance.onerror = end;
	current = utterance;
	synth.speak(utterance);
	return {
		cancel() {
			utterance.onboundary = null;
			synth.cancel();
			end();
		},
	};
}
```

- [ ] **Step 5: Write the settings store, voiceprint store and the deps**

`lib/voice/web/settings-store.ts`:
```ts
// The per-device voice settings in localStorage, as an external store for useSyncExternalStore.
// If storage is unavailable (a private window), they're kept in memory for this visit.

import { DEFAULT_VOICE_SETTINGS, parseVoiceSettings, type VoiceSettings } from "../settings";

const KEY = "osmo-voice";
const listeners = new Set<() => void>();
let memory: string | null = null;
let cachedRaw: string | null | undefined;
let cached: VoiceSettings = DEFAULT_VOICE_SETTINGS;

function readRaw(): string | null {
	try {
		return window.localStorage.getItem(KEY) ?? memory;
	} catch {
		return memory;
	}
}

export function getVoiceSettings(): VoiceSettings {
	const raw = readRaw();
	if (raw !== cachedRaw) {
		cachedRaw = raw;
		cached = parseVoiceSettings(raw);
	}
	return cached;
}

export function serverVoiceSettings(): VoiceSettings {
	return DEFAULT_VOICE_SETTINGS;
}

export function subscribeVoiceSettings(listener: () => void): () => void {
	listeners.add(listener);
	window.addEventListener("storage", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", listener);
	};
}

export function setVoiceSettings(patch: Partial<VoiceSettings>): void {
	const raw = JSON.stringify({ ...getVoiceSettings(), ...patch });
	memory = raw;
	try {
		window.localStorage.setItem(KEY, raw);
	} catch {
		// Kept in memory for this visit.
	}
	listeners.forEach((listener) => listener());
}
```

`lib/voice/web/voiceprints.ts`:
```ts
// Gur's voiceprints in Supabase (own rows only). Only numbers are stored, never audio.

import { supabase } from "@/lib/supabase";
import { deviceLabel } from "../device";
import { MODEL_ID, type Voiceprint } from "../voiceprint";

// null when Supabase can't be reached.
export async function loadVoiceprints(): Promise<Voiceprint[] | null> {
	const { data, error } = await supabase.from("voiceprints").select("model,embedding");
	return error ? null : ((data ?? []) as Voiceprint[]);
}

export async function saveVoiceprint(embedding: number[]): Promise<boolean> {
	const { error } = await supabase.from("voiceprints").insert({ model: MODEL_ID, embedding, device: deviceLabel(navigator.userAgent) });
	return !error;
}

// Deletes every voiceprint, whichever device taught it.
export async function forgetVoiceprints(): Promise<boolean> {
	const { error } = await supabase.from("voiceprints").delete().not("id", "is", null);
	return !error;
}
```

`lib/voice/web/deps.ts`:
```ts
// The browser's implementations of the engine's VoiceDeps. A laptop or phone app would provide its own.

import type { VoiceDeps } from "../engine";
import { chime } from "./chime";
import { openMic } from "./mic";
import { chosenVoice, say } from "./say";
import { voiceEmbedding } from "./speaker-id";
import { hear } from "./transcriber";
import { createDetector } from "./wake-detector";

export function webVoiceDeps(): VoiceDeps {
	return {
		now: () => Date.now(),
		later: (run, ms) => {
			const id = setTimeout(run, ms);
			return () => clearTimeout(id);
		},
		openMic,
		createDetector,
		hear,
		embed: voiceEmbedding,
		say: (text, hooks) => say(text, chosenVoice(), hooks),
		chime,
	};
}
```

- [ ] **Step 6: Type check, lint, test and build**

Run: `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run` and `npm run build`
Expected: all pass, with 0 lint errors.
- If `tsc` rejects passing the `onnxruntime-web` module or session where `OrtLike`/`SessionLike` is expected, widen the parameter types in `lib/voice/runtime.ts`.
- Do not use `as any`.
- Report what changed.

- [ ] **Step 7: Check in the browser (read-only)**

With the dev server running, open the room in the browser pane. Run with javascript_tool:
```js
[(await fetch("/voice/pcm-worklet.js")).status, (await fetch("/models/wake/osmo.onnx", { method: "HEAD" })).status]
```
Expected: `[200, 404]`. The detector file doesn't exist until Gur trains it.

Then check `read_console_messages` for errors: none new.

- [ ] **Step 8: Commit**

```bash
git add public/voice/pcm-worklet.js lib/voice/web/ort.ts lib/voice/web/mic.ts lib/voice/web/speaker-id.ts lib/voice/web/transcriber.ts lib/voice/web/wake-detector.ts lib/voice/web/chime.ts lib/voice/web/say.ts lib/voice/web/settings-store.ts lib/voice/web/voiceprints.ts lib/voice/web/deps.ts
git commit -m "feat: the browser's microphone, recognizer, detector, speaking voice and stores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: He speaks (the room hook, speech in the room, Settings voice line)

**Before dispatching (controller):**
- Confirm the language session's chain commit is on `main`: `git log --oneline -15`, and `grep -n "onReplyRef\|sendTextRef\|speaker?: \"guest\"" app/assistant.tsx`. The expected names are:
  - `const onReplyRef = useRef<((reply: string, via: Via) => void) | null>(null)`, called in `deliver`;
  - `sendTextRef`, holding `(text: string, options: SendOptions) => boolean`;
  - `ChatMessage` with `speaker?: "guest"`.
- If the names differ, update this task's code to match before dispatch.
- Send the language session this task's `app/assistant.tsx` edits before dispatch.

**Files:**
- Create: `components/osmo/use-voice.ts`, `components/osmo/voice-settings.tsx`
- Modify:
  - `components/osmo/panel.tsx` (add `open` to `usePanels`)
  - `components/osmo/settings-panel.tsx` (the `voice` prop, rendering `VoiceSettings`)
  - `components/osmo/panels.module.css` (switch styles)
  - `app/assistant.tsx` (the edits in Step 4 only)
  - `app/assistant.module.css` (listening, line, guest-label styles)

**Interfaces:**
- Consumes:
  - `VoiceEngine`, `SendText`, `SpeechHooks`, `VoiceView`;
  - `initialVoice`, `micOpen`, `displayVoiceName`, `SPEECH_CHAR_MS`, `Voiceprint`;
  - `webVoiceDeps`, `chooseVoice`, `unlockSpeech`, the settings store, `canListen`, `loadVoiceprints`, `forgetVoiceprints`, `wakeWordTrained`;
  - from the language session: `sendTextRef`, `onReplyRef`, `ChatMessage.speaker`.
- Produces:
  - `useVoice({ speech, sendTextRef, openSettings })`, returning `VoiceControls`:
    - state: `mode`, `micOpen`, `liveText`, `error`, `listening`, `speakTyped`, `voiceName`, `listenSupported`, `wakeReady`, `prints`, `teaching`;
    - actions: `onReply`, `stop`, `micPress`, `setListen`, `setSpeakTyped`, `startTeaching`, `finishTeaching`, `forgetVoice`.
  - `type TeachingReason = "listen" | "mic" | "settings"`
  - `VoiceSettings({ voice })` and `Switch({ label, on, onChange, disabled })`
  - `usePanels().open(id)`

- [ ] **Step 1: Add `open` to `usePanels`**

In `components/osmo/panel.tsx`, inside `usePanels`, after the `toggle` callback add:
```ts
	// Opens a panel without closing it if it's already open (the voice uses this to ask for teaching).
	const open = useCallback((id: PanelId) => setPanel(id), []);
```
and change the return to `return { panel, toggle, close, open, linkRef };`.

- [ ] **Step 2: Write the hook**

`components/osmo/use-voice.ts`:
```ts
"use client";

// The room's side of Osmo's voice: one VoiceEngine for the page, fed by the device settings, Gur's voiceprints
// and whether the wake word has been trained.

import { useEffect, useState, useSyncExternalStore } from "react";
import { VoiceEngine, type SendText, type SpeechHooks, type VoiceView } from "@/lib/voice/engine";
import { initialVoice, micOpen } from "@/lib/voice/machine";
import { displayVoiceName } from "@/lib/voice/voices";
import type { Voiceprint } from "@/lib/voice/voiceprint";
import { webVoiceDeps } from "@/lib/voice/web/deps";
import { chooseVoice, unlockSpeech } from "@/lib/voice/web/say";
import { getVoiceSettings, serverVoiceSettings, setVoiceSettings, subscribeVoiceSettings } from "@/lib/voice/web/settings-store";
import { canListen } from "@/lib/voice/web/transcriber";
import { forgetVoiceprints, loadVoiceprints } from "@/lib/voice/web/voiceprints";
import { wakeWordTrained } from "@/lib/voice/web/wake-detector";

// Why Settings is teaching his voice: the listening switch, the mic button, or Gur asked.
export type TeachingReason = "listen" | "mic" | "settings";

const noSubscription = () => () => {};

export function useVoice(options: { speech: SpeechHooks; sendTextRef: { current: SendText | null }; openSettings(): void }) {
	const settings = useSyncExternalStore(subscribeVoiceSettings, getVoiceSettings, serverVoiceSettings);
	// False on the server and while hydrating, then the browser's real answer.
	const listenSupported = useSyncExternalStore(noSubscription, canListen, () => false);
	const [voice, setVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined);
	const [prints, setPrints] = useState<Voiceprint[] | "error" | null>(null);
	const [wakeReady, setWakeReady] = useState<boolean | null>(null);
	const [teaching, setTeaching] = useState<TeachingReason | null>(null);
	const [view, setView] = useState<VoiceView>(() => ({ state: initialVoice(), liveText: null, error: null }));
	const [engine] = useState(() => new VoiceEngine(webVoiceDeps(), setView));

	useEffect(() => {
		let live = true;
		async function load() {
			const [chosen, list, trained] = await Promise.all([chooseVoice(), loadVoiceprints(), wakeWordTrained()]);
			if (!live) return;
			setVoice(chosen);
			setPrints(list ?? "error");
			setWakeReady(trained);
		}
		void load();
		return () => {
			live = false;
		};
	}, []);

	const { speech, sendTextRef, openSettings } = options;
	useEffect(() => {
		engine.configure({
			// Listening waits for the voiceprints to load, so a slow load never reads as "not taught".
			listen: settings.listen && listenSupported && Array.isArray(prints),
			wakeReady: wakeReady === true,
			prints: Array.isArray(prints) ? prints : [],
			canSpeak: voice != null,
			speakTyped: settings.speakTyped,
			// Read at call time, so a message always goes through the room's latest sendText.
			sendText: (text, sendOptions) => sendTextRef.current?.(text, sendOptions) ?? false,
			speech,
			listenOff: () => setVoiceSettings({ listen: false }),
			needTeaching: () => {
				setTeaching("mic");
				openSettings();
			},
		});
	});

	useEffect(() => {
		const onVisibility = () => engine.visibility(document.hidden);
		document.addEventListener("visibilitychange", onVisibility);
		const ticking = setInterval(engine.tick, 250);
		return () => {
			document.removeEventListener("visibilitychange", onVisibility);
			clearInterval(ticking);
			engine.dispose();
		};
	}, [engine]);

	async function refreshPrints() {
		const list = await loadVoiceprints();
		setPrints(list ?? "error");
	}

	return {
		mode: view.state.mode,
		micOpen: micOpen(view.state),
		liveText: view.liveText,
		error: view.error,
		listening: settings.listen,
		speakTyped: settings.speakTyped,
		// undefined while checking, null when the device has no English voice.
		voiceName: voice === undefined ? undefined : voice ? displayVoiceName(voice.name) : null,
		listenSupported,
		wakeReady,
		prints,
		teaching,
		onReply: engine.onReply,
		stop: engine.stop,
		micPress() {
			unlockSpeech();
			engine.micPress();
		},
		setListen(on: boolean) {
			unlockSpeech();
			engine.clearError();
			if (on && !(Array.isArray(prints) && prints.length > 0)) {
				setTeaching("listen");
				return;
			}
			setVoiceSettings({ listen: on });
		},
		setSpeakTyped(on: boolean) {
			unlockSpeech();
			setVoiceSettings({ speakTyped: on });
		},
		startTeaching() {
			setTeaching("settings");
		},
		async finishTeaching(saved: boolean) {
			const reason = teaching;
			setTeaching(null);
			await refreshPrints();
			if (saved && reason === "listen") setVoiceSettings({ listen: true });
		},
		async forgetVoice(): Promise<boolean> {
			const done = await forgetVoiceprints();
			if (done) {
				setVoiceSettings({ listen: false });
				await refreshPrints();
			}
			return done;
		},
	};
}

export type VoiceControls = ReturnType<typeof useVoice>;
```

- [ ] **Step 3: Write the Settings voice section (voice line and the typed-replies switch)**

`components/osmo/voice-settings.tsx`:
```tsx
"use client";

import type { VoiceControls } from "./use-voice";
import styles from "./panels.module.css";

export function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange(on: boolean): void; disabled?: boolean }) {
	return (
		<button type="button" role="switch" aria-checked={on} className={styles.switch} onClick={() => onChange(!on)} disabled={disabled}>
			<span className={styles.switchTrack} aria-hidden="true">
				<span className={styles.switchThumb} />
			</span>
			{label}
		</button>
	);
}

function voiceLine(name: string | null | undefined): string {
	if (name === undefined) return "Checking my voice…";
	if (name === null) return "This device has no English voice, so I'll only write.";
	return `I speak with ${name} on this device.`;
}

export function VoiceSettings({ voice }: { voice: VoiceControls }) {
	return (
		<section className={styles.section}>
			<h3 className={styles.sectionTitle}>Voice</h3>
			<p className={styles.note}>{voiceLine(voice.voiceName)}</p>
			<Switch label="Speak typed replies too" on={voice.speakTyped} onChange={voice.setSpeakTyped} disabled={voice.voiceName === null} />
		</section>
	);
}
```

Append to `components/osmo/panels.module.css`:
```css
.switch {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	font: inherit;
	color: inherit;
	background: none;
	border: 0;
	padding: 0.35rem 0;
	cursor: pointer;
	text-align: left;
}
.switch:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}
.switch:focus-visible {
	outline: 2px solid var(--aura-a);
	outline-offset: 3px;
	border-radius: 0.4rem;
}
.switchTrack {
	position: relative;
	flex: none;
	width: 2.4rem;
	height: 1.35rem;
	border-radius: 999px;
	background: color-mix(in oklab, var(--bone) 18%, transparent);
	transition: background 0.2s ease;
}
.switchThumb {
	position: absolute;
	top: 0.175rem;
	left: 0.2rem;
	width: 1rem;
	height: 1rem;
	border-radius: 50%;
	background: var(--bone);
	transition: translate 0.2s ease;
}
.switch[aria-checked="true"] .switchTrack {
	background: color-mix(in oklab, var(--aura-a) 70%, transparent);
}
.switch[aria-checked="true"] .switchThumb {
	translate: 1rem 0;
}
@media (prefers-reduced-motion: reduce) {
	.switchTrack,
	.switchThumb {
		transition: none;
	}
}
```

In `components/osmo/settings-panel.tsx`:
- add `import { VoiceSettings } from "./voice-settings";` and `import type { VoiceControls } from "./use-voice";`;
- change `export function SettingsPanel() {` to `export function SettingsPanel({ voice }: { voice: VoiceControls }) {`;
- render `<VoiceSettings voice={voice} />` between the Devices `</section>` and the Lock Osmo `<section>`.

- [ ] **Step 4: Wire the voice into the room (`app/assistant.tsx`)**

Make exactly these edits:

(a) Imports. Add:
```ts
import { SPEECH_CHAR_MS } from "@/lib/voice/voices";
import { useVoice } from "@/components/osmo/use-voice";
```

(b) Directly after `const waveIdRef = useRef(0);`, add:
```ts
	// How the typed-out reply keeps time: its own timer, his spoken words, or speaking pace when the device gives no word timing.
	const paceRef = useRef<"timer" | "words" | "stretched">("timer");
```

(c) In the speaking effect, directly after the closing `}` of the `if (speaking.chars >= text.length) { … }` block, add:
```ts
		// While his voice reports word timing, his words move the text, not this timer.
		if (paceRef.current === "words") return;
```
Then replace:
```ts
		const wait = charDelay(text.length, theme.pulseSeconds) + breath + (speaking.chars === 0 ? 350 : 0);
```
with:
```ts
		const pace = paceRef.current === "stretched" ? SPEECH_CHAR_MS : charDelay(text.length, theme.pulseSeconds);
		const wait = pace + breath + (speaking.chars === 0 ? 350 : 0);
```

(d) Directly after the language session's `onReplyRef` declaration (and after `sendTextRef`'s), add:
```ts
	const voice = useVoice({
		speech: {
			onSpeechStart: () => {
				paceRef.current = "words";
			},
			onNoWordTiming: () => {
				paceRef.current = "stretched";
				setSpeaking((s) => (s ? { ...s } : s));
			},
			onWord: (end) => {
				setSpeaking((s) => (s ? { ...s, chars: Math.max(s.chars, end) } : s));
				if (reduceMotionRef.current) return;
				const stage = stageRef.current;
				stage?.style.setProperty("--voice", "0.8");
				setTimeout(() => stage?.style.setProperty("--voice", "0.2"), 170);
				const id = ++waveIdRef.current;
				setWaves((current) => [...current.slice(-5), { id, amp: 0.8 }]);
			},
			onSpeechEnd: () => {
				paceRef.current = "timer";
				stageRef.current?.style.setProperty("--voice", "0");
				setSpeaking((s) => (s ? { ...s, chars: Number.MAX_SAFE_INTEGER } : s));
			},
		},
		sendTextRef,
		openSettings: () => panels.open("settings"),
	});
	useEffect(() => {
		onReplyRef.current = voice.onReply;
	}, [voice.onReply]);
```

(e) On the stage `<div ref={stageRef} …>`, add the attribute:
```tsx
			data-listening={voice.mode === "awake" || voice.mode === "followup" ? "" : undefined}
```

(f) In the message list, replace the `<li …>` element's `className` expression and its first child as follows. Keep the `key` and `hidden` props.
- The `className` becomes:
```tsx
									className={`${styles.item} ${message.role === "user" ? styles.user : styles.agent} ${
										talking ? styles.speaking : ""
									} ${message.speaker === "guest" && message.role === "user" ? styles.guest : ""}`}
```
- Insert this as the first child, before the `<p className={styles.bubble}>`:
```tsx
								{message.speaker === "guest" && message.role === "user" && <span className={styles.who}>Someone else</span>}
```

(g) Directly after the closing `</form>` of the composer, add:
```tsx
				{voice.micOpen && (
					<p className={styles.voiceLine} role="status">
						{voice.mode === "sleeping" ? 'Listening for "Osmo"' : "Listening…"}
					</p>
				)}
				{voice.error && (
					<p className={styles.voiceError} role="alert">
						{voice.error}
					</p>
				)}
```

(h) Change `{panels.panel === "settings" && <SettingsPanel />}` to `{panels.panel === "settings" && <SettingsPanel voice={voice} />}`.

- [ ] **Step 5: Add the room styles (`app/assistant.module.css`)**

Add before the first `@media (prefers-reduced-motion: reduce)` block:
```css
/* Listening: the circle's edge brightens and it breathes faster, so it's clear he's hearing you. */
.stage[data-listening] .core {
	border-color: color-mix(in oklab, var(--aura-a) 95%, transparent);
	animation: listen 1.2s ease-in-out infinite;
}
@keyframes listen {
	0%,
	100% {
		scale: 1;
	}
	50% {
		scale: 1.07;
	}
}
.voiceLine,
.voiceError {
	flex: none;
	margin: -1rem 0 0;
	padding: 0 0 1rem;
	font-size: 0.85rem;
}
.voiceLine {
	color: color-mix(in oklab, var(--bone) 70%, transparent);
}
.voiceError {
	color: #f2b8a2;
}
.guest {
	flex-direction: column;
	align-items: flex-end;
}
.who {
	margin: 0 0.4rem 0.2rem;
	font-size: 0.78rem;
	color: color-mix(in oklab, var(--bone) 70%, transparent);
}
```
Inside the existing `@media (prefers-reduced-motion: reduce)` block, add:
```css
	.stage[data-listening] .core {
		animation: none;
	}
```

- [ ] **Step 6: Type check, lint, test and build**

Run: `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run` and `npm run build`
Expected: all pass, with 0 lint errors.

- [ ] **Step 7: Browser check (read-only, Gur's session)**

Open the room and open **Settings**.
- The Voice section reads "I speak with … on this device." (or "Checking my voice…" for a moment).
- Flip "Speak typed replies too" on: `aria-checked` becomes `true`. Flip it back off.
- `read_console_messages` shows no new errors.
- Take a screenshot of the Settings panel.
- Do not send Osmo a message.

- [ ] **Step 8: Commit**

```bash
git add components/osmo/use-voice.ts components/osmo/voice-settings.tsx components/osmo/panel.tsx components/osmo/settings-panel.tsx components/osmo/panels.module.css app/assistant.tsx app/assistant.module.css
git commit -m "feat: Osmo speaks his replies, with the circle following his real words

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9 (controller):** Tell the language session the room edits are in (give the commit).

---

### Task 11: He listens (teaching, forgetting, the listening switch and the mic button)

**Before dispatching (controller):** Send the language session the composer edits in Step 4 (the mic button inside the form; the input showing live words).

**Files:**
- Create: `components/osmo/voice-teaching.tsx`
- Modify:
  - `components/osmo/voice-settings.tsx` (full version below)
  - `components/osmo/panels.module.css` (`.teach`, `.sentence`)
  - `app/assistant.tsx` (composer edits in Step 4 only)
  - `app/assistant.module.css` (`.mic`)

**Interfaces:**
- Consumes:
  - `VoiceControls` (Task 10);
  - `openMic`, `voiceEmbedding`, `saveVoiceprint` (Task 9);
  - `MicError`, `MIC_BLOCKED`, `NO_MIC`, `MODEL_FAILED` (Task 7);
  - `TEACHING_SENTENCES`, `averagePrint`, `outliers`, `readingDone`, `readingProblem`, `trimSilence`, `MicHandle`.
- Produces: `VoiceTeaching({ onDone(saved: boolean): void })`.
- Language session behavior this relies on: `sendText` calls `setInput("")` only when `via === "typed"`. While listening, the composer shows `voice.liveText` read-only, and after a spoken message the half-typed draft reappears untouched.

- [ ] **Step 1: Write the teaching flow**

`components/osmo/voice-teaching.tsx`:
```tsx
"use client";

// Teaching Osmo Gur's voice: five sentences read aloud, each turned into numbers on the device and the audio
// thrown away. Readings that don't match the rest are asked for again. Only the averaged voiceprint is saved.

import { useEffect, useRef, useState } from "react";
import { MIC_BLOCKED, MicError, MODEL_FAILED, NO_MIC, type MicHandle } from "@/lib/voice/engine";
import { readingDone, readingProblem, trimSilence } from "@/lib/voice/levels";
import { averagePrint, outliers, TEACHING_SENTENCES } from "@/lib/voice/voiceprint";
import { openMic } from "@/lib/voice/web/mic";
import { voiceEmbedding } from "@/lib/voice/web/speaker-id";
import { saveVoiceprint } from "@/lib/voice/web/voiceprints";
import styles from "./panels.module.css";

const TOO_QUIET = "That was too quiet to learn from. Try again somewhere quieter.";
const READ_AGAIN = "That one didn't sound like the others. Please read it again.";
const SAVE_FAILED = "Couldn't save your voice. Try again.";

type Phase = "ready" | "recording" | "learning" | "saving" | "failed";

export function VoiceTeaching({ onDone }: { onDone(saved: boolean): void }) {
	const [readings, setReadings] = useState<(number[] | null)[]>(() => TEACHING_SENTENCES.map(() => null));
	const [phase, setPhase] = useState<Phase>("ready");
	const [error, setError] = useState<string | null>(null);
	const micRef = useRef<MicHandle | null>(null);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const finishRef = useRef<(() => void) | null>(null);
	const next = readings.findIndex((r) => r === null);
	const current = next === -1 ? TEACHING_SENTENCES.length - 1 : next;

	function release() {
		if (timerRef.current) clearInterval(timerRef.current);
		timerRef.current = null;
		finishRef.current = null;
		micRef.current?.close();
		micRef.current = null;
	}

	useEffect(() => release, []);

	async function save(filled: number[][]) {
		setPhase("saving");
		if (await saveVoiceprint(averagePrint(filled))) {
			onDone(true);
			return;
		}
		setError(SAVE_FAILED);
		setPhase("failed");
	}

	async function record() {
		setError(null);
		setPhase("recording");
		try {
			const mic = await openMic(() => {});
			micRef.current = mic;
			const start = mic.ring.total;
			const heard = () => Float32Array.from(mic.ring.since(start), (s) => s / 32768);
			const samples = await new Promise<Float32Array>((resolve) => {
				timerRef.current = setInterval(() => {
					const sofar = heard();
					if (readingDone(sofar)) resolve(sofar);
				}, 150);
				finishRef.current = () => resolve(heard());
			});
			release();
			if (readingProblem(samples)) {
				setError(TOO_QUIET);
				setPhase("ready");
				return;
			}
			setPhase("learning");
			const embedding = await voiceEmbedding(trimSilence(samples));
			const updated = readings.map((r, i) => (i === current ? embedding : r));
			if (updated.some((r) => r === null)) {
				setReadings(updated);
				setPhase("ready");
				return;
			}
			const filled = updated as number[][];
			const bad = outliers(filled);
			if (bad.length > 0) {
				setReadings(filled.map((r, i) => (bad.includes(i) ? null : r)));
				setError(READ_AGAIN);
				setPhase("ready");
				return;
			}
			setReadings(updated);
			await save(filled);
		} catch (problem) {
			release();
			setError(problem instanceof MicError ? (problem.problem === "blocked" ? MIC_BLOCKED : NO_MIC) : MODEL_FAILED);
			setPhase("ready");
		}
	}

	function cancel() {
		release();
		onDone(false);
	}

	return (
		<div className={styles.teach}>
			<p className={styles.note} aria-live="polite">
				Reading {current + 1} of {TEACHING_SENTENCES.length}
			</p>
			<p className={styles.sentence}>{TEACHING_SENTENCES[current]}</p>
			{phase === "ready" && (
				<button type="button" className={styles.action} onClick={() => void record()} autoFocus>
					Start reading
				</button>
			)}
			{phase === "recording" && (
				<>
					<p className={styles.note} role="status">
						Listening. I&apos;ll stop when you pause.
					</p>
					<button type="button" className={styles.action} onClick={() => finishRef.current?.()}>
						Done
					</button>
				</>
			)}
			{phase === "learning" && (
				<p className={styles.note} role="status">
					Learning that one…
				</p>
			)}
			{phase === "saving" && (
				<p className={styles.note} role="status">
					Saving your voice…
				</p>
			)}
			{phase === "failed" && (
				<button type="button" className={styles.action} onClick={() => void save(readings as number[][])}>
					Save again
				</button>
			)}
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{phase !== "saving" && (
				<button type="button" className={styles.action} onClick={cancel}>
					Cancel
				</button>
			)}
		</div>
	);
}
```

Append to `components/osmo/panels.module.css`:
```css
.teach {
	display: grid;
	gap: 0.6rem;
	justify-items: start;
}
.sentence {
	margin: 0;
	max-width: 30ch;
	font-size: 1.15rem;
	line-height: 1.45;
}
```

- [ ] **Step 2: Write the full Settings voice section**

Replace `components/osmo/voice-settings.tsx` with:
```tsx
"use client";

import { useState } from "react";
import type { VoiceControls } from "./use-voice";
import { VoiceTeaching } from "./voice-teaching";
import styles from "./panels.module.css";

const UNREACHABLE = "I can't reach my memory right now. Try again in a moment.";
const FORGET_FAILED = "Couldn't save that. Try again.";

export function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange(on: boolean): void; disabled?: boolean }) {
	return (
		<button type="button" role="switch" aria-checked={on} className={styles.switch} onClick={() => onChange(!on)} disabled={disabled}>
			<span className={styles.switchTrack} aria-hidden="true">
				<span className={styles.switchThumb} />
			</span>
			{label}
		</button>
	);
}

function voiceLine(name: string | null | undefined): string {
	if (name === undefined) return "Checking my voice…";
	if (name === null) return "This device has no English voice, so I'll only write.";
	return `I speak with ${name} on this device.`;
}

export function VoiceSettings({ voice }: { voice: VoiceControls }) {
	const [confirming, setConfirming] = useState(false);
	const [forgetError, setForgetError] = useState<string | null>(null);
	const [taughtNow, setTaughtNow] = useState(false);
	const taught = Array.isArray(voice.prints) && voice.prints.length > 0;

	async function forget() {
		setConfirming(false);
		const done = await voice.forgetVoice();
		setForgetError(done ? null : FORGET_FAILED);
		if (done) setTaughtNow(false);
	}

	return (
		<section className={styles.section}>
			<h3 className={styles.sectionTitle}>Voice</h3>
			<p className={styles.note}>{voiceLine(voice.voiceName)}</p>

			<Switch label='Listen for "Osmo"' on={voice.listening} onChange={voice.setListen} disabled={!voice.listenSupported || voice.wakeReady !== true} />
			{!voice.listenSupported && <p className={styles.note}>Listening needs Chrome, Edge or Safari. I can still speak.</p>}
			{voice.listenSupported && voice.wakeReady === false && <p className={styles.note}>His wake word isn&apos;t trained yet.</p>}

			<Switch label="Speak typed replies too" on={voice.speakTyped} onChange={voice.setSpeakTyped} disabled={voice.voiceName === null} />

			{voice.teaching ? (
				<VoiceTeaching
					onDone={(saved) => {
						setTaughtNow(saved);
						void voice.finishTeaching(saved);
					}}
				/>
			) : (
				voice.listenSupported && (
					<>
						{taughtNow && (
							<p className={styles.note} role="status">
								I know your voice now.
							</p>
						)}
						<button type="button" className={styles.action} onClick={voice.startTeaching} disabled={voice.prints === null}>
							{taught ? "Teach again on this device" : "Teach Osmo my voice"}
						</button>
						{taught &&
							(confirming ? (
								<>
									<p className={styles.note}>I&apos;ll stop recognizing you on every device until you teach me again.</p>
									<div className={styles.actions}>
										<button type="button" className={styles.action} onClick={() => void forget()}>
											Forget my voice
										</button>
										<button type="button" className={styles.action} onClick={() => setConfirming(false)}>
											Keep
										</button>
									</div>
								</>
							) : (
								<button type="button" className={styles.action} onClick={() => setConfirming(true)}>
									Forget my voice
								</button>
							))}
					</>
				)
			)}

			{voice.prints === "error" && (
				<p className={styles.error} role="alert">
					{UNREACHABLE}
				</p>
			)}
			{voice.error && (
				<p className={styles.error} role="alert">
					{voice.error}
				</p>
			)}
			{forgetError && (
				<p className={styles.error} role="alert">
					{forgetError}
				</p>
			)}
		</section>
	);
}
```

- [ ] **Step 3: Add the mic button style (`app/assistant.module.css`)**

Add after the `.send:disabled, .field:disabled` rule:
```css
.mic {
	flex: none;
	display: grid;
	place-items: center;
	width: 3rem;
	color: var(--bone);
	background: transparent;
	border: 1px solid color-mix(in oklab, var(--bone) 35%, transparent);
	border-radius: 999px;
	cursor: pointer;
}
.mic:hover:not(:disabled) {
	border-color: var(--aura-a);
}
.mic:focus-visible {
	outline: 2px solid var(--aura-a);
	outline-offset: 3px;
}
.mic:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}
.stage[data-listening] .mic {
	border-color: var(--aura-a);
	background: color-mix(in oklab, var(--aura-a) 22%, transparent);
}
```

- [ ] **Step 4: The composer (`app/assistant.tsx`)**

Make exactly these edits:

(a) Add the import `import { Mic, Square } from "lucide-react";`.

(b) On the composer `<input>`:
- replace `value={input}` with `value={voice.liveText ?? input}`;
- add `readOnly={voice.liveText !== null}`.

(c) Directly before the Send `<button type="submit" …>`, add:
```tsx
					{(voice.listenSupported || voice.mode === "speaking") && (
						<button
							type="button"
							className={styles.mic}
							onClick={voice.mode === "speaking" ? voice.stop : voice.micPress}
							disabled={voice.mode !== "speaking" && (!ready || thinking)}
							aria-label={voice.mode === "speaking" ? "Stop speaking" : "Talk to Osmo"}
						>
							{voice.mode === "speaking" ? <Square aria-hidden="true" size={18} /> : <Mic aria-hidden="true" size={18} />}
						</button>
					)}
```

- [ ] **Step 5: Type check, lint, test and build**

Run: `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run` and `npm run build`
Expected: all pass, with 0 lint errors.

- [ ] **Step 6: Browser check (read-only)**

Open the room (desktop width, then 375 px wide):
- The mic button sits between the text box and Send, and it has visible focus when tabbed to.
- Settings → Voice shows:
  - `Listen for "Osmo"` disabled, with "His wake word isn't trained yet.";
  - "Teach Osmo my voice", or "Teach again on this device" if Gur has already taught it.
- Do not click the mic, teaching, forget or listen controls.
- `read_console_messages` shows no new errors.
- Take screenshots at both widths.

- [ ] **Step 7: Commit**

```bash
git add components/osmo/voice-teaching.tsx components/osmo/voice-settings.tsx components/osmo/panels.module.css app/assistant.tsx app/assistant.module.css
git commit -m "feat: teach Osmo your voice, forget it, and talk to him with the mic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8 (controller):** Tell the language session the composer edits are in (give the commit).

---

### Task 12: The wake-word guide and the hand checks

**Files:**
- Create: `docs/osmo-wake-word.md`
- Modify: `docs/osmo-deploy.md` (add a "Voice" section before "Your password is the real key")

- [ ] **Step 1: Write the training guide**

`docs/osmo-wake-word.md`:
```markdown
# Training Osmo's wake word

Osmo's ear for his name is a small file, `osmo.onnx`, that you train once with openWakeWord's free notebook on Google Colab. It takes about 1–2 hours, mostly waiting. Until it exists, the mic button works and "Listen for 'Osmo'" stays off.

## What you need

- A Google account (for Colab).
- About 2 hours in which you can leave the browser tab open.

## Steps

1. Open https://colab.research.google.com/github/dscripka/openWakeWord/blob/main/notebooks/automatic_model_training.ipynb
2. **Runtime → Change runtime type → T4 GPU → Save.**
3. Run the first code cell ("Environment setup"): press its play button and wait for it to finish (5–10 minutes). If Colab asks to restart the session, restart it, then carry on from the next cell.
4. Run the "Imports" cell and the three "Download" cells in order (about 15 minutes in all).
5. In the cell that begins `# Modify values in the config and save a new version`, change the first lines so they read:

       config["target_phrase"] = ["osmo"]
       config["model_name"] = "osmo"
       config["custom_negative_phrases"] = ["cosmo", "awesome", "also", "gizmo", "osmosis", "almost"]
       config["n_samples"] = 5000
       config["n_samples_val"] = 1000
       config["steps"] = 20000
       config["max_negative_weight"] = 3000
       config["target_false_positives_per_hour"] = 0.1

   Leave the other lines in that cell as they are, then run it.
6. Run "Step 1: Generate synthetic clips" (the longest part, about 45–60 minutes). If it stops, run it again; it continues where it left off.
7. Run "Step 2: Augment the generated clips", then "Step 3: Train model" (about 20–40 minutes together).
8. In the file browser on the left (the folder icon), open `my_custom_model`, right-click `osmo.onnx` and choose **Download**. Skip step 4 of the notebook (tflite); Osmo uses the `.onnx` file.
9. Give the file to Claude in this project. It goes to `public/models/wake/osmo.onnx`. Claude then runs `npm run voice:check`, which now tests "Osmo" itself, and commits it. It goes live with the next push.

## If he wakes too often, or not enough

- **Wakes by mistake** (TV, conversation): first raise `threshold` in `lib/voice/wake.ts` (0.7 → 0.8). If that isn't enough, train again with the phrase "hey osmo" (`target_phrase` and `model_name` both "hey_osmo"), which wakes by mistake far less.
- **Doesn't wake when you say it:** lower `threshold` a little (0.7 → 0.6), or train again with `n_samples` at 10000.
```

- [ ] **Step 2: Add the voice checks to `docs/osmo-deploy.md`**

Insert before `## Your password is the real key`:
```markdown
## 5. Voice (after the voice update is live)

1. Open **Settings**. The Voice section names the voice he speaks with. Turn on "Speak typed replies too", send a message, and listen. The text types out with his words. Tap the square Stop button once to check it stops him. Turn the switch off again if you prefer silence for typed messages.
2. Choose **Teach Osmo my voice**, allow the microphone, and read the five sentences in a normal voice. You should see "I know your voice now."
3. Tap the mic button and ask something. Your words appear in the text box, he answers aloud, and for about 6 seconds he listens for a follow-up without the mic.
4. Once his wake word is trained (`docs/osmo-wake-word.md`), turn on **Listen for "Osmo"**. The line under the text box says `Listening for "Osmo"`. From across the room, say "Osmo", wait for the chime, and ask something.
5. Leave the TV or music on for an evening with listening on, and count how often he wakes by mistake. More than once or twice an hour means the threshold needs raising (see the training guide).
6. Ask a friend to talk to him. Their line is labelled **Someone else**. He doesn't use your name or say anything he remembers about you, and "how close are we" gets "That's between me and the person I belong to."
7. On your iPhone in Safari, repeat steps 2–4. If Teach again on this device makes him recognize you better on the phone, keep it.
8. Choose **Forget my voice**, then **Forget my voice** again to confirm. Listening turns off, and the button reads "Teach Osmo my voice" again. Teach it once more if you want to keep using voice.
```

- [ ] **Step 3: Commit**

```bash
git add docs/osmo-wake-word.md docs/osmo-deploy.md
git commit -m "docs: train Osmo's wake word, and check his voice by hand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Gur's hand checks (after the push, which is Gur's call)

These need a real microphone, a real voice and Gur's own sessions, so the builder can't do them. They are the steps in `docs/osmo-deploy.md` section 5:
- a spoken reply, including Stop;
- teaching his voice;
- a mic-button conversation, with the follow-up window;
- the wake word from across the room, once trained;
- an evening of false wake-ups;
- a friend as "Someone else";
- Safari on the iPhone;
- Forget my voice.

Before any push that includes Task 10, the controller confirms the `messages.speaker` column is live (Task 1, Step 9).
