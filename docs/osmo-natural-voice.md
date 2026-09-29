# Osmo's natural voice

By default Osmo speaks with whatever voice the device has. On this Windows PC that is **Microsoft David**,
an old SAPI voice — there is no British voice installed at all, so the British tiers in
`lib/voice/voices.ts` never match. That is why he sounded robotic, and no amount of rate or pitch
tuning changes it: the engine itself is the limit.

The natural voice sends the words he says to OpenAI and plays the audio that comes back.

## Turning it on

Settings → Voice → **Natural voice**. It is **off** until you turn it on, on every device.

**With it on, the text of every reply he speaks is sent to OpenAI.** What you say to him is not, and
neither is your microphone audio or your voiceprint: listening and knowing your voice stay on the
device exactly as before.

If anything goes wrong — no key, no network, an OpenAI error, or audio that doesn't start in time —
he falls back to the built-in voice without saying anything about it. The worst case is how he
sounded before.

## The key

`/api/speak` reads a server-only key. It is never sent to the browser.

Put it in `my-app/.env.local`, on its own line, no quotes and no spaces:

    OPENAI_API_KEY=sk-...

`.env.local` is gitignored, so the key never reaches the repository. `.env.example` lists the names
with empty values and *is* committed — never put a real key there.

`CHATGPT_KEY` is accepted as an alias, because that is the name the key was first typed under. Either
works; `OPENAI_API_KEY` is the name in `project.md`.

To make it work on https://osmo-xyz.vercel.app, the same variable has to be added in Vercel
(Production). Until it is, the live site quietly uses the built-in voice.

**Set a monthly spend limit in the OpenAI dashboard.** The route requires a signed-in user and caps
each request at 400 characters, but a spend limit is the only real backstop, and it is worth more
than a rate limiter that can't be made reliable on serverless.

## What it costs

`gpt-4o-mini-tts` is about **$0.015 per minute** of audio ($0.60 per 1M input text tokens, $12 per 1M
audio output tokens). A typical reply is a few seconds, so roughly a tenth of a cent each.

Clips are cached per sentence in IndexedDB (up to 300 clips or 20 MB per device, longest-unused
dropped first). Because his replies come from a finite set of sentences, common lines like
"How are you?" are paid for once and then played from the cache, so the real cost falls over time.

## How he sounds

All in `lib/voice/tts.ts`:

- **Model** `gpt-4o-mini-tts` — the one that takes an `instructions` prompt.
- **Voice** `ash`. The British accent comes from the instructions, not the voice.
- **Speed** 1.15. The default sounded sluggish.
- **Instructions**, two tones:
  - **composed** — what you hear essentially always. It asks for "light variation in pitch and
    emphasis - not flat, not slow". An earlier version asked for "measured" and "slightly slower",
    and *that* is what sounded robotic. Don't reintroduce those words.
  - **grave** — only when his mood is clearly negative *and* strongly felt (`valence <= -0.45` and
    `strength >= 0.6`). Lower, slower, quieter, still composed. He is JARVIS: he stays himself
    unless something is genuinely bad.

**Bump `INSTRUCTIONS_VERSION` whenever you change an instruction, the voice or the speed.** It is part
of the cache key, so without a bump the old audio keeps playing.

To audition other voices, change `TTS_VOICE` (`ash`, `onyx`, `ballad`, `cedar`, `verse`, and others)
and bump the version.

## How it is built

Sentence at a time, so he starts talking sooner and gets a real breath between sentences:

| File | Job |
|---|---|
| `lib/voice/sentences.ts` | cuts a reply into sentences, each keeping its offsets in the whole reply |
| `lib/voice/tts.ts` | the voice, the two tones, the cache key, the word-timing sums |
| `lib/voice/cloud-say.ts` | the sequence: fetch, play, breathe, next; cancel and fallback. No browser in it |
| `lib/voice/web/say-cloud.ts` | the browser's part: the fetch, the audio element, and choosing which voice speaks |
| `lib/voice/web/tts-cache.ts` | the IndexedDB clip store |
| `lib/server/auth.ts` | checks the Supabase bearer token; `/api/chat` will reuse it |
| `lib/server/speak.ts` | the route's logic, so `vitest` (which only collects `lib/**`) can test it |
| `app/api/speak/route.ts` | a thin POST wrapper |

`engine.ts` and `machine.ts` are untouched. `VoiceDeps.say` was already the seam.

The model, voice and instructions are chosen **on the server**. The browser sends only the text and
one of two tone names, so nobody who reaches the route can put their own prompt in Osmo's mouth.

Word timing comes from the clip's own `currentTime` each frame, mapped back to offsets in the whole
reply — so the circle and the reveal work as they do with a built-in voice that reports boundaries,
rather than falling back to the stretched typing rhythm.

## Not yet verified

**Latency has not been measured from a browser.** Measured through an agent's shell the API took 38 s
to first byte at about 1 KB/s, which is that sandbox's network, not OpenAI — but it means the
"first sound in about 300 ms" figure is an expectation, not a measurement. Check it on the real
machine. If it is slow, `FIRST_SOUND_GUARD_MS` (1.2 s, in `lib/voice/cloud-say.ts`) will fire often
and he will simply keep using the built-in voice.

Also unverified by hand: playback on the iPhone (`unlockCloudAudio` primes a muted element on the
same taps that unlock speech), and how the breath between sentences actually sounds.
