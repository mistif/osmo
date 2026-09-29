# Osmo as an agent: a language model for his words, his own heart underneath

Date: 2026-09-28. Revised 2026-09-29 for OpenAI and the free daily allowance. Status: design; the language lane builds it, the cloud lane keeps this document and reviews the code.

## Goal
Osmo answers almost any question and talks like a person, while staying the same Osmo: his mood, values, personality donors, bond and memories keep shaping what he says. An OpenAI model writes his words, inside the free daily allowance Gur's account gets for traffic shared with OpenAI. His heart, brain and bond stay rule-based and run on every turn, because they are what make him consistent, learnable and his. Everything he knows about Gur lives in Supabase and he reads and writes it himself through tools, so he becomes an agent that runs off the database rather than a page that pattern-matches sentences.

## Non-goals
- Changing the voice (spec `2026-09-27-osmo-voice-design.md`, shipped). He speaks, wakes to his name and tells Gur from a guest. This plan fits inside it: the route is called from the same `sendText` path, and a guest gets exactly what the voice spec allows.
- More than one user.
- Replacing the heart, brain, bond or genome with the model's own guesses about how Osmo feels. They stay as code.
- Letting the model change its own state directly. It sees his state and can ask for memories to be saved; the code decides what his mood and bond do.
- Paying for conversation. Every model call stays inside the allowance; when the day's share is used up he answers from code until the counter resets.

## Where Osmo stands today
Read for this plan: every file under `app/`, `components/`, `lib/agent/`, `lib/shell/`, all six specs, the language session's handoff (`docs/handoff-language-session.md`), the live Supabase schema (project `agent-memory`) and the Vercel project `osmo`. Checked against `main` at `8b50b4f`, which carries the voice. Tests: 612 pass. Lint: one warning. Typecheck passes after `next typegen`.

What works well and should be kept:
- The heart (`heart.ts`, `cues.ts`, `events.ts`), the brain (`brain.ts`, `dilemmas.ts`), the bond (`bond/`), the genome (`personality/`) and the mood theme. All pure, all tested, all cheap to run every turn.
- The crisis check (`safety.ts`). It must stay deterministic and run before anything else.
- Persistence (`agent-state.ts`, `load.ts`), the lock, the panels, and the room itself.
- The voice (`lib/voice/`), and with it two things the route inherits: one message path, `sendText(text, { via, speaker })`, for typed and spoken words alike; and the guest rules in `lib/voice/guest.ts`, where a voice that is not Gur's sees nothing of his and changes nothing.

What holds him back:
- Every reply is a template chosen by a regular expression. `talk.ts` recognizes about 25 intents; anything else falls through to "I'm not sure I follow" or "Could you explain it? I'll remember." That is why he cannot answer most questions.
- `app/assistant.tsx` carries a 200-line chain of special cases (names from chat history, pending explanations, hand-rolled arithmetic, a 20-entry built-in fact list) that each fix one conversation and break another. The code review below lists several of those breaks.
- The personality donors can only flavor a template. The first personality spec already noted this ceiling: "the voice will read as a flavored version of the same replies, not 100 truly different speakers." A model can actually sound like The Night-Shift Nurse.
- He remembers facts (`memory_facts`) but not conversations. "How did the exam go?" is impossible today.

## The shape of the change

```
browser (room)  --->  POST /api/chat (Vercel, holds the key)  --->  OpenAI (gpt-5.4-mini)
      ^                     |            ^
      |                     v            |  tools: remember, forget, search the past,
      |               Supabase (as Gur, RLS)      define a word, a story, a dilemma
      |               token_ledger: today's tokens per pool, checked before every call
      +---- the reply, the new mood, today's use ----+
```

