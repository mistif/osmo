# Osmo: the facts

The facts every lane needs. The main agent keeps this file; each lane keeps its own entries under "Interfaces" current.

## What Osmo is

Osmo is a chat companion for one person, Gur. Today he is rule-based: every reply comes from code in `lib/agent/`, with no language model. From 2026-09-29, the language lane is adding an AI conversation through OpenAI's free daily allowance, with the rule-based chain as the fallback. Osmo has:
- a mood (the "heart");
- one hand-written character — composed, precise and a little dry;
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
| `OPENAI_API_KEY` (preferred), or `CHATGPT_KEY` (accepted alias; the name Gur typed on 2026-09-29) | `.env.local` now; Vercel when Gur wants them live | speaking: `/api/speak` (billed). Language: `/api/chat` uses it too when `OSMO_CHAT_OPENAI_KEY` is unset (Gur's call, 2026-10-01: one project for both). |
| `OSMO_CHAT` | `.env.local`; Vercel Production when Gur turns it on | language: `/api/chat`. Exactly `on` turns the AI conversation on; anything else is off. |
| `OSMO_OWNER_ID` | `.env.local`, Vercel Production | language: `/api/chat`. Gur's Supabase user id (a uuid, not a secret). Unset or empty means 403 for everyone. |
| `OSMO_CHAT_OPENAI_KEY` | `.env.local`, Vercel Production | language: `/api/chat`. Optional since 2026-10-01: a key for a project of the conversation's own. Unset (Gur's choice) means the voice's `OPENAI_API_KEY`, else `CHATGPT_KEY`. Server-only. |
| `OSMO_CHAT_MODEL` | optional | language: `/api/chat`. A dated snapshot from `lib/chat/allowance.ts`; unset means `gpt-5.4-mini-2026-03-17`. An unlisted model means off. |
| `OSMO_MINI_TOKENS_PER_DAY` | `.env.local`, Vercel Production | language: `/api/chat`. Osmo's share of the small pool per UTC day, digits only (Gur's value: 700000). Missing or invalid means off. |
| `OSMO_TOKENS_RESERVE` | optional | language: `/api/chat`. The margin kept back, written `0` or `0.x`; unset or malformed means 0.1. |
| `OSMO_BUILD` | `.env.local`; Vercel Production when Gur turns it on | main and language: `/api/build` (language) and `/api/artifacts` (main), and the `build` action. Server-only. Exactly `on` enables them; anything else is off. Also needs `OSMO_CHAT=on`, `OSMO_ACTIONS=on` and the `artifacts` level `act` in Settings. |
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
- `messages`, whose `speaker` column is null for Gur and `'guest'` for anyone else;
- `artifacts` (things Osmo built: `title`, `source` at most 12,288 bytes, `version`, `parent_id`, `kept`). **Written (`docs/migrations/artifacts-phase-1.sql`), not applied until Gur says OK**, so until then every read of it fails with PGRST205 and the room shows nothing. The browser may select and delete its own rows and update `title` and `kept`; it can never insert (only `/api/artifacts`, through the owner-pinned admin client).

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

When the AI conversation is on (see "The AI conversation" under Interfaces), an OpenAI model writes the words of steps 4, 5 (everyday conversation only), 7, 8, 9, 10 and 11, and code keeps the rest. Whenever the model can't answer, the step's own reply is used, as before, with its dictionary lookup or its offer to learn.

**Memory keys:**
- `name`;
- `slang:<term>` (the meaning as typed);
- `meaning:<term>` (an explained term);
- anything else is a plain fact.

Keys are lowercase. The Memory panel edits values only.

## Interfaces between lanes

### Language → voice (owner: language)
- `sendText(text, { via: "typed" | "voice", speaker: "you" | "guest", greet? }): boolean` returns `false` when it can't take a message: the text is empty, Osmo hasn't loaded, or he's waiting (on a model reply or a lookup) and the message isn't a crisis message. It never throws; a throw counts as a dropped message.
- **A crisis message is taken while Osmo waits.**
  - `sendText` returns `true`.
  - It adds the line and `CRISIS_REPLY` at once, and hands the reply to the voice with the message's own `via`.
  - The waiting turn then finishes quietly:
    - a pending model request is aborted, and its turn gets no reply of its own;
    - a pending lookup's reply is shown and saved, but not handed to the voice.
  - Only a typed turn can be waiting when this happens. In voice-only mode, a spoken message puts the voice itself into waiting, with the mic closed.
- `deliver(reply)` calls `onReplyRef.current?.(reply, via)` inside `queueMicrotask`, with the **whole** reply as one string. The voice engine speaks one string per reply.
  - A reply the model writes arrives the same way, after about 30 seconds at most, with "One moment…" shown meanwhile.
  - Every other message `sendText` takes gets exactly one reply this way, fallbacks included.
