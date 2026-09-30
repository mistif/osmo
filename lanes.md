# Lanes

Gur set this up on 2026-09-29 so each agent works in its own area, with less crossover and less waiting. The main agent keeps this file; ask it for a change.

## The four agents

| Lane | Session | How to reach it | What it can reach |
|---|---|---|---|
| **Main** | "Fable 5.1 Main Osmo Agent" (`local_8fec8db9-0593-4b1c-9157-0430581b932f`) | SendMessage to its name | The local tree, the dev server and browser pane, the Supabase and Vercel tools, GitHub |
| **Language** | "Opus 5.5 Secondary Osmo Agent" (`local_f2c0bb11-27e1-43d1-a5f5-80c2d707b771`) | SendMessage to its name | The same as main |
| **Speaking** | "Osmo more human voice" (`local_dc3a4d19-694a-4689-be01-3dfe904c1ecc`) | On 2026-09-29 it refused cross-session messages. Leave an Ask on your desk, which it reads at the start of each task; if it's urgent, Gur relays. It can message the others. | The same local tree and dev server |
| **Cloud** | Claude Code on the web; branch `claude/compassionate-sagan-x1teq9`, draft PR #1 | Gur relays; it can't be messaged | **GitHub only** |

Session titles can change. The lane names don't.

## What each lane owns

### Main: the core, and releases
Osmo's inner life, his room, his listening, the database and shipping.
- **Heart, brain, personality, bond:**
  - in `lib/agent/`: `heart`, `state`, `cues`, `brain`, `dilemmas`, `events`, `mood-theme`, `mood-days`, `speech`, `load`, `agent-state`, with their tests;
  - `lib/agent/bond/*`, `lib/agent/personality/*`;
  - `mind.test.ts` and `mind-guest.test.ts`.
- **Listening:**
  - everything in `lib/voice/` and `lib/voice/web/` that isn't listed under Speaking (engine, machine, mic, wake word, speaker recognition, recognizer, teaching, settings store, chime);
  - `components/osmo/use-voice.ts`, `voice-settings.tsx`, `voice-teaching.tsx`;
  - `public/models/*`, `public/voice/*`, `scripts/voice-*`, `scripts/copy-ort.mjs`, `vitest.voice.config.mts`.
