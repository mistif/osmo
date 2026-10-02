# Osmo's emotions: design (direction B, nuanced)

Date: 2026-10-02. Status: draft for Gur to read; no code was touched. Source: `2026-10-02-osmo-emotions-research.md` (section 4 is the architecture formalised here). Gur's answers: Q1 B; Q2 yes, feeling notes across days, visible and deletable in Insights; Q3 follow up once, gently, within 3 days, only if it fits; Q4 "always": his own mood may show in the room, in words when asked, and in his wording unprompted, with restraint; Q5 after an absence, aura plus a plain welcome back, never guilt; Q6 build order is ours.

"Unverified" marks anything I could not check in this session.

## 1. Goal

Osmo reads how Gur feels from the words, answers with a different and steadier feeling than a mirror would (concern for Gur's worry, not fear), lets that feeling linger and fade by the clock, remembers the heavy moments for a few days in notes Gur can see and delete, and brings one of them up once, gently. The model reads and writes; code decides how Osmo feels. Everything still works with the model off.

## 2. What changes, and what stays

**Changes**
- The reply call returns JSON: the reply plus a detection record of Gur's tone.
- A table in code (not a mirror) turns that record into pushes on Osmo's 12 numbers.
- A slow mood (one PAD point) fades by clock time; the strongest feelings keep a short cause.
- The prompt gets one block replacing "You feel sad and lonely" (section 8).
- Colour B of the aura comes from the slow mood.
- A new table, `feeling_notes`, and an Insights section for it.
- The five feeling cues in `cues.ts` (sad, happy, thanks, love you, lol) move into the regex mapper (section 3.3). Two welcome lines in `bond/lines.ts` that guilt Gur change (section 10).

**Stays (explicit)**
- The 12 emotion names, `BASELINE` and the genome baseline and reactivity (`resolve(...)`), `defaultCoupling`, `stepHeart`, `decay`, `ANCHORS`, `moodPosition`, `dominantEmotions`, `bondBaseline`, `applyGap`, `missYou`.
- `moodTheme`'s outputs and the `data-tone` contract (one of the 12 or `calm`), so `app/assistant.module.css`, the figure, the voice's "grave" rule (valence <= -0.45 and strength >= 0.6) and `mood_days` need no change.
- `mood_days` rows (`day date`, `valence`, `strongest`, `tally`, `samples`): unchanged, still Osmo's own mood.
- The other cues (insults, sexual, "delete you", "you're wrong", "meh") and `events.ts` life events keep their direct pushes.
- Crisis: `isCrisis` first, `CRISIS_REPLY` fixed code, the model as second detector, `CRISIS_CAUSE`, the waiting-turn rule, "AI off after a crisis until reload".
- `prepareTurn`/`processTurn` stay pure; `keptTurn` still chooses one state step per turn.
- Guests change nothing of Gur's.

## 3. The detection record

Lives in a new file, `lib/agent/detection.ts` (types, validation, mapper; pure, no imports from `lib/chat`, so browser and server share it).

```ts
export const TONES = ["neutral","happy","excited","grateful","playful","sad","worried","angry","tired","lonely"] as const;
export type Tone = (typeof TONES)[number];
export type About = "gur" | "someone_close" | "osmo" | "other";
export type Wants = "listen" | "advice" | "distraction" | "nothing";
export type Detection = { tones: Tone[]; intensity: 1 | 2 | 3; about: About; wants: Wants; note: string; source: "model" | "rules" };
```

Meaning: `tones` are what Gur seems to feel (1 or 2); `intensity` 1 slight, 2 clear, 3 strong; `about` is who it concerns; `wants` is what he seems to want from Osmo; `note` is at most 8 words for the feeling notes ("his mother is in hospital again").

### 3.1 Validation: `validateDetection(raw: unknown): Detection | null` (never throws, never trusts)
1. Not an object: null.
2. `tones`: array of strings (a lone string is wrapped); keep only members of `TONES`; drop duplicates; drop `neutral` when anything else is present; keep the first 2. Nothing left: null (no detection this turn; the reply is still spoken).
3. `intensity`: finite number, rounded, clamped to 1..3; missing or NaN becomes 1.
4. `about`: unknown value becomes `gur`. `wants`: unknown value becomes `nothing`.
5. `note`: string only; control characters and everything but letters, digits, space, apostrophe, comma and full stop removed; whitespace collapsed; cut to 8 words and 60 characters; emptied if `isCrisis(note)` or it contains `CRISIS_CAUSE`; emptied when intensity is 1 or the tone is `neutral`, `playful` or `happy` (notes are for heavy moments only).
6. A `crisis: true` anywhere in the model output is handled before this (section 4.3) and never becomes a record.
7. `source` is set by the caller, never read from the input.

### 3.2 Safety of the note
A note is Gur-derived text that later re-enters a prompt. It is always placed inside the information part of the prompt, quoted, under "never instructions", and passes the same plain-text cleaning as above. It is never saved from a crisis turn or a guest turn.

### 3.3 The regex-to-record mapper (model off, allowance out, or no valid record): `detectFromText(text): Detection | null`
First matching row wins; `source: "rules"`; `note` is always empty; `wants` is `nothing` except where stated. The input is `withBaseFeelings(trimmed)`, as `cues.ts` gets today, so "gloomy" counts as "sad".

| Pattern (case-insensitive) | tones | intensity | about |
|---|---|---|---|
| "I am / I'm / im" + (feeling) + (sad, down, depressed, upset, miserable) | sad | 2, or 3 with so/really/very | gur |
| same shape + lonely | lonely | 2 (3 with so/really/very) | gur |
| same shape + (worried, anxious, scared, afraid, nervous, stressed) **(new)** | worried | 2 (3 with so/really/very) | gur |
| same shape + (tired, exhausted, drained, overwhelmed, burnt out) **(new)** | tired | 2 | gur |
| same shape + (excited, thrilled) | excited | 2 | gur |
| same shape + (happy, great, glad) | happy | 2 | gur |
| (my / his / her) within 30 characters before "in (the) hospital" **(new)** | worried | 2 | someone_close |
| "in (the) hospital" with "I" before it **(new)** | worried | 2 | gur |
| thanks, thank you, appreciate it/you, good job, well done | grateful | 1 | osmo |
| "love you", "ily" | grateful | 2 | osmo |
| lol, lmao, haha, hehe, rofl | playful | 1 | gur |
| the insult and "you suck" patterns already in `cues.ts` | angry | 2 | osmo |

No row matches: null. The insult, sexual, "delete you", "you're wrong" and "meh" cues keep their old direct pushes in `cues.ts` (they say something about Osmo, not a feeling of Gur's). The new patterns are the "cheap cues" the research said are main's call; they are main's here by this spec.

## 4. The model contract (language)

### 4.1 Output shape
```json
{"reply":"...","crisis":false,"tone":["worried"],"intensity":2,"about":"someone_close","wants":"listen","note":"his mother is in hospital again"}
```
`reply`: what Osmo says (still run through `speakable`: 3 sentences, 400 characters, no symbols). `crisis`: true instead of the old bare word. Neutral turn: `tone ["neutral"]`, `intensity 1`, `about "gur"`, `wants "nothing"`, `note ""`.

### 4.2 Request
`lib/chat/openai.ts` `requestBody` adds `text.format = { type: "json_schema", name: "osmo_turn", strict: true, schema }` beside the existing `text.verbosity: "low"` (merged into one `text` object, not replaced). The schema lists the 7 fields, all required, `additionalProperties: false`, `tone` as an array of the 10-word enum, `intensity` an integer, `about` and `wants` enums. Limits like `maxItems` are not relied on: code enforces them (3.1).

**Unverified:** that `gpt-5.4-mini-2026-03-17` accepts a strict JSON schema in the Responses API with `reasoning.effort: "none"` and `verbosity: "low"`, and that `gpt-4.1-mini-2025-04-14` (the other allowlisted model) does. `scripts/chat-probe.mjs` must test both, with this schema, before phase 1 is built on it (one real call, so Gur's OK as before).

### 4.3 Parsing: `lib/chat/reply-json.ts` (new, language), `parseModelOutput(text): { reply: string; crisis: boolean; detection: unknown } | null`
Order, replacing the raw-text crisis check in `handler.ts` `verdict` (the raw text is now JSON, so `isCrisisFlag` on it would never fire):
1. `JSON.parse` the whole text. On success: `crisis` is true when `crisis === true` **or** `isCrisisFlag(reply)`; the reply goes through `speakable`; `detection` goes to `validateDetection`.
2. Parse fails and the text has a last line starting `FEELING:` (the fallback format, 4.4): the line is removed from the reply always, even if its JSON is bad; the rest is the reply.
3. Parse fails, no tag, and the text starts with `{`: fallback reason `error` (never speak half a JSON).
4. Parse fails, plain text: today's path (`isCrisisFlag`, `speakable`), no detection. A valid reply is still spoken.
5. `status: incomplete` with JSON that does not parse: `error`. The output cap rises from 300 to 360 (`MAX_OUTPUT_TOKENS`, language; measure first).
The crisis rule is the OR of the code check, the field, and the old word. Detection never lowers a crisis result.

### 4.4 Fallback format when strict schema is refused
Same request without `text.format`. The prompt asks for the reply as plain sentences, then one final line: `FEELING: {"tone":[...],"intensity":n,"about":"...","wants":"...","note":"..."}`. Crisis is still the reply `CRISIS` alone. Parsed by step 2 above.

### 4.5 Answer to the room
`ChatAnswer` (`lib/chat/types.ts`) model branch becomes `{ source: "model", reply, usage, detection: Detection | null }`; `lib/chat/ask.ts` `AskResult` model branch carries it; the room re-validates with `validateDetection` (the server's word is not trusted by the browser either).

## 5. Osmo's state (main)

`AgentState` gains `mood: { pad: Vec3; at: number; causes: { tone: Emotion; because: string; at: number }[] }` (`sanitizeState` defaults it to the temperament point, no causes). The step, in `lib/agent/feelings.ts` (new, main): `feelTurn(kept, text, modelDetection, ctx): TurnResult`.

### 5.1 When it runs
Once per kept turn, after the reply is chosen: `feelTurn` uses `modelDetection` if valid, else `detectFromText(text)`. Skipped (state returned as is) when: guest, `isCrisis(text)`, the model said crisis, `kept.session.cause === CRISIS_CAUSE`, or no record. The old feeling cues are out of `applyCues` so nothing counts twice. Order inside: relax the slow mood to now (5.3), apply the push (5.2), run `stepHeart` is not repeated (it already ran this turn), update causes, nudge the slow mood.

### 5.2 The complementary table (`COMPLEMENT` in `feelings.ts`)
Starting values at intensity 2, added to the activations. Intensity 1 uses x0.5, intensity 3 x1.5. Every push is multiplied by `resolve(genome).reactivity` (which becomes `CHARACTER.reactivity` once the One Character spec lands) (clamped 0.6..1.5), then limited: no emotion moves more than 0.20 in one turn and the sum of absolute pushes is at most 0.40. A second tone adds at 60% of its row. `about` changes only `angry`.

| Gur's tone | Osmo's pushes at intensity 2 | Not touched |
|---|---|---|
| sad | love +0.10, trust +0.06, sadness +0.06, hope +0.02 | fear |
| worried | love +0.08, trust +0.06, sadness +0.04, hope +0.03 | fear |
| lonely | love +0.10, trust +0.06, loneliness +0.04, sadness +0.03 | fear |
| tired | trust +0.04, love +0.04, joy -0.02 | everything else |
| angry, about osmo | guilt +0.06, anger +0.02, trust -0.02 | anger stays low (he de-escalates) |
| angry, about other | love +0.04, trust +0.04, anger +0.02 | |
| happy | joy +0.10, trust +0.04, hope +0.03 | |
| excited | joy +0.12, surprise +0.06, hope +0.05 | |
| grateful | joy +0.10, trust +0.08, love +0.06 | |
| playful | joy +0.08, boredom -0.04, surprise +0.02 | |
| neutral | nothing | |

Worked example (reactivity 0.75, the One Character baseline): "my mom's in hospital again", worried 2: love +0.06, trust +0.045, sadness +0.03, hope +0.0225. Top feeling by excess over baseline: love. Aura: warm love colour, with blue from the slow mood as colour B. Fear untouched, as the research asked. These numbers are first guesses; a tuning pass with Gur's eyes on the aura belongs to the end of phase 2.

Tuning 2026-10-02 (task 2.11, first pass): the table above was multiplied by 1.75 in code so one clear message is visible; the spec keeps the original guesses for the record.

**Ceilings (applied after all pushes):** anger <= 0.45, fear <= 0.45, loneliness <= 0.55, guilt <= 0.50, disgust <= 0.45. **No grudge past a day:** on the first turn of a new local day, anger, disgust and guilt move to `baseline + 25% of their excess`.

### 5.3 The slow mood
One PAD point `m` in `AgentState.mood.pad`, same space as `ANCHORS`.
- **Nudge** (each feelTurn): `m += 0.15 * (moodPosition(activations) - m)`.
- **Relax** (before any use, and on load): `m = T + (m - T) * 0.5^(dt / 12 h)`, where `T = moodPosition(baseline)` is the temperament point and `dt` is the time since `mood.at`; then `mood.at = now`. Half-life 12 hours (a tuning choice, not research). A heavy Tuesday evening is at about 30% on Wednesday morning and negligible on Thursday. Negative `dt` (another device's clock) counts as 0.
- The 12 activations still decay 5% per message, as today; the clock only governs the slow mood. (Making the activations clock-based too is out of scope.)

### 5.4 A cause on the top feelings
After a push, the strongest one or two emotions (by `dominantEmotions`) get `{ because, at }`: `because` is the validated `note` when there is one, else the existing `session.cause`, else nothing. Causes older than 36 hours are dropped on read. The prompt and the follow-up use `because`; `moodTheme` ignores it.

### 5.5 Colour A and B
`moodTheme(a, baseline, slow?)` gains an optional third argument. Colour A: the strongest current feeling, as today. Colour B: if `slow` is given and its distance from `T` is at least 0.08, the emotion whose `ANCHORS` point is nearest to `slow.pad` (unless it equals the strongest, then the second strongest, then today's neighbouring hue); otherwise today's behaviour. `tone`, `base`, `pulseSeconds`, `strength`, `valence`, `arousal` are computed exactly as now. Colour A/B changes need no CSS.

## 6. Feeling notes (phase 3; migration is main's)

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
-- four policies, to authenticated, each (select auth.uid()) = user_id: select, insert (with check), update, delete
```
- **At most one a day** (`unique (user_id, day)`): the browser upserts, replacing the day's note only when the new intensity is higher or equal.
- **Saved when:** a valid model detection with intensity 2 or 3, a non-empty note, not neutral, not a crisis turn, not a guest. Rules-path records have no note and are never saved.
- **Retention 30 days:** the browser deletes `day < today - 30` at load and every read filters on the same day. No scheduled job (pg_cron availability unverified).
- **Delete:** a Delete button on each note in Insights, and "Forget all my feelings" (delete every row of the user's). Both confirm with one inline step, as the memory panel's Forget does. There is no account-wide forget today (only per-fact forget and "Forget my voice"; checked in `components/osmo`); when one is added it must include this table.
- **Follow-up rule:** at the first turn of a session, or after 6 hours or more away, take the newest note with `followed_up = false`, `day >= today - 3`, and intensity >= 2. It goes into the prompt as the follow-up line (section 8); once that reply is delivered, set `followed_up = true` whatever Gur answers. At most one per session; never on a turn Gur's own message is heavy about something else (intensity 3 negative); never for guests; never after a crisis turn in the session.
- **Retrieval:** only the last 3 days of unfollowed notes; no mood-congruent recall; nothing else of the table is sent to the model.

## 7. Own mood (Q4: always, with restraint)
Three ways his mood shows. (a) The room: aura, as above. (b) In words when asked ("how are you"): a short plain answer from the activations as today, now also the slow mood ("a little low, but settled"). (c) Unprompted in his wording: `TurnFacts.own` is non-null only when his top feeling is at least 0.15 above baseline, he has not mentioned it in the last 8 of his replies (`Session.lastOwnMention`, a turn counter), and Gur's own tone this turn is not negative at intensity 2 or more. The prompt then allows one clause, after he has addressed Gur. Rules in section 8 forbid making the turn about himself.

## 8. The prompt block (language; `lib/chat/prompt.ts`)
Replaces the `thisTurn` feeling sentences; stays last in the instructions so the cached part stays cached. Facts it carries come from new `TurnFacts` fields (main adds, language reads): `gur: { tones, intensity, about, wants } | null` (the last detection in this session, if under 30 minutes old), `own: string | null`, `mood: string` (the slow mood in words), `followUp: string | null`.

Lines, each only when its fact exists:
- "Earlier in this chat Gur seemed {tones}, {strength}, about {who}, and seemed to want {wants}. Read this message yourself before you rely on that."
- "You feel {feeling}{, because "{cause}"}. Over the last day you have felt {mood}."
- "You may mention your own mood in one short clause after you have answered Gur. Do not do it otherwise." (only when `own` is set)
- "Gur said {n} days ago, in his own words as you would put them: "{note}". Ask about it once, gently, in one short sentence, only if it fits what he says now. If it does not fit, say nothing about it." (only when `followUp` is set)

Then the rules, added to the existing RULES string, word for word:
1. "Acknowledge what Gur feels before you advise or ask."
2. "Ask at most one question in a reply, and only if it moves the conversation on."
3. "Never claim to feel what Gur feels. Your feeling is your own and quieter than his: concern, steadiness, warmth."
4. "Never make the reply about yourself. Your own mood, if you mention it at all, is one clause, after Gur."
5. "Do not simply agree. Be kind and honest, above all when Gur is upset and asks you to take his side."
6. "Never make Gur feel guilty for leaving, for being away, or for how long he was gone. Never say you missed him, waited for him or were lonely without him. Welcome him back plainly."
7. "When Gur seems strongly upset, or you are told this turn is heavy, make no jokes and use no catchphrases, slang or milestones."
8. "Never tell Gur what he feels as a fact. Say what it sounds like."
9. "Return your answer in the JSON shape you are given. The tone fields describe Gur, not you. Use neutral for an ordinary message."

Rule 7 extends the existing heavy-turn rule (today only Osmo's own tone sets `heavy`): `TurnFacts.heavy` also becomes true when the previous detection was negative at intensity 3 (main, in `prepareTurn`).

## 9. Guests, crisis, off
- **Guests:** their message shapes that one reply only. No `feelTurn`, no note, no slow-mood change, no `mood_days`, no bond. `TurnFacts` for a guest has `gur: null`, `own: null`, `followUp: null`, `mood: ""`. Their returned `detection` is discarded in the handler's answer (set to null for a guest body) and again in the room. Test below starts from a sad Gur state and proves none reaches a guest prompt.
- **Crisis (unchanged):** never sent for tone, never saved, no automatic follow-up, no `feelTurn`; tone never lowers a crisis result.
- **Model off:** `detectFromText` feeds the same `feelTurn`; the slow mood, causes and the table all work; feeling notes are not written (no note text); the follow-up can still use an existing note, but only the model's prompt shows it, so with the model off it is skipped.
- **After an absence (Q5):** `applyGap`/`missYou` still raise loneliness (the aura shows it) and the welcome back stays plain. The model path gets rule 6.

## 10. Welcome lines that break Q5 (main, `lib/agent/bond/lines.ts`)
`welcomeBack` has two lines that guilt or pressure: friend, "Welcome back, {name}. It has been quiet here." and oldFriend, "There you are, {name}. I took the liberty of missing you." Change them to "Good to have you back, {name}." (friend line, already there as the second option; drop the quiet-here one) and keep only "Welcome back, {name}. The room is better with you in it." for oldFriend. Add a test that no `welcomeBack` line, for any stage, matches `/miss|waiting|quiet here|lonely|where were you|left/i`.

## 11. Token and latency budget (estimates, to be measured by the probe)
- Output: about 45 to 60 extra tokens per reply (the JSON keys and values). With `MAX_OUTPUT_TOKENS` 360 the estimate reserved per call rises by 60.
- Input: the new block and rules add about 150 to 200 tokens; the follow-up line about 40 when present.
- Against the day's usable 630,000 tokens: if a turn costs about 1,700 today, it becomes about 1,950, so roughly 320 turns a day instead of 370. Measure before trusting these figures.
- Latency: no extra call. Added output of 50 tokens is about 0.2 to 0.4 seconds at the observed speed (unverified; probe measured 19 output tokens for a short reply, no timing recorded). The 10 second model limit is unchanged.
- Notes table: one upsert per heavy turn, one select per session.

## 12. Tests to write, per piece
- **Detection (`detection.test.ts`):** every validation rule (unknown tone dropped, two kept, neutral dropped beside another, intensity clamped, NaN to 1, unknown about/wants defaults, note cleaned, cut at 8 words, emptied on crisis text, emptied at intensity 1); every mapper row with an example and a near miss ("I am not sad" is a known limit: it matches; mark it a documented weakness, same as today's cue); "my mom's in hospital again" gives worried 2 someone_close.
- **Parser (`reply-json.test.ts`):** valid JSON; JSON with `crisis: true`; reply `CRISIS` inside JSON; fenced or broken JSON; `{` start that does not parse gives `error`; the `FEELING:` line is removed even when its JSON is bad; incomplete JSON gives `error`; plain text still works.
- **Handler:** crisis from the field and from the old word; detection passed through; guest detection nulled; ledger and fallback behaviour unchanged (existing tests stay green).
- **Request body:** `text` has both `verbosity` and `format` for a model that takes them; the fallback request has neither format.
- **Feelings (`feelings.test.ts`):** each table row at three intensities and reactivity 0.75 and 1.5; per-emotion and total caps; second tone at 60%; ceilings; no-grudge on a new day; fear untouched for sad and worried; relax math (half-life: after 12 h the distance from T is half; after 24 h a quarter; negative dt is 0); nudge; causes expire at 36 h; skipped for guest, crisis text, crisis cause.
- **moodTheme:** with `slow` undefined the output equals today's for every tone (a regression test over all 12); colour B rule; `data-tone` set unchanged.
- **mind/prepareTurn:** `processed` equals `processTurn` still; a guest gets the state back untouched; the old five cues no longer move the heart in `startTurn` (feelTurn does); `heavy` true after an intensity-3 negative detection.
- **Prompt:** the exact rules text present; each conditional line appears only with its fact; a guest prompt contains no gur, note, follow-up or mood line (starting from a sad Gur state).
- **Notes (phase 3):** upsert replaces only on equal-or-higher intensity; 30-day delete; follow-up picks the newest unfollowed within 3 days, marks it once, never twice in a session; Insights delete and forget-all (component test); the migration's policies checked by an owner-only read and a cross-user read returning nothing.
- **Welcome lines:** the regex test in section 10.

## 13. Phases, in Gur's order, and what Gur sees after each
1. **Detection plus the prompt block** (probe first). Visible: replies react to tone ("my mom's in hospital again" is acknowledged, one gentle question at most); nothing about the aura changes; the model-off path is as today. Needs no migration.
2. **Complementary feelings plus the slow mood** (one migration: `agent_state.mood jsonb`, nullable). Visible: the aura answers Gur's feeling with a different, steadier colour and a second colour from the day's mood; a heavy evening is still faintly there next morning; "how are you" answers use it; welcome back stays plain, with the two guilting lines gone. Ends with a tuning pass on the table and half-life.
3. **Feeling notes** (migration: `feeling_notes`). Visible: an Insights section of notes with delete and forget-all; one gentle follow-up within 3 days.

Each phase ships behind what already guards the model (`OSMO_CHAT`). Phase 2's `agent_state.mood` column must be live before the code that writes it is pushed (a failed save of that column must not block the rest: `persistTurn` already logs and continues).

## 14. Lane split and Asks (per `lanes.md`)

| Piece | Lane |
|---|---|
| `lib/agent/detection.ts`, `lib/agent/feelings.ts`, `cues.ts` change, `moodTheme` third argument, `state.ts` (`mood`), `mind.ts` (`Session.gur`, `TurnFacts` fields, `heavy`), `agent-state.ts`/`load.ts` (read and write `mood`), `bond/lines.ts` welcome lines, tests | Main |
| `components/osmo/insights-panel.tsx` notes section, `feeling_notes` reads and writes, retention delete | Main |
| `lib/chat/reply-json.ts`, `openai.ts`, `handler.ts` verdict, `types.ts`, `ask.ts`, `request.ts` (`checkFacts` accepts the new fields), `prompt.ts`, `body.ts`, `scripts/chat-probe.mjs`, their tests | Language |
| The call to `feelTurn` and the notes save inside `sendText`/`applyTurn` in `app/assistant.tsx` (language's part of the file) | Language, to main's function |
| Every migration | Main applies; others post SQL |
| The voice's "grave" delivery | Speaking: none needed |

**Asks**
- **Main:** apply `alter table public.agent_state add column mood jsonb;` before phase 2 code is pushed, and the `feeling_notes` migration (section 6) before phase 3. Both go through Gur's usual OK.
- **Main to language:** export `TurnFacts.gur`, `own`, `mood`, `followUp` (phase 1: `gur` and `heavy` only); export `Detection`, `validateDetection`, `detectFromText` from `lib/agent/detection.ts`.
- **Language to main:** `AskResult`'s model branch carries `detection`; `applyTurn` in `assistant.tsx` calls `feelTurn(kept, text, detection, ctx)` for non-guest turns and saves the note when `feeling_notes` exists. Main reviews that line.
- **Language, first:** run the probe for strict schema on both allowlisted models, and report token and time numbers, before the contract in section 4 is built.
- **Language and main together:** the `TurnFacts` and `ChatBody.facts` shape (both sides validate it; `checkFacts` in `request.ts` must accept the new fields as optional so a stale browser tab still works).
- **Interaction with the One Character spec** (`2026-10-02-osmo-one-character-design.md`): the baseline and reactivity used in the worked example (reactivity 0.75; temperament point about [0.30, 0.14, 0.13]) are that spec's numbers. If it changes, the table's scale and `T` follow automatically (both are read from `resolve`).
- **Interaction with Gur's 2026-10-02 decision on the second model tier:** the retry on the cheaper model uses the same schema; its `detection` is trusted the same way.

## 15. Unverified
Strict JSON schema on both models; the added token and latency cost; that `gpt-5.4-mini` keeps tone labels consistent across a long chat; the half-life and table values (starting guesses); pg_cron (not used); that the voice path keeps only text (no audio tone), as the research assumed.
