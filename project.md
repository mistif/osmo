# Osmo: the facts

The facts every lane needs. The main agent keeps this file; each lane keeps its own entries under "Interfaces" current.

## What Osmo is

Osmo is a chat companion for one person, Gur. Today he is rule-based: every reply comes from code in `lib/agent/`, with no language model. From 2026-09-29, the language lane is adding an AI conversation through OpenAI's free daily allowance, with the rule-based chain as the fallback. Osmo has:
- a mood (the "heart");
- a personality stitched together from 100 donor characters (the "Frankenstein" genome);
- a bond with Gur that grows over time;
- a memory of facts Gur tells him;
- a dictionary;
- a voice: he speaks, listens, will wake to "Osmo" once the wake word is trained, and tells Gur's voice from a guest's.

## Stack and places

- **Code:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing Next code, because it differs from older versions), React 19 with the React Compiler lint rules, TypeScript, Vitest, ESLint, Supabase (auth with passkeys, Postgres, row-level security), and `onnxruntime-web` 1.30.0 for the voice models.
- **The repo:** the app is in `my-app/`, which is the repo root of the private GitHub repo `mistif/osmo`. Local path: `C:\Users\Gurra\GroupProject\my-app`.
- **Pages:** the room (the chat) is at `/`, and the passkey lock screen is at `/lock`.
- **Live:** https://osmo-xyz.vercel.app. Vercel redeploys every push to `main`, **so a push is a deploy.**
- **Supabase:** project `jtkeljvldtngkrftzwdm`, shared by local and production.

## Commands (run in `my-app/`)

| What | Command |
|---|---|
| Tests (612 on 2026-09-28) | `npx vitest run` |
| Types | `npx tsc --noEmit -p .` (a fresh clone may need `npx next typegen` first) |
| Lint (one old warning about `router` in the load effect is expected) | `npm run lint` |
| Build (copies the ONNX runtime into `public/ort` first) | `npm run build` |
| Dev server | the `my-app` entry in `.claude/launch.json`, port 3000 |
| Voice model check (needs clips from `scripts/voice-clips.ps1`; Windows only) | `npm run voice:check` |

## Keys (names only; never write a value here)

| Variable | Where | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, Vercel Production | everything |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, Vercel Production | everything (public by design; row-level security protects the data) |
| `OPENAI_API_KEY` (preferred), or `CHATGPT_KEY` (accepted alias; the name Gur typed on 2026-09-29) | `.env.local` now; Vercel when Gur wants them live | speaking: `/api/speak` (billed). Language: `/api/chat` (planned; free allowance only). Both read `OPENAI_API_KEY` first. |
| `NEXT_PUBLIC_OSMO_DEMO` | local only, never in production | the bond demo switch |

Vercel's variables target Production only, so preview deployments of other branches fail at build. Adding the Preview target is Gur's call.

## Current state (2026-09-29)

- **Live** is `68faa75` (pushed 2026-09-29: the voice plus the docs that point to this brain). To see anything unpushed, run `git fetch && git log --oneline origin/main..main`.
- **Tests:** 612 pass, `tsc` is clean, and lint has 0 errors (plus the one old warning).
- **Supabase auth:**
  - passkeys are on (relying party `osmo-xyz.vercel.app`);
  - anonymous sign-ins are off;
  - **new sign-ups were still on at the last check.** Gur turns them off in Authentication → Sign In / Providers. To check: a public GET of `<SUPABASE_URL>/auth/v1/settings` with the publishable key must return `disable_signup: true`.
- **The wake word:** `public/models/wake/osmo.onnx` isn't trained yet (`docs/osmo-wake-word.md`). Until then the listening switch is disabled, and the mic button is the only voice path.

## Supabase tables

All tables use per-user row-level security, `(select auth.uid()) = user_id`:
- `agent_state`, `dilemma_log`, `emotion_associations`, `event_log`, `memory_facts`, `mood_days`, `user_words`, `voiceprints`, `word_lookups`;
- `messages`, whose `speaker` column is null for Gur and `'guest'` for anyone else.

