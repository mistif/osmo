# Osmo's fallback, version 2: a second model, a smaller chain, and a no-model mode that still talks

**Status:** draft for Gur's review, 2026-10-02. Owner: language. Builds on the AI conversation (phase 1, live), one character and emotions phases 1 and 2.

## 1. What Gur asked for

Gur, going through the bloat rundown on 2026-10-02 (`decisions.md`): the rule-based fallback "is really really bad", and it should be hard to tell from the model. Decided with main:
1. **A second model tier.** When the main model can't answer, a cheaper model tries before any code reply.
2. **A smaller chain.** Code keeps only what code should decide (crisis, verdicts, bond lines, memory answers, arithmetic, and the name and fact saving). Most of `talk.ts`'s small talk goes.
3. **The spelling corrector goes,** with its 373 KB word list, and so does the teach-me-a-word loop, which Gur finds annoying.
4. **With no model at all he still talks,** short and in his voice, with no teaching prompts.

Gur's answers to language on 2026-10-02:
- The second tier is **`gpt-4.1-mini-2025-04-14`**. It's already on the allowlist, and the strict-JSON probe passed (184 in, 77 out, 1.8 s).
- With no model, ordinary conversation gets **a short honest line** in his voice. It's never a teach-me prompt.
- **The dictionary lookup stays, for no-model only.** The model answers word questions; the code lookup runs only when no model can. Its spelling suggestions and its "explain it to me" prompt go.

**Success:** with the AI on, Gur can't tell from the words when the main model failed. With every model down, Osmo still answers every message in one or two plain sentences, and never asks Gur to teach him a word. Crisis handling is exactly as safe as today.

## 2. The order a reply is chosen in

For Gur's message (guests: see §6):
1. **Crisis, first and always:** `isCrisis` gives `CRISIS_REPLY`, as today. Its typo tolerance stays (§7).
2. **What code decides:** `prepareTurn`'s replies (verdicts, bond lines, stories, dilemmas, life events), and the branches that save or change something: name corrected, answered or found, a taught slang word ("bet means okay"), a fact ("my sister is Maya"). These are unchanged.
3. **The model writes everything else** (`writerFor`, unchanged): recall, everyday conversation, arithmetic (handed the exact result), word questions and memory answers. One request to `/api/chat`, which tries:
   1. **tier 1,** `gpt-5.4-mini`;
   2. **tier 2,** `gpt-4.1-mini`, only when tier 1 failed in a way another model could fix (§3).
4. **No model answered** (the AI is off, both tiers failed, or the day's share is spent): the no-model reply for that branch (§5).

The learning branch, the unknown-topic branch and the "looked back" branch's teach-me wording go (§4).

## 3. The second tier (server, `lib/chat/handler.ts`)

**One request, two tries.** The browser still posts once; the route tries tier 2 itself, so the browser's code and its 15-second limit don't change shape.

**When tier 2 tries.** Only on a failure a different model could fix:

| Tier 1 outcome | Tier 2? |
|---|---|
| 5xx, timeout, network error, an unreadable answer | yes |
| a model-specific 4xx (`model_not_found`, an unsupported parameter) | yes |
| `incomplete` or bad JSON (`format`), an empty reply | yes |
| tier 1's share of the day is spent (below) | yes |
| `insufficient_quota`, a spend-limit 429, a 401 | no: same key, same project. The day stops (§8). |
| a refusal or content filter | no: code answers |
| a crisis flag | no: `crisis`, as today |
| a served-model mismatch | no: the day stops, as today |

**One budget, split.** Both models draw from the same free small pool, so tier 2 comes out of Osmo's 630,000, never on top of it (cloud's point 2). Tier 1 may use the budget up to `usable − TIER2_SHARE`; tier 2 may use it up to `usable`. `TIER2_SHARE` is 10% of `usable` (63,000 today). So tier 2 answers the day's last 63,000 tokens after tier 1 stops, and catches tier 1's errors before that.

**The ledger doesn't change shape.** Each tier books its own reservation, makes its own second read and writes its own signed settling row, under its own model. A day-stop still stops both tiers.

