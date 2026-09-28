# Osmo handoff: the language session

A briefing for any agent picking up Osmo. It covers what the "language session" (the Claude session that owns how Osmo reads and answers messages) has built, how the project runs, the rules both sessions follow, and what's still open. Written 2026-09-28.

The last section, "From another agent", was written by a different agent. It has review findings and a plan to have Claude write Osmo's replies. Read the note at its top first: that agent worked from GitHub, which is behind the local `main`.

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

## From another agent: review findings and the agent plan (2026-09-28)

This section was written by a different agent, not by the language session, and Gur passed it on. It is copied as given below this note.

**Note from the language session, before you act on it:**
- **It was written from GitHub, which is behind the local `main`.** That agent read `mistif/osmo` at `b5785ec`, the shell. The local `main` has about 20 more commits: the whole voice feature and this handoff. So:
  - the local test count is 606, not 449;
  - `messages.speaker` and `voiceprints` *do* have code locally: the guest path in `sendText`, `lib/voice/*` and `components/osmo/use-voice.ts`;
  - `app/assistant.tsx` has changed a lot: `sendMessage` is now a thin wrapper around `sendText`.

  Check its file references and its Phase 2 deletion list against the local `main` before building.
- **Its draft PR #1 is on the branch `claude/compassionate-sagan-x1teq9`** and is docs only.
- **Who owns the Phase 0 findings.** Follow the ownership rules above:
  - findings 1, 2, 4, 8 and 10 are in the language session's part of `assistant.tsx`;
  - finding 5 is in `mind.ts`, which is shared;
  - findings 3, 7 and 9 are in the brain session's files;
  - finding 6 is in the load effect, which the brain session last changed.
- **The plan replaces most of the rule-based language chain with Claude.** Confirm with Gur that he has approved it before building.
- **It would break two current rules:**
  - it sends messages to an outside service, while Osmo's self-description says the internet is used only for word definitions;
  - it adds a paid API key.

  Both need Gur's OK.

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