Only the main agent applies migrations.

## How a message flows

The language chain is `sendText` in `app/assistant.tsx`, owned by language. It runs these steps in order:
1. Crisis check.
2. A pending explanation Gur owes Osmo ("Could you explain it?").
3. Name correction, name answer, and finding the name in the chat.
4. "What did I say?"
5. The brain's `processTurn` reply (the heart, bond, personality commands and everyday conversation).
6. Taught slang ("bet means okay"), then plain facts ("my dog is Nala").
7. Arithmetic.
8. Dictionary lookup.
9. An unknown topic ("what is X?", when he asks to be taught).
10. Answers from memory and built-in knowledge.
11. Fallback.

**Memory keys:**
- `name`;
- `slang:<term>` (the meaning as typed);
- `meaning:<term>` (an explained term);
- anything else is a plain fact.

Keys are lowercase. The Memory panel edits values only.

## Interfaces between lanes

### Language → voice (owner: language)
- `sendText(text, { via: "typed" | "voice", speaker: "you" | "guest", greet? }): boolean` returns `false` when it can't take a message: the text is empty, Osmo hasn't loaded, or a lookup is running. It never throws; a throw counts as a dropped message.
- `deliver(reply)` calls `onReplyRef.current?.(reply, via)` inside `queueMicrotask`, with the **whole** reply as one string. The voice engine speaks one string per reply.
- **Guest turns** read `GUEST_MEMORY` and an empty history (`turnView`), pass `guest: true` to `processTurn`, and discard the state. They save both rows with `speaker = 'guest'`, and prefix the first reply with `greetGuest`.
- The crisis check stays code and runs first.

### The voice engine → speaking (owner: main; speaking implements it)
`VoiceDeps.say(text, { onWord(start, end), onEnd() }): { cancel() }`, in `lib/voice/engine.ts`:
- `say` is called once per reply, with the whole reply.
- `onWord(start, end)` gives the character offsets in `text` of each word as it's spoken. The room reveals the text and moves the circle with them. If no `onWord` arrives within `WORD_TIMING_WAIT_MS` (800 ms), the room shows the reply without timing.
- `onEnd()` fires once when the speech finishes, errors included: an error must end the speech, never hang it. After `cancel()`, the audio stops at once, and a late `onEnd` is ignored.
- **The watchdog:** `text.length × 150 ms + 5 s`, counted from the `say()` call, with network time included. Speech still going after that is cancelled.
- The engine closes the mic while he speaks.
- On iPhones, audio must be unlocked inside a tap: `use-voice.ts` calls `unlockSpeech()` on the mic button, Send and the settings switches.
- `voiceName` (the name of the voice he speaks with) is shown in Settings.

### Server auth (owner: speaking; planned `lib/server/auth.ts`)
It checks `Authorization: Bearer <Supabase access token>` and returns the user, or a 401. `/api/speak` uses it, and `/api/chat` will later. There's no service-role key anywhere.

### The AI conversation → voice and the rest (owner: language; design by cloud)
- Listed free-allowance models only. A daily token count stays under the limits, and the rule-based chain answers once the day's allowance is used up or on any model error.
- Whole replies per `deliver` (or a "final text" event).
- `sendText` still returns false while a turn is in flight.
- The guest rules move into the prompt: a guest prompt gets no memory, no bond, no name and no `cause`.
- The crisis check stays code, and the `speaker` rows stay.
- His self-description, "internet only for word definitions", lives in `agentKnowledge` (language) and must change when the model lands.

## Docs

- **Specs and plans:** `docs/superpowers/specs/` and `docs/superpowers/plans/` hold heart and brain, Frankenstein personality, bond, dictionary, shell and voice. The cloud lane's language-model design is on its branch.
- **Deploying and Gur's hand checks:** `docs/osmo-deploy.md`.
- **Voice:** `docs/osmo-voice-models.md` (the models) and `docs/osmo-wake-word.md` (wake word training).
- **Demo mode:** `docs/osmo-demo-mode.md`.