1. **A server route holds the key.** Today the whole app runs in the browser with the publishable Supabase key. A model API key cannot live there. A Next.js route handler at `app/api/chat/route.ts` runs on Vercel with `OPENAI_API_KEY` as a server-only environment variable (or `CHATGPT_KEY`, the alias `project.md` records; the route reads `OPENAI_API_KEY` first, exactly as speaking's `/api/speak` does). It is the same key the speaking voice uses. It is never `NEXT_PUBLIC_`.
2. **The route acts as Gur, not as an admin.** The browser sends its Supabase access token in the `Authorization` header. The route builds a Supabase client with that token, so every read and write still goes through the same row-level security as today. No service-role key anywhere. A request without a valid token gets 401, so nobody else can spend the allowance.
3. **The turn moves to the server.** The route loads his state and memory, runs the deterministic steps (crisis, cues, heart step, bond), builds a system prompt from the result, calls the model with his tools, runs the tools against Supabase, saves everything, and returns the reply. The browser becomes what it should be: a room that shows the words and the mood.
4. **He stays inside the allowance.** Gur's account gets a free daily token budget for traffic shared with OpenAI, split into a mini-model pool and a large-model pool, and his investing agents use most of it. Osmo's share (`decisions.md`, 2026-09-29) is about 500,000 tokens a day from the mini pool and 50,000 from the large pool. OpenAI does not stop at the limit; it bills what goes over. So the route keeps its own ledger in Supabase, counts every token of every call (input, output and reasoning), refuses a call that could cross the day's cap, and lets the code answer instead. The caps are server settings Gur can change without a code change. The section "The model and the API" has the exact rules.
5. **The old chain becomes the fallback.** When the model is unreachable (no key, rate limit, outage, timeout) or the day's share is used up, the route answers with today's `processTurn` and template replies. Osmo gets duller, never silent. `talk.ts` stays for that reason and stops growing.
6. **`sendText` stays the one door.** Typed and spoken messages already arrive through it, and every reply already leaves through `deliver`, which hands the text to the voice. The route call goes inside `sendText`, so the voice engine, the guest marking and the "Someone else" label keep working unchanged.
7. **A guest gets a guest.** The request carries `speaker`. For a guest the route builds the prompt from the guest view (no name, no memory, no history, no bond, no cause), tells the model it is speaking with someone who is not its owner, offers no tool that writes, discards the turn's state and effects, and saves both lines with `speaker = 'guest'`. That is the voice spec's Part 2, applied to the model. A guest's tokens come out of the same ledger, because the route is acting as Gur either way.

## What the model is told, every turn
The system prompt (the `instructions` of the request) is assembled from his state by a pure function, `lib/agent/prompt.ts`, so it can be tested without the API. In order, stable content first so it caches:

1. **Who he is.** Osmo, one person's companion, built by students, professional and composed like JARVIS, with dry wit. Everything he says is plain speakable text: no markdown, lists, emoji, brackets or symbols, because a voice reads it aloud. Short replies by default, one question at a time. He has opinions and defends them, gently. He never talks down.
2. **His personality donors.** The six donor names and their organs, written as guidance rather than data: "Your voice comes from The Victorian Butler: formal, full sentences, no contractions. Your humor comes from The Grumpy Professor: dry, rare." Every organ's written material goes in: the voice openers and elaboration, the humor lines whatever their style, the slang tags, the catchphrases. Today all of that is stored on all 100 donors and used by nothing (see "Personality piece 2, absorbed"). The model is told to use it sparingly and in the professional register, which is a judgement a template could not make. This is where the donors finally sound different.
3. **His values.** The five moral weights in words ("you weigh honesty most, then kindness"), and his outlook ("you lean toward hope, because of what you have experienced").
4. **His memory of Gur.** Every `memory_facts` row as a sentence, the same sentences the Memory panel shows. Words Gur taught him. Gur's own frequent words, so the model knows "valo" is not a typo.
5. **The relationship.** The bond stage, how many days they have talked, milestones reached, any milestone due to be mentioned, and how long Gur has been away. Written as instructions per stage, matching the bond spec's table: a stranger gets formal precision, an old friend gets easy familiarity.
6. **How he feels right now, and why.** `feelingPhrase`, the dominant emotions, `session.cause`, today's mood so far from `mood_days`, and what happened last time they talked. This block changes every turn, so it goes last.
7. **The rules that stay code.** He is told which things are handled for him and not to improvise them: the crisis reply, re-rolling, saving memories (use the tool, do not claim to remember without it).

The conversation itself is the last 30 of Gur's messages from `messages` (guest lines excluded, as `ownerHistory` does today), sent as plain text items. The model's reasoning is never stored or replayed: every turn is rebuilt from `messages`, the request does not chain on a previous response, and OpenAI is asked not to store responses. The whole prompt should stay near 4,000 tokens, because every token comes out of the day's share.

## What stays deterministic, in order
Before the model sees anything, the route runs what `mind.ts` does today, in this order. The main lane exports these steps from `mind.ts` as one `prepareTurn(...)` (answered 2026-09-29), with every guest gate inside it, so the order lives in one place and the route only calls it:

1. **Crisis.** `isCrisis` on the raw text. If it matches, the reply is `CRISIS_REPLY`, saved and returned. The model is not called and no tokens are spent.
2. **Heart.** Gap and loneliness, cues, reactivity, one coupling and decay step. The new activations are what the prompt describes.
3. **Bond.** `recordTurn` with the same signals as today. Whether the message shared a feeling or an event comes from the model's reply instead of regexes (see tools), so the counts get more accurate, not less.
4. **Pending answers.** A yes or no while a dilemma verdict is pending, and "yes, roll" while a re-roll is pending, are still handled by code. The model is told the outcome and voices it.
5. **Life events and arguments.** `classifyUserEvents` and `detectArgument` still run so `applyEvent` and `argueOutlook` keep learning. The model is told "Gur just shared sad news; your sadness rose" and writes the acknowledgement itself.

After the model replies, the route saves `agent_state`, the two messages, `mood_days`, the ledger row, and any effects from tools, using the existing `persistTurn` moved server-side.

## His tools
All run in the route, all through the per-request Supabase client, all with their inputs validated before they run. Each is small and has its own tests with a fake database. Every tool round trip is another model call, and its tokens count.

| Tool | What it does | Table |
|---|---|---|
| `remember(key, value)` | Saves a fact about Gur. Replaces the regexes in `lib/facts.ts` and the "Could you explain it? I'll remember" flow. Keys keep today's shapes (`name`, `likes`, `slang:bet`, `meaning:zorp`) so the Memory panel keeps working. | `memory_facts` |
| `forget(key)` | Removes a fact when Gur asks him to. | `memory_facts` |
| `search_past(query, days?)` | Full-text search over their old messages, returned with dates. This is what makes "what did I say about my exam" and "how was I doing last week" answerable. | `messages`, `mood_days` |
| `define(term)` | The existing `lookupWord` (taught words, built-in slang, cache, Datamuse, Wiktionary). Kept because it is cached, private and already handles offensive senses. | `word_lookups` |
| `experience_story()` | The existing `pickEvent` and `applyEvent`. Returns the story and his new feeling; the model tells it. | `event_log`, `emotion_associations` |
| `pose_dilemma(topic?)` | The existing `nextDilemma` or `findDilemma`, scored by `decide`. Returns the scenario, his choice and the values that drove it; the model explains and asks "Do you agree?" | `dilemma_log` |
| `note_shared(kind)` | The model reports that Gur shared a feeling or a life event, so the bond counts it. Replaces the feeling regexes for bond purposes. | (bond in `agent_state`) |
| `web_search` | OpenAI's built-in web search, for current facts (the model's knowledge stops at August 2025). Off by default: a turn that uses it is billed, because tool use is outside the allowance (see below). | (none) |

