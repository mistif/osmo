# Osmo as an agent: a language model for his words, his own heart underneath

Date: 2026-09-28. Status: draft for review.

## Goal
Osmo answers almost any question and talks like a person, while staying the same Osmo: his mood, values, personality donors, bond and memories keep shaping what he says. A language model (Claude) writes his words. His heart, brain and bond stay rule-based and run on every turn, because they are what make him consistent, learnable and his. Everything he knows about Gur lives in Supabase and he reads and writes it himself through tools, so he becomes an agent that runs off the database rather than a page that pattern-matches sentences.

## Non-goals
- Voice (speaking and listening). The `messages.speaker` column and the `voiceprints` table already exist in the database from that work, but no code uses them yet. This plan leaves them alone.
- More than one user.
- Replacing the heart, brain, bond or genome with the model's own guesses about how Osmo feels. They stay as code.
- Letting the model change its own state directly. It sees his state and can ask for memories to be saved; the code decides what his mood and bond do.

## Where Osmo stands today
Read for this plan: every file under `app/`, `components/`, `lib/`, the five earlier specs, the live Supabase schema (project `agent-memory`) and the Vercel project `osmo`. Tests: 449 pass. Lint: one warning. Typecheck passes after `next typegen`.

What works well and should be kept:
- The heart (`heart.ts`, `cues.ts`, `events.ts`), the brain (`brain.ts`, `dilemmas.ts`), the bond (`bond/`), the genome (`personality/`) and the mood theme. All pure, all tested, all cheap to run every turn.
- The crisis check (`safety.ts`). It must stay deterministic and run before anything else.
- Persistence (`agent-state.ts`, `load.ts`), the lock, the panels, and the room itself.

What holds him back:
- Every reply is a template chosen by a regular expression. `talk.ts` recognizes about 25 intents; anything else falls through to "I'm not sure I follow" or "Could you explain it? I'll remember." That is why he cannot answer most questions.
- `app/assistant.tsx` carries a 200-line chain of special cases (names from chat history, pending explanations, hand-rolled arithmetic, a 20-entry built-in fact list) that each fix one conversation and break another. The code review below lists several of those breaks.
- The personality donors can only flavor a template. The first personality spec already noted this ceiling: "the voice will read as a flavored version of the same replies, not 100 truly different speakers." A model can actually sound like The Night-Shift Nurse.
- He remembers facts (`memory_facts`) but not conversations. "How did the exam go?" is impossible today.

## The shape of the change

```
browser (room)  --->  POST /api/chat (Vercel, holds the API key)  --->  Claude
      ^                     |            ^
      |                     v            |  tools: remember, forget, search the past,
      |               Supabase (as Gur, RLS)      define a word, a story, a dilemma, web search
      +---- stream of text, then the new mood ----+
```

1. **A server route holds the key.** Today the whole app runs in the browser with the publishable Supabase key. A model API key cannot live there. A Next.js route handler at `app/api/chat/route.ts` runs on Vercel with `ANTHROPIC_API_KEY` as a server-only environment variable.
2. **The route acts as Gur, not as an admin.** The browser sends its Supabase access token in the `Authorization` header. The route builds a Supabase client with that token, so every read and write still goes through the same row-level security as today. No service-role key anywhere. A request without a valid token gets 401, so nobody else can spend the API budget.
3. **The turn moves to the server.** The route loads his state and memory, runs the deterministic steps (crisis, cues, heart step, bond), builds a system prompt from the result, calls Claude with his tools, runs the tools against Supabase, saves everything, and streams the reply back. The browser becomes what it should be: a room that shows the words and the mood.
4. **The old chain becomes the fallback.** When the model is unreachable (no key, rate limit, outage) the route answers with today's `processTurn` and template replies. Osmo gets duller, never silent. `talk.ts` stays for that reason and stops growing.

