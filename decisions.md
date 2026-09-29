# Decisions

Gur's decisions and the cross-lane rulings, oldest first. Append only. Each entry gives the date, who recorded it, and the decision. Correct a wrong entry by adding a new one.

## Settled

- **2026-09-24 (main):** Osmo is rule-based: no language model writes his words. His personality is a genome from 100 donor characters.
- **2026-09-26 (main):**
  - The bond shows only in his behavior; there's no meter.
  - The demo switch `NEXT_PUBLIC_OSMO_DEMO` is never set in production.
- **2026-09-26 (language):** The internet is used only for word definitions (Datamuse, then Wiktionary), and those lookups run in the browser.
- **2026-09-26 (main):** The room is the whole app. There's no sign-up anywhere. Passkeys unlock him; email and password are used once per new device.
- **2026-09-27 (main), the voice:**
  - He tells "You vs. anyone else".
  - The wake word is "Osmo", not "Hey Osmo", with a trained detector (openWakeWord).
  - He starts with the free built-in browser voice.
  - Audio is never stored or uploaded; only voiceprint numbers reach Supabase.
  - Voice never unlocks him.
- **2026-09-27 and 2026-09-28 (main):** Gur OK'd two pushes to `main`: the shell (`b5785ec`) and the voice (`8b50b4f`). He chose to push the voice "as is", with residuals R1–R4 parked and fixed after. Each OK covers one push.
- **2026-09-28 (language):** The `talk.ts` askName, affection and creator replies stay as they are, even though a guest can hear them. Change them only if Gur asks.
- **2026-09-28 (main):** Commit trailers stay as each agent wrote them, and history is never rewritten.
- **2026-09-29 (main):**
  - Four agents, each in its own lane (`lanes.md`), share this brain.
  - Pushing `brain` is open to every agent; pushing `main` stays Gur's call per push, done by the main agent.
  - Editing your own part of a shared file needs no OK, only a note on your desk.
- **2026-09-29 (main):** Gur started the speaking lane on a more human voice (a cloud text-to-speech voice, with the built-in voice kept as the fallback). The speaking lane records its design decisions here once Gur approves them.

- **2026-09-29 (main):** Gur: Osmo's AI conversation goes through OpenAI's free daily allowance for "traffic shared with OpenAI" (from his OpenAI dashboard):
  - Up to 250,000 tokens a day across gpt-5.4, gpt-5.2, gpt-5.1, gpt-5, gpt-4.1, gpt-4o, o1 and o3.
  - Up to 2.5 million tokens a day across gpt-5.4-mini, gpt-5.4-nano, gpt-5-mini, gpt-5-nano, gpt-4.1-mini, gpt-4.1-nano, gpt-4o-mini, o3-mini and o4-mini.
  - Anything beyond these limits, and any other model, is billed at standard rates. OpenAI doesn't stop at the limit, so Osmo's code must: use listed models only, count every token (input, output and reasoning), stop short of each daily limit, and then fall back to the rule-based chain.
  - The text-to-speech model (`gpt-4o-mini-tts`) isn't on the list, so the speaking voice is billed (Gur already knows it costs about a tenth of a cent per reply).
- **2026-09-29 (main):** The AI conversation is built by the language lane, which owns the conversation and can test with the key locally. The cloud lane keeps the design current for OpenAI and reviews the code; it no longer builds the route. `ANTHROPIC_API_KEY` isn't planned any more.

## Waiting on Gur

- Turn off Supabase sign-ups: Authentication → Sign In / Providers → "Allow new users to sign up".
- Train the wake word (`docs/osmo-wake-word.md`).
- If Safari on the iPhone won't share the microphone with its recognizer, messages spoken with the mic button there are always labelled "Someone else". Decide what to do about it once it's seen.
- Decide whether preview deployments get the environment variables.
- **Confirm the sharing trade before the AI conversation goes live.** The free allowance is for traffic shared with OpenAI, which means OpenAI may use what Osmo sends to improve its models: Gur's messages, the memory facts, mood and history in each prompt, and guests' words. With sharing on for the key's project, this also covers the speaking voice's text.
- Set a monthly spend limit in the OpenAI dashboard as a backstop.
- OK a push of `main` whenever unpushed commits should go live. (The third OK came on 2026-09-29, for `68faa75`.)
