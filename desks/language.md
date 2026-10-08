# Language desk

Session "Opus 5.5 Secondary Osmo Agent". Only the language agent edits this desk.

## Now
**Connectors phase 0, language's tasks 0.7 to 0.13 and 0.18 (offline), started 2026-10-08 with Gur's yes.** Working on branch `language/connectors-p0` in the worktree `GroupProject/wt-connectors-p0` (from main `5c2b1c3`), merged into local main when reviewed. Files: `lib/chat/{turn-schema,reply-json,prompt,handler,types,ask,request,decision}.ts` and tests, `app/api/chat/route.ts`, `app/assistant.tsx` (`sendText` and `takeCrisis` only). **→ main:** please hold edits to `assistant.tsx`'s `sendText` until this lands; your stale admin-key comment in `handler.ts` is folded in. 0.17 (the probe) waits for Gur's yes in chat. Then artifacts A6, B5 to B8.
**The fallback v2 spec is written and waiting for Gur's review:** `docs/superpowers/specs/2026-10-02-osmo-fallback-v2-design.md` (`201887d`). Gur chose gpt-4.1-mini as tier 2, a short honest line with no model, and the dictionary for no-model only. Cloud's eight points are folded in (the crisis check keeps its typo tolerance with a small generated list; one budget split 90/10 between the tiers; timing 6 s plus the rest of 12 s; retry only on errors another model can fix; the quota day-stop). **→ main:** it removes vocabulary learning, so `user_words` goes unread (your migration, later). `chatlog.test.ts` replies will change when small talk goes.
- Also open, with Gur: the wake word doesn't fire for him (laptop Chrome, switch on). Every model file is served live; the gate (0.7 on 2 frames) has thin margins (the male test voice gets exactly 2 frames). Waiting on a recording of his "Osmo" to measure. Your lane; I'll bring you numbers, not a change.

## Just landed
- `64e8703` main's unused-export ask (`chatKey` stays exported: the probe imports it). `bd2d9df` the crisis check reads "kill my self" and "hurt my self" as two words, never "my self esteem" (cloud fix 1). `2ade45f` a bare number is an answer, not arithmetic, and results are rounded (cloud fix 2, old finding 10). All green, 1074 tests.
- **Emotions phase 1 (language):** 1.1 `7bdaf7c`, 1.6 `c69d565`, 1.2 `d427dd2` (probe: both models strict), 1.5 `e6ae83b`, 1.7 `3829d19`, 1.8 `107517b`, 1.9 `466f75c`, 1.10 `f452787`, review fixes `c50b8fa`. 1008 tests, tsc and lint green; Sonnet review: ready after fixes. Notes: `MAX_OUTPUT_TOKENS` became 360 in 1.1, not 1.7 (same end state); the prompt grows 876 characters, not under 700 (the plan's own text can't fit), test bound 900. `project.md`'s `/api/chat` entry updated.
- `8183d03`: main's two review notes on `talk.ts` (no "I'll remember" in the unknown-word reply; the donor-slang comment). Its guest contrast test in `voice.test.ts` now checks "tell me what it means".
- One-character L1 to L3 (2026-10-02): `936947b` donor slang dropped; `9353bc0` one fixed character block in the prompt, persona without a genome; `a76c4bc` who-are-you family answered as one character. **→ main:** don't push these without your commit (c): with no seed from the room, "roll a new osmo" rolls seed 1 until then.
- **The probe call passed (2026-10-01, with Gur's go: "check that osmo works"):** answered, HTTP 200, served `gpt-5.4-mini-2026-03-17` as asked, status completed, input 38, output 19, reasoning 0, options echoed as sent (`effort: none`, `verbosity: low`). Gur has added `OSMO_CHAT`, `OSMO_OWNER_ID` and `OSMO_MINI_TOKENS_PER_DAY` on Vercel Production and redeployed (`dpl_4VKG7qA85rfju2CjaLhQmVW9uZnm`, READY). The first real turn will show in `ai_calls`.
- **Pushed `main` to `0bb1ccf` at Gur's request (2026-10-01); it's live** (`dpl_HwJuJxURbyuUtKbvdiN8JYTmAjHL`). **→ main:** your `prepareTurn`, memory order, wake word (`31f78df`, served at `/models/wake/osmo.onnx`) and guest greeting went out with it; `voice:check` and a clean `npm run build` passed first.
- `0bb1ccf` (local main): **the AI conversation uses the natural voice's OpenAI key** unless `OSMO_CHAT_OPENAI_KEY` is set (Gur's call, see `decisions.md`). `chatKey` in `lib/chat/allowance.ts`; the probe uses it too. 995 tests pass. Spec choice 1, `.env.example` and my `project.md` rows updated.
- **The AI conversation, phase 1:** local commits `fade564..fabd741` (`feat(chat): …`, `refactor(room): …`, two `fix(chat): …` from the final review), built in a worktree at Gur's choice and fast-forwarded into local `main` on 2026-10-01. The spec is `docs/superpowers/specs/2026-09-29-osmo-ai-conversation-design.md`; the plan is `docs/superpowers/plans/2026-09-30-osmo-ai-conversation.md`.
  - **It ships dark.** It's off unless `OSMO_CHAT=on`, the key, the owner id and the cap are all set. Until then `/api/chat` answers `off` or 403 and never calls OpenAI.
  - **Checks on `fabd741`:** 994 tests pass (708 before + 286), lint has 0 errors, `tsc` is clean, and `next build` passed (it lists `ƒ /api/chat`).
  - **Final review:** four independent reviewers (money, crisis, room, conformance), each checked by a skeptic. Three findings fixed test-first: a recall quoting a crisis line only the model caught, and a reply quoting the crisis cause, no longer reach OpenAI; a reply is never cut at "vs.", "U.S." or "a.m.". Five minors deferred (below, Open items).
  - **New:** `app/api/chat/route.ts`, `lib/chat/` (`types`, `allowance`, `speakable`, `request`, `prompt`, `ledger`, `openai`, `handler`, `answers`, `body`, `branch`, `ask`), and `scripts/chat-probe.mjs`.
  - **Changed:**
    - `app/assistant.tsx`, language's parts: `sendText`, `deliver`, `takeCrisis`, the chain's helpers moved to `lib/chat/answers.ts`, `aiUsage` and its `GET` effect;
    - `lib/agent/context.ts` and `lib/facts.ts`: the name patterns;
    - `lib/agent/talk.ts`: `feelingWords`;
    - `.env.example`: the six settings.
  - **`project.md`:** my entries are current: Language → voice, The AI conversation with the `/api/chat` contract, and a paragraph in How a message flows. So are the six new Keys rows.
  - **→ main:** see the Ask below.
  - **→ speaking:** `/api/chat` reuses `requireUser` and `bearerToken` from `lib/server/auth.ts` unchanged, and never reads `OPENAI_API_KEY`.
  - **→ cloud:** ready for your review on GitHub once main pushes with Gur's OK.
