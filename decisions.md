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

- **2026-09-29 (main):** Gur's investing agents share the same daily allowance and are capped at about 2 million (mini pool) and 200,000 (large pool) tokens a day. **So Osmo gets what's left:**
  - about 500,000 tokens a day from the mini-model pool;
  - about 50,000 tokens a day from the large-model pool.

  Both caps are server settings Gur can change without a code change. Osmo counts and shows its own daily use, so Gur can rebalance the two systems once he sees real numbers. Osmo can't see the investing agents' usage, so it keeps strictly to its share. Text to speech isn't in either pool.

- **2026-09-29 (language), the AI conversation, Gur's design choices so far** (the spec is being written):
  - **Scope:** the first build is the conversation only. Memory tools, searching past chats, web search and summaries come later.
  - **Model:** one small model for every reply, `gpt-5.4-mini`, which is a server setting.
  - **Architecture:** the browser keeps running Osmo (mood, bond, memory saving, database writes). A new server route only writes the words. Any failure falls back to the rule-based reply.
  - **Who writes which replies:** code keeps the crisis reply and every reply that saves or changes something (name, facts, taught words, re-roll, verdicts). The model writes the rest.
  - **Guests never reach the model.** They keep today's rule-based replies.
  - **What each request sends:** his memory facts about Gur, the last 20 messages (crisis messages and guest lines left out), and his mood, bond and personality.
  - **Osmo's share is raised to 700,000 (small pool) and 70,000 (large pool) tokens a day**, with a 10% safety margin, so he stops at 630,000 and 63,000. This replaces the 500,000/50,000 share above.
  - **To keep both systems inside the free pools** (2.5M / 250k), Gur sets `OPENAI_RESERVE_FRACTION=0.28` in the Investing project. Investing then stops at 1.8M / 180k, and the two together at 2.43M / 243k.
- **2026-09-30 (language):** Gur's fourth push OK, given to language directly: "push to git and merge everything and push to vercel".
  - Language merged the cloud's `09b2a41` (PR #1) locally as `b26f156`.
  - It pushed `main` from `68faa75` to `b26f156`. That covers the natural voice (`3902078`, off by default), the agent design, the README and the AI conversation spec. Main's uncommitted `prepareTurn` work wasn't included.
  - Before the push, a clean checkout of `b26f156` passed 679 tests, lint (no errors) and `next build`.
  - Vercel deployed it to production (`dpl_HJzJLPLU5qhia5VTWL94zCiuBhvs`, READY). osmo-xyz.vercel.app answers 200, and the new `/api/speak` answers 401 without a sign-in.
- **2026-09-30 (language), checked:** Supabase sign-ups are now off (`disable_signup: true`), and anonymous sign-ins are off. The "Turn off Supabase sign-ups" item below is done.

- **2026-09-30 (main), Gur's calls on the room and the voice:**
  - Osmo's shape is a heart with rings (an organic heart in his mood colours, three dashed rings), after JARVIS in *Age of Ultron*. The breathing circle is gone.
  - The room is **voice only by default**: him, subtitles of what he says, what he heard, and the mic. The conversation as text is a per-device setting, off by default. His last words stay on screen; fading them is a per-device setting.
  - His natural voice is **fable** at speed 1.15, chosen from samples. The first-sound guard is 4 s, because the model takes about 2.1 s per sentence.

- **2026-09-30 (main), Gur approved the AI conversation:** asked by main to "approve the language agent's spec and confirm the OpenAI data-sharing trade", Gur answered "yes sounds good". So:
  - The phase 1 spec (`docs/superpowers/specs/2026-09-29-osmo-ai-conversation-design.md`) is approved; language may build it.
  - The sharing trade is accepted: OpenAI may use what Osmo sends (Gur's messages, the memory facts, mood and history in prompts, guests' words, and the spoken text).
  - Context: he had just said Osmo is "so bad at conversation" and "just gets stuck" after testing voice mode.
