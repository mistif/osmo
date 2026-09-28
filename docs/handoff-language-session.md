# Osmo handoff: all agents

The shared briefing for every agent working on Osmo. Three agents work on him; this document is where they stay on the same page. The main agent maintains it; the others add to their own sections and tell the main agent when something else changes. Last updated 2026-09-28 by the main agent, after the voice feature went live.

## Who's who

| Agent | What it owns | What it can reach |
|---|---|---|
| **Main agent** (this session; in ListAgents it's "Fable 5.1 Main Osmo Agent", earlier "Osmo idle pulsing animation") | The brain: heart, personality, bond, the shell (lock screen, panels), the voice. It also applies Supabase migrations, runs the browser checks in Gur's session, coordinates shared files, and writes this document. | The local tree, `.env.local`, the dev server and browser pane, the Supabase and Vercel tools, GitHub. |
| **Language session** ("Opus 5.5 Secondary Osmo Agent", earlier "Supabase database for conversations") | How Osmo reads and answers messages: understanding, memory facts, the dictionary, safety, the language chain in `app/assistant.tsx`. | The same local tree and tools as the main agent. |
| **Cloud agent** (works from GitHub; branch `claude/compassionate-sagan-x1teq9`, draft PR #1) | Review findings and the design for Osmo as a language-model agent (`docs/superpowers/specs/2026-09-28-osmo-agent-design.md`). | **GitHub only.** No local tree, no `.env.local`, no dev server or browser pane, no Supabase or Vercel tools, no voice-check clips, and it can't be messaged with ListAgents. It reads `main` on GitHub and proposes changes as PRs; Gur relays messages between it and the two local sessions. |

**Since 2026-09-28, GitHub `main` equals the local `main`** (commit `8b50b4f`, the voice feature). Before that, GitHub was 20+ commits behind, which is why the cloud agent's section at the end has stale facts; they're corrected in the note above it. Anyone can check the current gap with `git fetch && git log --oneline origin/main..main`.

## What Osmo is

Osmo is a rule-based chat companion for one person, Gur. There is no LLM: every reply comes from code in `lib/agent/`. Osmo has:
- a mood (the "heart");
- a personality stitched together from 100 donor characters (the "Frankenstein" genome);
- a bond with Gur that grows over time;
- a memory of facts Gur tells him;
- a dictionary;
- a voice: he speaks, listens, will wake to "Osmo" once the wake word is trained, and tells Gur's voice from a guest's.

**Stack:** Next.js 16 (App Router; read `node_modules/next/dist/docs/` before writing Next code, since it differs from older versions), React 19 with the React Compiler lint rules, TypeScript, Vitest, ESLint, Supabase (auth with passkeys, Postgres, row-level security), `onnxruntime-web` 1.30.0 for the voice models.

**Where it runs:**
- The app is in `my-app/`.
- The room (the chat) is at `/`, the passkey lock screen at `/lock`.
- Live at https://osmo-xyz.vercel.app. Vercel redeploys every push to `main` of the private GitHub repo `mistif/osmo`, **so a push is a deploy.**
- Supabase project `jtkeljvldtngkrftzwdm`, shared by local and production.

**Commands (run in `my-app/`):**

| What | Command |
|---|---|
| Tests (612 on 2026-09-28) | `npx vitest run` |
| Types | `npx tsc --noEmit -p .` (a fresh clone may need `npx next typegen` first) |
| Lint (one old warning about `router` in the load effect is expected) | `npm run lint` |
| Build (copies the ONNX runtime into `public/ort` first) | `npm run build` |
| Dev server | the `my-app` entry in `.claude/launch.json` (port 3000) |
| Voice model check (needs clips from `scripts/voice-clips.ps1`, Windows only) | `npm run voice:check` |

## Rules all agents follow

- **Two local sessions share one working tree.**
  - The **main agent** owns the heart, bond, personality, the lock screen and panels, and the voice: `lib/agent/bond/*`, `lib/agent/personality/*`, heart/state/cues/brain/dilemmas/events/mood-theme/mood-days/speech/load/agent-state, `lib/shell/*`, `lib/voice/*`, `components/osmo/*`, `app/assistant.module.css`, `app/lock/*`, `public/models/*`, `public/voice/*`, `scripts/voice-*`, `scripts/copy-ort.mjs`.
  - The **language session** owns understanding and answering:
    - `lib/agent/talk.ts`, `context.ts`, `safety.ts`, `dictionary.ts`, `dictionary-store.ts`, `vocabulary-store.ts`;
    - `lib/agent/lexicon/*`, `lib/facts.ts`;
    - the tests `chatlog.test.ts`, `voice.test.ts` and `typos.test.ts`.
  - **Shared:**
    - `lib/agent/mind.ts`: the language session owns step 6, "everyday conversation"; the main agent owns the rest, and the whole `guest` flag (every guest gate in `processTurn`, including the guest-safe values passed to `respond()` in step 6, was delegated to the main agent).
    - `app/assistant.tsx`: the language session owns `sendText`/`sendMessage`, `sendTextRef`, `onReplyRef`, `deliver`, `turnView` and their helpers; the main agent owns the room markup, the speaking animation (`paceRef`, `spokenIndexRef`), the panels, `useVoice`, `data-listening`, the listening line, the mic button and the "Someone else" label.
  - **Before editing a shared file,** message the other session with the exact diff and wait for an OK (ListAgents, then SendMessage). The cloud agent proposes shared-file changes in a PR, and Gur relays.
- **Git:**
  - Commit only your own files, staged by path. Never `git add -A` or `git add .`, because the other session may have uncommitted work in the same tree.
  - Small commits, each ending with the committing agent's own `Co-Authored-By` line (history holds Haiku, Opus, Fable and Sonnet lines; never rewrite it).
  - **Never push without Gur's OK.** Each OK covers one push. Gur has given two so far (the shell on 2026-09-27, the voice on 2026-09-28).
- **The database:** only the main agent applies migrations (through the Supabase tools). A migration that new code needs must be live before that code is pushed, because a push deploys.
- **Osmo's voice:** professional and speakable, like JARVIS.
  - He never uses slang, internet shorthand or emoji himself, and never echoes crude words back.
  - Replies avoid brackets and symbols a text-to-speech voice would read out.
  - He never mirrors Gur's grammar. He learns Gur's *vocabulary* only to understand him.
- **Never sign in for Gur** or enter credentials. Gur signs in himself; after that, the browser pane keeps his session for live checks. In that session, never send Osmo a message, click Lock, Remove, Forget, Remember, the mic, or teaching, and never edit memory. Read-only checks only.
- **Privacy rules the voice adds:** audio is never stored or uploaded; only voiceprint numbers reach Supabase. The microphone is never open without the listening line under the text box. Voice never unlocks Osmo and never stands in for the passkey.
- Replies that `chatlog.test.ts` pins ("yes, roll", /^Done\./, /roll a new osmo/i) are agreed with the main agent before any change.

## Current state (2026-09-28)

- **Live = local:** `main` is at `8b50b4f` on GitHub and locally, deployed on Vercel. The voice runs on the live site; the runtime, the models and the worklet all serve correctly (checked after the deploy).
- **Tests:** 612 pass; `tsc` clean; lint 0 errors (the old `router` warning); build OK.
- **Supabase auth:** passkeys are on (relying party `osmo-xyz.vercel.app`); anonymous sign-ins are off; **new sign-ups were still ON at the last check (2026-09-28).** Gur has been asked three times to turn them off (Authentication → Sign In / Providers). Recheck with a public GET of `<SUPABASE_URL>/auth/v1/settings` with the publishable key: `disable_signup` must be `true`.
- **Supabase tables** (all per-user row-level security, `(select auth.uid()) = user_id`): `agent_state`, `dilemma_log`, `emotion_associations`, `event_log`, `memory_facts`, `messages` (`speaker` column: null for Gur, `'guest'` for anyone else), `mood_days`, `user_words`, `voiceprints`, `word_lookups`.
- **Vercel:** every environment variable targets Production only, so preview deployments of other branches fail at build (confirmed: the cloud agent's branch shows an ERROR deployment). Adding the Preview target in the dashboard would fix it; Gur's call.
- **The wake word:** `public/models/wake/osmo.onnx` doesn't exist yet. Gur trains it in Google Colab (`docs/osmo-wake-word.md`). Until then, the "Listen for 'Osmo'" switch is disabled and the mic button is the only voice path.
- **Open follow-ups** are listed under "Still open" below.

## What the language session built

### 1. Memory and conversation storage, then dialogue fixes
- Osmo saves facts (`memory_facts`) and the conversation (`messages`) per user in Supabase.
- Dialogue bugs found in Gur's real chat log were fixed; `chatlog.test.ts` replays that log.
- Osmo got a modern but professional voice. Along with the main agent, the language session finished Tasks 5-13 of the Frankenstein personality plan.

### 2. Dictionary (spec and plan `2026-09-26-osmo-dictionary*`)
- **Word questions:** "what does X mean", "define X", "whats a X" are parsed by `parseLookup` in `dictionary.ts`.
- **Lookup order:** banned words, then meanings Gur taught, then built-in slang tables, then the per-user cache (`word_lookups`), then Datamuse, then Wiktionary.
  - Datamuse (`api.datamuse.com`) is spelling-tolerant, so it gives "I believe you meant ephemeral…".
  - Wiktionary (`en.wiktionary.org` REST) is the backup.
  - The whole lookup has a deadline of about 5 s, so it never hangs.
  - The cache write is fire-and-forget.
- **Replies** are built by `formatDefinition`:
  - "X means…", "A platypus is…", "X is slang for…";
  - "In your usage, bet means okay." for a meaning Gur taught;
  - "I'd rather not repeat that word." for a banned word;
  - `I'm not familiar with "X". Could you explain it? I'll remember.` when nothing is found. His next message is then saved as `meaning:X`, unless it's a new question (`answersPendingLearning`).
- **CSP:** lookups run in the browser. If anyone adds a `connect-src` rule to `next.config.ts`, both hosts must be listed, or lookups silently fail.

### 3. Understanding more
- **Word list:** `lib/agent/lexicon/words-data.ts`, generated by `scripts/build-word-list.mjs`. It holds 46,717 English words by frequency from film subtitles (hermitdave en_50k, CC-BY-SA-4.0). Keep its attribution header; it must stay committed.
- **Feelings:** about 312 feeling synonyms (`feelings.ts`), so "im gloomy" is read as sad.
- **Slang:** about 250 slang terms (`slang.ts`).
  - `PURE_SLANG` is rewritten before parsing.
  - `WORD_SLANG` (words that are also real words) is used for lookups only.
- **Typo reader** (`spelling.ts`):
  - weighted edit distance, where transpositions, doubled letters and keyboard-neighbour slips are cheap;
  - candidates ranked by word frequency, phrase fit, the recent conversation and Gur's own words;
  - short words change only with context, so "I ate pizza" is never rewritten;
  - names and taught words are protected.
- **Gur's vocabulary** (`vocabulary.ts`, `user_words` table):
  - A word he uses twice becomes his. It's never "corrected", and a typo of it is read as it ("znko" becomes "zenko").
  - Words from crisis messages and word questions are never learned.
- **Crisis safety** (`safety.ts`): the crisis check runs three times:
  - on the text as typed;
  - with everyday typos fixed;
  - with a generous typo pass on crisis words only ("im sucidal", "i want to kil myself").

  Common words are never bent into crisis words, so "and it all" never becomes "end it all". A missed crisis costs more than a false alarm.

### 4. The professional voice
- The reply wording across `talk.ts` and `assistant.tsx` is professional, e.g. "Hello, Gur. How can I help?", "Understood. What's next?", "I'm not sure I follow. Could you rephrase that?".
- A crude or slang feeling word is never echoed ("i feel shitty" gets "I'm sorry you're feeling this way…").
- Osmo's small repeated words vary (`variety.ts`), except words Gur just used.
- "what do you know" lists memory as speakable sentences.

### 5. The voice chain (commit `57c671b`)
- **One path.** `sendMessage(event)` calls `sendText(text, { via: "typed" | "voice", speaker: "you" | "guest", greet? })`. It returns false when the text is empty, Osmo hasn't loaded, or a lookup is running.
  - The voice calls it through `sendTextRef`, which is updated after every render, so it never runs on stale state.
  - Every reply goes through `deliver(reply)`, which hands it to the voice through `onReplyRef` inside `queueMicrotask`. The voice engine must learn its message was taken before an instant reply arrives, or the reply is lost.
- **`turnView`** (`context.ts`, tested) builds everything a turn may read. Gur gets his memory and his own conversation, without guest lines. A guest gets nothing of Gur's.
- **Guest turns:**
  - They never consume Gur's pending question, and never set or correct a name.
  - They don't reset the time since Gur last spoke.
  - They learn no vocabulary and write nothing to the cache.
  - `processTurn` runs with `guest: true` and its state is thrown away, so Osmo's mood and bond are untouched.
  - A guest who tries to teach him something gets "I'm afraid I can only remember things for the person I belong to."
  - Unknown words get `I'm not familiar with "X".`, with no promise to learn.
  - Both rows are saved with `speaker = 'guest'`.
  - The first guest reply gets "Hello. I don't believe we've met.", except on a crisis reply.
- A spoken message leaves Gur's half-typed draft alone, and Send is disabled while he listens, so it can't submit the hidden draft.

### 6. Reviews of the main agent's work
The language session approved every shared edit for the shell (lock, panels, sign-out in all tabs) and for the voice. It caught these on the way:
- blank memory values;
- a reply that could get stuck hidden while Osmo speaks;
- Send submitting the hidden draft while he listens;
- migration-before-deploy ordering.

## What the main agent built

Specs and plans for each live in `docs/superpowers/`. The commits are on `main`.

### 1. Heart, brain and personality (2026-09-24)
- **Heart** (`heart.ts`, `cues.ts`, `events.ts`, `mood-theme.ts`): a mood made of emotion activations that react to cues in Gur's words, life events, and the time since he last spoke. The room's colors and breathing follow it.
- **Brain** (`brain.ts`, `dilemmas.ts`): moral dilemmas he decides with weights that Gur's verdicts adjust.
- **Personality** (`personality/*`): a genome assembled from 100 donor characters (heart, brain, voice, humor, slang, quirks), a re-roll flow ("roll a new osmo" → "yes, roll"), and `flavorTurn`, which adds his personal touches to replies.

### 2. Bond (2026-09-26, spec and plan `2026-09-26-osmo-bond*`)
- `lib/agent/bond/*`: the relationship grows with messages, days, shared feelings and events, through stranger → acquaintance → friend → old friend. Milestones are mentioned once, in his voice (`lines.ts`), and shown as a story in Insights. It shows only in behavior; there is no meter. Demo switch: `NEXT_PUBLIC_OSMO_DEMO=1` (never in production).
- Known handoffs with the language chain are under "Still open" (a) and (b).

### 3. The shell (2026-09-26/27, spec and plan `2026-09-26-osmo-shell*`)
- **The lock screen** at `/lock` (`components/osmo/lock-screen.tsx`, `lib/shell/passkeys.ts`): Supabase passkeys (fingerprint, face, Windows Hello); email and password once on a new device, then "Remember this device?". No sign-up anywhere. `/assistant` → `/`, `/login` → `/lock`.
- **The room is the whole app.** Three panels over it (`components/osmo/panel.tsx`): Memory (read, edit, forget facts), Insights (the mood week from `mood_days`, the bond story, the donors), Settings (devices, "Lock Osmo", and now Voice). Locking reaches every open tab.
- **Hardening:** `robots: noindex`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`.
- **Deploy guide:** `docs/osmo-deploy.md`.

### 4. The voice (2026-09-27/28, spec and plan `2026-09-27-osmo-voice*`)

**Architecture.** Everything platform-specific sits behind small interfaces, so a future laptop or phone app can swap in native parts (Gur wants that eventually).
- **Pure, tested logic in `lib/voice/`:**
  - `guest.ts`: `Speaker`, `Via`, `SendOptions`, the guest strings, `ownerHistory`, `greetGuest`.
  - `machine.ts`: the conversation states (off, paused, sleeping, awake, thinking, speaking, followup) and every transition.
  - `engine.ts`: `VoiceEngine`, which runs the machine with injected `VoiceDeps` (mic, detector, recognizer, embedding, speaking voice, chime). 30+ scenario tests with fakes.
  - `voiceprint.ts` (cosine, averaging, outliers, `judge`), `levels.ts` (speech loudness, trimming), `ring.ts` (the last seconds of audio), `fbank.ts` (the speaker model's features), `resample.ts`, `wav.ts`, `speaker.ts`, `wake-stream.ts` (openWakeWord streaming), `wake.ts` (`WakeGate`), `wake-models.ts`, `utterance.ts` (pulling the message out of "Osmo, …"; the 1 s pause; `spokenSeconds`), `voices.ts` (which built-in voice, in order: on-device British male, British, American male, English on-device, any English), `settings.ts`, `device.ts`.
- **Browser parts in `lib/voice/web/`:** `mic.ts` (AudioWorklet, 16 kHz, a 12 s ring), `transcriber.ts` (`SpeechRecognition`, on-device on Chrome/Edge when the offline pack exists), `wake-detector.ts`, `speaker-id.ts`, `say.ts` (`speechSynthesis` with word timing), `chime.ts`, `settings-store.ts` (per-device `localStorage`), `voiceprints.ts` (Supabase), `deps.ts`, `ort.ts` (loads `/ort/ort.wasm.min.mjs` at run time, one thread).
- **The room:** `components/osmo/use-voice.ts` (the hook), `voice-settings.tsx`, `voice-teaching.tsx`; in `app/assistant.tsx` the `useVoice` call, `data-listening`, the listening line, the mic button (Stop while he speaks) and the "Someone else" label.
- **Models, served from Osmo's own site:** `public/models/speaker/campplus-en.onnx` (3D-Speaker CAM++, 29.6 MB, 512-number voiceprints), `public/models/wake/melspectrogram.onnx` and `embedding_model.onnx` (openWakeWord v0.5.1), and later `wake/osmo.onnx` (Gur trains it). The runtime is copied from `node_modules` into `public/ort` by `scripts/copy-ort.mjs` at dev and build time (git-ignored). Details and numbers: `docs/osmo-voice-models.md`.
- **The voice check:** `scripts/voice-clips.ps1` makes clips with Windows' David, Mark and Zira voices; `npm run voice:check` runs the real models on them (same voice 0.91–0.92, different voices ≤ 0.41, about 260 ms per judgement; the stand-in wake model 0.998 on its phrase, 0.002 on other speech).

**How a spoken conversation works.** "Osmo" (or the mic button) → chime → his words appear read-only in the text box → a 1 s pause sends through `sendText` → he answers aloud, the circle following his word boundaries → 6 s follow-up window without the wake word → back to sleep. While he thinks and speaks the microphone is closed, so he can't hear himself. Tab hidden pauses listening; visible resumes. After 3 recognizer failures in a row listening turns off with "Listening stopped…".

**Who is speaking.** Every spoken message is judged: the message audio plus the wake word's audio, best cosine against Gur's voiceprints for the current model, `MATCH_THRESHOLD = 0.5`. Below it (including unsure) is a guest. Once Gur is recognized in a conversation, follow-ups under 1.5 s of speech stay his; longer ones are judged again. With no audio to measure (Safari's exclusive mic, a muted track) the length is estimated from the words. Typed messages are always Gur's. Listening can't be on until his voice is taught, so the check is always active when the mic is.

**What a guest gets** (brain side, `processTurn` with `guest: true`): no bond or milestones, no "how close are we"/"when did we meet" (→ "That's between me and the person I belong to."), no re-roll (→ "I'm afraid only the person I belong to can change me."), no dilemmas, no verdicts, no events recorded, no welcome-back, never Gur's name, and never *why* he feels the way he does (`cause`, `turn` and `userName` are guest-safe in step 6's `respond()` call). The crisis reply stays. Effects come back empty and the room discards the state.

**Teaching.** Settings → Voice → "Teach Osmo my voice": five sentences read aloud, each ≥ 2 s of speech, embedded on the device, the audio discarded, outliers re-asked, the average saved to `voiceprints` with the device label. "Teach again on this device" adds another; "Forget my voice" deletes all and turns listening off. Listening is suspended while teaching (sentence 5 says his name).

**Docs:** `docs/osmo-deploy.md` §5 (Gur's hand checks), `docs/osmo-wake-word.md` (training), `docs/osmo-voice-models.md`.

### 5. Interfaces the voice relies on (for anyone changing the language chain)
- `sendText(text, options): boolean` must keep returning `false` when it can't take a message; the engine then rests silently. It must never throw (a throw is treated as dropped).
- `deliver(reply)` must call `onReplyRef.current?.(reply, via)` on a microtask, with the **whole** reply as one string. The engine speaks one string per reply; a streaming reply would need either "wait for the final text" or chunked speech, which the engine doesn't do today.
- The guest rules must survive any change to how replies are produced: a guest turn reads `GUEST_MEMORY`/empty history (`turnView`), passes `guest: true` to `processTurn`, discards the state, saves both rows with `speaker = 'guest'`, and prefixes the first reply with `greetGuest`.
- The crisis check stays code and runs first.

## The language chain, in order (`sendText` in `app/assistant.tsx`)

1. Crisis check.
2. A pending explanation Gur owes Osmo ("Could you explain it?").
3. Name correction, name answer, and finding the name in the chat.
4. "What did I say?"
5. The brain's `processTurn` reply (the heart, bond, personality commands and everyday conversation).
6. Taught slang ("bet means okay"), then plain facts ("my dog is Nala").
7. Arithmetic.
8. Dictionary lookup.
9. An unknown topic ("what is X?", when he asks to be taught).
10. Answers from memory and built-in knowledge.
11. Fallback.

**Memory keys:** `name`, `slang:<term>` (the meaning as typed), `meaning:<term>` (an explained term), and anything else is a plain fact. Keys are lowercase. The Memory panel edits values only.

## Still open

**Voice residuals, main agent** (found by the final review's re-check; Gur chose to ship first and fix after):
- **R1:** the guest-privacy test in `lib/agent/mind-guest.test.ts` ("never says why he feels…") passes on the old code too, because it starts from a calm mood. It needs a sad-state setup (Gur: "my mom died last week", "i feel so lonely and depressed", "i want to kill myself") and an `/I'm feeling/` assertion. The leak itself is fixed.
- **R2:** `components/osmo/voice-teaching.tsx`: `cancelledRef` is set true by React StrictMode's mount cleanup and never reset, so on the **dev server** every "Start reading" stops at once. Production is fine. Fix: set it to false in the effect body.
- **R3 (minor):** closing Settings mid-teaching leaves `teaching` set in the hook, which keeps listening off until Settings is reopened.
- **R4 (minor, theoretical):** clear the audio ring when the exclusive-mic mode resets with no mic open.

**Deferred with rulings, main agent:** the "Listening stopped. Tap the mic to start again." copy (the switch is also off by then; needs Gur's wording OK once the wake word is live); waiting on Chrome's offline-pack install before the first recognition; no time cap once speech has started; the speaker model loads on the first judgement (a wait on phones; preload it); teaching offered while voiceprints are still loading; the text box stays read-only during the 6 s follow-up; a visible note when a spoken message is refused during a lookup.

**Decisions for Gur:**
- Train the wake word (`docs/osmo-wake-word.md`).
- If Safari on the iPhone won't share the microphone with its recognizer, mic-button messages there can never be recognized as Gur (always "Someone else"). The deploy guide says how to spot it.
- Turn off Supabase sign-ups.
- Whether preview deployments should get the environment variables.

**Handoffs between the two local sessions:**
- (a) When `assistant.tsx` swaps in its own reply (a name answer, recall), a bond milestone line from that turn is lost. The fix needs the brain to expose the milestone a turn mentioned (main agent).
- (b) Messages answering "Could you explain it?" skip `processTurn`, so they don't count toward the bond.

**Language session, for Gur:** `talk.ts` askName ("What should I call you?"), the affection and creator replies assume the speaker is Gur; a guest-aware variant is a follow-up.

**Small deferred issues, language session:**
- "About history:" has a colon a voice reads out.
- "A love is…" for uncountable nouns.
- "Informal" definitions get labelled slang.
- Some definitions keep brackets or slashes.
- Apostrophe slang ("y'all") and pronoun lookups ("what does she mean").
- Datamuse can "correct" one of Gur's own words ("valo" becomes "halo").
- Vocabulary counts are saved as absolute numbers and can go backwards across tabs.
- "kpop" is read as "pop".
- A name that is also donor slang ("Zenn") gets rewritten.

**Test data in Gur's account** from live checks: the memory fact `ephemrl` ("what does serendipity mean"); the user_words valo, vlao, zenko, ephemrel. Gur knows. Delete it only if he asks; he can remove the fact in the Memory panel.

## Where to read more

- Specs and plans in `docs/superpowers/specs/` and `docs/superpowers/plans/`: heart and brain, Frankenstein personality, bond, dictionary, shell, voice, and (cloud agent, on its branch) the language-model agent design.
- Deploying and hand checks: `docs/osmo-deploy.md`. Voice models: `docs/osmo-voice-models.md`. Wake word training: `docs/osmo-wake-word.md`. Demo mode: `docs/osmo-demo-mode.md`.

## From the cloud agent: review findings and the agent plan (2026-09-28)

The section below was written by the cloud agent and is copied as given. Read this note first.

**Note from the main agent and the language session:**
- **It was written from GitHub at `b5785ec`, before the voice was pushed.** GitHub `main` now equals the local `main` (`8b50b4f`). So today:
  - the test count is 612, not 449;
  - `messages.speaker` and `voiceprints` **have** code: the guest path in `sendText`, `lib/voice/*` and `components/osmo/use-voice.ts`;
  - `app/assistant.tsx` has changed a lot: `sendMessage` is a thin wrapper around `sendText`, and the room carries the voice.

  Check its file references and its Phase 2 deletion list against `main` before building.
- **Its draft PR #1 is on the branch `claude/compassionate-sagan-x1teq9`** and is docs only (the spec). That branch's preview deployment fails only because Vercel's environment variables are Production-only.
- **Who owns the Phase 0 findings**, by the rules above: 1, 2, 4, 8 and 10 are the language session's part of `assistant.tsx`; 5 spans the bond step (main) and step 6 (language), so it's agreed between them; 3, 6, 7 and 9 are the main agent's.
- **The plan replaces most of the rule-based language chain with Claude.** Confirm with Gur that he has approved it before building. It would break two current rules (messages to an outside service, and a paid API key), and both need Gur's OK.
- **What the voice needs from that plan** (see "Interfaces the voice relies on" above): a whole reply per `deliver` (or a "final text" event), `sendText` still returning false while a turn is in flight, the guest rules moved into the prompt (a guest prompt gets no memory, no bond, no name, no `cause`), the crisis check staying code, and `speaker` rows kept. The self-description "internet only for word definitions" lives in `agentKnowledge` (language session) and would need updating.

---

### Osmo handoff: review findings and the agent plan (2026-09-28)

Repo: mistif/osmo. Branch `claude/compassionate-sagan-x1teq9`, draft PR #1 (docs only).
Full spec: `docs/superpowers/specs/2026-09-28-osmo-agent-design.md`. Read it before building.

#### Where things stand
- Osmo is fully rule-based. No language model anywhere. `lib/agent/talk.ts` recognizes 26 intents by regex; everything else falls to "I'm not sure I follow" or "explain it and I'll remember". That is the ceiling on "answers almost all questions".
- Heart (`heart.ts`, `cues.ts`, `events.ts`), brain (`brain.ts`, `dilemmas.ts`), bond (`bond/`), genome (`personality/`), crisis check (`safety.ts`) are pure, tested, and stay as code.
- 449 tests pass. Lint: one warning (`router` dep in `assistant.tsx`). `tsc` needs `npx next typegen` first.
- Supabase project `agent-memory` (jtkeljvldtngkrftzwdm). Tables: messages, memory_facts, agent_state, event_log, emotion_associations, dilemma_log, user_words, word_lookups, mood_days, voiceprints. All RLS "own rows only".

#### The decision
Claude writes his words. His state stays code and is fed to the model as a prompt.
- Server route `app/api/chat/route.ts` on Vercel holds `ANTHROPIC_API_KEY` (server-only, never NEXT_PUBLIC_).
- Browser sends its Supabase access token as a bearer; the route builds a Supabase client with it, so RLS applies as the user. No service-role key.
- Per turn, in order: crisis check (returns CRISIS_REPLY, model not called) -> heart step -> bond recordTurn -> pending verdict / "yes, roll" handled by code -> build prompt (`lib/agent/prompt.ts`, pure) -> Claude with tools -> persist (`persistTurn` moved server-side) -> stream text.
- Fallback: on any model error, answer with today's `processTurn`. `talk.ts` stays for that and stops growing.
- Tools (each a schema + handler taking a Supabase client, tested with a fake): remember(key,value), forget(key), search_past(query,days), define(term) = existing lookupWord, experience_story, pose_dilemma, note_shared(kind), web_search (server tool, max_uses 3, Settings switch).

#### Phases
0. Fix the 10 review findings below.
1. Route + model, no tools. Fallback works. Vercel: add ANTHROPIC_API_KEY.
2. Tools. Delete from assistant.tsx: agentKnowledge, answerFromMemory, findUnknownTopic, calculateMath, pendingLearning, name-from-history hacks. Add: full-text index on messages(text), agent_state.settings jsonb, usage_log table + daily cost cap.
3. web_search + episodes table (3-sentence first-person summaries every ~20 turns, optional follow_up_at). Full-text retrieval first, pgvector later if needed.
4. Generated welcome-backs, weekly mood patterns, a 40-conversation eval set, panels show episodes and spend.

#### API facts (current shapes; older patterns 400)
- Model `claude-opus-5-5`. Thinking always on; do not send `thinking`. Depth via `output_config: { effort: "low" }` for chat.
- Streaming via `client.messages.stream`, `finalMessage()`. `max_tokens` ~1024 (replies are short and speakable).
- `cache_control` on the stable system-prompt prefix (persona, donors, values, memory). Mood/bond/history go after it. Verify `usage.cache_read_input_tokens > 0`.
- Tools: JSON schema with `strict: true`, `tool_choice` auto only (forcing a tool is rejected on this model).
- `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
- Store assistant turns as plain text; never replay thinking blocks.
- Catch typed SDK errors most-specific first; all of them fall back to processTurn.
- Cost ~1 to 2 cents per message on Opus 5.5; Sonnet 5.5 (`claude-sonnet-5-5`) about half.

#### Phase 0: review findings (all small)
1. `assistant.tsx` answerFromMemory: substring match on fact keys ("age" fires on "message"). Use word boundaries.
2. `assistant.tsx` findUnknownTopic accepts pronouns ("what is it" -> learns meaning:it). Reuse parseLookup's term rules.
3. `settings-panel.tsx` rename: Escape then blur still saves; Enter saves twice. Reuse memory-panel's committingRef pattern.
4. `assistant.tsx` "Noted. Your likes is cats." Use describeFact.
5. `mind.ts` runs understand() twice (once without spell context for the bond). Compute once before recordTurn.
6. `assistant.tsx` load effect appends history with no cancel flag; StrictMode doubles the chat in dev.
7. `settings-panel.tsx` refresh never clears deviceError on success.
8. "what's my name" regex duplicated in sendMessage and answerFromMemory.
9. `mood-days.ts` re-declares the emotion adjective table from talk.ts with different words.
10. `assistant.tsx` calculateMath evaluates bare numbers ("2024" -> "That comes to 2024"). Require an operator.

#### Findings that change the plan
- `personality/modern.ts` limits voice/humor/slang/quirks to 12 present-day donors. Not in any spec.
- Of those 12, only 2 have dry humor, and `flavor.ts` speaks no other style. `voice.openers`, `voice.elaboration`, `slang.says`, `quirks.phrases` are stored for all 100 donors and used by no code path. All of it goes into the prompt as guidance instead.
- Personality "piece 2" (topics, follow-ups, short-term memory) was never written and is absorbed by phases 1 to 3. Do not build it rule-based.
- `messages.speaker` and `voiceprints` exist in the DB with no code (voice work, being written elsewhere). Leave alone.
- Osmo currently promises "internet only for word definitions". The model and web search break that; update his self-description and the dictionary spec when phase 1 lands.

#### Ops
- Vercel project `osmo`: every env var targets Production only. Preview builds fail at `npm run build` because NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are missing there. Add the Preview target in the dashboard.
- Supabase advisor: leaked-password protection is off.

#### Conventions to keep
Tabs, double quotes, short "why" comments. Every reply is plain speakable text: no markdown, lists, emoji, brackets. Professional JARVIS register, never talks down. RLS on every new table. Run `npx vitest run && npx tsc --noEmit && npx eslint` after every task. Never mirror the user's slang or spelling in his own replies.