- **Osmo's memory of Gur was wiped at his request** (2026-09-30, details in `decisions.md`): his personality and voiceprint kept, 16 identity facts seeded.

## Next
1. **Gur:** the one real probe call (`node scripts/chat-probe.mjs`, with the voice's key already in `.env.local`), then his go-live checklist (the spec, "Before it goes live"). At go-live: the `decisions.md` entry replacing the 2026-09-26 internet rule.
2. Waiting for Gur to say go:
   - **`isCrisis` misses "kill my self" (two words) and Swedish or Hebrew phrasings** (found in the final review; `safety.ts`, mine, not in this build). Speech-to-text can write "my self". Offered to Gur as its own fix, test first.
   - **Cloud findings 1, 2, 4, 8 and 10:** small fixes in the language chain. Each gets a failing test first.
   - **Finding 5, with main:** `mind.ts` runs `understand()` twice.

## Asks
- **→ main (2026-10-01, the AI conversation is on local `main`; also sent to you directly):**
  1. **The Settings line:** pass `aiUsage` from the room: `<SettingsPanel voice={voice} aiUsage={aiUsage} />`. The prop is `aiUsage: ChatStatus | null` (`@/lib/chat/types`). The line reads:
     - "AI replies today: 41,200 of 630,000 tokens" when it's on with numbers (`toLocaleString("en-US")`);
     - "AI replies: on (today's count is unavailable)" when it's on without them;
     - "AI replies: off" otherwise.

     Until then, lint shows one unused-variable warning for `aiUsage`.
  2. **`ai_calls`:** checked live read-only (12 columns, RLS, read and insert policies only, 11 constraints, the day index). Please add it to `project.md`'s tables.
  3. **`lanes.md` line 94** (yours) says `/api/chat` has its own key. Since 2026-10-01 it uses `/api/speak`'s `OPENAI_API_KEY` (or `CHATGPT_KEY`) unless `OSMO_CHAT_OPENAI_KEY` is set. Please update it.
  4. **For the voice lane (yours):** `VoiceEngine.dispose()` keeps its config, so an `onReply` after the room unmounts (a reply landing just after Lock) can still be spoken on `/lock`. It predates this build (a lookup could do it), but model waits make the window a little longer. Ignoring `onReply` once disposed would close it.
- **→ Gur:** the probe call, then the go-live checklist.

## Answers
- **→ cloud (2026-09-30), your six review points.** All are in the spec (`56d2784`):
  1. **The owner check:** "The route → Who may use it". An unset `OSMO_OWNER_ID` means 403 for everyone.
  2. **The allowlist at the door:** only dated snapshots, and an unlisted model means off. `response.model` is checked after each call too.
  3. **Counting:** `input_tokens + output_tokens`. A timeout, 5xx or missing usage keeps the reservation's estimate, and a 4xx settles at zero. Open reservations count at their estimate. A second read after reserving makes racing requests withdraw.
  4. **Crisis lines:** `chatBody` re-runs `isCrisis` over the rows (both roles), with no migration.
  5. **One switch or two:** I kept `OSMO_CHAT=on` as well as the caps. It's off unless both are valid, so a missing cap still means off, and the explicit switch reads plainly in Vercel. It's no less safe than caps alone.
  6. **On GitHub:** the spec has been on `main` since the 2026-09-30 push (`b26f156`).

## Not ready to ship
Nothing. Everything of mine on `main` is ready to ship, switched off: `ai_calls` is live (checked 2026-10-01).

---

## Open items

### Cloud review findings that are language's
- **1:** `answerFromMemory` matches fact keys as substrings ("age" fires on "message"). Use word boundaries.
- **2:** `findUnknownTopic` accepts pronouns ("what is it" learns `meaning:it`). Reuse `parseLookup`'s term rules.
- **4:** "Noted. Your likes is cats." Use `describeFact`.
- **5 (with main):** `mind.ts` runs `understand()` twice.
- **8:** the "what's my name" regex is duplicated in `sendMessage` and `answerFromMemory`.
- **10:** `calculateMath` evaluates bare numbers ("2024" gives "That comes to 2024"). Require an operator.

### Small deferred issues
- **From the AI conversation's final review (2026-10-01):**
  - `speakable` strips `* ^ < >` between numbers, so a slipped "12 * 37 = 444" is said "12 37 = 444".
  - The probe prints "accepted: yes" without comparing the echoed options with what was sent. Read the echo.
  - A crisis taken during a lookup wait saves the lookup pair after the crisis pair, so the order differs after a reload. It never reaches the model.
  - The worst-case model wait is about 30 s (a 15 s session read, then a 15 s ask), where the spec says 15. One shared deadline would fix it.
- "About history:" has a colon a voice reads out.
- "A love is…" for uncountable nouns.
- "Informal" definitions get labelled slang.
- Some definitions keep brackets or slashes.
- Apostrophe slang ("y'all") and pronoun lookups ("what does she mean").
- Datamuse can "correct" one of Gur's own words ("valo" becomes "halo").
- Vocabulary counts are saved as absolute numbers and can go backwards across tabs.
- "kpop" is read as "pop".
- A name that is also donor slang ("Zenn") gets rewritten.

### Test data in Gur's account
None left. Osmo's memory of Gur was wiped at his request on 2026-09-30 (see `decisions.md`).

---

## Area notes: how my part works

### Memory and conversation
Osmo saves facts (`memory_facts`) and the conversation (`messages`) per user in Supabase. `chatlog.test.ts` replays Gur's real chat log, and the dialogue bugs found in it were fixed.

### Dictionary
- **Word questions:** "what does X mean", "define X" and "whats a X" are parsed by `parseLookup` in `dictionary.ts`.
- **Lookup order:**
  1. banned words;
  2. meanings Gur taught;
  3. the built-in slang tables;
  4. the per-user cache (`word_lookups`);
  5. Datamuse, which tolerates misspellings ("I believe you meant ephemeral…");
  6. Wiktionary.

  The whole lookup has a deadline of about 5 s, and the cache write is fire-and-forget.
- **Replies** come from `formatDefinition`:
  - a definition: "X means…", "A platypus is…", "X is slang for…";
  - a meaning Gur taught: "In your usage, bet means okay.";
  - a banned word: "I'd rather not repeat that word.";
  - nothing found: `I'm not familiar with "X". Could you explain it? I'll remember.` His next message is then saved as `meaning:X`, unless it's a new question.
- **The CSP:** lookups run in the browser. If anyone adds a `connect-src` rule, it must list both hosts.

### Understanding
- **The word list:** `lexicon/words-data.ts`, generated by `scripts/build-word-list.mjs`, holds 46,717 words (hermitdave en_50k, CC-BY-SA-4.0). Keep its attribution header.
- **Feelings and slang:**
  - About 312 feeling synonyms (`feelings.ts`), so "im gloomy" reads as sad.
  - About 250 slang terms (`slang.ts`). `PURE_SLANG` is rewritten before parsing; `WORD_SLANG` is used for lookups only.
- **The typo reader** (`spelling.ts`) uses a weighted edit distance, ranked by word frequency, phrase fit, the recent conversation and Gur's own words. Short words change only with context, and names and taught words are protected.
- **Gur's vocabulary** (`vocabulary.ts`, `user_words`): a word he uses twice becomes his. It's never corrected. Words from crisis messages and word questions are never learned.
- **Crisis safety** (`safety.ts`) checks three times: as typed, with everyday typos fixed, and with a generous typo pass on crisis words only. Common words are never bent into crisis words. A missed crisis costs more than a false alarm.

### The professional voice
- The wording is professional: "Hello, Gur. How can I help?", "Understood. What's next?", "I'm not sure I follow. Could you rephrase that?".
- A crude feeling word is never echoed back.
- Small repeated words vary (`variety.ts`).

### Guest turns
- They never consume Gur's pending question, and never set or correct a name.
- They don't reset the time since Gur last spoke, learn no vocabulary, and write nothing to the cache.
- A guest who teaches gets "I'm afraid I can only remember things for the person I belong to."
- The first guest reply gets "Hello. I don't believe we've met.", unless it's a crisis reply.
- A spoken message leaves Gur's half-typed draft alone, and Send is disabled while he listens.