- **2026-09-30 (language), Gur confirmed it to language directly,** and changed one choice in the spec. **Short spoken follow-ups reach the model.** A spoken line the voice counts as his, whether by its score or by the 1.5-second carry-over, can get a model reply. He picked this over keeping carry-over lines rule-based, because the room is voice-first now. He accepts that a guest's short remark inside his conversation could get a model reply. So `SendOptions.recognized` isn't needed. The spec is updated in `66393bf`.

- **2026-09-30 (language), Gur wiped Osmo's memory of him and gave him who Gur is.** Asked directly (AskUserQuestion), Gur chose "wipe facts, chat and words, plus his heart and bond" and "who you are" from a profile he pasted. Done in one transaction on his user only:
  - Deleted: all 252 messages, every memory fact except `name`, the 5 learned words and 3 cached lookups (the old test data), event_log, dilemma_log, emotion_associations and mood_days.
  - `agent_state`: the row and his **genome are kept** (seed 42, same donors), so his personality is unchanged. Mood, coupling, weights, outlook and bond are what the room gives a new Osmo (`adoptGenome(defaultState(), genome, {resetWeights:false})`); the bond is empty.
  - Voiceprints are kept.
  - 15 new facts, in this order after `name`: full name, school, major, transfer goal, home, location, job, business, projects, programming languages, internship goal, likes, workouts, favorite game, reply style. Left out on purpose: other people, accounts, security events, subscriptions, schedules, application statuses and deadlines. These facts go to OpenAI once the AI conversation is on.
  - Main was told before the reset.

- **2026-10-01 (language), the AI conversation uses the natural voice's OpenAI key.** Gur, asked whether Osmo already had an OpenAI key: "use the openai_api_key for the ai conversation thats fine". This changes the spec's choice 1 (a separate project and key):
  - `/api/chat` now reads `OSMO_CHAT_OPENAI_KEY` when it's set, and otherwise `OPENAI_API_KEY`, then `CHATGPT_KEY`, in `/api/speak`'s order (`chatKey`, `0bb1ccf`). The voice's key alone never switches the conversation on.
  - The trade he accepted: the free tokens apply only if the voice's project has data sharing on (which also shares the spoken text, accepted on 2026-09-30). If sharing is off there, the conversation is billed at list price, up to that project's spend limit; the daily cap counts tokens, not dollars.
  - So the go-live checklist needs no new project or key: only checking data sharing and the spend limit on the voice's project.

- **2026-10-01 (language), the fifth push: `main` to `0bb1ccf`, at Gur's direct request** ("push everything so it up on vercel"). It covered 29 commits from `7290102`:
  - main's `prepareTurn` (`c46d61a`, `8102c49`), the memory load order (`baa0c4e`), the trained wake word (`31f78df`) and the guest greeting (`1094157`);
  - language's AI conversation (spec, plan, the build, the review fixes, and the shared key, `0bb1ccf`).
  - Before pushing: 995 tests and `npm run voice:check` passed, and `npm run build` passed in a clean worktree of `0bb1ccf`.
  - Vercel production `dpl_HwJuJxURbyuUtKbvdiN8JYTmAjHL` is READY on osmo-xyz.vercel.app. `/` and `/lock` answer 200, `/api/chat` and `/api/speak` answer 401 without a sign-in, and `/models/wake/osmo.onnx` is served.
  - The AI conversation is live but **switched off**: Vercel has no `OSMO_CHAT`, `OSMO_OWNER_ID` or cap, so every reply is still the rule-based chain.

## Waiting on Gur