- **The room and the shell:**
  - `app/` (layout, page, lock, `globals.css`, `assistant.module.css`, and the room's part of `assistant.tsx`);
  - `components/osmo/*`, `components/ui/*`;
  - `lib/shell/*`, `lib/supabase.ts`, `lib/uuid.ts`, `lib/utils.ts`.
- **Project config:** `next.config.ts` (the security headers), the scripts in `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `CLAUDE.md`, `README.md`, `.claude/launch.json`.
- **Docs:**
  - `osmo-deploy.md` (each lane may add and edit its own section);
  - `osmo-voice-models.md`, `osmo-wake-word.md`, `osmo-demo-mode.md`;
  - the specs and plans for heart and brain, Frankenstein, bond, shell and voice.
- **Also:**
  - every Supabase migration (other lanes post the SQL as an Ask);
  - every push to `main`;
  - this brain's `lanes.md` and `project.md`;
  - settling it when two lanes want the same thing.

### Language: understanding and answering (the conversation)
How Osmo reads a message and what he says back, whether code or an AI model writes the words.
- **Code:** `lib/agent/talk.ts`, `context.ts`, `safety.ts`, `dictionary.ts`, `dictionary-store.ts`, `vocabulary-store.ts`, `lib/agent/lexicon/*`, `lib/facts.ts`, `scripts/build-word-list.mjs`.
- **Tests:** `talk`, `context`, `safety`, `dictionary`, `chatlog`, `voice`, `typos`, `facts`.
- **The AI conversation** (since 2026-09-29): Osmo's replies written by an OpenAI model inside the free daily allowance (see `decisions.md`).
  - It owns the server route, the prompt builder, the tools, the daily token cap, and the fallback to the rule-based chain.
  - Planned new files (2026-09-30, from its approved spec): `app/api/chat/**`, `lib/chat/**`, `scripts/chat-probe.mjs`.
  - It reuses speaking's `lib/server/auth.ts`, and asks main for the token-ledger table.
- **Docs:** the dictionary spec and plan, and the AI conversation's spec and plan.

### Speaking: how Osmo sounds
The voice he speaks with, from the browser's built-in voice to a more human cloud voice.
- **Existing files:** `lib/voice/web/say.ts`, `lib/voice/voices.ts` and its test.
- **New files it plans:** `lib/voice/sentences.ts`, `lib/voice/tts.ts`, `lib/voice/web/say-cloud.ts`, `lib/voice/web/tts-cache.ts`, `app/api/speak/**`, with their tests. It also plans `lib/server/auth.ts`, which checks a Supabase bearer token on the server; the cloud lane will reuse it.
- **Docs:** its own docs, spec and plan.
- **Key:** `OPENAI_API_KEY`, server-only. Gur adds it.

### Cloud: the design, and reviews
The design for a language model writing Osmo's words while his state stays code: `docs/superpowers/specs/2026-09-28-osmo-agent-design.md`, on its branch.
- **Owns:** that spec. Since 2026-09-29 the building belongs to language, because language owns the conversation and can test with the key locally, which the cloud agent can't.
- **Its job now:**
  - Bring the spec up to date for OpenAI and the free daily allowance, instead of Claude.
  - Review the AI conversation's code on GitHub after each push, posting findings on its desk.
- **Delivers** on its branch or in PRs. The main agent merges them locally. Never use the GitHub merge button: local `main` usually has unpushed commits, and a merge on GitHub deploys.
- **Doesn't edit other lanes' files.** Changes it needs from them go on its desk as Asks.
- **Its review findings belong to their owners:** 1, 2, 4, 8 and 10 to language; 3, 6, 7 and 9 to main; 5 to main and language together.

## Shared files: who owns which part

Editing your own part of a shared file needs no OK. Put the file under Now on your desk before you edit it, and under Just landed after; the other owner reads it there.

- **`app/assistant.tsx`:**
  - Language owns `sendText`/`sendMessage`, `sendTextRef`, `onReplyRef`, `deliver`, the `turnView` use and the chain's helpers.
  - Main owns the room's markup, the panels, the speaking animation (`paceRef`, `spokenIndexRef`), `useVoice`, `data-listening`, the listening line, the mic button and the "Someone else" label.
- **`lib/agent/mind.ts`:** language owns step 6, "everyday conversation". Main owns the rest, including every `guest` gate.
- **Speaking's seams in main's files** (speaking may edit these parts):
  - `lib/voice/web/deps.ts`: the `say:` entry and its import.
  - `components/osmo/use-voice.ts`: the lines that choose and unlock the voice (`chooseVoice`, `unlockSpeech`, `voiceName`), and passing speaking settings through.
  - `components/osmo/voice-settings.tsx`: the line naming his voice, and any new speaking controls, kept together in one block.
  - `lib/voice/settings.ts` and `lib/voice/web/settings-store.ts`: new speaking fields, with defaults and tests. Existing fields stay as they are.
  - The contract speaking must keep is in `lib/voice/engine.ts`, which main owns. It's under "Interfaces" in `project.md`.
- **`package.json` and `package-lock.json`:** anyone may add a dependency, but one install at a time. Put "installing X" under Now first, and commit both files with the change that needs it.

## Shared resources

- **The `main` branch:**
  - Everyone commits their own files, staged by path. Never `git add -A` or `git add .`.
  - Keep every commit green: `npx vitest run`, `npx tsc --noEmit -p .` and `npm run lint`. If a check fails because of another lane's uncommitted work, tell that lane; don't fix it.
  - Keep unfinished features behind a setting that is off, because a push ships everything on `main`.
- **Pushing `main`:** only the main agent, and only after Gur's OK for that push. Before it pushes, it checks every desk for "not ready to ship".
- **Pushing `brain`:** any agent, at any time.
- **The OpenAI keys:** speaking's `/api/speak` uses `OPENAI_API_KEY` (or its alias `CHATGPT_KEY`); language's `/api/chat` has its own key, `OSMO_CHAT_OPENAI_KEY`. Every model call stays inside the free daily allowance in `decisions.md`, except text to speech, which isn't covered and is billed. The chat route counts its tokens against the allowance and stops short of it.
- **Supabase:** only the main agent applies migrations. A migration that new code needs goes live before that code is pushed.
- **Keys:**
  - Only Gur types keys, into `.env.local` and into Vercel.
  - Agents name the variable and list it in `project.md`. A server-only key never starts with `NEXT_PUBLIC_`.
  - Never read out or repeat a key's value.
- **The dev server:** one only, on port 3000, from `.claude/launch.json`. Don't start a second one, and note a restart under Now.
- **The browser pane:** Gur's signed-in session is read-only for agents. Never sign in or out, send Osmo a message, click Lock, Remove, Forget, Remember, the mic or teaching, or edit his memory.
- **Replies that `chatlog.test.ts` pins** ("yes, roll", /^Done\./, /roll a new osmo/i): main and language agree before either changes one.
- **Osmo's voice:** professional and speakable, like JARVIS. No slang, emoji, brackets or symbols a voice would read out, and he never mirrors Gur's grammar.