Web search changes a promise he makes today ("internet access is used only to look up word definitions"), and it is the one thing in this plan that costs money: a search is billed per call, and the allowance excludes tool use, so the turn's tokens are billed too. It becomes a switch in Settings, off by default, stored in a new `settings` column on `agent_state`, with a daily number of searches next to it. When it is off the tool is not offered. His self-description is updated either way.

## What he can newly do
- Answer general questions, explain things, help think through a problem, do arithmetic, and hold a real conversation about anything. The model does this on its own.
- Answer about the world as it is now, through web search, if Gur switches it on.
- Remember the thread of their life together, not only facts: "You mentioned the exam last Tuesday. How did it go?" comes from `search_past` in phase 2 and from episodes in phase 3.
- Sound like his donors. A Victorian Butler Osmo and a Skater Osmo will read differently for the first time.
- Have an opinion in his own voice about a dilemma, a story or a piece of news, weighted by his values and mood.

## Personality piece 2, absorbed
The personality spec promised a "piece 2": about 25 topics with follow-ups, short-term memory, and a larger slang dictionary. It was never written. Where it stands:

- **The slang dictionary shipped** with the dictionary spec. Done.
- **Topics with follow-ups were never built.** The nearest things are the 20 one-line facts in `agentKnowledge` (matched by substring, which the review found buggy) and the "explain it and I'll remember" flow. Twenty-five hand-written topics would be twenty-five more regexes and templates, and the replayed chat log in `chatlog.test.ts` shows real messages ("do it jiggle when you walk") do not fit templates. The model makes topics free and unlimited (phase 1), and web search covers the present (phase 3). Follow-ups become `search_past` (phase 2) and episodes with a follow-up date (phase 3).
- **Short-term memory exists in fragments**, each solving one incident: `session.cause` (why he feels this way), the pending dilemma, the last question he asked (so "Gur" is read as a name), the words of the last six messages (for typos only), and `recallReply`, which quotes the last two lines back verbatim. Nothing tracks what was talked about. In the route, the conversation window in the prompt gives all of this for free; `cause` and the pending dilemma are kept as named lines in the prompt because they are state the model cannot see otherwise.

One more thing piece 2 would have run into. The material meant to give each personality "more to say" is already written and already dead:

- Only 12 of the 100 donors may supply voice, humor, slang or quirks (`personality/modern.ts`, not recorded in any spec).
- Of those 12, only two have dry humor, and `flavor.ts` speaks no other style. So ten of the twelve have no humor at all.
- `voice.openers`, `voice.elaboration`, `slang.says` and `quirks.phrases` are stored for every donor and read by no code path since the professional-voice change.

So today a donor's "voice" amounts to dropping a trailing question when verbosity is low, plus a rare framed slang joke from a hand-picked list of seven donors in `bond/lines.ts`. Piece 2 as designed would have poured more templates into that same narrow pipe. In this plan the donor material becomes prompt guidance instead, which is the only way a teasing or punning donor can be funny without being tone-deaf: the model reads the mood and the stage before it decides whether a line fits. The present-day restriction can then be reconsidered as a register rule ("sound like now") rather than a roster cut.

## Phases

### Phase 0. Fix what the review found
Small, mechanical, keeps every test green. Ships on its own first so the later phases start clean. The findings are listed at the end.