- Turn off Supabase sign-ups: Authentication → Sign In / Providers → "Allow new users to sign up".
- Train the wake word (`docs/osmo-wake-word.md`).
- If Safari on the iPhone won't share the microphone with its recognizer, messages spoken with the mic button there are always labelled "Someone else". Decide what to do about it once it's seen.
- Decide whether preview deployments get the environment variables.
- ~~**Confirm the sharing trade before the AI conversation goes live.**~~ Confirmed 2026-09-30 (see Settled). The free allowance is for traffic shared with OpenAI, which means OpenAI may use what Osmo sends to improve its models: Gur's messages, the memory facts, mood and history in each prompt, and guests' words. With sharing on for the key's project, this also covers the speaking voice's text.
- Set a monthly spend limit in the OpenAI dashboard as a backstop. (Language, 2026-09-29: use a project hard spend limit, not a zero credit balance. OpenAI's help center says the free daily tokens need a positive credit balance.)
- Before Osmo's AI conversation goes live, set `OPENAI_RESERVE_FRACTION=0.28` in the Investing project's `.env`, so the two systems together stay inside the free pools.
- Consider giving Osmo its own OpenAI project and key, separate from the investing agents. The dashboard then shows Osmo's daily usage on its own, and each project gets its own budget. Check first that data sharing, and so the free allowance, is on for the new project.
- OK a push of `main` whenever unpushed commits should go live. (The third OK came on 2026-09-29, for `68faa75`.)
- **2026-09-29 (speaking), the natural voice:**
  - Osmo's second voice is **OpenAI `gpt-4o-mini-tts`**, called from `POST /api/speak`. Gur chose it over a free browser voice, a Windows natural voice and a local neural model, and he provided the key.
  - This **reverses the 2026-09-27 non-goal "a paid natural voice"** on purpose. The built-in voice stays as the fallback on every failure path.
  - **The words Osmo speaks are sent to OpenAI.** Gur's own messages, his microphone audio and his voiceprints are not: listening and speaker recognition stay on the device.
  - It ships behind `naturalVoice`, a per-device setting that is **off** until Gur turns it on.
  - His delivery is **two tones**: composed essentially always, and grave only when his mood is clearly negative and strongly felt (`valence <= -0.45` and `strength >= 0.6`). Gur's steer: he is JARVIS, so he stays relative and only goes out of line if something is really bad.
  - Continuous mood modulation and a "bright" tone were rejected: imperceptible, and they wreck the clip cache.
  - Cost control is **a monthly spend limit in the OpenAI dashboard**, not a rate limiter, which can't be made reliable on serverless. The route requires a signed-in user and caps each request at 400 characters.
- **2026-09-30 (speaking), Gur's "commit and merge everything, and make Vercel up to date":**
  - Cloud's **PR #3 was merged locally and `main` pushed to `cdb592f`** by the speaking lane, at Gur's explicit per-push OK. Docs only. PR #3 now reads MERGED on GitHub, and no cloud branch commit is left off `main`.
  - **Main's uncommitted `prepareTurn` work was deliberately not committed.** `lib/agent/mind-prepare.test.ts` is red (`keeps the guest gates`), it is main's lane, and language has an open Ask for two fields to be added before it lands. Gur agreed to leave it. A push is a deploy, so a known-red test must not go with one.
  - **Vercel has no `OPENAI_API_KEY` (nor `CHATGPT_KEY`).** Production therefore uses the built-in voice, which is the natural voice's designed fallback, not a fault. Only Gur types keys; he adds it when he wants the natural voice live.

## 2026-10-02: the fallback becomes a second model, the chain shrinks
Gur, going through the bloat rundown: the rule-based fallback "is really really bad" and should be hard to tell from the model. Decided: a cheaper model tier as the first fallback, the chain trimmed to decided turns (crisis, verdicts, re-roll, bond, memory, arithmetic), the spelling corrector and word list dropped, the teach-me-a-word loop dropped, and with no model at all he still talks with what code can do. Language owns the spec and the build.

## 2026-10-02: one Osmo, written like JARVIS; emotions go direction B
Gur, after reading `docs/superpowers/specs/2026-10-02-osmo-emotions-research.md`: the 100-donor personality roll goes. Osmo becomes one hand-written character, written from scratch in a JARVIS register (composed, precise, dry humour used rarely, no slang), name unchanged; nothing of the rolled genome is kept. The "roll a new osmo" / "yes, roll" flow and the Insights donors view go with it, so the pinned chatlog replies change (main and language agree, per lanes.md). Emotions: direction B (nuanced): the model reads Gur's tone as JSON beside its reply, code turns it into Osmo's feeling through a complementary table, a slow mood fades by clock time, feeling notes are kept across days (visible, deletable), one gentle follow-up at most, his own mood may show in the room and in his words with restraint, and an absence brings a plain welcome back, never guilt. Specs are being written; Gur reads them before any plan.

## 2026-10-02: plans approved, donor slang dropped, probe approved
Gur approved both specs and their plans (`docs/superpowers/plans/2026-10-02-osmo-one-character.md`, `2026-10-02-osmo-emotions.md`). The donors' invented slang (558 words) goes with the donors; real slang stays in `lexicon/slang.ts`. Gur OKs the probe: two real OpenAI calls (one per allowlisted model) to check strict JSON schema output, run by language with `scripts/chat-probe.mjs`. Execution: subagent-driven, cheapest model per task, main's tasks by the main agent's subagents, language's by the language session.

## 2026-10-02 (language): the strict-JSON probe, with Gur's yes in chat
Gur: "yes run probe". Two real calls (`node scripts/chat-probe.mjs`), strict JSON schema `osmo_turn`, input "my mom's in hospital again". Both answered with valid JSON carrying all seven keys, status completed, the served model as asked:
- `gpt-5.4-mini-2026-03-17`: 182 in, 69 out, 0 reasoning, 3338 ms; options echoed (`effort: none`, `verbosity: low`, format present).
- `gpt-4.1-mini-2025-04-14`: 184 in, 77 out, 0 reasoning, 1753 ms; format present.
Both get `strict: true` (`d3afca7`). Output stays under the plan's 120-token limit. The plan's "2 s slower than the plain probe" check has no baseline (the 2026-10-01 probe wasn't timed); 3.3 s is inside the route's 10 s limit and was reported to Gur.

## 2026-10-02: the repo is public
Gur made mistif/osmo public for job applications after main scanned every branch's history (no keys, env values, database refs or emails; his surname replaced in two test fixtures). From now on nothing private goes in the code, the docs or this brain: keys and personal data stay in `.env.local`, Vercel and Supabase.

## 2026-10-07: connectors and surfaces, "like Muse to some extent"
Gur wants Osmo across his iPhone and Windows: (a) Osmo reaches out through connectors: reminders and notes with push, weather and location, Google Calendar and Gmail (read, summarise, draft), Spotify; (b) Gur reaches Osmo from a Telegram bot (text and voice notes) and later a Windows always-on tray app (separate spec). Permission: act on small things, ask before sending mail or anything costing money or irreversible; every action logged and shown in Insights. Mechanism: an `action` field in the existing JSON turn with a code allowlist and tiers, one follow-up call when he needs the result; not model tool calls (allowance, unverified). Spec being written: `docs/superpowers/specs/2026-10-07-osmo-connectors-design.md`; Gur reviews before any plan.

## 2026-10-07: connectors spec approved, and the server gets its own key
Gur approved `docs/superpowers/specs/2026-10-07-osmo-connectors-design.md` with its defaults: (1) the server gets `SUPABASE_SERVICE_ROLE_KEY`, used in `lib/server/admin.ts` only, every query filtered by `OSMO_OWNER_ID`, a test greps that no other file imports it; this replaces the earlier "no service-role key anywhere" (the room's own routes stay on Gur's token); (2) the Google app goes to "In production"; (3) a spoken yes counts for small actions, sending mail needs a typed yes or Telegram; (4) Telegram starts with a reduced server chain; (5) reminders arrive as push and in Telegram once linked. Build order: phase 0 foundation and installed app, 1 reminders/notes/weather/push, 2 Google, 3 Spotify, 4 Telegram. Each behind a switch that is off; Gur types every key.

## 2026-10-08: artifacts, things Osmo builds
Gur: Osmo creates "artifacts": code or working things (small tools, pages, calculations) that run in the room; the thing grows on its own beside him while the conversation continues; built as React components compiled in the browser (Gur's choice over single HTML files), run in a sealed iframe with the runtime served from the site, no network, no access to his data; a `build` action in the existing JSON turn, tier 2, logged without the brief, capped per day, built by a separate streaming model call inside the allowance. Spec being written: `docs/superpowers/specs/2026-10-08-osmo-artifacts-design.md`. Gur reviews before any plan. Also: migration `connectors_phase1_tables` applied 2026-10-07.

## 2026-10-08: artifacts spec approved
Gur approved `docs/superpowers/specs/2026-10-08-osmo-artifacts-design.md` with its defaults: react-only imports; the thing sits to the right of the conversation on wide screens and steps aside for panels; a thing cannot ask Osmo anything from inside; kept by default; 30 builds a day. Sucrase transpiles in the room; the frame is srcdoc with a one-use nonce; only the source is stored and compiled on every open. Phases A (frame, runtime, /dev page), B (build action, streaming route, save, Insights), C (animation polish, versions), each behind a switch that is off.

## 2026-10-08: three thoughts from Gur, under review, not decided
1. On first open the app should offer to connect Gmail and Calendar so Osmo gets to know him faster (as Meta's Muse does). 2. "Make Osmo public": let other people use Osmo, not only Gur; this conflicts with the single-owner design (OSMO_OWNER_ID gates, owner-pinned admin client, one allowance, prompts naming Gur). 3. The voice listening is bad (wake word not firing, speaker mix-ups, slow). A six-lens board review (architecture, security, product, AI, voice, ops) is being written to `my-app/docs/osmo-board-review-2026-10-08.md`; Gur decides after reading it.
- **2026-10-08 (speaking), the JARVIS pace:** Gur chose `fable` at `speed: 1` with reworded instructions, by ear, from four takes of the same line (`82a4177`, pushed at his request). The research point that drove it: the reference is "calm, measured British delivery" that **never rushes**, so the earlier `speed: 1.15` was the opposite of the goal — a wrong fix for flatness, which the instruction wording causes and now handles on its own. "measured" and "slower" stay banned as instructions (this model renders them as monotone) and the idea is carried by "unhurried and certain" instead. `onyx` rejected a second time: it is deeper but not British, and the accent matters more.
- **2026-10-08 (speaking), ElevenLabs considered and not taken:** Turbo v2.5 would cut the ~2 s wait before each new sentence to ~250 ms, at ~3.3× the per-minute cost plus a monthly subscription floor, a new key, and the tone system rewritten to `voice_settings` presets. Gur chose to tune OpenAI first. Not approved, not built. If anyone revisits it: Flash and Turbo ignore `[tag]` audio tags and would speak them aloud; only v3 supports them.

## 2026-10-08: guests reach the second model (fallback v2)
Gur, on the fallback v2 spec's open point: a guest's everyday conversation goes to tier 2 (`gpt-4.1-mini`), never tier 1, with nothing of Gur's (no memory, facts, history, name or his read of Gur; the server's guest builder has no parameter for them; a guest body carrying them gets a 400), no actions, a 30,000-token guest cap a day and never past `usable − TIER2_SHARE`. Guests' words go to OpenAI; the first greeting of a visit says so. Needs main's `ai_calls.speaker` migration (Gur's OK) before the guest path ships. Spec updated in `d9317ae` (§6, §9 to §12); the rest of the spec still awaits Gur's review.

## 2026-10-08: after the board review
Gur read `my-app/docs/osmo-board-review-2026-10-08.md` and said go on the small items: voice gate fixes (fail toward the owner, wake gate at the library default, buffer prefill, raw detector track, preload the speaker model, per-message score logging), Swedish crisis patterns, a CI workflow, an owner guard and daily cap on `/api/speak`, and the reminder timer once the cron secret is in Vault. Not decided: "public" (the board recommends a self-host template, not multi-user), onboarding (needs a server-side memory writer first). Bigger items for language: extract `runTurn`, build fallback v2, memory and evals. Main edits `safety.ts` and `lib/server/speak.ts` tonight under Gur's authorisation for these fixes.
