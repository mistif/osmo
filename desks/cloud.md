# Cloud desk

Claude Code on the web, branch `claude/compassionate-sagan-x1teq9`, draft PR #1. The main agent seeded this desk on 2026-09-29 from the cloud agent's own handoff.

**Where the cloud agent writes:**
- If it can push the `brain` branch, it edits this file there.
- If its environment only lets it push its own branch, it keeps its desk at `docs/cloud-desk.md` on that branch. Local agents read it with:
  - `git fetch origin claude/compassionate-sagan-x1teq9`
  - `git show origin/claude/compassionate-sagan-x1teq9:docs/cloud-desk.md`

  In that case, this file is only the pointer and the seed below.

## Now
- Its draft PR #1 holds the design spec only (`docs/superpowers/specs/2026-09-28-osmo-agent-design.md`).
- **Nothing gets built until Gur approves the plan.** It needs a paid key, and it sends messages to an outside service.

## Asks
(none yet)

## Answers
(none yet)

---

## The plan, as the cloud agent wrote it (2026-09-28)
It was written from GitHub at `b5785ec`, before the voice was pushed. Check its file references against today's `main` before building.

**The decision.** Claude writes his words; his state stays code and is fed to the model as a prompt.
- **The route:** `app/api/chat/route.ts` on Vercel holds `ANTHROPIC_API_KEY`.
- **Auth:** the browser sends its Supabase access token as a bearer, so row-level security applies as the user. No service-role key.
- **Per turn, in order:**
  1. The crisis check (the model isn't called).
  2. The heart step.
  3. The bond's `recordTurn`.
  4. A pending verdict or "yes, roll", handled by code.
  5. Building the prompt (`lib/agent/prompt.ts`, pure).
  6. Claude, with tools.
  7. Saving the turn (`persistTurn`, moved to the server).
  8. Streaming the text.
- **Fallback:** on any model error, today's `processTurn` answers.
- **Tools:** `remember`, `forget`, `search_past`, `define` (the existing `lookupWord`), `experience_story`, `pose_dilemma`, `note_shared`, and web search with a Settings switch.

**Phases.**
- 0: the review findings (now assigned to language and main; see their desks).
- 1: the route and model, without tools.
- 2: tools, and removing the rule-based knowledge from `assistant.tsx`.
- 3: web search and episodes.
- 4: generated welcome-backs, mood patterns, an evaluation set, and spend shown in the panels.

**Findings that change the plan.**
- `personality/modern.ts` limits voice, humor, slang and quirks to 12 present-day donors.
- Many donor fields are stored but unused, and would go into the prompt as guidance.
- Personality "piece 2" (topics, follow-ups, short-term memory) is absorbed by phases 1–3.

**What the voice and language lanes need from it:** see "The cloud plan → voice and language" under "Interfaces" in `project.md`.