### Phase 1. The route, the model and the ledger, no tools
- `app/api/chat/route.ts`: verify the token, load state and memory, run `prepareTurn`, check the ledger, build the prompt, call the model, save, return.
- `lib/agent/prompt.ts` (pure) and its tests.
- `lib/agent/allowance.ts` (pure) and its tests: the listed models, which pool a model belongs to, the estimate for a call, and the decision "may this call be made today". The ledger is not optional and not phase 2: OpenAI bills what goes over the allowance, so the counter goes live with the first model call.
- The `token_ledger` table (main applies the migration; the SQL is in "Storage changes").
- The browser sends `{ text, speaker }` with the token from inside `sendText`, waits for the finished reply, and hands `deliver` one string, because the voice speaks a reply as one utterance and the typewriter already follows its word timing. The "One moment…" line covers the wait. The route does not stream in phase 1: a whole response is simpler to count and to fall back from, and the browser could not use the early words anyway. Streaming sentence by sentence is a later refinement.
- The mood theme updates from the state the route returns with the reply, and the response also carries today's use so the room can show it.
- Fallback to `processTurn` when the model call fails or the ledger says no.
- Vercel: `OPENAI_API_KEY` is already there for the speaking voice (Production only); the two cap variables are new. Supabase: the ledger.

After phase 1 he answers most questions. He does not yet remember anything new by himself.

### Phase 2. Tools, and the old chain retired
- The tools above, except `web_search`. Each with its own tests. The tool loop replays the model's output items in order (the SDK's `toResponseInputItems()`), appends the tool results, and counts every round into the ledger.
- Delete from `sendText` in `assistant.tsx` (checked against `main` at `8b50b4f`, all still present): `agentKnowledge`, `answerFromMemory`, `findUnknownTopic`, `calculateMath`, the pending-learning flow and the name-from-history hacks. Delete `lib/facts.ts` regexes once `remember` covers them. `context.ts` keeps `turnView` and shrinks otherwise to what the fallback needs.
- Supabase: a full-text index on `messages.text`, and `settings jsonb` on `agent_state`.

### Phase 3. Web search, and episodes
- `web_search` with the Settings switch, off by default because it is billed, and a cap on searches a day, counted from the `web_search_call` items in the responses (this SDK has no per-request cap for built-in tools).
- **Episodes.** Every 20 turns, or when a conversation goes quiet for an hour, the route asks the model for a three-sentence first-person summary of what happened ("Gur told me about his exam on Thursday. He was nervous. I said I would ask how it went.") with an optional follow-up date. Saved in a new `episodes` table. The most recent and the most relevant episodes (full-text match on the current message) go into the prompt. A due follow-up is mentioned when he greets Gur. This is what turns him from a chatbot with a fact list into someone who was there last week. Summaries are the one job for the large-model pool: a few calls a day where judgement matters more than speed, and if that pool is spent the summary waits until tomorrow.
- Full text search first. Vector search (`pgvector`) is a later upgrade if plain search proves too blunt; it needs an embedding provider and is not worth a second vendor yet.

### Phase 4. Being more human, once the plumbing is quiet
- **He starts conversations.** The welcome after a gap is generated from the last episode and any due follow-up instead of a fixed line per stage.
- **He notices patterns.** Once a week, a summary of `mood_days` and episodes lets him say "You have seemed tired all week" if it is true. Also on the large pool.
- **Evaluation.** A set of about 40 saved conversations graded for: speakable text, staying in character and stage, using memory correctly, and never inventing a memory. Run before any prompt change. Without this, prompt edits are guesswork.
- **Panels.** Insights shows episodes as part of "Our story" and shows today's and this week's tokens per pool against the caps. Memory shows episodes under a fourth heading, editable and forgettable like facts.

## The model and the API, so nothing stale gets built
These are the current shapes as of this revision. Field names and types come from the `openai` Node SDK 7.23.0 type definitions (published 2026-09-23), which the cloud session read directly. The allowance rules come from Gur's dashboard as recorded in `decisions.md`. Everything else (prices, the reset hour, per-model limits) comes from mirrors of OpenAI's pages and from other people's implementations, because the cloud session cannot reach OpenAI's own sites; those points are marked "to confirm" and the language lane checks them against the dashboard on the first live day.

