# Osmo's bond: a relationship that grows, in a professional voice

## Goal
Give Osmo a relationship with each user that grows over time, in the spirit of JARVIS and Tony Stark. As you talk across days, he moves from stranger to old friend. He uses your name more, welcomes you back, remembers milestones, and slowly lets some dry humor show. His voice stays composed and professional throughout, because he will become a speaking agent. Fully rule-based, with no AI model.

## Non-goals
- A visible bond meter or stage label. The bond is felt through behavior only.
- The bond ever going down. Osmo is loyal no matter what.
- Remembering specific topics the user mentioned ("your exam last week"). That needs topic tracking, which belongs to the language work.
- Loyalty changing his dilemma decisions.
- Any change to the language files owned by the other session: `talk.ts`, `context.ts`, `safety.ts`, `lib/facts.ts`, `lib/agent/lexicon/*`, `dictionary*.ts`.

## Part A: a professional voice
Osmo speaks in a composed, polite, concise register at all times, with occasional dry wit. The donors keep shaping his feelings (heart), morals (brain) and how much he says (verbosity), but no longer his register.

- `flavor.ts` stops adding casual openers, slang tags and catchphrases as plain output. Humor is limited to dry wit, whatever the donor's humor style.
- **Slang only as a knowing joke.** Occasionally, on light moments, he uses one of his slang donor's words inside a deadpan frame that shows it is deliberate. Examples:
  - "That was a strong answer. No cap, as I believe the expression goes."
  - "Consider it done. I am told the phrase is slay."
  - "An excellent result. Some would say it hits different."
- **Gated by the bond:**
  - Stranger: never.
  - Acquaintance: rarely.
  - Friend and old friend: a little more often, but still rare.
- **Never** on sad or heavy moods, a sad user, insults, crisis, dilemmas, stories or verdicts.
- `readout.ts` ("what are you made of", re-roll wording) and Osmo's own replies in `mind.ts` (event acknowledgements, dilemma verdicts, re-roll hints) are rewritten in the professional voice.
- **Everything he says is speakable:** no brackets, symbols, emoji or internet abbreviations. Slang is written out as words.
- He never talks down to the user ("kiddo", "sweetheart" and similar). This is an existing rule, pinned by the other session's `chatlog.test.ts`.
- **Wording pinned by the other session's tests must keep matching:**
  - the re-roll hint contains `"yes, roll"`,
  - the reply after "yes, roll" starts with `Done.`,
  - the "nothing to confirm" line mentions `roll a new osmo`.

  Any other change to those strings is sent to the other session as old and new text before editing.

## Part B: the bond

### What is stored
A `bond` object on Osmo's state, per account:

| Field | Meaning |
|---|---|
| `metAt` | When they first talked (ISO timestamp) |
| `messages` | Total user messages |
| `days` | Number of distinct local calendar days they have talked |
| `lastDay` | The most recent of those days (`YYYY-MM-DD`), used to count new days |
| `shared` | Times the user shared something personal: a feeling, a life event, or their name becoming known |
| `nameKnown` | Whether the user's name has been learned |
| `milestones` | Reached milestones, each `{ id, at }` |
| `toMention` | Milestone ids reached but not yet mentioned in a reply |

Counts only ever go up, which is what makes the bond loyal.

### Closeness and stages
`closeness` is a number from 0 to 1, recalculated from the counts every time, never stored. Distinct days weigh most, then things shared, then messages, each with diminishing returns so growth continues but slows. Stages come from closeness:

| Stage | Roughly when, at real pace |
|---|---|
| Stranger | First conversation |
| Acquaintance | After a couple of days |
| Friend | About a week of regular talking |
| Old friend | A month or more |

The exact formula and thresholds are tuned in the implementation plan so those rough times hold. Because closeness is derived from counts, retuning it later updates every account consistently.

### Demo switch
When `NEXT_PUBLIC_OSMO_DEMO=1` is set, every message counts as a new day. All four stages then appear within about 30 messages (acquaintance around message 3, friend around 8, old friend around 30). It is off by default.

### Milestones
Each fires once, in the order reached:

- first conversation,
- learning the user's name (recorded quietly, since the name reply already acknowledges it),
- first feeling shared,
- first life event shared,
- 7 days talked,
- 30 days talked,
- reaching acquaintance, friend and old friend.

A newly reached milestone joins `toMention`. It is mentioned on the next reply where it fits, then removed. For example: "Thank you for telling me how you feel. I will remember it." The first conversation and the name milestone are never mentioned.

### How the bond shows