## What the model is told, every turn
The system prompt is assembled from his state by a pure function, `lib/agent/prompt.ts`, so it can be tested without the API. In order, stable content first so it caches:

1. **Who he is.** Osmo, one person's companion, built by students, professional and composed like JARVIS, with dry wit. Everything he says is plain speakable text: no markdown, lists, emoji, brackets or symbols, because a voice will read it aloud later. Short replies by default, one question at a time. He has opinions and defends them, gently. He never talks down.
2. **His personality donors.** The six donor names and their organs, written as guidance rather than data: "Your voice comes from The Victorian Butler: formal, full sentences, no contractions. Your humor comes from The Grumpy Professor: dry, rare." This is where the donors finally sound different.
3. **His values.** The five moral weights in words ("you weigh honesty most, then kindness"), and his outlook ("you lean toward hope, because of what you have experienced").
4. **His memory of Gur.** Every `memory_facts` row as a sentence, the same sentences the Memory panel shows. Words Gur taught him. Gur's own frequent words, so the model knows "valo" is not a typo.
5. **The relationship.** The bond stage, how many days they have talked, milestones reached, any milestone due to be mentioned, and how long Gur has been away. Written as instructions per stage, matching the bond spec's table: a stranger gets formal precision, an old friend gets easy familiarity.
6. **How he feels right now, and why.** `feelingPhrase`, the dominant emotions, `session.cause`, today's mood so far from `mood_days`, and what happened last time they talked. This block changes every turn, so it goes last.
7. **The rules that stay code.** He is told which things are handled for him and not to improvise them: the crisis reply, re-rolling, saving memories (use the tool, do not claim to remember without it).

The conversation itself is the last 30 messages from `messages`, stored as plain text. Thinking blocks are never stored or replayed, so there is no history-editing problem.

## What stays deterministic, in order
Before the model sees anything, the route runs what `mind.ts` does today, in this order:

1. **Crisis.** `isCrisis` on the raw text. If it matches, the reply is `CRISIS_REPLY`, saved and returned. The model is not called.
2. **Heart.** Gap and loneliness, cues, reactivity, one coupling and decay step. The new activations are what the prompt describes.
3. **Bond.** `recordTurn` with the same signals as today. Whether the message shared a feeling or an event comes from the model's reply instead of regexes (see tools), so the counts get more accurate, not less.
4. **Pending answers.** A yes or no while a dilemma verdict is pending, and "yes, roll" while a re-roll is pending, are still handled by code. The model is told the outcome and voices it.
5. **Life events and arguments.** `classifyUserEvents` and `detectArgument` still run so `applyEvent` and `argueOutlook` keep learning. The model is told "Gur just shared sad news; your sadness rose" and writes the acknowledgement itself.

After the model replies, the route saves `agent_state`, the two messages, `mood_days`, and any effects from tools, using the existing `persistTurn` moved server-side.

## His tools
All run in the route, all through the per-request Supabase client, all with their inputs validated before they run. Each is small and has its own tests with a fake database.

| Tool | What it does | Table |
|---|---|---|
| `remember(key, value)` | Saves a fact about Gur. Replaces the regexes in `lib/facts.ts` and the "Could you explain it? I'll remember" flow. Keys keep today's shapes (`name`, `likes`, `slang:bet`, `meaning:zorp`) so the Memory panel keeps working. | `memory_facts` |
| `forget(key)` | Removes a fact when Gur asks him to. | `memory_facts` |
| `search_past(query, days?)` | Full-text search over their old messages, returned with dates. This is what makes "what did I say about my exam" and "how was I doing last week" answerable. | `messages`, `mood_days` |
| `define(term)` | The existing `lookupWord` (taught words, built-in slang, cache, Datamuse, Wiktionary). Kept because it is cached, private and already handles offensive senses. | `word_lookups` |
| `experience_story()` | The existing `pickEvent` and `applyEvent`. Returns the story and his new feeling; the model tells it. | `event_log`, `emotion_associations` |
| `pose_dilemma(topic?)` | The existing `nextDilemma` or `findDilemma`, scored by `decide`. Returns the scenario, his choice and the values that drove it; the model explains and asks "Do you agree?" | `dilemma_log` |
| `note_shared(kind)` | The model reports that Gur shared a feeling or a life event, so the bond counts it. Replaces the feeling regexes for bond purposes. | (bond in `agent_state`) |
| `web_search` | Claude's own server-side search, for current facts. Capped at 3 searches a turn. | (none) |

