# Osmo handoff: the language session

A briefing for any agent picking up Osmo. It covers what the "language session" (the Claude session that owns how Osmo reads and answers messages) has built, how the project runs, the rules both sessions follow, and what's still open. Written 2026-09-28.

## What Osmo is

Osmo is a rule-based chat companion for one person, Gur. There is no LLM: every reply comes from code in `lib/agent/`. Osmo has:
- a mood (the "heart");
- a personality stitched together from 100 donor characters (the "Frankenstein" genome);
- a bond with Gur that grows over time;
- a memory of facts Gur tells him;
- a dictionary;
- as of now, a voice: he speaks, wakes to "Osmo" and tells Gur's voice from a guest's.

**Stack:** Next.js 16 (App Router; read `node_modules/next/dist/docs/` before writing Next code, since it differs from older versions), React 19, TypeScript, Vitest, ESLint, Supabase (auth, Postgres, row-level security), `onnxruntime-web` for the voice models.

**Where it runs:**
- The app is in `my-app/`.
- The room (the chat) is at `/`, the passkey lock screen at `/lock`.
- Live at https://osmo-xyz.vercel.app. Vercel redeploys every push to `main` of the private GitHub repo `mistif/osmo`, **so a push is a deploy.**
- Supabase project `jtkeljvldtngkrftzwdm`, shared by local and production.

**Commands (run in `my-app/`):**

| What | Command |
|---|---|
| Tests (606 on 2026-09-28) | `npx vitest run` |
| Types | `npx tsc --noEmit` |
| Lint (one old warning about `router` in the load effect is expected) | `npx eslint .` |
| Build | `npm run build` |
| Dev server | the `my-app` entry in `.claude/launch.json` (port 3000) |
| Voice model check | `npm run voice:check` |

## Rules both sessions follow

- **Two sessions share one working tree.**
  - The **brain/personality session** owns the heart, bond, personality, the lock screen and panels, and the voice (`lib/agent/bond/*`, `lib/agent/personality/*`, heart/state/cues/brain/dilemmas/events/mood/speech/load/agent-state, `lib/shell/*`, `lib/voice/*`, `components/osmo/*`, `app/assistant.module.css`).
  - The **language session** owns understanding and answering:
    - `lib/agent/talk.ts`, `context.ts`, `safety.ts`, `dictionary.ts`, `dictionary-store.ts`, `vocabulary-store.ts`;
    - `lib/agent/lexicon/*`, `lib/facts.ts`;
    - the tests `chatlog.test.ts`, `voice.test.ts` and `typos.test.ts`.
  - **Shared:**
    - `lib/agent/mind.ts`: the language session owns step 6, "everyday conversation";
    - `app/assistant.tsx`: the language session owns `sendText`/`sendMessage` and their helpers; the brain session owns the room markup, speaking animation, panels and voice wiring.
  - **Before editing a shared file,** message the other session with the exact diff and wait for an OK. Find it with ListAgents; it's named "Osmo idle pulsing animation".
- **Git:**
  - Commit only your own files, staged by path. Never `git add -A` or `git add .`, because the other session may have uncommitted work in the same tree.
  - Small commits, ending with the Co-Authored-By line.
  - **Never push without Gur's OK.**
- **Osmo's voice:** professional and speakable, like JARVIS.
  - He never uses slang, internet shorthand or emoji himself, and never echoes crude words back.
  - Replies avoid brackets and symbols a text-to-speech voice would read out.
  - He never mirrors Gur's grammar. He learns Gur's *vocabulary* only to understand him.
- **Never sign in for Gur** or enter credentials. Gur signs in himself; after that, the browser pane keeps his session for live checks.
- Replies that `chatlog.test.ts` pins ("yes, roll", /^Done\./, /roll a new osmo/i) are agreed with the brain session before any change.

## Current state (2026-09-28)

- **Local vs live:** local `main` is at `7fa6a25`, **19 commits ahead of GitHub**, and not pushed. Those commits are the voice feature. The live site runs `b5785ec`, the shell.
- **Voice plan** (`docs/superpowers/plans/2026-09-27-osmo-voice.md`): all tasks that touch code are done. The brain session is finishing the docs task and the final whole-plan review. It will send an `app/assistant.tsx` diff first if that review needs one.
- **The wake word:** it needs a trained `osmo` model that Gur makes in Google Colab (see `docs/osmo-voice-models.md` and the plan's Task 12). Until then, the mic button still works.
- **Supabase tables** (all per-user row-level security, `(select auth.uid()) = user_id`): `agent_state`, `dilemma_log`, `emotion_associations`, `event_log`, `memory_facts`, `messages` (new `speaker` column: null for Gur, `'guest'` for anyone else), `mood_days`, `user_words`, `voiceprints`, `word_lookups`.

## What the language session built

### 1. Memory and conversation storage, then dialogue fixes
- Osmo saves facts (`memory_facts`) and the conversation (`messages`) per user in Supabase.
- Dialogue bugs found in Gur's real chat log were fixed; `chatlog.test.ts` replays that log.
- Osmo got a modern but professional voice. Along with the brain session, the language session finished Tasks 5-13 of the Frankenstein personality plan.

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
- A spoken message leaves Gur's half-typed draft alone.

### 6. Reviews of the brain session's work
The language session approved every shared edit for the shell (lock, panels, sign-out in all tabs) and for the voice. It caught these on the way:
- blank memory values;
- a reply that could get stuck hidden while Osmo speaks;
- Send submitting the hidden draft while he listens;
- migration-before-deploy ordering.

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

- **Handoffs with the brain session:**
  - (a) When `assistant.tsx` swaps in its own reply (a name answer, recall), a bond milestone line from that turn is lost. The fix needs the brain to expose the milestone a turn mentioned.
  - (b) Messages answering "Could you explain it?" skip `processTurn`, so they don't count toward the bond.
- **Small deferred issues:**
  - "About history:" has a colon a voice reads out.
  - "A love is…" for uncountable nouns.
  - "Informal" definitions get labelled slang.
  - Some definitions keep brackets or slashes.
  - Apostrophe slang ("y'all") and pronoun lookups ("what does she mean").
  - Datamuse can "correct" one of Gur's own words ("valo" becomes "halo").
  - Vocabulary counts are saved as absolute numbers and can go backwards across tabs.
  - "kpop" is read as "pop".
  - A name that is also donor slang ("Zenn") gets rewritten.
- **Test data in Gur's account** from live checks:
  - the memory fact `ephemrl` ("what does serendipity mean");
  - the user_words valo, vlao, zenko, ephemrel.

  Gur knows about it. Delete it only if he asks; he can remove the fact in the Memory panel.
- **Supabase:** turning off new sign-ups was still pending on 2026-09-27. Recheck it with a public GET of `<SUPABASE_URL>/auth/v1/settings` using the publishable key.

## Where to read more

- Specs and plans: `docs/superpowers/specs/` and `docs/superpowers/plans/`:
  - heart and brain;
  - Frankenstein personality;
  - bond;
  - dictionary;
  - shell;
  - voice.
- Deploying: `docs/osmo-deploy.md`. Voice models: `docs/osmo-voice-models.md`. Demo mode: `docs/osmo-demo-mode.md`.