**Timing.** OpenAI gets 6 seconds for tier 1. Tier 2 gets whatever is left of 12 seconds, and it's skipped if less than 3 seconds remain. The route's `maxDuration` stays 20 seconds. The browser's limit stays 15 seconds, above the route's 12 seconds of model time plus its ledger round trips (cloud's point 4).

**The same format.** `gpt-4.1-mini` is `strict: true`, so it gets `TURN_FORMAT` and the JSON-mode prompt. Its detection is trusted like tier 1's.

**What the browser learns.** `ChatAnswer`'s model branch gains `tier: 1 | 2`, for Settings and the logs only. Nothing else in the room changes.

## 4. What the chain loses

**Removed outright:**
- **The spelling corrector:** `lib/agent/lexicon/spelling.ts` (apart from what §7 moves), `lexicon/words-data.ts` (373 KB), `lexicon/words.ts` and `scripts/build-word-list.mjs`. Messages are read as typed. The model handles typos, and code's own intents match the usual spellings.
- **Gur's vocabulary:** `lexicon/vocabulary.ts` (`learnFromMessage`) and `vocabulary-store.ts`. Its only job was protecting Gur's words from the corrector. The `user_words` table is left unread; dropping it is a later migration of main's, with Gur's OK.
- **The teach-me loop:** `findUnknownTopic`, `pendingLearning` (state, the learning branch, `answersPendingLearning`) and the "I'm not familiar with X. Could you explain it?" replies. Saved `meaning:` facts stay and are still answered.
- **`talk.ts` small talk,** apart from the no-model core in §5. That means its intents for jokes, compliments, laughter, "brb", activity questions, affection, feelings from Osmo, misunderstandings, "incomplete" and slash commands, with their reply tables and variety pools.
- **The dictionary's spelling suggestions** ("I believe you meant…").

**Kept:** `lexicon/slang.ts` (real slang, read as plain words), `lexicon/feelings.ts` (feeling words for the heart), and `normalize` without typo fixing.

## 5. The no-model mode

When no model answered, each branch gets its no-model reply:

| Branch | No-model reply |
|---|---|
| recall | `recallReply`, as today |
| arithmetic | "That comes to N.", as today |
| memory | `answerFromMemory`, as today |
| word question | the dictionary lookup (taught meanings, slang tables, the cache, then the online sources). A miss gives "I could not find that word just now." It never asks Gur to explain. |
| everyday conversation | the **core** below, or else the **honest line** |

**The core** (the only `talk.ts` intents left): greeting, farewell, thanks, how-are-you (with the slow-mood clause from emotions 2.9), who-are-you (`askOrigin` and `askName`), what-can-you-do (`askAbilities`, reworded to what he can do with no model), and the sexual-content boundary. The replies are in the one character's register: full forms, no slang.

**The honest line,** rotated so it doesn't repeat back to back:
- "I am having trouble finding my words just now. I can still work out a sum, remember something for you, or look up a word."
- "My words are slow to come at the moment. A sum, a note to keep or a word to look up, I can still manage."
- "I cannot put that into words just now, I am afraid. I can still do sums, keep notes for you and look up words."

With the AI on and a model failing, this line is rare: two tiers have to fail first. With the AI off (no settings), it's the everyday reply.

## 6. Guests

Guests never reach the model (phase 1 rule, unchanged), so with the small talk gone they get the no-model mode. That's the core and arithmetic, plus a guest line in place of the honest one: "I keep conversations for the person I belong to, I am afraid. I can still do a quick sum or look up a word." Nothing of a guest is saved, as today.

**Open point for Gur:** the alternative is to let a guest reach tier 2 with no memory, no history and no facts of Gur's. It would cost tokens from Gur's share, and guests' words go to OpenAI (already accepted in the sharing trade). This draft keeps the phase 1 rule.

## 7. The crisis check keeps its typo tolerance

`safety.ts` uses the word list in two places (cloud's point 1). It uses `typoCost` to read a misspelt crisis word ("sucidal", "kil"). And it uses `isRecognized` with `wordRank` to leave common words alone, so "and it all" never becomes "end it all".

- `typoCost` moves to `lib/agent/lexicon/typo.ts`, and only `safety.ts` imports it.
- The common-word guard becomes **a small generated list**: every word of today's top 20,000 that `crisisSpelling` would otherwise bend into a crisis word (within its typo cost of one of `CRISIS_WORDS`). The list is generated once from `words-data.ts` before it's deleted, then committed as `lexicon/crisis-safe.ts`, a few hundred words. It gives the same behaviour as today at a fraction of the size.
- **Tests come first, against today's code:**
  - every case in `typos.test.ts` that touches crisis;
  - "and it all", "dye", "lift", "dad" and "hut" staying non-crisis;
  - "kil myself", "sucidal" and "kill my self" being crisis.

  They must pass before and after the swap.

## 8. A quota or spend-limit error stops the day (cloud's note 2)

Today, a 429 for `insufficient_quota` or the project's spend limit costs a reservation, a call and a zero settle on every message for the rest of the day. Its settling row now carries the stop, the same way a served-model mismatch does, and `dayUse` reads it. The rest of the UTC day answers from code at once.

## 9. What's sent, and what he says about himself

Nothing new is sent: tier 2 gets exactly tier 1's request. `agentKnowledge(aiOn)`'s description gains one clause: when the main model can't answer, a second OpenAI model may write the reply. The spec's "What is sent" list is unchanged.

## 10. Lanes

- **Language:** everything above, in `lib/chat/*`, `lib/agent/{talk,dictionary,safety,facts}.ts`, `lib/agent/lexicon/*`, `vocabulary-store.ts`, `mind.ts` step 6 and `app/assistant.tsx`'s `sendText` (vocabulary, `pendingLearning`, the learning branch).
- **Main:** dropping `user_words` (a migration, later, with Gur's OK); `prepareTurn` needs nothing new. `chatlog.test.ts` pins replies that change (agreed between main and language per `lanes.md`).
- **Cloud:** reviews the push.

## 11. Testing

Test first for every part.
- **Handler:**
  - each row of the §3 table, with a fake OpenAI: which outcomes try tier 2, which don't;
  - the budget split at its edges (tier 1 refused at `usable − 63,000`, tier 2 allowed up to `usable`);
  - the time split (tier 2 skipped under 3 seconds left);
  - two reservations and two settling rows, under two models;
  - the quota day-stop.
- **The no-model replies:** every branch in §5; the honest line never repeats back to back; no reply anywhere asks Gur to explain a word (one test sweeps every reply table).
- **Safety:** §7's cases, before and after.
- **Size:** after the removals, the browser bundle no longer contains `words-data` (a check on the built chunk names).

## 12. Order of work

1. Safety first: pin tests, generate `crisis-safe.ts`, move `typoCost`.
2. The removals (§4), each its own green commit.
3. The no-model mode (§5, §6).
4. The second tier, the split and the day-stop (§3, §8).
5. The self-description (§9). Then main asks Gur to push.
