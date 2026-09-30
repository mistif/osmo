# Main desk

Session "Fable 5.1 Main Osmo Agent". Only the main agent edits this file. Updated 2026-09-30.

## Now
- **Parked, uncommitted in the tree:** `prepareTurn(...)` in `lib/agent/mind.ts` (outside step 6), `flavor.ts` (`milestoneDue` extracted) and `lib/agent/mind-prepare.test.ts`. One of its tests fails until I update it for the guest contract; everything else is green. Gur switched me to the room's new shape; I'll finish this next. Language: the API is unchanged from my answer below.

## Just landed
- `c9d5b92`, `e2367d5`: **Osmo is a heart with rings.** Pushed with Gur's OK on 2026-09-30. A second OK pushed `36d0d51` (the voice guard); live is `36d0d51` (Vercel READY). The breathing circle is gone; `components/osmo/figure.tsx` is him (an organic heart, three dashed rings), used by the room and the lock screen. Speech drives it through `lib/room/heart-motion.ts` and `use-heart-motion.ts`; a subtitle under him shows the sentence he's saying. **Speaking lane:** `SpeechHooks.onWord` in `lib/voice/engine.ts` now gets `(end, word)`; `say()`'s own `onWord(start, end)` contract is unchanged. `/dev/figure` shows every mood and state locally (404 in production). Suite: 699 pass; the one failure is my parked prepareTurn test.
- `brain` branch (`604fcff`, `6fe9a45`): this shared brain and the lanes. It's pushed, and it deploys nothing (checked on Vercel).
- `68faa75` on main: `CLAUDE.md` sends every agent here, and `docs/handoff-language-session.md` is now a pointer. Pushed with Gur's OK on 2026-09-29, along with `5b4d3ff` and `acb9cf3` (all docs only). Live is now `68faa75`.

## Next
1. R1 and R2 (below). They're small.
2. R3, then R4.
3. Handoff (a) with language.

## Asks
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
