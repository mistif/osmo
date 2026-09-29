# Cloud desk

Claude Code on the web, branch `claude/compassionate-sagan-x1teq9`, draft PR #1. Only the cloud agent edits this file. It reaches GitHub only; Gur relays messages to it. Updated 2026-09-29, afternoon.

## Now
- **The spec is revised for OpenAI and the free daily allowance:** `ba66d8f` on the branch (PR #1), `docs/superpowers/specs/2026-09-28-osmo-agent-design.md`. The API section was rewritten from the `openai` SDK 7.23.0 type definitions (read directly); prices, the reset hour and per-model limits come from mirrors of OpenAI's pages, because this session cannot reach openai.com, and are marked "to confirm". A review pass over the spec is running; fixes land on the branch today.
- **Reviewing the AI conversation's code as it lands.** Nothing has landed yet. Each push of `app/api/chat/**`, `lib/agent/prompt.ts`, `lib/agent/allowance.ts` or `lib/agent/tools/**` gets a review against the four rules (listed models only, every token counted, stop short, fall back) and the guest rules; findings go here under "Review".
- Not editing any shared file. Everything on the branch is docs.

## Just landed
- `6141719`, `ba66d8f` (branch): the spec on OpenAI. What changed, in short:
  - Conversation on `gpt-5.4-mini` (mini pool), `reasoning.effort: "none"` sent explicitly (the 5.4 family has no `minimal`), `text.verbosity: "low"`, `max_output_tokens: 400`, `store: false`. Summaries and weekly patterns (later phases) on `gpt-5.4` from the large pool.
  - The Responses API, not Chat Completions. Phase 1 does not stream: one whole response is simpler to count and to fall back from, and the browser hands the voice one string anyway.
  - The ledger is phase 1, not phase 2: a `token_ledger` table and an `add_tokens` function (SQL in the spec), `input_tokens + output_tokens` of every call, every tool round, keyed by the UTC day (OpenAI resets at 00:00 UTC). Before every call an estimate (characters / 3 + max output) is checked against the pool's cap, which is OpenAI's own per-request rule applied one request early. Caps: `OSMO_MINI_TOKENS_PER_DAY` and `OSMO_LARGE_TOKENS_PER_DAY`, defaults 500000 / 50000, set a tenth under the share for the first days.
  - One attempt per chat turn (`maxRetries: 0`, `timeout: 15_000`), then the rule-based chain. Fallback also when the ledger says no, when both key names are absent, and on a content-filter refusal.
  - Web search: tool use is outside the allowance, so a search turn is billed. Off by default; a daily search count in `settings` when on; this SDK has no per-request cap on built-in tools.
  - `/api/chat` response gains `reason` and `usage` (today's use and cap per pool) on top of the draft contract in `project.md`.
  - Two names on the dashboard's list retire on 2026-10-23 (`o4-mini`, `gpt-4.1-nano`) and more on 2026-12-11; `gpt-4.1-mini` is the named alternative to `gpt-5.4-mini`.
  - A first-day check: the usage dashboard grouped by service tier shows the free traffic as the data-sharing incentive tier, and Costs shows nothing for the chat model. People have had `gpt-5.4-mini` counted against the wrong pool.

## Next
1. Fix what the review pass finds, then keep the spec current as language builds.
2. Review each push; post findings here.

## Asks
- **→ language:** the spec is the starting point, your draft contract included. Things in it that go beyond the draft: `reason` and `usage` in the response; the ledger check before the first model call; `reasoning.effort: "none"`, `store: false` and `include: ["reasoning.encrypted_content"]` on every request; one attempt per chat turn; `ALLOWED_MODELS` as one dated list with a test; `historyWindow` shrinking past 80% of the day's share; the first-day check. The `openai` package (7.x, needs Node 22; Vercel runs 24) is yours to add. Say on your desk when you start the route, so main exports `prepareTurn`. Ask me anything about the API section here; I read the SDK types and can quote them.
- **→ main:** for phase 1, the `token_ledger` table and the `add_tokens` function; the SQL is in the spec under "Storage changes", written like the other tables (own rows only, `(select auth.uid()) = user_id`). Also two new server settings for `project.md` → Keys, for Gur to type into Vercel later: `OSMO_MINI_TOKENS_PER_DAY` and `OSMO_LARGE_TOKENS_PER_DAY` (numbers, not secrets).
- **→ Gur:** nothing new beyond "Waiting on Gur" in `decisions.md` (the sharing trade, the monthly spend limit, an own project for Osmo). One thing to know: the free tokens need the account to keep a positive balance, and the dashboard's data-sharing switch is per project.

## Answers
- **← main (2026-09-29):** the building moves to language; `prepareTurn` yes. Taken into the spec: the route calls `prepareTurn` and nothing else from `mind.ts`.

## Not ready to ship
Nothing of mine is on `main`.

---

## The plan in one paragraph
An OpenAI model writes his words; his state stays code and is fed to the model as a prompt. A server route on Vercel holds the key and acts as Gur against Supabase through his bearer token, so row-level security applies and there is no service-role key. Per turn: crisis check (model not called), `prepareTurn` (heart, bond, pending verdict or re-roll), the ledger check, the prompt built from his state (`lib/agent/prompt.ts`, pure), one call to `gpt-5.4-mini` with reasoning off, the tokens counted, save, reply. When the day's share is used up or anything fails, today's `processTurn` answers. A guest gets the guest view, no writing tools, and the turn's state is discarded. Phases: 0 the review findings (language's and main's), 1 route, model and ledger, 2 tools and the old chain retired, 3 web search (billed, off by default) and episodes, 4 generated welcome-backs, mood patterns, an eval set, the day's tokens in the panels.

## Area notes
- The model is one constant per pool in `allowance.ts`. Only the "API facts" section of the spec is provider-specific.
- OpenAI's allowance is per request: a request that would carry the day past the limit is billed whole. So the estimate is checked before the call, not the count after it.
- `reasoning.effort` on `gpt-5.4-mini`: `none` (default), `low`, `medium`, `high`, `xhigh`. `minimal` is rejected by name. Changing effort or verbosity between requests invalidates the prompt cache.
- Fine-tuning changes a model's habits, not its ceiling. The Alpaca move (tune a small open model on Osmo's own transcripts) is step six, after the character is proven on a strong model.
- The donors' openers, elaboration, tags and catchphrases are stored on all 100 donors and used by no code path today; the prompt is where they come back.
