# Speaking desk

Session "Osmo more human voice". Only the speaking agent edits this file. Updated 2026-09-29.

## Now

Nothing in progress. The natural voice is built and committed; it is **off by default**, so it is safe
in a push. Waiting on Gur to turn it on and tell me how it sounds.

Not holding any shared file open. No uncommitted work of mine in `my-app`.

## Just landed

- **`82a4177` (2026-10-08, pushed at Gur's request, deploying): Osmo stops rushing.**
  `TTS_SPEED` 1.15 → **1**, and both tone instructions reworded. Gur picked it by ear from four takes
  of the same line ([the A/B page](https://claude.ai/artifact/HxUpUN2TumCMVfSLkUajGv)): current,
  fable@1.0, fable@1.05, onyx@1.0. He chose fable@1.0 with the new wording, so `fable` stands and
  `onyx` lost a second time.
  - **Why**: I researched the reference. It is described as "calm, **measured** British delivery" that
    "never rushes" — and `speed: 1.15` plus "not slow" was us doing the opposite. The 1.15 was a wrong
    fix for a real problem: the flatness Gur heard on 2026-09-29 came from the *instruction*, not the
    speed, so hurrying him bought liveliness twice and threw away the pace. Pace and flatness are
    separate dials.
  - The composed string is **byte-identical** to the clip Gur approved (checked, not assumed).
  - "warm and quick-witted" → "quietly warm and dryly witted": over-emoting is specifically what
    breaks the reference.
  - `INSTRUCTIONS_VERSION` → 2, so **every cached sentence regenerates once**. First hearing of each
    line costs the usual ~2 s; after that it is instant again.
  - Two new tests: both tones must keep a "never flat" cue and the composed one its
    "variation in pitch and emphasis"; and `TTS_SPEED` must stay ≤ 1.05, so nobody cranks it back up
    without reading why.
  - 1686 tests pass, `tsc` clean, lint clean. Only `lib/voice/tts.ts` and its test were staged; main's
    untracked `docs/osmo-rundown-2026-10-02.md` was left alone.

- **`cdb592f`: merged cloud's PR #3 into `main` and pushed, at Gur's direct request (2026-09-30).**
  Documentation only (cloud's `614e4bb`, two lines in the agent design spec), merged locally rather than with
  GitHub's merge button, per `lanes.md`. GitHub now shows PR #3 as MERGED against `cdb592f`, and
  `origin/main..origin/claude/compassionate-sagan-x1teq9` is empty, so nothing of cloud's is left unmerged.
  - Checked before pushing: the push is a two-line docs diff on top of `b26f156`, which was already built READY, so
    it is green by construction. `tsc` clean.
  - **→ main: I left your uncommitted work completely alone**, and Gur agreed that was right. `lib/agent/mind.ts`,
    `lib/agent/personality/flavor.ts` (both modified) and `lib/agent/mind-prepare.test.ts` (untracked) are all
    still in the tree, unstaged and unpushed. **One thing you'll want to know: that test is red.** I ran it:
    `prepareTurn: replies code decides > keeps the guest gates` fails, 1 failed and 10 passed in that file (689 of
    690 across the suite). It is the `sameAsProcessTurn` assertion at `mind-prepare.test.ts:34` — `prepareTurn`
    returns a guest at baseline (`turns: 0`, trust `0.5`) where `processTurn` returns it stepped (`turns: 1`, trust
    `0.50206`), so one of the two is wrong about whether a guest's turn moves the heart and the bond. That is your
    call, not mine, and cloud reached the same reading independently. It is untracked, so it was never at risk of
    going out in my push.

- **`3902078` is pushed and live** (2026-09-30). Language pushed `main` to `b26f156` at Gur's request and carried it
  along. Verified from the outside, not from a desk: Vercel production `dpl_HJzJLPLU5qhia5VTWL94zCiuBhvs` built
  `b26f156` and is READY, and `POST https://osmo-xyz.vercel.app/api/speak` with no token returns
  `401 {"error":"unauthorized"}` — so the route is deployed and guarded in production.
  - **Gur added `OPENAI_API_KEY` to Vercel (Production, sensitive) on 2026-09-30, and production now has it.**
    He added it about five minutes *after* the then-current deployment was built, so that build could not see it —
    Vercel injects variables at deploy time. Redeployed the same commit `cdb592f` at his OK:
    `dpl_3jNCzTyhUwBmoLcxJ75QQnw51ifC`, READY in ~37 s, `osmo-xyz.vercel.app` reassigned with `aliasError: null`.
    Production smoke check after it: `/` 200, `/lock` 200, `/api/speak` 401 with no token and 401 with a bogus one.
    - **The target is Production only**, so branch previews still have no key. The preview-env gap other lanes hit
      is unchanged and remains Gur's call.
    - **Nobody can verify the key actually works without Gur.** `/api/speak` checks auth before the key, so an
      unauthenticated call returns 401 either way, and a valid token would mean using his session. The proof is
      him turning the switch on and hearing it. If the key were wrong or out of credit, the route would 502 and he
      would simply hear the built-in voice — no error surfaces to him by design.

- **`3902078` on `main`: Osmo's natural voice, behind a setting that is off.**
  OpenAI `gpt-4o-mini-tts` via a new `POST /api/speak`, one clip per sentence with a breath between
  them, IndexedDB clip cache, and the built-in voice as the fallback on every failure path.
  690 tests pass, `tsc` clean, lint unchanged (still just the old `router` warning).

  **What other lanes need to know:**
  - **`lib/server/auth.ts` now exists**, as `project.md` said it would: `bearerToken(request)` and
    `requireUser(request, lookup?)`, returning the user or null. No service-role key. The cloud lane
    can use it for `/api/chat` as-is; the `lookup` argument is injectable so routes test without Supabase.
  - **`VoiceSettings` has a third field, `naturalVoice`**, defaulting to `false`. `parseVoiceSettings`
    keeps it off for settings saved before it existed. `settings-store.ts` needed no change.
  - **`lib/voice/web/deps.ts`'s `say:` is now `speakReply`**, which picks the cloud voice or the
    device's. `engine.ts` and `machine.ts` are untouched, and the `VoiceDeps.say` contract in
    `project.md` is unchanged and still honoured, including `onWord` offsets into the whole reply.
  - **`.gitignore` has one added line, `!.env.example`.** `.env*` was ignored, so the committed
    example file needed the negation. `.gitignore` is in nobody's lane — main, revert it if you'd
    rather not have it and I'll rename the file instead.
  - **Docs:** `docs/osmo-natural-voice.md` (mine): where the key goes, what it costs, how he sounds,
    and what is still unverified.

## Next

Nothing until Gur has heard it. Then, in order:
1. Whatever he says about the voice, the pace and the breath between sentences — all of it is
   constants in `lib/voice/tts.ts` plus `GAP_AFTER` in `lib/voice/sentences.ts`.
2. Measure real first-sound latency from the browser and record it in `docs/osmo-natural-voice.md`.
3. If he keeps it: the mood wiring in the first Ask below, so the grave tone actually engages.

## Asks

- **→ main: one line to make his mood reach his voice.** `setSpeechTone` is exported from
  `lib/voice/web/say-cloud.ts` and `speechTone(valence, strength)` from `lib/voice/tts.ts`, both
  tested — but nothing calls them yet, so **every reply is currently spoken "composed"**. The tone
  needs `moodTheme`'s `valence` and `strength`, which only reach `assistant.tsx`, and both the
  `useVoice` call there and `use-voice.ts`'s own signature are yours. Either add it yourself, roughly
  `setSpeechTone(speechTone(theme.valence, theme.strength))` before a reply is delivered, or grant me
  those two lines and I'll do it. **Not blocking:** composed is the baseline and grave is rare, so
  composed-only is a perfectly good first listen.
- **→ main: the 2026-09-27 voice spec now contradicts the code.** Its Non-goals say "**A paid natural
  voice.** He uses the device's built-in voices" and "Choosing a different voice in Settings", and
  "His voice" says on-device voices come first "so the text of his replies isn't sent to a speech
  service". Gur reversed the first deliberately on 2026-09-29. That spec is yours, so I haven't
  touched it — please add a superseding note pointing at `docs/osmo-natural-voice.md`, or grant me the
  edit. Without it a later session reads "no paid voice" and undoes this. Two smaller drifts to fold
  in: the new switch changes the voice *source*, not the voice identity, which is adjacent to that
  second non-goal; and "If no English voice exists, he stays silent" is no longer true, because
  `canSpeak` now also accepts the cloud voice.
- **→ main: `project.md` → Keys.** Gur has already typed the key, but as **`CHATGPT_KEY`**, not
  `OPENAI_API_KEY`. `/api/speak` reads `OPENAI_API_KEY` first and falls back to `CHATGPT_KEY`, so
  nothing is broken either way. Please record both names. Gur may prefer to rename it in `.env.local`;
  his call, and `.env.example` shows the preferred name.

## Answers

(none asked of me yet)

## Not ready to ship

**Safe to push.** `naturalVoice` defaults to off on every device, so `3902078` changes nothing audible
until Gur turns it on. Nothing of mine blocks a push of `main`.

Two things Gur must know before he turns it on, and they belong in whatever you tell him:
- With it on, **the text of every reply he speaks goes to OpenAI.** His own messages, his microphone
  audio and his voiceprints do not — listening and speaker ID stay on the device.
- It bills his key, about a tenth of a cent a reply before caching. He should set a monthly spend
  limit in the OpenAI dashboard; that is the real backstop, not anything in the code.

For the live site, the key also has to be added in Vercel. Until then production quietly uses the
built-in voice, which is the same as today.

---

## Area notes

### What was actually wrong

Gur's machine has no British voice installed at all — only `Microsoft David`, `Mark` and `Zira`, all
`en-US`. So `pickVoice`'s two British tiers never matched and Osmo fell to tier 3, `Microsoft David`,
an old SAPI voice. That, not the settings, is why he sounded robotic. `voices.ts` and its tiers are
unchanged and still pick the fallback voice.

### The instructions matter more than the voice

My first attempt asked for "measured… understated… slightly slower than conversational pace". Gur
heard it and said it was still robotic and asked for faster. He was right: flat and slow *is* what
reads as robotic, and I had asked for both. The wording now asks for "light variation in pitch and
emphasis - not flat, not slow" with `speed: 1.15`. A test in `tts.test.ts` fails if "measured" or
"slower" comes back into the composed instruction.

`speed` is confirmed to work alongside `instructions` on this model.

**`INSTRUCTIONS_VERSION` is part of the cache key. Bump it with any change to the instructions, the
voice or the speed**, or cached audio outlives the change. (The voice, speed and model are in the key
in their own right; the instruction text is not, which is why the bump matters.)

**Second chapter, 2026-10-08: the speed was an over-correction.** Fixing the flatness by *also* raising
`speed` to 1.15 was wrong, and researching the reference is what showed it — JARVIS "never rushes", and
his authority comes partly from not hurrying. The variation line is what buys the life; pace is a
separate dial, and we were paying for liveliness twice. Pace is back to 1, and the same "measured" idea
is now carried by "unhurried and certain" and "each word gets its weight", which this model does not
flatten the way it flattens the literal words. A test keeps the speed from creeping back up.

**What is still unlike the reference:** `fable` is the expressive voice, where JARVIS is described as
calm and *deep*. `onyx` is the deep one but not British, so it would lean entirely on the instruction
for accent. Gur has now rejected onyx twice by ear. If depth ever matters more than the accent, that is
the trade to revisit.

**Latency, measured a third time (2026-10-08, Node on Gur's PC):** first byte 1.3–2.4 s, full clip
2.0–2.8 s. Consistent with main's earlier ~1.25 s / ~2.1 s, so the pause before a new sentence is
OpenAI's generation time and no wording or setting touches it. Researched the alternative: **ElevenLabs
Turbo v2.5 is ~250 ms** at ~3.3× the per-minute cost plus a monthly subscription floor, and would need
a new key and the tone system rewritten from an instruction string to `stability`/`similarity_boost`/
`style` presets. **Trap for whoever tries it: Flash and Turbo do not support `[tag]` audio tags — only
v3 does — so a tag would be read out loud.** Gur chose to tune OpenAI first; the switch stays unbuilt
and unapproved.

### Delivery: two tones, Gur's call

JARVIS stays himself, and only goes out of line "if it's really really bad":
- **composed** — the baseline, essentially always.
- **grave** — only `valence <= -0.45` **and** `strength >= 0.6`: clearly negative *and* strongly felt.
  Lower, slower, quieter, never emotive.

Rejected deliberately: continuous per-reply modulation (imperceptible, and it destroys the cache hit
rate) and a "bright" tone. Because grave is rare, nearly all cached audio is one tone.

### Latency is measured and NOT yet trustworthy

Through my shell: **38 s to first byte**, then ~1 KB/s. TLS alone took 1 s, so that is the sandbox's
network, not OpenAI. **"First sound in ~300 ms" is an expectation, not a measurement** — it must be
checked from the browser on Gur's machine.

Relevant to main's contract: `WORD_TIMING_WAIT_MS` is 800 ms, so on an uncached first sentence the
room may show the reply untimed and then pick word timing up when audio starts. `paceRef` recovers to
`"words"` on the first `onWord`, so it heals itself. The watchdog (`length × 150 ms + 5 s`, network
included) is the real ceiling, and `FIRST_SOUND_GUARD_MS` (1.2 s) fires well before it.

### What is verified, and what is not

Verified: the key works (HTTP 200 against `/v1/models`, and real audio generated); `/api/speak`
returns 401 unauthenticated, 401 on a bogus token, 405 on GET, all against the running dev server;
the page compiles and loads with no new console or server errors; 690 tests, `tsc`, lint.

**Not verified:** the actual sound in the app, because turning the switch on and sending Osmo a
message is Gur's session and agents don't touch it; real browser latency; the iPhone unlock; and how
the breath between sentences sounds in practice.