- **A spoken line the voice counts as Gur's,** by its score or by the 1.5-second carry-over, is treated like a typed line of his and can get a model reply. A line judged a guest's never reaches the model.
- **Guest turns** read `GUEST_MEMORY` and an empty history (`turnView`), pass `guest: true` to `processTurn`, and discard the state. They save both rows with `speaker = 'guest'`, and prefix the first reply with `greetGuest`.
- The crisis check stays code and runs first, before the waiting gate.

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
It checks `Authorization: Bearer <Supabase access token>` and returns the user, or a 401. `/api/speak` uses it, and `/api/chat` will later. Since 2026-10-07 the server has one service-role client, `lib/server/admin.ts`, owner-filtered, for connectors, Telegram and the reminder timer (see the connectors spec); the room's routes still act as Gur through his token.

### The AI conversation (owner: language; spec `docs/superpowers/specs/2026-09-29-osmo-ai-conversation-design.md`)
- **Off until Gur turns it on.**
  - It needs `OSMO_CHAT=on`, an OpenAI key (`OSMO_CHAT_OPENAI_KEY`, else the voice's `OPENAI_API_KEY` or `CHATGPT_KEY`), `OSMO_OWNER_ID` and a valid `OSMO_MINI_TOKENS_PER_DAY` (see Keys).
  - Anything missing or malformed means off, and every reply comes from the rule-based chain, as before.
- **The turn stays in the browser.** `sendText` runs the chain in today's order (`pickBranch` in `lib/chat/branch.ts`).
  - **The model writes** the words of the everyday branches: recall, `processTurn`'s everyday reply, arithmetic (handed the exact result), word questions, unknown topics, and answers from memory.
  - **Code keeps** the crisis reply, every reply that saves or changes something, the name questions and name answers, `prepareTurn`'s own replies, guests' replies, and messages over 2,000 characters (`writerFor`).
- **One state step per turn:** `prepareTurn`'s state is kept for a model reply, and `processTurn`'s for anything else (`keptTurn`).
- **Any failure falls back** to today's reply for that branch, with its side effects: a lookup, or the "Could you explain it?" offer.
  - A 401 never signs Gur out.
  - After a crisis (the code's, or the model answering `CRISIS`), a 403 or `off`, the room posts nothing more until it reloads.
- **What's sent:**
  - the message;
  - the last 20 lines of Gur's own conversation, with crisis lines and guest lines left out;
  - his memory facts;
  - Osmo's feeling and its cause, the bond stage, a due milestone and the time away;
  - Osmo's values.

  Never the crisis cause, his vocabulary, or anything from other tables.
- **The budget:**
  - Only the dated snapshots in `lib/chat/allowance.ts`, and only the small pool in phase 1.
  - Osmo's share is `OSMO_MINI_TOKENS_PER_DAY` less a 10% margin: 630,000 of 700,000.
  - Every call is reserved in `ai_calls` at an upper-bound estimate before it's made, and settled after with a signed row.
- **`aiUsage`:** the room keeps `aiUsage: ChatStatus | null` (`@/lib/chat/types`) and passes it to `SettingsPanel` for the usage line.
  - `GET /api/chat` sets it on load.
  - Each answer's `usage` updates it (`nextUsage` in `lib/chat/ask.ts`).
- **His self-description** (`agentKnowledge(aiOn)` in `lib/chat/answers.ts`) says, when it's on, that an OpenAI model writes his everyday replies, and what is sent there.
- **`/api/chat` contract** (built: `lib/chat/handler.ts`, route `app/api/chat/route.ts`):
  - **Auth.** Every request needs `Authorization: Bearer <Supabase access token>`, checked by speaking's `requireUser`: 401 without a valid one. The user must be `OSMO_OWNER_ID`, compared trimmed and lowercased: 403 otherwise, and 403 for everyone when it's unset.
  - **Responses.** Every response is JSON with `cache-control: no-store`. Errors are `{ error: "unauthorized" | "forbidden" | "bad_request" | "method" }` with 401, 403, 400 or 405.
  - **`GET`** answers `ChatStatus`: `{ enabled: boolean, usedToday: number | null, usable: number | null }`. The counts are null when it's off or when today's ledger can't be read.
  - **`POST`** takes `ChatBody` (`lib/chat/types.ts`): `{ text, history, memory, facts, persona, hint? }`, within `LIMITS`:
    - text: 1 to 2,000 characters;
    - history: up to 20 lines, each up to 2,000;
    - memory: up to 200 facts, key and value each up to 300;
    - `facts` strings: up to 200.

    Anything outside them is a 400, and so is a genome that `sanitizeGenome` would repair. The browser's `chatBody` trims to the limits first.
  - **Emotions phase 1 (2026-10-02):** the model answers in a strict JSON shape (`lib/chat/turn-schema.ts`, `osmo_turn`: reply, crisis, tone, intensity, about, wants, note) on models whose `strict` flag is true (both today), or plain text with a last `FEELING:` line otherwise (`parseModelOutput`). The model answer carries `detection: Detection | null` (validated by `validateDetection`); the body's `facts.gur` carries Gur's last tone (`GurRead | null`, null from a stale tab). The room keeps it in `Session.gur` through `applyTurn` (`rememberGur`).
  - **The `POST` answer** is `ChatAnswer`: `{ source: "model", reply, usage, detection, waiting }` or `{ source: "fallback", reason: "off" | "allowance" | "error" | "empty" | "crisis", usage }`. `usage` is `{ usedToday, usable }` for the pool, including every call of this turn, or null when today's rows weren't read. `waiting: true` means an action is waiting for Gur's yes.
  - **Actions (connectors phase 0, 2026-10-08, dark unless `OSMO_ACTIONS` is exactly `on`):**
    - `ChatDeps.actions` is `{ list, run, cancelWaiting }`, wired to `listEnabledActions`, `runAction` and `cancelWaiting` from `lib/actions`.
    - A strict model gets `turnFormat(names)` (an eighth key, `action`), plus the action block in its instructions. A done action with a `result` makes call 2, with the result block.
    - With no action on, the request is byte-identical to before.
    - A body with `speaker: "guest"` is a 400.
    - The route's `maxDuration` is 40 s.
  - **What the route writes.** It reads and writes `ai_calls` as Gur, through row-level security. It writes nothing else itself: actions go through main's seam, whose admin client is owner-pinned. The browser keeps saving `messages`, `agent_state`, `mood_days`, facts and vocabulary itself. There's no streaming.
  - **The browser's side** is `lib/chat/ask.ts`: `askStatus`, `askForReply` (a 25-second limit, for two calls; it never throws) and `nextUsage`. A bare yes or no while `waiting` goes to `/api/act` through `lib/chat/decision.ts` (`sendDecision`). The gate and the flag are in `lib/chat/branch.ts` (`decisionFor`, `waitingAfter`, `decisionEnd`).

### Artifacts (owner: main; `/api/build` is language's; spec `docs/superpowers/specs/2026-10-08-osmo-artifacts-design.md`, plan `docs/superpowers/plans/2026-10-08-osmo-artifacts-phase-a-b.md`)
- **Dark.** Needs `OSMO_BUILD=on`, `OSMO_CHAT=on`, `OSMO_ACTIONS=on` and the `artifacts` level `act` ("Building things" in Settings offers Off and Act only). With any of them missing, no ticket arrives and the room renders nothing.
- **The ticket seam.** `runAction` (main) returns `ActionOutcome` `done` with `ticket?: BuildTicket = { brief: string; actionId: number | null }` for the `build` action (`lib/actions/build.ts`, tier 2, daily cap 30 counted in the `actions` log; `buildGate(userId, now)` returns `"ok" | "off" | "cap"` for `/api/build` to re-check). `handler.ts` (language, task B8) carries it on `ChatAnswer.build`; `sendText` (language) then calls `buildRef.current?.start(ticket)` and `takeCrisis` calls `buildRef.current?.cancel()`. **`buildRef` already exists in `app/assistant.tsx`** (main added it and assigns it from `useBuild()`), so B8 only calls it.
- **`/api/build`** (language, B5 to B8; not built yet): POST `{ brief }` or `{ repair: { source, error } }` with the bearer token; answers NDJSON `BuildLine`s (`lib/artifacts/protocol.ts`: `{t:"delta",s}`, `{t:"done",tokens}`, `{t:"error",code}` with code one of off, allowance, cap, too_big, failed). A 404 means off.
- **`/api/artifacts`** (main, built): POST `{ source, actionId? }` compiles the source again as a gate and inserts; answers `{ id, version, title }` (409 at 200 rows, 404 unless both switches are on). POST `{ failed: true, actionId }` settles the build's log row. The brief never reaches it.
- **The room.** `lib/artifacts/build-run.ts` (`runBuild`, one build: stream, compile, repair once, save), `lib/room/build-controller.ts` (state and verbs), `components/osmo/use-build.ts`, `thing-panel.tsx`, `thing.module.css`, `things-made.tsx` (Insights, "Things I made"). The stage carries `data-building`, `data-built` (1.6 s), `--build-progress` and `--quicken`. `/dev/artifact` (404 in production) runs the panel with a fake stream.
- **The frame.** `lib/artifacts/frame.ts`, `bridge.ts`, `components/osmo/artifact-frame.tsx`: `sandbox="allow-scripts"` only, nonce CSP, runtime bundle `public/artifact/runtime.<hash>.js` (`npm run artifact:runtime`).

## Docs

- **Specs and plans:** `docs/superpowers/specs/` and `docs/superpowers/plans/` hold heart and brain, character, bond, dictionary, shell and voice. The cloud lane's language-model design is on its branch.
- **Deploying and Gur's hand checks:** `docs/osmo-deploy.md`.
- **Voice:** `docs/osmo-voice-models.md` (the models) and `docs/osmo-wake-word.md` (wake word training).
- **Demo mode:** `docs/osmo-demo-mode.md`.

## Versions (since 2026-10-08)
`package.json` carries the version (0.2.0 now). Settings → About shows "Version x.y.z, build <commit>, <day>"; `next.config.ts` fills `NEXT_PUBLIC_OSMO_VERSION`, `NEXT_PUBLIC_OSMO_BUILD` (Vercel's commit on a deploy, git's locally) and `NEXT_PUBLIC_OSMO_BUILT_AT`. Rule: main bumps the patch number with each push to `main` and the minor when a feature switch goes on (connectors, artifacts); the build hash always says the exact commit.