Web search changes a promise he makes today ("internet access is used only to look up word definitions"). It becomes a switch in Settings, on by default, stored in a new `settings` column on `agent_state`. When it is off the tool is not offered. His self-description is updated either way.

## What he can newly do
- Answer general questions, explain things, help think through a problem, do arithmetic, and hold a real conversation about anything. The model does this on its own.
- Answer about the world as it is now, through web search.
- Remember the thread of their life together, not only facts: "You mentioned the exam last Tuesday. How did it go?" comes from `search_past` in phase 2 and from episodes in phase 3.
- Sound like his donors. A Victorian Butler Osmo and a Skater Osmo will read differently for the first time.
- Have an opinion in his own voice about a dilemma, a story or a piece of news, weighted by his values and mood.

## Phases

### Phase 0. Fix what the review found
Small, mechanical, keeps every test green. Ships on its own first so the later phases start clean. The findings are listed at the end.

### Phase 1. The route and the model, no tools
- `app/api/chat/route.ts`: verify the token, load state and memory, run the deterministic steps, build the prompt, call Claude, stream text, save.
- `lib/agent/prompt.ts` (pure) and its tests.
- `lib/agent/turn.ts`: the deterministic steps lifted out of `mind.ts` so both the route and the fallback share them.
- The browser sends `{ text }` with the token and renders the stream through the existing typewriter, which already paces itself by mood. The mood theme updates from the state the route returns at the end of the stream.
- Fallback to `processTurn` when the model call fails.
- Vercel: add `ANTHROPIC_API_KEY`. Nothing changes in Supabase.

After phase 1 he answers most questions. He does not yet remember anything new by himself.

### Phase 2. Tools, and the old chain retired
- The tools above, except `web_search`. Each with its own tests.
- Delete from `assistant.tsx`: `agentKnowledge`, `answerFromMemory`, `findUnknownTopic`, `calculateMath`, the pending-learning flow and the name-from-history hacks. Delete `lib/facts.ts` regexes once `remember` covers them. `context.ts` shrinks to what the fallback needs.
- Supabase: a full-text index on `messages.text`, and `settings jsonb` on `agent_state`.
- A `usage_log` table (day, input tokens, output tokens) written by the route, so Insights can show what he cost this week and a daily cap can stop a runaway. The cap is a number in `settings`.

### Phase 3. Web search, and episodes
- `web_search` with the Settings switch.
- **Episodes.** Every 20 turns, or when a conversation goes quiet for an hour, the route asks the model for a three-sentence first-person summary of what happened ("Gur told me about his exam on Thursday. He was nervous. I said I would ask how it went.") with an optional follow-up date. Saved in a new `episodes` table. The most recent and the most relevant episodes (full-text match on the current message) go into the prompt. A due follow-up is mentioned when he greets Gur. This is what turns him from a chatbot with a fact list into someone who was there last week.
- Full text search first. Vector search (`pgvector`) is a later upgrade if plain search proves too blunt; it needs an embedding provider and is not worth a second vendor yet.

### Phase 4. Being more human, once the plumbing is quiet
- **He starts conversations.** The welcome after a gap is generated from the last episode and any due follow-up instead of a fixed line per stage.
- **He notices patterns.** Once a week, a summary of `mood_days` and episodes lets him say "You have seemed tired all week" if it is true.
- **Evaluation.** A set of about 40 saved conversations graded for: speakable text, staying in character and stage, using memory correctly, and never inventing a memory. Run before any prompt change. Without this, prompt edits are guesswork.
- **Panels.** Insights shows episodes as part of "Our story" and shows spend. Memory shows episodes under a fourth heading, editable and forgettable like facts.