### The allowance, and the rules it forces
- Two pools, from the dashboard (2026-09-29): up to 250,000 tokens a day across `gpt-5.4`, `gpt-5.2`, `gpt-5.1`, `gpt-5`, `gpt-4.1`, `gpt-4o`, `o1` and `o3`; up to 2.5 million tokens a day across `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5-mini`, `gpt-5-nano`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o-mini`, `o3-mini` and `o4-mini`. "Tokens" is one number, input plus output. Any other model, and anything over a limit, is billed at standard rates. OpenAI does not stop at the limit, and its rule is per request: a request that would carry the day's total past the limit is billed whole.
- The allowance excludes tool use, fine-tuning and evals. A turn that runs OpenAI's built-in web search is a billed turn.
- Osmo's share: about 500,000 a day from the mini pool and 50,000 from the large pool; the investing agents are capped at the rest. Osmo cannot see their usage, so it keeps strictly to its share.
- The counter resets at 00:00 UTC (OpenAI's help article, quoted by several sources, and confirmed by an independent implementation). The ledger is keyed by the UTC date in one function, `dayKey`, so a different hour would be a one-line change.
- Sharing is switched on per project in the OpenAI dashboard, and only shared projects get the free tokens. The account also needs a positive balance for them to apply.
- The four rules, each with a test: **listed models only** (one `ALLOWED_MODELS` list, dated, copied from the dashboard; a model constant not in it fails the test suite); **count every token** (input, output and reasoning, from every call, tool rounds included); **stop short of each cap** (a call is refused when today's count plus the call's estimate would cross the pool's cap, which is exactly OpenAI's own per-request rule applied one request early); **fall back to the rule-based chain** when refused or on any error.

### Which models
- **Conversation: `gpt-5.4-mini`**, from the mini pool. Released 2026-03-17, the newest listed mini model; 400,000-token context (272,000 in), knowledge to August 2025; it runs with reasoning off by default, so the share is not spent on thinking, and at that setting it answers in about one to three seconds. At about 4,500 tokens a message (a 4,000-token prompt plus a short reply) the 500,000 share is roughly 110 messages a day; a 50,000 share of `gpt-5.4` would be about 11, which is why the large model is not the conversation model.
- **Summaries and weekly patterns (phases 3 and 4): `gpt-5.4`**, from the large pool. A few calls a day, no history window, so 50,000 tokens is plenty.
- **Alternatives, all listed:** `gpt-4.1-mini` is the fallback choice if `gpt-5.4-mini` proves off-tone; it never reasons, has no shutdown date, and its knowledge stops in mid-2024. `gpt-5-mini` is not a good swap: it cannot turn reasoning off (its lowest setting is `minimal`, which still spends tokens) and its dated snapshot is shut down on 2026-12-11. `gpt-5.4-nano` is not worth its savings, because the prompt is the cost, not the reply. Two names on the dashboard's list are being retired: `o4-mini` and `gpt-4.1-nano` shut down on 2026-10-23, and `o3` and the `gpt-5` snapshots on 2026-12-11. The model is one constant per pool in `allowance.ts`, and the eval set in phase 4 is how a change is judged.
- The SDK's `ChatModel` union lists every model on the dashboard's lists, so the constants type-check; the dated snapshot for the mini model is `gpt-5.4-mini-2026-03-17`. Use the bare names, so OpenAI's own upgrades apply.
- A note from the field: in March 2026 several people reported `gpt-5.4-mini` traffic counted against the large pool instead of the mini pool, and free tokens have been mis-billed more than once. The first-day check below is how Osmo finds out which pool he actually landed in.

### Which API, and the request
- **The Responses API** (`client.responses.create`), which the SDK's own README calls the primary API. It has the `instructions` field for the system prompt, the built-in `web_search` tool (Chat Completions has no such tool, only a `web_search_options` field), `max_output_tokens`, and a usage block that breaks out reasoning and cached tokens. Nothing in the route uses Chat Completions.
- The `openai` package needs Node 22 or later; the Vercel project runs Node 24 and the app's own Node is 22, so nothing changes there. The package is not in `package.json` yet; language adds it.
- The request, per turn:
  - `model`: the conversation constant.
  - `instructions`: the system prompt from `prompt.ts`.
  - `input`: the history window and the new message as `{ role, content }` items. Within one turn's tool loop, the model's output items are replayed in order and the tool results appended as `function_call_output` items with the `call_id` the model gave; the SDK's `toResponseInputItems()` does the normalising. Across turns nothing is replayed: the next turn is rebuilt from `messages` as plain text.
  - `reasoning: { effort: "none" }` for conversation. On the 5.4 family the accepted values are `none`, `low`, `medium`, `high` and `xhigh`; `none` is the default and there is no `minimal` (the API rejects it by name). Sent explicitly anyway, so a later model change cannot silently start spending on thought. The summaries use `low`. Do not vary it between requests: a change invalidates the prompt cache.
  - `text: { verbosity: "low" }`: his replies are short. Also fixed, for the same reason.
  - `max_output_tokens`: 400 for conversation; the cap covers reasoning tokens too, and at `none` there are none. If a response comes back `incomplete` with reason `max_output_tokens`, the text so far is used when it ends a sentence, else the fallback answers.
  - `store: false`: nothing is kept on OpenAI's side for retrieval (the default keeps responses for at least 30 days), and no `previous_response_id`; the route replays history itself. With `store` off, `include: ["reasoning.encrypted_content"]` is set so any reasoning item can be replayed inside the tool loop. Whether `store: false` interacts with the sharing programme is not documented anywhere the cloud session could find; the first-day check settles it, and if the free tokens did not apply, `store` goes back to its default.
  - `tools`: the function tools with `strict: true` and `parallel_tool_calls: false`, so each round is one call and the loop stays simple; `tool_choice: "auto"`. Web search is `{ type: "web_search", search_context_size: "low" }`, only when the switch is on and the day's search count allows; the SDK's create parameters have no per-request cap on built-in tool calls, so the count is kept in the ledger from the `web_search_call` output items.
  - `safety_identifier`: a hash of Gur's user id, as OpenAI asks of apps with end users; the old `user` field is deprecated.
  - `prompt_cache_key`: the user id. It steers requests with the same prefix to the same cache. No `temperature` or `top_p`: the family accepts them only with reasoning off, and the default is right for a companion.
- Streaming is not used in phase 1 (see the phase). If it is added later, `client.responses.stream()` is the helper: the text arrives as `response.output_text.delta` events, and the finished `Response`, with `usage`, arrives in `response.completed` (or `response.incomplete` or `response.failed`); the helper's `finalResponse()` returns that last object. The ledger is written from it, never from the deltas.
- Prompt caching is automatic and prefix-based, which is why the stable blocks come first; the SDK reports `usage.input_tokens_details.cached_tokens`. On models before 5.6 the minimum cacheable prefix "varies by request settings", and the mini models are not on the list for 24-hour retention, so expect hits within a conversation and not across hours. Cached input is cheaper on the bill; this plan still counts cached tokens in full against the share, because nothing says the allowance discounts them.

### Counting
- After every call, add `usage.input_tokens + usage.output_tokens` (which is `usage.total_tokens`) to the ledger. `output_tokens` includes the reasoning tokens (`usage.output_tokens_details.reasoning_tokens` is the breakdown, recorded too); `input_tokens` includes the cached ones (`usage.input_tokens_details.cached_tokens`, recorded too). Store the model, so the pool is known.
- Before every call, estimate: the instructions and input in characters divided by three, rounded up, plus `max_output_tokens`. If `used(pool, today) + estimate > cap(pool)`, the call is not made and the turn falls back. The estimate is deliberately generous, so the counter always stops short. The SDK also has an exact counter, `client.responses.inputTokens.count(...)`; it is a network call, so it is for calibrating the estimator in tests, not for every turn.
- A call that times out or errors after the request was sent may still have been served: count the estimate for it. A call refused before sending counts nothing.
- A tool loop is several calls; each one is estimated, checked and counted on its own, so a long loop can stop in the middle and fall back.
- The two caps come from the server settings `OSMO_MINI_TOKENS_PER_DAY` (default 500000) and `OSMO_LARGE_TOKENS_PER_DAY` (default 50000). Until the dashboard has shown a few real days, set them a tenth under the share (450000 and 45000): OpenAI counts on its own clock, the investing agents' estimates may be off in the other direction, and the people who have built this before stop at ninety percent.
- When the mini pool is past 80% for the day, the history window drops from 30 messages to 10, so the last fifth of the share goes further.
- Two tabs could race by one call, because `sendText` returns false only within one browser; the margin covers that.

### Errors, timeouts and the fallback
- The conversation client is built with `timeout: 15_000` and `maxRetries: 0`: one attempt, then the code answers. The SDK's defaults are a 10-minute timeout and two retries with backoff, on connection errors, 408, 409, 429 and 5xx; for a chat turn a retry is a longer wait and possibly a second spend, and the fallback is free. The summaries, which nobody waits for, keep the SDK's defaults.
- Catch the SDK's classes from most specific to least: `AuthenticationError` (401, the key), `RateLimitError` (429; a spent balance also arrives here, with `error.code === "insufficient_quota"`, so log the code), `APIConnectionTimeoutError`, `APIConnectionError`, `InternalServerError`, then `APIError`. All of them fall back to `processTurn`. The response tells the browser `source: "fallback"` and why, so a bad key is visible in the console rather than mistaken for a dull mood.
- A missing key is not an error path: the route sees no `OPENAI_API_KEY` and no `CHATGPT_KEY` and falls back before building a client (the SDK throws at construction without a key).
- A refusal by the model (`incomplete_details.reason === "content_filter"`, or a `refusal` content part) falls back the same way. Unlikely for a companion.
- Vercel: the project was created after Fluid compute became the default, where a function may run 300 seconds on every plan, so a 15-second call needs no `maxDuration` export. If a build ever says otherwise, `export const maxDuration = 30` in the route is the fix.

### Cost
- Inside the allowance: nothing. A day of conversation is bounded by the share, and the fallback takes over after it. For scale, if the counting slipped by a whole day's share on `gpt-5.4-mini` (about $0.75 per million input tokens and $4.50 per million output, to confirm) the bill would be under a dollar.
- Outside it: web search, when switched on, is $10 per thousand calls plus the search content tokens at the model's rate, and the turn's own tokens are billed because tool use is excluded (to confirm); the speaking voice's text-to-speech (`gpt-4o-mini-tts`, about $12 per million audio tokens, roughly a cent and a half a minute of speech) is billed as before. A monthly spend limit in the OpenAI dashboard is the backstop for both, and for any slip in the counting.

### The first-day check
On the first live day, language and Gur look at the OpenAI usage dashboard: grouped by service tier, the free traffic appears as the data-sharing incentive tier, and the Costs view should show nothing for the chat model. That confirms three assumptions at once: that `store: false` did not disqualify the traffic, that `gpt-5.4-mini` landed in the mini pool, and that the ledger's count agrees with OpenAI's to within the estimates.

## Storage changes

| Change | Phase | Why |
|---|---|---|
| Vercel env `OPENAI_API_KEY` (server only, never `NEXT_PUBLIC_`; `CHATGPT_KEY` accepted) | 1 | The key; already there for the voice |
| Vercel env `OSMO_MINI_TOKENS_PER_DAY`, `OSMO_LARGE_TOKENS_PER_DAY` | 1 | The caps, changeable without code |
| `token_ledger` and `add_tokens` (below) | 1 | Count every token, stop short |
| `agent_state.settings jsonb` (`{ webSearch: false, webSearchesPerDay: 10 }`) | 2 | Switches |
| Full-text index on `messages(text)` | 2 | `search_past` |
| `episodes(id, user_id, summary, follow_up_at, from_id, to_id, created_at)` | 3 | Episodic memory |

The ledger, for main to apply (own rows only, like every other table):

```sql
create table public.token_ledger (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  pool text not null check (pool in ('mini', 'large')),
  model text not null,
  calls integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, pool, model)
);
alter table public.token_ledger enable row level security;
create policy "own rows" on public.token_ledger
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.add_tokens(
  p_day date, p_pool text, p_model text,
  p_input integer, p_output integer, p_reasoning integer, p_cached integer
) returns void language sql security invoker as $$
  insert into public.token_ledger as t
    (user_id, day, pool, model, calls, input_tokens, output_tokens, reasoning_tokens, cached_tokens)
  values ((select auth.uid()), p_day, p_pool, p_model, 1, p_input, p_output, p_reasoning, p_cached)
  on conflict (user_id, day, pool, model) do update set
    calls = t.calls + 1,
    input_tokens = t.input_tokens + excluded.input_tokens,
    output_tokens = t.output_tokens + excluded.output_tokens,
    reasoning_tokens = t.reasoning_tokens + excluded.reasoning_tokens,
    cached_tokens = t.cached_tokens + excluded.cached_tokens,
    updated_at = now();
