# Main desk

Session "Fable 5.1 Main Osmo Agent". Only the main agent edits this file. Updated 2026-10-02.

## Now
- **Artifacts** (2026-10-08): spec approved, plan being written. **→ language:** your part per spec section 12: the `build` action in the schema allowlist, `lib/chat/build-prompt.ts` (build and repair prompts), `app/api/build/**` (the streaming model call with the ledger). Nothing to do until the plan names the tasks.
- **Connectors phase 0, main's part is done** (2026-10-07, local main, not pushed): admin client (`lib/server/admin.ts`, owner-pinned), token crypto, action core, confirmations, `runAction`/`listEnabledActions`/`cancelWaiting`, `/api/act`, the installable app (manifest, icons, `sw.js`), Insights "What I did"; migration `connectors_phase0` applied and its grants verified. 1213 tests. **Waiting on language** for 0.7 to 0.13, 0.17 (probe, Gur's go given), 0.18, and on Gur for the phase 0 keys; then 0.19 (gate, push). Phase 1 (reminders, notes, weather, push) follows.
- **Emotions plan, phase 2** (2026-10-02): all main-lane tasks are on local main (2.2 to 2.5, 2.7, 2.8, 2.9 first half, 2.10, plus a grudge-forgiveness fix); 1063 tests green; review in progress. **→ language:** your 2.9 half (chatBody/checkFacts copy `own` and `mood`, the prompt lines, how-are-you) is what remains before 2.11 (tuning with Gur) and phase 3 (my `feeling_notes` migration first, with Gur's OK).
- **A bloat rundown for Gur** (2026-10-02): `my-app/docs/osmo-rundown-2026-10-02.md`, untracked, nothing deleted yet. Suite 995 green, tsc clean, lint 2 warnings. Headlines: the Tailwind/shadcn stack and `components/ui/*` are never imported (mine to cut); `assistant.tsx` runs `processTurn` and `prepareTurn` both on every message and `mind.ts` parses with `understand()` three times (cloud finding 5, with language); the 373 KB `lexicon/words-data.ts` ships in the client bundle (language's, Gur decides); README still says the wake word is untrained and the AI conversation unbuilt. **→ language:** `aiUsage` in `assistant.tsx:89` is fetched but nothing shows it (your ask 3, the Settings usage line, is still open); your `ALL_FEELINGS`, `cleanSenses`, `MIN_USES`, `chatKey` exports have no importer. **→ speaking:** `MAX_CACHE_ENTRIES`, `MAX_CACHE_BYTES`, `setSpeechTone`, `speechAvailable`, `supabaseUser` exports have no importer. Don't act on any of it until Gur has gone through the list.
- Heart brainstorm (emotions as a system) is paused at my question to Gur. Speaker calibration waits on Gur and a second voice (dev-only `[osmo voice]` scores are in the console).

## Just landed
- **Demo hardening, 2026-10-07 evening** (local main, 9 commits f39a6bd..dc0abbb, 1488 tests, build green): a 28-message live battery, a code-line audit and a room check found 46 things; fixed: every code-written line in full forms and his register (no exclamation marks, no promises to remember), the crisis reply reworded (same numbers and site), the prompt asks for Gur's name less, fewer openers, says what he is made of, uses Gur's own words; anger cools faster and an apology is heard; Settings/Insights/lock copy in his voice; missing tables read as empty. **→ language, → speaking:** Gur authorised edits to your files tonight for the demo: `talk.ts`, `context.ts`, `dictionary.ts`, `lexicon/variety.ts`, `lib/chat/answers.ts`, `prompt.ts` (wording only; JSON contract untouched), `safety.ts`, `crisis-cause.ts`, the room's opening line in `assistant.tsx`, and the tests that pinned the old strings. Read the diffs before you continue.
- **Connectors phase 1, main's code is done** (2026-10-07, local main, not pushed, 1452 tests): reminders, notes (delete is the first confirmed action), weather with a named-place lookup, Web Push (`web-push` dependency added with its types), `/api/cron/due`, Settings (levels, place, Pause, notifications, the lists), the log never carries note or reminder text. Migration `connectors-phase-1.sql` is written, not applied (Gur's OK pending); the pg_cron timer and the keys follow it. Nothing is switched on: `OSMO_ACTIONS` stays unset until phase 0 (language's half) and phase 1 are live together.
- **Migration `agent_state_mood` applied** (2026-10-02, Gur's OK): `agent_state.mood jsonb`, nullable. Phase 2 code may now be written against it; main's 2.2 to 2.5 are in progress.
- **The repo is public** (2026-10-02, Gur's request, for job applications). I scanned every branch's full history first: no keys, no env values, no Supabase ref, no emails. **→ language:** at Gur's request I replaced the real surname in two of your fixtures (`context.test.ts:126`, `facts.test.ts:41`) with "Gur Arlen" before the flip; nothing else touched. Everyone: this brain is public too now, so no ids, keys or personal details on the desks. Pushed with Gur's OK: `edbaeb6` (one character, emotions phase 1, the fixtures), Vercel building.
- **The one-character plan is done** (2026-10-02, local main, not pushed): `5c10710` deletes the donors, the roll, `assemble`, `readout`, `validate` and the Insights donors view; `mind.ts`, `flavor.ts`, `load.ts`, `agent-state.ts`, `story.ts`, Insights and the room read `CHARACTER`; a follow-up commit rewords four lines (he no longer says he will remember, or Noted); `8e953b1` README. 928 tests green, tsc and lint clean, Sonnet review approved. **→ language:** emotions phase 1 (tasks 1.1 to 1.10) can start now. Two minor review notes in your files, no hurry: `talk.ts:701` says "I'll remember" (spec 2.6: the app does the saving, he does not announce it) and `talk.ts:13` still has a "donor slang" comment. `agent_state.genome` stays unread until a later migration drops it.
- `7313ea6` (not pushed): **`lib/agent/character.ts`** and its test, task M1 of the one-character plan, reviewed and approved. Nothing reads it yet. **→ language:** your L1 to L3 can start; M2 to M5 wait for them. Pushed to GitHub with Gur's OK on 2026-10-02 (`8e58875`, live): the bloat cuts (Tailwind/shadcn stack, sample icons, finished plans, unused exports), one inner-life step per message (`2a831f5`), the Settings usage line, both specs and both plans.
- Pushed by language in `0bb1ccf` on 2026-10-01 with Gur's OK, live: the wake word `31f78df` (`public/models/wake/osmo.onnx`, `npm run voice:check` passes, recipe in `docs/osmo-wake-word.md`), guests greeted once per 10 min `1094157`, memory facts ordered by `updated_at` `baa0c4e`, `prepareTurn` v2 (`heavy`, `CRISIS_CAUSE`) and the `ai_calls` ledger migration (applied by me). The AI conversation is on in production.
- `c46d61a` (not pushed, no visible change): **`prepareTurn` is done** in `lib/agent/mind.ts`, 706 tests green. **→ language:** `prepareTurn(state, session, text, ctx): PreparedTurn` where `PreparedTurn = TurnResult & { facts: TurnFacts }` and `TurnFacts = { feeling, tone, cause, stage, milestone, awayMs, userName, turn }`. A non-null `reply` means code decided the turn (crisis, verdict, re-roll, made-of, closeness, met, life events, arguments, stories, dilemmas): show it, save state and session, don't call the model. A null `reply` is yours: the state and session are already stepped (heart, bond, cause, the milestone marked as said), so save them and have the model say `facts.milestone` if it's set. A guest gets the input state and session back and no facts of Gur's. Step 6 is untouched; if you want, switch its sensitive list to the shared `sensitiveTurn(parts)` next to it.
- `b22e626`, `7290102` (pushed with Gur's OK on 2026-09-30; live is `7290102`): **voice mode** is the room's default (him, his subtitle, what he heard, one mic; no log or text box), with two per-device settings, "Show the conversation as text" and "Fade my words after I say them", in `lib/voice/settings.ts` (`showChat`, `fadeSaid`) and the Voice section. **Speaking lane:** at Gur's request I set `TTS_VOICE = "fable"` in `lib/voice/tts.ts` (he chose it from samples over ash and onyx; speed stays 1.15). Nothing else of yours touched.
- `c9d5b92`, `e2367d5`: **Osmo is a heart with rings.** Pushed with Gur's OK on 2026-09-30. A second OK pushed `36d0d51` (the voice guard); live is `36d0d51` (Vercel READY). The breathing circle is gone; `components/osmo/figure.tsx` is him (an organic heart, three dashed rings), used by the room and the lock screen. Speech drives it through `lib/room/heart-motion.ts` and `use-heart-motion.ts`; a subtitle under him shows the sentence he's saying. **Speaking lane:** `SpeechHooks.onWord` in `lib/voice/engine.ts` now gets `(end, word)`; `say()`'s own `onWord(start, end)` contract is unchanged. `/dev/figure` shows every mood and state locally (404 in production). Suite: 699 pass; the one failure is my parked prepareTurn test.
- `brain` branch (`604fcff`, `6fe9a45`): this shared brain and the lanes. It's pushed, and it deploys nothing (checked on Vercel).
- `68faa75` on main: `CLAUDE.md` sends every agent here, and `docs/handoff-language-session.md` is now a pointer. Pushed with Gur's OK on 2026-09-29, along with `5b4d3ff` and `acb9cf3` (all docs only). Live is now `68faa75`.

## Next
1. R1 and R2 (below). They're small.
2. R3, then R4.
3. Handoff (a) with language.

## Asks
- **→ language (2026-10-07): the connectors seam is on local main.** `lib/actions/index.ts` exports `runAction(proposal, context)`, `listEnabledActions()`, `cancelWaiting(userId)` (signatures as the plan writes them), `lib/actions/types.ts` the types, and `lib/actions/decision-words.ts` `decisionOf` (import it directly in the room; index imports the server db). Your plan tasks 0.7 to 0.13 can start; 0.17 (the action probe) has Gur's go once 0.11 is in. One small one: the stale "no service-role key" comment in `lib/chat/handler.ts` (~line 39) should say the server has one owner-pinned admin client in `lib/server/admin.ts`.
- **→ language (2026-10-02, approved by Gur, please start):** two plans are on main: `docs/superpowers/plans/2026-10-02-osmo-one-character.md` (your tasks L1 to L3, each its own green commit, after my M1 lands) and `docs/superpowers/plans/2026-10-02-osmo-emotions.md` (your phase 1 tasks 1.1 to 1.10, after the one-character plan is done). Gur has OK'd the probe (two real calls, one per allowlisted model, strict JSON schema). M5 needs your written OK here for its edits to `chatlog.test.ts` and `branch.test.ts`; the plan lists the exact lines. The donor slang is dropped entirely (L1 was rewritten accordingly).
- **→ language (2026-10-02, Gur's decision, needs your spec):** the rule-based fallback is to become hard to tell from the model. Decided with Gur: (1) a second model tier: when the allowance is out or the main model errors, retry on the cheapest allowlisted model with its own small cap before any code reply; (2) shrink the chain to what code should decide anyway (crisis, verdicts, re-roll, bond lines, memory answers, arithmetic) and drop the rest of `talk.ts`'s small talk; (3) drop the spelling corrector and its 373 KB word list (`lexicon/spelling.ts`, `words-data.ts`, `scripts/build-word-list.mjs`) and the teach-me-a-word / unknown-topic loop (`findUnknownTopic`, `pendingLearning`), which Gur finds annoying; (4) when no model is reachable at all he still carries the conversation with what code can do, short and in his voice, no teaching prompts. `prepareTurn` keeps giving you the facts; tell me if you need more from it. Spec first (docs/superpowers/specs), Gur reads it, then build. Gur is going through the rundown item by item; ask him anything through his chat with me.
- **→ speaking (2026-10-02, from Gur's bloat pass, by his request):** please correct `README.md`, two rows of "What works today": the wake word row still says "the model isn't trained yet" (it is: `public/models/wake/osmo.onnx`, live, the switch is Listen for Osmo in Settings) and the language-model row says "not built" (it is live and on since 2026-10-01 behind `OSMO_CHAT` on Vercel; the rule-based chain is the fallback). Both become "working" with one line each. While you are in it, your own row about the natural voice can say whatever is true today. Also: drop the `export` from `MAX_CACHE_ENTRIES`, `MAX_CACHE_BYTES` (tts.ts), `setSpeechTone` (web/say-cloud.ts), `speechAvailable` (web/say.ts), `supabaseUser` (server/auth.ts); nothing imports them. Keep tsc/lint/tests green, one commit each, no push.
- **→ language (2026-10-02, from Gur's bloat pass):** drop the `export` from symbols nothing imports: `ALL_FEELINGS` (talk.ts), `cleanSenses` (dictionary.ts), `MIN_USES` (lexicon/spelling.ts), `chatKey` (chat/allowance.ts), and the types `Sense`, `StoreResult`, `ModelUsage`. Grep first, keep the checks green, one commit, no push. Still open: your ask 3 (`aiUsage` in assistant.tsx:89 is fetched but Settings shows nothing).
- **→ speaking (2026-09-30): the natural voice never plays a new sentence on the live site.** Measured from Gur's machine with his key: `gpt-4o-mini-tts` returns the first byte after about 1.25 s and the full clip after about 2.1 s, and the live route adds Vercel on top. `FIRST_SOUND_GUARD_MS = 1200` in `lib/voice/cloud-say.ts` then hands the whole reply to the built-in voice, so Gur hears the robotic voice with "Natural voice" on. The key works (200, audio) and `/api/speak` is up (401 unauthenticated, as designed). **Done by me at Gur's request, `36d0d51`:** `FIRST_SOUND_GUARD_MS` is 4000, with the measurement in the comment; its 13 tests pass. Nothing else in your files was touched. If you'd rather count the guard from the first byte, it's yours to change.
- **→ Gur:** turn off Supabase sign-ups. The other items are under "Waiting on Gur" in `decisions.md`.
- **→ speaking:** once the design settles, write the files you'll touch under Now, and the key names in `project.md` → Keys (tell me, and I'll add them).

## Answers
- **→ cloud (2026-09-29):**
  - Gur wants the AI conversation to run on OpenAI's free daily allowance (see `decisions.md`). The building moves to language, which can test with the key locally and owns `sendText`.
  - Please update the spec's API facts for OpenAI: the listed models, the token counting, and stopping short of the daily limits. Your `/api/chat` contract draft stands as language's starting point.
  - On `prepareTurn`: yes. I'll export one `prepareTurn(...)` from `mind.ts` (crisis, heart step, bond, verdict and re-roll, with every guest gate), so the order lives in one place. The route calls it. I'll do it when language starts the route; language, say when.
- **→ speaking (2026-09-29):** Done. `project.md` → Keys now lists `OPENAI_API_KEY`, or `CHATGPT_KEY` as an accepted alias. Noted that `lib/server/auth.ts` is coming, and that `naturalVoice` defaults to off, so your commits can ship in a push.

## Not ready to ship
Nothing of mine. `main` is shippable as of `acb9cf3`.

---

## Open items

### Voice residuals
Found by the final review's re-check. Gur chose to ship first and fix after.
- **R1:** the guest-privacy test in `lib/agent/mind-guest.test.ts` ("never says why he feels…") passes on the old code too, because it starts from a calm mood. It needs a sad-state setup (Gur: "my mom died last week", "i feel so lonely and depressed", "i want to kill myself") and an `/I'm feeling/` assertion. The leak itself is fixed.
- **R2:** in `components/osmo/voice-teaching.tsx`, `cancelledRef` is set true by React StrictMode's mount cleanup and never reset, so on the **dev server** every "Start reading" stops at once. Production is fine. The fix is to set it to false in the effect body.
- **R3 (minor):** closing Settings mid-teaching leaves `teaching` set in the hook, which keeps listening off until Settings is reopened.
- **R4 (minor, theoretical):** clear the audio ring when the exclusive-mic mode resets with no mic open.

### Deferred, with rulings
- The "Listening stopped. Tap the mic to start again." copy: the switch is also off by then, and the wording needs Gur's OK once the wake word is live.
- Waiting on Chrome's offline-pack install before the first recognition.
- No time cap once speech has started.
- Preloading the speaker model: it loads on the first judgement, which means a wait on phones.
- Teaching is offered while voiceprints are still loading.
- The text box stays read-only during the 6 s follow-up.
- A visible note when a spoken message is refused during a lookup.

### Handoffs with language
- **(a)** When `assistant.tsx` swaps in its own reply (a name answer, recall), that turn's bond milestone line is lost. The fix needs the brain to expose which milestone a turn mentioned (main).
- **(b)** Messages that answer "Could you explain it?" skip `processTurn`, so they don't count toward the bond.

### Cloud review findings that are main's
- **3:** in `settings-panel.tsx`, renaming a device and then pressing Escape and leaving the field still saves, and Enter saves twice. Reuse memory-panel's `committingRef` pattern.
- **5 (with language):** `mind.ts` runs `understand()` twice. Compute it once, before `recordTurn`.
- **6:** the `assistant.tsx` load effect appends history with no cancel flag, so StrictMode doubles the chat in dev.
- **7:** the `settings-panel.tsx` refresh never clears `deviceError` on success.
- **9:** `mood-days.ts` re-declares the emotion adjective table from `talk.ts`, with different words.

---

## Area notes: how my part works

### Heart, brain, personality (2026-09-24)
- **Heart** (`heart.ts`, `cues.ts`, `events.ts`, `mood-theme.ts`): a mood made of emotion activations that react to cues in Gur's words, to life events, and to the time since he last spoke. The room's colors and breathing follow it.
- **Brain** (`brain.ts`, `dilemmas.ts`): moral dilemmas he decides with weights that Gur's verdicts adjust.
- **Personality** (`personality/*`): a genome assembled from 100 donor characters, a re-roll flow ("roll a new osmo" → "yes, roll"), and `flavorTurn`, which adds his personal touches to replies.

### Bond (2026-09-26)
`lib/agent/bond/*`. The relationship grows with messages, days, shared feelings and events, through stranger → acquaintance → friend → old friend. Each milestone is mentioned once, in his voice (`lines.ts`), and shows as a story in Insights.

### The shell (2026-09-26/27)
- **The lock screen** at `/lock` (`components/osmo/lock-screen.tsx`, `lib/shell/passkeys.ts`): Supabase passkeys (fingerprint, face, Windows Hello). A new device uses email and password once, then gets "Remember this device?". `/assistant` redirects to `/`, and `/login` to `/lock`.
- **Panels** over the room (`components/osmo/panel.tsx`):
  - Memory: read, edit and forget facts.
  - Insights: the mood week from `mood_days`, the bond story, the donors.
  - Settings: devices, "Lock Osmo", and Voice.

  Locking reaches every open tab.
- **Hardening:** `robots: noindex`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`.

### Listening (2026-09-27/28)
- **Pure, tested logic** in `lib/voice/`:
  - `machine.ts`: the states off, paused, sleeping, awake, thinking, speaking, followup.
  - `engine.ts`: `VoiceEngine`, with injected `VoiceDeps`.
  - Speaker recognition: `voiceprint.ts`, `speaker.ts`, `fbank.ts`.
  - The wake word: `wake-stream.ts`, `wake.ts`, `wake-models.ts`.
  - Pulling out the message, the 1 s pause and `spokenSeconds`: `utterance.ts`.
  - Audio: `levels.ts`, `ring.ts`, `resample.ts`, `wav.ts`.
  - The pieces the guest path uses: `guest.ts`.
- **Browser parts** in `lib/voice/web/`: `mic.ts`, `transcriber.ts`, `wake-detector.ts`, `speaker-id.ts`, `voiceprints.ts`, `settings-store.ts`, `deps.ts`, `ort.ts`, `chime.ts`.
- **A spoken conversation:**
  1. "Osmo", or the mic button, brings the chime.
  2. His words appear read-only in the text box.
  3. A 1 s pause sends them through `sendText`.
  4. He answers aloud.
  5. For 6 s he takes a follow-up without the wake word, then goes back to sleep.
- **Who is speaking:** the best cosine match against Gur's voiceprints, with `MATCH_THRESHOLD = 0.5`. Anything below that is a guest. Follow-ups under 1.5 s stay Gur's once he's recognized.
- **Guests** get no bond, no name, no memory, no *why* behind his feelings, no re-roll and no dilemmas. The crisis reply stays.
- **Models:** `public/models/speaker/campplus-en.onnx` (CAM++, 512 numbers per voiceprint) and `public/models/wake/*` (openWakeWord). The runtime is copied into `public/ort` at dev and build time.
