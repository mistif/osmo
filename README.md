# Osmo

Osmo is a chat companion built for one person.

He has a mood that moves on its own, a personality stitched together from a hundred
donor characters, a bond that grows over the weeks you talk to him, a memory of what
you tell him, and a voice: he speaks his replies, listens through the microphone, and
tells your voice from a stranger's.

He is private by construction. A passkey guards the front door, row-level security
guards every table, and the speech models run in your browser — the audio never leaves
the device.

**Live:** https://osmo-xyz.vercel.app (passkey required) · **Deploying and hand checks:** [`docs/osmo-deploy.md`](docs/osmo-deploy.md)

## What works today

| | |
|---|---|
| The room, the chat, and the mood theme | working |
| Memory, Insights and Settings panels | working |
| Passkey lock, and remembering a device | working |
| He speaks his replies, word by word | working, with the device's built-in voices |
| The microphone button, and speech to text | working |
| He knows your voice from a guest's | working, once you've taught him |
| He wakes when you say "Osmo" | **the model isn't trained yet** — see [`docs/osmo-wake-word.md`](docs/osmo-wake-word.md). Until it is, the listening switch stays disabled and the mic button is the only voice path. |
| A language model writes his replies | **not built.** Every reply today comes from code in `lib/agent/`. The design is under way. |
| A more human cloud voice | **not built** |

## How he works

### His inner life — `lib/agent/`

Twelve emotions — joy, sadness, anger, fear, trust, disgust, surprise, love, hope,
guilt, loneliness, boredom — coupled to each other and stepping on their own. The
coupling acts on each emotion's deviation from a baseline, so a resting Osmo stays at
rest and what you say moves him from there. `heart.ts` holds all of it, and `stepHeart`
is under twenty lines.

His personality is assembled at birth from **100 donor characters** across six "organs" —
heart, brain, voice, humor, slang, quirks — drawn by a seeded PRNG so the same seed
always grows the same Osmo. `personality/assemble.ts`.

On top of that sit the bond (`bond/`), his memory of facts you tell him, a dictionary,
and a vocabulary he can be taught. `mind.ts` runs a turn: the crisis check first, then
the brain's reply, then the taught slang, the plain facts, arithmetic, the dictionary,
and a fallback.

**The crisis check runs before anything else**, so talk of self-harm is never met with a
joke or a "say that another way". Its spell-correction is deliberately more eager than
the everyday guesser's, because a missed crisis costs far more than a false alarm.
`safety.ts`.

### His voice — `lib/voice/`

All of it runs in the browser, on `onnxruntime-web`, against models this site serves
itself.

- **`fbank.ts`** — Kaldi-style log mel filterbank features: 25 ms frames every 10 ms,
  pre-emphasis, a Povey window, a 512-point FFT, 80 mel bins, per-recording mean
  subtraction. It matches what 3D-Speaker CAM++ was trained on, because the embeddings
  are worthless if the features drift.
- **`voiceprint.ts`** — telling your voice from a guest's, by cosine distance between
  CAM++ embeddings. The threshold comes from measurement, not taste: the same voice
  scored 0.91–0.93 and different voices at most 0.41, so the line sits at 0.5.
- **`wake.ts`, `wake-stream.ts`, `web/wake-detector.ts`** — the openWakeWord pipeline
  (melspectrogram → embedding → a keyword model trained on your own "Osmo"), behind a
  gate that debounces the score.
- **`machine.ts`** — a spoken conversation as a pure state machine: `off`, `paused`,
  `sleeping`, `awake`, `thinking`, `speaking`, `followup`. No I/O, no timers of its own,
  so all of it is testable.
- **`engine.ts`** — the machine wired to the real microphone, detector, recognizer and
  speech, with a watchdog on every utterance. He closes the mic while he speaks, so his
  own voice can never wake him.

### His room — `app/`, `components/`

The room is at `/` and the passkey lock at `/lock`. The chat, the speaking circle that
follows his words, and the Memory, Insights and Settings panels live here.
`app/assistant.tsx` holds the send chain.

When someone he doesn't recognize talks to him, he is polite and keeps everything of
yours to himself: no name, no memory, no bond. Their messages are stored with
`speaker = 'guest'`.

## Getting started

You need Node 20+, and a Supabase project. [`docs/osmo-deploy.md`](docs/osmo-deploy.md)
walks through Supabase from scratch — passkeys, sign-ups and the redirect URLs.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. You'll need a `.env.local` with the two Supabase
variables below before he can load anything — there's no committed example to copy,
because `.gitignore` keeps every `.env*` out of the repo.

`dev` and `build` both run `scripts/copy-ort.mjs` first, which copies the ONNX runtime
out of `node_modules` into `public/ort` so the site serves it itself, with nothing
third-party at runtime. `public/ort` is git-ignored.

### Environment

Names only — never commit a value. All of these go in `.env.local`.

| Variable | What it's for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | everything |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | everything. Public by design; row-level security is what protects the data. |
| `NEXT_PUBLIC_OSMO_DEMO` | local only. Every message counts as a new day, so the bond moves in one sitting — use a test account. [`docs/osmo-demo-mode.md`](docs/osmo-demo-mode.md) |

## Commands

| What | Command |
|---|---|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Tests (612 at last count) | `npm test` |
| Types | `npx tsc --noEmit -p .` — a fresh clone may need `npx next typegen` first |
| Lint | `npm run lint` |
| Voice model check | `npm run voice:check` — needs clips from `scripts/voice-clips.ps1`; Windows only |

`npm run voice:check` is the one that matters before touching the voice: it runs the
real models against real speech and asserts that the speaker model separates voices fast
enough, and that the wake pipeline fires on its phrase and nothing else. The ordinary
suite can't do that, because it has no audio.

## Layout

```
app/              the room (/), the lock (/lock), and the send chain
components/
  osmo/           panels, the lock screen, the voice hooks
  ui/             the primitives
lib/
  agent/          heart, brain, personality, bond, dictionary, memory, safety
    personality/  the 100 donors, and assembling a genome from a seed
  voice/          features, voiceprints, wake word, the conversation machine
    web/          the browser's side: mic, recognizer, speech, ONNX, storage
  shell/          passkeys, devices, the story
public/models/    the ONNX models he runs
docs/             how he was specified, and how to deploy and check him
scripts/          the ONNX copy, the word list, the voice check
```

## Tests

612 tests across 68 files, all in Vitest, next to the code they cover. They run in about
five seconds, so run them.

The rule on this project is that a bug gets a failing test before it gets a fix.

## Docs

- **Specs and plans** — [`docs/superpowers/`](docs/superpowers/). Each subsystem was
  specified, then planned, then built: the heart and brain, the Frankenstein
  personality, the bond, the dictionary, the shell, and the voice.
- **Deploying, and the hand checks** — [`docs/osmo-deploy.md`](docs/osmo-deploy.md). The
  manual pass at the end is not optional; some of what Osmo does can only be judged by
  ear.
- **The voice models** — [`docs/osmo-voice-models.md`](docs/osmo-voice-models.md), and
  training his wake word in [`docs/osmo-wake-word.md`](docs/osmo-wake-word.md).

## Working on Osmo

Several agents build Osmo at once, each in its own lane, sharing a brain on the `brain`
branch. **Read [`CLAUDE.md`](CLAUDE.md) before you start** — it points at the routine,
the lanes, and who owns which file.

[`AGENTS.md`](AGENTS.md) carries one more warning worth repeating: this is Next.js 16,
and it is not the Next.js in your training data. Read the guides in
`node_modules/next/dist/docs/` before writing Next code.

A push to `main` is a deploy.