$$;
```

The function runs as the caller, so row-level security still applies, and the increment is one statement, so two calls cannot lose each other's count. Today's use for a pool is `sum(input_tokens + output_tokens)` over the day's rows for that pool. The route never uses a service-role key.

## Code structure
All new files are the language lane's, which owns the conversation and can test with the key locally.
- `app/api/chat/route.ts`: auth, load, `prepareTurn`, the ledger check, the prompt, the model call, tools, save, respond. Thin; everything it calls is testable without it.
- `app/api/chat/openai.ts`: the client, and one `ask(request)` that runs the tool loop and returns `{ text, calls: [{ model, usage, status, searches }] }` or throws one of the SDK's errors. The only file that imports `openai`.
- `app/api/chat/supabase.ts`: the per-request client, built from the user that speaking's `lib/server/auth.ts` returns.
- `lib/agent/prompt.ts`: state in, system prompt out. Pure.
- `lib/agent/allowance.ts`: `ALLOWED_MODELS` with the dashboard date, `poolOf(model)`, `estimateTokens(request)`, `mayCall(used, estimate, cap)`, `dayKey(now)`, `historyWindow(used, cap)`. Pure.
- `lib/agent/tools/*.ts`: one file per tool, each a schema plus a handler that takes a Supabase client. Tested with a fake.
- `lib/agent/mind.ts` (main): exports `prepareTurn`; otherwise the fallback, unchanged. `talk.ts` unchanged.
- `app/assistant.tsx` (language): `sendText` loses its language chain and calls the route; the room, the typewriter, the voice wiring and the panels stay as they are.

### The `/api/chat` contract
`POST` with `Authorization: Bearer <Supabase access token>` (checked by speaking's `lib/server/auth.ts`) and body `{ text: string, speaker: "you" | "guest" }`. Response `{ reply: string, state: AgentState, source: "model" | "fallback", reason?: "allowance" | "error" | "no_key" | "crisis", usage?: { pool: "mini" | "large", usedToday: number, cap: number } }`, or a 401. The route saves the two `messages` rows and `agent_state` itself, so `sendText` only shows the reply and takes the new state for the mood theme. `reason` and `usage` are additions to the draft in `project.md`; `usage` is what lets the room show today's use without a new query. Streaming, if added, ends in the same final object.

## Coordination
- **Four lanes share a brain** (the `brain` branch: `lanes.md`, `project.md`, `decisions.md`, one desk per lane). Since 2026-09-29 the **language lane builds** the AI conversation, because it owns `sendText` and can test with the key locally; the **cloud lane** keeps this spec current and reviews the code on GitHub after each push, posting findings on `desks/cloud.md`; the **main lane** exports `prepareTurn` from `mind.ts`, applies the migrations, and owns the panels that will show the use; the **speaking lane** owns `lib/server/auth.ts`, which the route reuses. The main agent merges PRs locally; the GitHub merge button is never used, because local `main` is usually ahead and a merge there deploys. `lib/voice/` is not touched.
- **The key is shared** by speaking (`/api/speak`, billed) and language (`/api/chat`, allowance only). Only Gur types keys, into `.env.local` and Vercel; no agent ever reads a key's value out.
- **Two things wait on Gur** (`decisions.md`, "Waiting on Gur"): confirming the sharing trade, because the free allowance means OpenAI may use what Osmo sends to improve its models, which includes Gur's messages, his memory facts, his mood and history in each prompt, and guests' words; and a monthly spend limit in the OpenAI dashboard as the backstop. Giving Osmo his own OpenAI project and key is also on that list. His self-description and the dictionary spec are updated in the same change that ships phase 1.
- **Nothing is pushed without Gur's OK.** A push to `main` is a deploy. Phase 1 ships behind nothing: with no key on Vercel it is the fallback, and with the key it is live, so the push waits for the two answers above.

## Testing
- All 612 existing tests keep passing at every phase.
- `prompt.ts`: given a state, the prompt names the right donors, the right stage, the right feeling and cause; contains every memory sentence; contains no markdown; a guest state yields a prompt with no name, memory, history or cause.
- `allowance.ts`: every model constant is in `ALLOWED_MODELS`; `poolOf` for each listed model and an unlisted one (throws); the estimate is above the real token count on three sample prompts (counted once with `inputTokens.count` and saved as fixtures); `mayCall` refuses at the boundary; `dayKey` rolls over at 00:00 UTC and not at local midnight; `historyWindow` shrinks past 80%.
- The ledger against a fake Supabase client: a call adds its usage under the right pool and model; a tool loop of three rounds adds three; a timed-out call adds its estimate; a refused call adds nothing.
- Each tool against a fake Supabase client: happy path, a database error, an invalid input.
- The route with a fake model client (the same pattern `lookupWord` uses with a fake `fetch`): 401 without a token; crisis short-circuits without a model call; fallback with `reason: "no_key"` when both key names are absent; fallback with `reason: "allowance"` when the ledger says no; fallback with `reason: "error"` on each SDK error class and on an `incomplete` response with reason `content_filter`; the request carries `reasoning.effort: "none"`, `store: false` and a listed model; tool results are saved; usage is logged; a guest turn sends no memory sentence, name or history line to the model and writes no fact.
- The eval set from phase 4, run by hand before prompt changes.
- By hand in the browser after each phase: a factual question, a question about last week, "remember my sister is Maya" then "what's my sister's name", a sad message, a dilemma, "roll a new osmo", the caps set to a few thousand to watch the fallback take over, and the key removed from Vercel to see the fallback. Then the first-day check above.

## Risks and open assumptions
- **Going over the allowance.** OpenAI bills past the limit instead of stopping. The ledger, the generous estimate, the caps set under the share, and the monthly spend limit are four separate guards; the investing agents' own cap is the fifth, and it is not Osmo's to check. The first days are watched on the dashboard.
- **The sharing trade.** Everything in a prompt may be used by OpenAI to improve its models. That is Gur's decision to confirm before phase 1 goes live, and his self-description must say plainly that his words leave the device.
- **The model list moves.** The dashboard's list changes with each model generation, and two names on it retire next month. `ALLOWED_MODELS` is one dated list; when it no longer matches the dashboard, the test that pins it is the reminder.
- **The reset hour** is assumed to be 00:00 UTC. If the dashboard shows otherwise, `dayKey` changes.
- **Free tokens landing in the wrong pool, or not at all.** It has happened to others with this model family. The first-day check catches it, and until then the caps sit a tenth under the share.
- **Latency.** A model reply takes one to three seconds where today's is instant (about 0.8 seconds to the first token and 160 tokens a second for this model with reasoning off, per public measurements). The typewriter and the "One moment…" line already cover waiting, and a 15-second timeout bounds the worst case.
- **Character drift.** A model will happily be warmer or chattier than Osmo should be. The prompt rules and the eval set are the guard. Keeping the heart and bond as code, not prose, is the other: the model is told he is a stranger, it does not get to decide.
- **Invented memories.** The strongest rule in the prompt: never claim to remember something that is not in the memory block or a tool result. The eval checks it.
- **Privacy.** Messages now leave the browser to Vercel and to OpenAI. That is a change from "internet only for word definitions" and his self-description must say so plainly. Supabase rows stay as private as before.
- **Guest leakage.** The model is the one place a guest could be told something of Gur's, because it answers freely. The guest prompt must contain nothing of his, and the route test for a guest turn asserts that no memory sentence, name or history line reaches the model. The voice check itself (who is speaking) stays on the device and is untouched.

## Appendix: code review findings, 2026-09-28
Static review of `app/`, `components/`, `lib/`, `scripts/`, plus the test suite, lint and typecheck. Re-checked against `main` at `8b50b4f` after the voice landed: all ten are still there. Most severe first. All are small and become phase 0. Ownership per `lanes.md` on the `brain` branch: 1, 2, 4, 8 and 10 to language; 3, 6, 7 and 9 to main; 5 to main and language together. They are tracked on those lanes' desks.

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