| | Stranger | Acquaintance | Friend | Old friend |
|---|---|---|---|---|
| Uses your name in bond lines | Never | Yes | Yes | Yes |
| Tone | Formal and precise | Courteous and settled | Warm but composed, some dry wit | Easy familiarity |
| Welcome back after 20+ hours away | "Welcome back." | "Good to see you again, Gur." | "Welcome back, Gur. It has been quiet here." | "There you are, Gur. I took the liberty of missing you." |
| Shared memories on light moments | No | No | Rarely | Sometimes |
| Joking slang | No | Rarely | Rare | Rare |

- **Shared memory** example: "I still remember the first day you told me your name."
- Greetings from the language layer already include the name once it is known; the bond does not add or remove it there.
- **At most one bond or personality extra per reply,** in priority order: welcome back (only on the first message after 20+ hours away), then milestone line, then shared memory, then joking slang or dry humor. This keeps the existing one-extra rule.
- **Heavy moments get no extras:** Osmo sad, afraid, angry, guilty or lonely; the user sad; an insult. One exception: a welcome back is allowed when he is only lonely, since the wait is what made him lonely.

### Mood
- Closeness raises his resting trust and love a little, so a close Osmo is warmer and steadier by default.
- Time away raises loneliness more the closer they are. This is what makes "I took the liberty of missing you" true.
- Insults still hurt his mood in the moment. The bond is never lowered.

### Asking about the bond
Two new personality commands, handled next to "what are you made of":

- **"How close are we?"** answers in words, using the real counts. For example: "I would call us friends. We have spoken on 9 different days, and you have told me a good deal about yourself."
- **"When did we meet?"** For example: "We first spoke on the 24th of September."

## Code structure
- `lib/agent/bond/bond.ts` (new, pure):
  - `recordTurn(bond, signals)`, where the signals are the time, whether something was shared, and whether the name is known,
  - `closeness(bond)`, `stageOf(bond)`, `newMilestones(before, after)`,
  - `sanitizeBond(raw, now)`,
  - `bondMood(...)`, which applies the mood effects.
- `lib/agent/bond/lines.ts` (new): welcome-back, milestone, shared-memory and closeness-answer wording; joke frames for slang; command detection for "how close are we" and "when did we meet".
- `state.ts`: `AgentState` gains `bond`. `defaultState` and `sanitizeState` handle it.
- `load.ts` and `agent-state.ts`: load and save `bond`. There is one database change, a nullable `bond` jsonb column on `agent_state`, in migration `add_agent_bond`. Existing accounts get a fresh bond on first load.
- `personality/flavor.ts`:
  - `FlavorContext` gains optional `bond`, `userName` and `awayMs` fields,
  - applies the voice rules from Part A and the extras above,
  - still runs its bond extras when there is no donor genome.
- `personality/readout.ts`: professional wording, and the two bond answers.
- `mind.ts`:
  - The heart step applies `bondMood`.
  - **A new step right after the crisis check** records the turn in the bond. Something counts as shared when a life event is told, a feeling is shared, or `ctx.userName` is set for the first time. Crisis messages return before this step, so they never count.
  - The two bond commands go next to the existing readout commands.
  - In step 6, which is owned by the other session, the `flavor(...)` call becomes `flavorTurn(...)`, which returns the text plus the milestone it mentioned, so the mention can be removed from the saved bond. That is a few lines, and the other session is messaged before and after this edit.

## Testing
Vitest, like the rest of the project:

- **bond.ts:**
  - counts never decrease,
  - a new local day increments `days` once,
  - closeness rises with diminishing returns,
  - stage thresholds are correct,
  - each milestone fires exactly once,
  - demo pace reaches old friend within about 30 messages,
  - `sanitizeBond` repairs missing or broken data.
- **flavor.ts:**
  - no slang, catchphrase or casual opener appears except inside a joke frame,
  - no joking slang at stranger,
  - name usage per stage,
  - welcome back only after 20+ hours,
  - at most one extra per reply,
  - no extras on heavy moods, sad users or insults,
  - output contains no brackets or emoji,
  - existing "never talks down" rule still holds for seeds 1 to 200.
- **mind.ts:**
  - a crisis message leaves the bond unchanged,
  - a shared feeling increments `shared`,
  - insults never lower closeness,
  - the bond commands answer with real counts.
- **Persistence:** the `bond` column round-trips, and a missing column value gives a fresh bond.

## Coordination and risks
- The folder is not a git repository and another session edits nearby files, so every edit to a shared file (`mind.ts`, `assistant.tsx`) is announced to that session first. Running `git init` is recommended.
- The rough stage timings are guesses and will need tuning after real use. The demo switch makes them quick to check.
- Rule-based wording has a ceiling. Closeness shows through a set of hand-written lines, which will start to repeat over long friendships until more are written.