## The model and the API, so nothing stale gets built
These are the current shapes as of this plan. They differ from older patterns.

- Model: `claude-opus-5-5`. Thinking is always on for this model and cannot be disabled; depth is set with `output_config: { effort: "low" }`, which suits chat and keeps replies fast. Raise it only if evaluation shows a reason.
- Streaming through the SDK's `messages.stream` with `finalMessage()` at the end. `max_tokens` around 1024: his replies are deliberately short and speakable.
- Prompt caching: `cache_control` on the stable part of the system prompt (sections 1 to 4 above). The changing block (mood, bond, recent messages) goes after it. Check `usage.cache_read_input_tokens` is non-zero after the second turn.
- Tools: plain JSON schema with `strict: true`, `tool_choice` left as `auto` (forcing a tool is rejected on this model). The SDK's tool runner can drive the loop; its per-turn hooks are where the route writes to Supabase.
- Refusal fallback: `fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta so a safety refusal on an odd message gets a reply from another model instead of silence. Unlikely for a companion, cheap to add.
- Web search: the `web_search_20260209` server tool with `max_uses: 3`.
- Errors: catch the SDK's typed errors from most specific to least (`RateLimitError`, then `APIError`, then connection errors) and fall back to `processTurn` on all of them.

Cost, rough, for one message: about 4,000 input tokens (mostly cached after the first turn) and 300 to 400 output tokens including thinking. On Opus 5.5 that is around one to two cents a message, so a busy day of 50 messages is under a dollar. Sonnet 5.5 (`claude-sonnet-5-5`) is about half the price and is a fine choice if the bill matters more than the last bit of judgement; the model is one constant in the route. Web search is billed per search on top.

## Storage changes

| Change | Phase | Why |
|---|---|---|
| Vercel env `ANTHROPIC_API_KEY` (server only, never `NEXT_PUBLIC_`) | 1 | The key |
| `agent_state.settings jsonb` (`{ webSearch: true, dailyCapCents: 200 }`) | 2 | Switches |
| Full-text index on `messages(text)` | 2 | `search_past` |
| `usage_log(user_id, day, input_tokens, output_tokens, cost_cents)` | 2 | Spend, cap |
| `episodes(id, user_id, summary, follow_up_at, from_id, to_id, created_at)` | 3 | Episodic memory |

Every new table gets the same "own rows only" row-level security as the others. The route never uses a service-role key.

## Code structure
- `app/api/chat/route.ts`: auth, load, deterministic steps, model call, tools, save, stream. Thin; everything it calls is testable without it.
- `lib/agent/prompt.ts`: state in, system prompt out. Pure.
- `lib/agent/turn.ts`: the deterministic steps, shared by route and fallback. Pure.
- `lib/agent/tools/*.ts`: one file per tool, each a schema plus a handler that takes a Supabase client. Tested with a fake.
- `lib/agent/mind.ts` and `talk.ts`: the fallback. Unchanged except that `turn.ts` is extracted from `mind.ts`.
- `lib/server/supabase.ts`: the per-request client from a bearer token.
- `app/assistant.tsx`: loses its language chain, keeps the room, the typewriter and the panels.

## Testing
- All 449 existing tests keep passing at every phase.
- `prompt.ts`: given a state, the prompt names the right donors, the right stage, the right feeling and cause; contains every memory sentence; contains no markdown.
- `turn.ts`: the same cases `mind.test.ts` covers today, moved.
- Each tool against a fake Supabase client: happy path, a database error, an invalid input.
- The route with a fake model client (the same pattern `lookupWord` uses with a fake `fetch`): 401 without a token, crisis short-circuits, fallback on a model error, tool results are saved, usage is logged.
- The eval set from phase 4, run by hand before prompt changes.
- By hand in the browser after each phase: a factual question, a question about last week, "remember my sister is Maya" then "what's my sister's name", a sad message, a dilemma, "roll a new osmo", and the API key removed from Vercel to see the fallback.

## Risks and open assumptions
- **Latency.** A model reply takes one to three seconds where today's is instant. The typewriter and the "One moment…" line already cover waiting; streaming makes the first words arrive early.
- **Character drift.** A model will happily be warmer or chattier than Osmo should be. The prompt rules and the eval set are the guard. Keeping the heart and bond as code, not prose, is the other: the model is told he is a stranger, it does not get to decide.
- **Invented memories.** The strongest rule in the prompt: never claim to remember something that is not in the memory block or a tool result. The eval checks it.
- **Privacy.** Messages now leave the browser to Vercel and to Anthropic. That is a change from "internet only for word definitions" and his self-description must say so plainly. Supabase rows stay as private as before.
- **Cost.** Bounded by the daily cap in phase 2. Until then the risk is a few dollars.
- **Two orphan migrations.** `messages.speaker` and `voiceprints` exist in the database with no code behind them, from voice work that was never committed. Harmless, but worth knowing before the voice spec resumes.

## Appendix: code review findings, 2026-09-28
Static review of `app/`, `components/`, `lib/`, `scripts/`, plus the test suite, lint and typecheck. Most severe first. All are small and become phase 0.

1. **`app/assistant.tsx` `answerFromMemory`: substring matching on fact keys.** Saving "my age is 30" makes every later message containing "age" ("send me a message") answer "Your age is 30." Same for `meaning:` keys. Needs word-boundary matching.
2. **`app/assistant.tsx` `findUnknownTopic` accepts pronouns.** "what is it" asks Gur to explain "it", then saves whatever he types next as its meaning, after which every message containing "it" gets that reply. Reuse `parseLookup`'s term rules.
3. **`components/osmo/settings-panel.tsx` rename has no commit guard.** Escape cancels, then the blur from unmounting still saves the discarded name; Enter saves twice. `memory-panel.tsx` already solves this with `committingRef`; share that editor.
4. **`app/assistant.tsx` "Noted." reply is hand-built.** "I like cats" answers "Noted. Your likes is cats." `describeFact` already says "You like cats."
5. **`lib/agent/mind.ts` runs `understand` twice per turn**, once without typo correction (for the bond) and once with (for the reply). "im sadd" counts as no feeling for the bond but gets a sympathetic reply. Compute once, before `recordTurn`.
6. **`app/assistant.tsx` load effect appends history without a cancel flag.** In development, Strict Mode runs it twice and the chat shows every past message twice; the first `persistTurn` is queued twice.
7. **`components/osmo/settings-panel.tsx` `refresh` never clears `deviceError`.** A transient failure sticks until a rename or removal.
8. **The "what's my name" regex is duplicated** between `sendMessage` and `answerFromMemory`, so they can drift.
9. **`lib/agent/mood-days.ts` re-declares the emotion adjectives** that `talk.ts` owns, with different words ("put off" vs "disgusted").
10. **`app/assistant.tsx` `calculateMath` evaluates bare numbers.** "2024" answers "That comes to 2024." Require an operator.

Also seen: one lint warning (`router` missing from an effect's dependency list in `assistant.tsx`), and `tsc` needs `next typegen` first because `LayoutProps` is a generated type. Passkeys need no opt-in flag in this SDK version, so `lib/supabase.ts` is correct as it is. Supabase's security advisor flags leaked-password protection as off; the deploy doc already recommends turning it on.

Phases 1 and 2 delete most of the code these findings live in. Phase 0 still fixes them, because they are cheap and the fallback path keeps that code alive.
