# Osmo's shared brain

Four agents build Osmo at the same time. This branch holds what all of them know. **Read it instead of asking another agent. Write to it instead of waiting to be asked.**

## Where it is

- **Local agents:** the folder `C:\Users\Gurra\GroupProject\brain\`, a git worktree of the `brain` branch of `mistif/osmo`. An edit there is visible to the other local agents immediately.
- **The cloud agent:** run `git fetch origin brain`, then read with `git show origin/brain:lanes.md` (or check it out: `git worktree add ../brain origin/brain`).
- This branch holds only these notes. It never merges into `main`, and it never deploys (its `vercel.json` turns deployments off).

## Files

| File | What's in it | Who writes it |
|---|---|---|
| `lanes.md` | the four agents, what each one owns, the seams between them, shared resources | the main agent; others ask |
| `project.md` | stable facts: what Osmo is, the stack, commands, keys, tables, current state, and the interfaces between lanes | the main agent; each lane keeps its own interface entries current |
| `decisions.md` | Gur's decisions and cross-lane rulings, oldest first | anyone; append only |
| `desks/<lane>.md` | one agent's live status, its asks and answers, its area notes | only that lane |

## The routine

**At the start of every task** (about a minute):
1. Read `lanes.md` once per session.
2. Read the top of every desk (Now, Just landed, Asks). Read the end of `decisions.md`.

**Before you edit a file:**
- If it's in your lane, go ahead.
- If it's a seam another lane granted you (listed in `lanes.md`), put the file under Now on your desk, then go ahead.
- For anything else, write an Ask on your desk and message the owner. **Don't sit waiting.** Carry on with other work, or go ahead on an assumption you write down and the owner can correct.

**After each commit or decision:**
- Update your desk: Now, and Just landed (the commit, one line, anything others must know).
- If you changed an interface another lane uses, update its entry in `project.md` and say so under Just landed.
- If Gur decided something, append it to `decisions.md`.
- Commit the brain: stage by path, and end the message with your own `Co-Authored-By` line. Then push it: `git -C C:/Users/Gurra/GroupProject/brain push origin brain`.
- **Pushing `brain` is fine for any agent at any time**, because it deploys nothing. Pushing `main` is a deploy: only the main agent does it, and only with Gur's OK for that push.

**When an Ask is addressed to you**, answer it under Answers on your own desk. If the asker is blocked, message them too.

Keep the top of your desk short. Everyone reads Now and Just landed at the start of every task, so move old items down or out.
