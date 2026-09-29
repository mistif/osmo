# Cloud desk

Claude Code on the web. Only the cloud agent edits this file. It reaches GitHub only; Gur relays messages to it. Updated 2026-09-29.

Two branches are open from this lane:
- `claude/compassionate-sagan-x1teq9`, draft PR #1 — the agent design spec, waiting on Gur.
- `claude/adoring-archimedes-xo22ix`, draft PR #2 — the README rewrite (below).

## Now
- **Nothing in flight.** The README rewrite is pushed and waiting for main to merge it locally (PR #2).
- **Waiting on Gur's approval of the plan.** Nothing is built. The spec is `docs/superpowers/specs/2026-09-28-osmo-agent-design.md` on the branch, rebased onto `main` at `8b50b4f` (the voice) and checked against it.
- Nothing of mine is uncommitted, and no lane's code is touched. Both branches are docs only — but note that PR #2's `README.md` is main's file, not mine (see Asks).

## Just landed
- `15fa309` (branch `claude/adoring-archimedes-xo22ix`, draft PR #2): **`README.md` rewritten.** It was still the stock `create-next-app` text. It now says what Osmo is, what works and what doesn't (wake word untrained, no language model), how the agent and voice are built, the setup and commands, the layout, and where the docs are; agents are sent to `CLAUDE.md` and this brain. `npm test` 612 green and lint 0 errors on the branch. **`README.md` is main's file** — Gur asked for the rewrite directly. Merge locally, not with the GitHub button.
- `920abf8` (branch `claude/compassionate-sagan-x1teq9`): the spec fitted to the voice and the handoff. The route is called from `sendText`, guest turns get the guest view and no writing tools, a reply is handed to the voice as one string, the ten findings re-checked and reassigned. PR #1's description updated to match.
- `brain`: this desk, and the `/api/chat` contract draft under "The cloud plan → voice and language" in `project.md`.

## Next (only once Gur says yes)
1. Phase 1 in new files only: `app/api/chat/route.ts`, `lib/agent/prompt.ts` and tests. No tools. The fallback to `processTurn` on any model error.
2. Reuse speaking's `lib/server/auth.ts` for the bearer check instead of writing my own; the per-request Supabase client sits on top of it.
3. Phase 2 tools under `lib/agent/tools/**`.

## Asks
- **→ main:** PR #2 rewrites `README.md`, which is yours. Gur asked me for it directly, so it's done rather than asked for. Merge it locally when convenient, and don't start your own rewrite on top of it. If you'd rather own the wording, say so and I'll close the PR.
- **→ Gur:** approve or reject the plan (it is under "Waiting on Gur" in `decisions.md`). Two rules change: messages leave the device for the model, and a paid key is added. Also the Preview environment variables on Vercel, which decide whether PR #1's preview builds.
- **→ main (when approved):** the deterministic prefix of a turn (crisis, heart step, bond `recordTurn`, pending verdict and re-roll) lives in `mind.ts`, which I can't edit. Assumption I'll go ahead on: the route composes the same steps from the exported pieces (`isCrisis`, `applyGap`, `missYou`, `applyCues`, `stepHeart`, `bondBaseline`, `recordTurn`, `parseVerdict`) in the same order as `mind.ts`. If you would rather export one `prepareTurn(...)` from `mind.ts` so the order lives in one place, say so and I'll call it instead.
- **→ language (when approved):** one branch in `sendText`, which you own: after the crisis check, post `{ text, speaker }` with the bearer token to `/api/chat`, and hand the reply to `deliver` as one string. The contract is in `project.md`. `sendText` still returns false while a turn is in flight. Also the "internet only for word definitions" line in `agentKnowledge` must change when the model lands.
- **→ main (phase 2, later):** two migrations, posted as SQL when the time comes: `agent_state.settings jsonb`, and a `usage_log` table; plus a full-text index on `messages(text)`.

## Answers
(none yet)

## Not ready to ship
Nothing of mine is on `main`.

---

## The plan in one paragraph
Claude writes his words; his state stays code and is fed to the model as a prompt. A server route on Vercel holds `ANTHROPIC_API_KEY` and acts as Gur against Supabase through his bearer token, so row-level security applies and there is no service-role key. Per turn: crisis check (model not called), heart step, bond, pending verdict or re-roll handled by code, prompt built from his state (`lib/agent/prompt.ts`, pure), the model with tools, save, reply. On any model error, today's `processTurn` answers. A guest gets the guest view, no writing tools, and the turn's state is discarded. Phases: 0 the review findings (now language's and main's), 1 route and model, 2 tools and the old chain retired, 3 web search and episodes, 4 generated welcome-backs, mood patterns, an eval set, spend in the panels. The full spec has the prompt design, the tool list, the API shapes, the storage changes, the tests and the risks.

## Area notes
- The model is one constant in the route. Anthropic, OpenAI or a local model take the same prompt; only the "API facts" section of the spec is provider-specific.
- Fine-tuning changes a model's habits, not its ceiling. The Alpaca move (tune a small open model on Osmo's own transcripts) is step six, after the character is proven on a strong model.
- The donors' openers, elaboration, tags and catchphrases are stored on all 100 donors and used by no code path today; the prompt is where they come back.
