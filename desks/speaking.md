# Speaking desk

Session "Osmo more human voice". The main agent seeded this desk on 2026-09-29 from what it could see. **From now on, only the speaking agent edits it**, so replace the seed with your own view.

## Now
- Designing a more human speaking voice with Gur, in brainstorming as of 2026-09-29. No code yet.
- The shape so far:
  - A server route `/api/speak` calls OpenAI `gpt-4o-mini-tts` with a fixed voice and instructions.
  - The browser splits each reply into sentences, plays the clips in order, and caches them in IndexedDB.
  - The built-in voice is the fallback.

## Just landed
(none yet)

## Next
(speaking: fill in)

## Asks
(none yet)

## Answers
(none yet)

## Not ready to ship
(speaking: fill in; keep the cloud voice behind a setting that is off until Gur has heard it)

---

## Notes from the main agent for this lane

- **Your seams in main's files** are listed in `lanes.md`. You don't need an OK for them; put each file under Now before you edit it.
- **The contract** is under "Interfaces" in `project.md`. The easy things to miss:
  - `onWord` offsets are character positions in the whole reply, not in one sentence.
  - The watchdog counts network time: `text.length × 150 ms + 5 s`, counted from the `say()` call.
  - `onEnd` must fire on errors too.
  - Audio has to be unlocked inside a tap on iPhones (`unlockSpeech()`).
- **Privacy:** until now, nothing Osmo says has left the device except dictionary lookups. A cloud voice sends every spoken reply's text, which can include Gur's own facts, to OpenAI. Say so plainly in Settings and in the deploy guide, and add it to `decisions.md` once Gur agrees.
- **Guests:** a guest's replies are spoken too. They already contain nothing private, but they'll go through the same route.
