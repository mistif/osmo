# Osmo board review, 2026-10-08

Six senior engineers reviewed Osmo through six lenses: architecture and code quality, security and privacy, product and vision, AI design, voice and realtime, and operations and cost. This is the chair's merged report for Gur. Nothing here was run against production except read-only checks named in the text.

## 1. Verdict

The library layer is genuinely good: pure, dependency-injected cores (handler, branch, build-controller, build-run, the voice machine), a production-grade reserve-and-settle ledger, a service-role key confined to one file with a test that greps for leaks, and a privacy stance that the Settings copy actually honours. "Code decides, the model writes" is the right design for a companion and it is held consistently across mood, memory, crisis and money. What is fragile is everything a user meets first: the whole turn runs inside a 340-line closure in a React component with no automated test, the voice stacks three research-grade problems (wake word, speaker ID, recognition) on a browser tab and has never been measured on Gur's own voice, and every server failure quietly becomes the rule-based reply Gur already called bad on 2026-10-02. Around the code nothing is operated: no CI, no monitoring, logs that vanish in an hour, and a reminder timer that was never installed in production, so a feature marked done cannot fire. "Make Osmo public" as accounts on Gur's Supabase would bill his card within days (per-user ledger, ungated TTS, one free pool) and would dismantle the single-owner design that makes the privacy promise true; the board recommends a self-host template instead. Decide now: no multi-user; check the sk- literal and install the timer this week; extract the turn before Telegram; treat listening as beta until it meets a written bar.

## 2. The ten issues that matter most

### 1. "Public" with the current money plumbing bills Gur's card
Where: lib/chat/ledger.ts:42 and lib/chat/handler.ts:132 (dayUse sums only the caller's own ai_calls rows under RLS); lib/server/speak.ts:46 (requireUser, no owner check, no daily cap); lib/server/admin.ts:19-35 (every row stamped with OSMO_OWNER_ID); lib/chat/prompt.ts:16-60 (Gur named about thirty times).
Why it matters: the daily cap is per user by accident, so every new account gets its own 630k-token day from one shared free pool; /api/speak is billed from the first character and any signed-in account can call it; the admin client would write strangers' artifacts, reminders and push devices into Gur's rows; the free allowance exists because traffic is shared with OpenAI, which other people would have to consent to. Four lenses converged on this independently.
What to do: decide what "public" means (section 3a). Regardless of the answer: requireOwner on /api/speak, a hard monthly spend limit on the OpenAI project, a kill switch Gur can flip from his phone, and a unit test asserting every API route except cron calls requireOwner.
Effort: S for the guards; L for anything multi-tenant.

### 2. The turn lives in a browser closure, and every new surface forks it
Where: app/assistant.tsx:318-657 (sendText), lib/agent/agent-state.ts:1,10,64 (imports the browser Supabase client), connectors spec lines 37 and 237 ("a reduced server chain first").
Why it matters: branch choice, heart step, memory and history saves, the model call, fallbacks and crisis quieting all run in one closure writing ten tables from the browser. Telegram cannot reuse it, so the spec plans a second chain; the crisis rules, name flow and memory saves will diverge between the two. The same file is a state machine written as refs (thinking plus waitingRef, five escape-hatch refs), 29 of 207 commits touch it, and two lanes now serialise on it. Session state (pending dilemma) lives in useState and is lost on reload.
What to do: extract a pure runTurn(input, deps) in lib/chat/run-turn.ts now, returning reply, kept state, effects and saves, with injected clock, uuid, store and askModel. Make sendText a thin adapter. Split the room into useTurn (language), useRoomMotion (main) and a Room component so lanes map to files again. Build Telegram on runTurn from day one. One sessions row per user, not per surface.
Effort: L.

### 3. The reminder timer does not exist in production, and nothing would say so
Where: lib/actions/due.ts:60-113; plan 2026-10-07 connectors phase 0-1, Task 1.11 (unchecked).
Why it matters: a read-only check of the live project shows pg_cron and pg_net available but not installed and no cron.job table, so /api/cron/due has no caller and a reminder set today stays pending forever. When the timer does exist, handleDue returns 200 on every internal failure (admin unconfigured, claim error, any throw, actions switch off), so the scheduler would record success while nothing is delivered.
What to do: apply the timer migration with Gur's OK and verify with a two-minute reminder. Return 5xx on misconfiguration. Write one heartbeat row (last run, sent, failed) and show it in Settings as "Timer last ran N minutes ago", red past ten minutes.
Effort: S.

### 4. An unmarked sk- literal sits in a test file on the public main branch
Where: lib/chat/handler.test.ts and lib/chat/openai.test.ts (const KEY = "sk-..."); commits 92cae6e, e5ad5fe, 576359d on origin/main.
Why it matters: the repo went public on 2026-10-02 after a scan that found no keys, but git log -G for sk- strings matches three commits and two literals remain in the tree, one with no fake marker. The reviewer did not read its value. Tests inject fetch so it is almost certainly a fixture, but nobody outside can tell, and secret scanners will flag it. If it was ever real it has been public for six days.
What to do: Gur checks the second literal today; if real or ever real, rotate in OpenAI and Vercel (history rewriting is pointless). Rename both fixtures to an obviously fake shape. Add gitleaks or GitHub push protection as a pre-commit and CI step. Record in decisions.md that the 10-02 scan missed -G style literals.
Effort: S.

### 5. Listening fails toward "stranger" and the wake gate is stricter than its own library
Where: lib/voice/voiceprint.ts:9,66-69 (MATCH_THRESHOLD 0.5, binary verdict); lib/voice/engine.ts:381-398 (score -1 means guest; score log dev-only); lib/voice/wake.ts:5-7 (two frames at 0.7; openWakeWord default is one frame at 0.5); lib/voice/wake-stream.ts:65 (buffer emptied on reset, 1.28 s deaf); lib/voice/web/mic.ts:14 (noise suppression and AGC on the detector feed); lib/voice/web/speaker-id.ts:9-17 (29.6 MB lazy-loaded on first judgement).
Why it matters: both gates were tuned on three Windows TTS voices and never on Gur. Real human voices across mics and sessions commonly score 0.4-0.7 on CAM++, so the one person the device is passkey-locked to is regularly answered as a stranger (no memory, no name), which is the worst possible failure. The wake model needs two confident frames from a two-syllable word said quickly, hears audio already smeared by Chrome's noise suppression, and is deaf for a second after each reset. This is the direct cause of "the voice listening is bad".
What to do: see section 4. First step this week: fail toward the owner on a locked device, loosen the wake gate to the library default, prefill the buffer, feed the detector a raw track, preload the speaker model on listen-on, and record score and verdict per message so the thresholds can be set from Gur's real distribution.
Effort: S this week, M for the recordings and retrain.

### 6. Fallback v2 was approved six days ago and nothing of it is built
Where: lib/chat/handler.ts:169-171 (one call, no tier 2); lib/agent/talk.ts:7,322-329,687-709 (spelling corrector, teach-me loop still live); lib/agent/lexicon/words.ts:1 (373 KB still imported); app/assistant.tsx:310,383-389 (learnFromMessage, pendingLearning still run).
Why it matters: every timeout, 5xx, bad JSON or allowance miss drops Gur into the chain he called "really really bad", so the model's quality is masked exactly on the turns that go wrong. Meanwhile two larger specs were approved and built on top of the unshrunk chain, and every surviving branch is one more that runTurn and the Telegram chain must carry.
What to do: build section 3 (tier 2 retry on fixable outcomes, two reservations, 90/10 split) and section 8 (quota day-stop) now; it is a loop over two ModelEntry values around steps 8-11 of chatTurn, about a day. Then do the section 4 removals before run-turn.ts and before Telegram. One withReservation helper in ledger.ts shared by call 1, call 2 and /api/build; one requireOwner in lib/server; the build's failure settle moves into the streaming route.
Effort: M.

### 7. Nothing is operated: no CI, no monitoring, no backups, errors gone in an hour
Where: .github (absent); lib/chat/handler.ts:49 and lib/actions/index.ts:26 (console.warn only); handler.ts:130,145,185 (every failure becomes a rule reply); docs/osmo-deploy.md:3 (two env vars documented, seventeen read); lib/chat/ledger.ts:42-47 (readDay fails past PostgREST's 1,000-row default); brain/project.md (one Supabase project for dev and production, no PITR).
Why it matters: 1,676 tests run only on whichever agent's machine remembers; a push to main is a deploy; the Hobby account keeps logs for about an hour and has no alerts. In week one of real use the likely outcome is "Osmo got dumber" with no evidence left. The browser is the only writer of messages, agent_state, memory_facts and mood_days, and a failed save is lost silently. The ledger has a hard wall at roughly 150-250 turns a day once fallback v2 and connectors add rows.
What to do: a CI workflow (tsc, lint, vitest, build, non-UTF-8 grep), main protected on green. An ops_events table (day, code, count, last_at) using the fixed codes already in the code, shown in Settings as Health. Weekly scripted pg_dump. Point local dev at the second free project. Replace the client-side day sum with a security-definer SQL function and prune ai_calls after 35 days. Bring .env.example and the deploy doc up to the full variable list.
Effort: S for CI, docs and backups; M for health and the ledger function.

### 8. Crisis detection is English-only for a user in Sweden
Where: lib/agent/safety.ts:6-21 (CRISIS regex), :53-57 (reply gives 112 and Mind Självmordslinjen); lib/chat/request.ts:114-120; lib/voice/engine.ts guest path.
Why it matters: the plumbing is good (crisis lines never reach OpenAI, a crisis cancels a pending action, the model's flag is honoured), but not one Swedish phrase is in the regex. A Swedish sentence is answered by the model's tone read at best, and with the AI off it falls into the rule chain and could get a dictionary lookup. A spoken line judged a guest's never reaches the model, so a guest in crisis gets the rule chain only.
What to do: a Swedish pattern set run alongside the English one on normalized text, with fixtures in safety.test.ts and a native-speaker review. Treat a guest crisis exactly as Gur's (the reply is static, so no data risk). Helplines from a locale table if public ever happens.
Effort: S.

### 9. Memory is three regexes and twenty lines, and nothing measures the model
Where: lib/facts.ts:149-176 (learnFact: "call me X", "my X is Y", "I like Y"); lib/chat/types.ts:223 (history 20 lines); lib/chat/prompt.ts:15-67 (about forty prose rules, tuned blind); scripts/chat-probe.mjs (one fixed message); lib/chat/detection.ts:42 (invalid wants silently becomes "nothing").
Why it matters: Osmo honestly forgets yesterday unless Gur phrased it as "my X is Y". The Muse comparison ("gets to know you faster") is really this gap, and connectors will not close it: Calendar gives Osmo today's agenda to read, not knowledge that persists, and memory_facts is written only by browser regexes, so connector data has nowhere to land. Separately, every prompt change since 2026-10-01 shipped unmeasured; the tone labels have never been scored against a human label.
What to do: section 5.
Effort: M.

### 10. Zero tests on the room; coverage is inverted relative to where the demo found problems
Where: vitest.config.mts:4 (lib/**/*.test.ts only, node environment); app/assistant.tsx (757 lines), components/osmo/use-voice.ts, components/osmo/use-build.ts; lib/chat/handler.test.ts (986 lines on a 241-line handler).
Why it matters: the component that runs the turn, the voice hook, the build hook, the panels and the lock flow have no automated test, and release confidence rests on a 30-item hand-check list. The 2026-10-07 demo found 46 problems in exactly the untested layer.
What to do: issue 2 makes the turn testable in node. Then 5-10 Playwright smoke tests against the dev server with a seeded test user (unlock, typed message, fallback reply, crisis reply, voice-only toggle, build panel) and a jsdom vitest project for use-build and use-voice with a fake engine. Smoke only, not a full browser suite. Add the hostile-component Playwright test the artifacts spec lists.
Effort: M.

## 3. The vision

### 3a. The "public" question

Recommendation: do not make Osmo multi-user. Make it a "run your own Osmo" template, and say so in decisions.md.

What the template takes (M): replace the literal "Gur" in prompt.ts with the saved name fact and a neutral "you" when unsaved, moving the register rules into character.ts so the prompt assembles rather than authors; crisis numbers from a locale table keyed by the saved timezone, with findahelpline.com as the default; a setup script or doc that writes OSMO_OWNER_ID from the first Supabase user; docs/self-host.md with every env switch and migration reproducible (which forces the CI and docs work in issue 7); a "deploy your own" section in README and a 60-second demo video for job applications. The repo is already public, so this is the honest completion of a step already taken. If Gur wants strangers to try Osmo without deploying, the cheapest honest form is a time-boxed guest demo on a separate Supabase project and a separate OpenAI key with a hard dollar cap and no connectors (M).

The alternative, a hosted multi-tenant Osmo, means: sign-up and accounts, per-user budgets or metered billing on a paid key with zero data retention (the free shared-traffic allowance is not acceptable for other people's conversations), abuse handling, a privacy notice and consent, locale-aware crisis lines, an age gate, Google OAuth verification plus a yearly CASA assessment for Gmail, paid Vercel and Supabase tiers, monitoring first, and a rewrite of the admin client, the ledger and the prompt. That is a different product with recurring cost and on-call, and it trades away the one claim Osmo can make that Muse cannot: the data is on your own Supabase and nobody else's. Effort L, and the board does not think it is the right L.

### 3b. Onboarding and connectors on first open

Today a new device opens voice-only with a heart and a microphone (lib/voice/settings.ts:9, showChat false), nothing asks the name, and every connector is five sections deep in Settings and off. Muse front-loads Gmail and Calendar because connectors are its value; copying that would make Osmo's first minute a consent dialog, which contradicts the privacy stance the Settings copy has been careful about. But the opposite failure is live: Osmo never offers anything, so the connectors Gur is building stay off for the one user who wants them.

Do it as a conversation in Osmo's voice, three turns at most, each a plain offer the user can decline: (1) the name; (2) "Would you like me to know your city, for the weather?" and notifications on this device; (3) in a later session, once Calendar exists: "I can read your calendar when you ask me to. I would not read mail. You can switch it off under What I may do." Rules that keep the stance: offer once, never pre-select, state in one sentence what leaves the device (the BUILD_PRIVACY line at profile-client.ts:43 is the model), and a one-line "this goes to OpenAI" note on Calendar. Gmail is never offered on first open: gmail.readonly is a Google restricted scope (fine for Gur as a test user, a CASA assessment for anyone else), mail is the main prompt-injection channel the spec itself names, and call 2 does not exist in code yet. When call 2 is built, enforce in code that its action field is dropped, wrap results in fixed delimiters, strip URLs, and keep the hostile-mail fixture as a regression test. Add a short in-app privacy page (what goes to OpenAI, what is stored, how to delete everything) before any Google connection; Google's review asks for one anyway.

Note the architecture lens's point: "getting to know him faster" needs a server-side memory writer (section 5) before it needs a prompt on first open.

### 3c. Is the roadmap in the right order

In ten days the plan grew from a companion with a mood to connectors (reminders, notes, weather, push, Calendar, Gmail, Spotify), two more surfaces (Telegram with voice notes, a Windows tray) and an artifacts clone. Everything is dark, nothing is pushed, and the question "what does Gur get from Osmo each day" has no written answer. Write the daily loop in one paragraph in project.md: morning, Osmo says the day (calendar, weather, due reminders) when asked or by push; evening, a conversation that feeds mood and memory. Then order to it:

Ship: fallback v2 tier 2 (one day); runTurn extraction; connectors phase 1 with the timer actually installed; Calendar (phase 2a); the memory steps in section 5. Keep artifacts A and B since they are built.
Defer: artifacts phase C; Telegram until runTurn exists (and then text first, voice notes later); the Windows tray and native shells until the loop has been used for two weeks.
Cut or park indefinitely: Spotify (every line of its spec section is marked unverified: Premium required, removed endpoints, development-mode limits); Gmail until the injection defences are live and measured, and off the table for any public form.

## 4. Voice

Diagnosis: the stack is well engineered as code (a pure tested machine, injected deps, graceful fallbacks, honest docs) but it has never been measured end to end on Gur's voice, and three independent faults compound. The speaker gate fails toward stranger (issue 5). The wake gate is stricter than its library's default, trained on synthetic Piper clips, checked on three Microsoft TTS voices, fed suppressed audio, and deaf for 1.28 s after every reset. End of speech is guessed from transcript churn (1 s unchanged, polled every 200 ms, lib/voice/utterance.ts:11) with no VAD, so a thinking pause cuts the message. The mic is closed during thinking and speaking (lib/voice/machine.ts:57-64), so there is no barge-in and anything said into the gap is lost. The latency chain is serial and uninstrumented: roughly 1 s pause, 0.3-1 s final transcript, 0.25 s judgement (seconds on first use while 29.6 MB downloads), 3.3 s model, TTS waiting for the whole mp3 blob (say-cloud.ts:40) rather than the first byte, then a 4 s guard; typically 6-9 s of a silent heart where conversation needs under 2.5 s. Web Speech cannot be fed audio, so recognizer start-up eats the first words after the wake, and Chrome's default recognizer sends audio to Google while the demo script says microphone audio never leaves the device.

Recommended path, in order:
1. This week (S): fail toward the owner (unsure band 0.3-0.5 and no-audio count as "you"; two consecutive confident guest verdicts before guest mode); wake threshold 0.5 on one frame, prefill the feature buffer on reset, a second mic track with noise suppression and AGC off for the detector; preload the speaker model on listen-on; performance marks at every boundary with a dev overlay and a written budget per link; an opt-in diagnostics log of score, speech seconds and verdict per message. Product side: text room by default, "Listen for Osmo (beta)" as the label, and a written acceptance bar in the brain (wake recall 9 of 10 at arm's length, at most one false wake per hour, speaker verdict under 300 ms) before it becomes the default again.
2. Next (M): record 20-30 of Gur's own "Osmo" clips and 5-10 spontaneous phrases on laptop and phone inside the teaching flow, run them through voice:check, set both gates from his distribution, add one git-ignored human clip set so the suite covers the real case. Silero VAD (about 1.8 MB, same ONNX runtime) on the PCM ring to end utterances on 600-800 ms of real silence and to gate the detector. Stream TTS from the first byte and count the guard from it (about 1 s saved per sentence). Keep the mic and detector open while speaking for barge-in, verifying AEC on Gur's laptop first. Move the detector and speaker model into a Worker. Consider retraining as "hey osmo" (three syllables) with Gur's clips in the positives, or an int8 CAM++ at 7-8 MB.
3. Later (L, behind a per-device switch like naturalVoice): a second Hearing implementation fed from the ring starting at the wake mark, so the first words are never lost: OpenAI Realtime transcription with server VAD via an ephemeral token route, or Deepgram Nova at about $0.0043 per minute. Make the privacy change explicit in decisions.md and Settings. Keep Web Speech as the fallback. With language: stream the reply and hand sentence one to TTS while sentence two generates. Target under 2.5 s from end of speech to first sound.
4. Decide once (S): on iPhone the web app is push-to-talk (hold the heart), no wake word, and Settings says so. iOS suspends audio on lock, Safari's recognizer may not share the mic, and the exclusive fallback judges an empty ring and answers as to a stranger. Keep VoiceDeps as the seam for a later native shell; spend nothing more on the Safari wake path.

Cost: step 1 is a few days of one lane and no money. Step 2 is one to two weeks. Step 3 at Gur's usage is a few dollars a month on Deepgram or inside the OpenAI allowance, plus one week to build.

## 5. AI design

Emotion machinery: do not rip it out; the complementary (non-mirror) feeling is right and the code is pure and tested. The problem is observability. Roughly twenty constants across five files (feelings.ts:100-146, slow-mood.ts:6-10, heart.ts:58-62, mind.ts:456-472, prompt.ts:156-166; several already drifted from the spec) decide how Osmo feels, and what the model receives is three sentences. Move every constant into lib/agent/tuning.ts with a one-line meaning each; add a scripted-week snapshot test (sad evening, quiet morning, happy Friday, three days away) that snapshots feeling, mood, own, heavy and aura tone per turn; freeze new emotional state until it exists. Give the aura a key: tap or hover shows one line from TurnFacts.cause ("Concern, from what you said about your mother"), otherwise the mood is wallpaper.

The regex seam: classifyUserEvents, detectArgument, STORY and DILEMMA (mind.ts:153,204-239,403-413) answer the heaviest turns with canned lines before the model sees them, which is where a model-written reply would matter most. Keep one call per turn. Hand the model a fact ("Gur just told you his grandmother died; acknowledge it first") and keep applyEvent and bond bookkeeping in code. Dedupe the two detectFromText calls (mind.ts:468, feelings.ts:157). Replace the frequency rules the model cannot count ("one reply in ten", "at most one in four") with booleans computed in code, as lastOwnMention already is; that is about 120 tokens of noise per call. Run one SQL over ai_calls for last week's cached_tokens ratio and reorder the prompt if it is near zero.

Memory, cheapest first: (1) add remember: {key, value}[] to the JSON turn; code validates (cleanMemoryKey, 300-char cap, dedup), saves tagged source=model, and the Memory panel shows and deletes them like today's facts. This needs a server-side writer, which runTurn provides. (2) One summary call on the first turn of a new local day, 150-token output, a day_notes table, last seven injected (about 1k tokens per turn). (3) Ship feeling_notes as designed. Skip vector memory: one user and at most 200 facts fit in the prompt.

Evals: build a replay eval, not a benchmark. 50-80 fixtures of real ChatBody shapes with a hand tone label, run through buildInstructions and callModel against both allowlisted models, scored by code first (speakable, 1-3 sentences, no "I will remember", name at most once, tone agreement, no markdown), optionally one judge call. About 160k tokens a run, a quarter of a day's share, so run on demand before a prompt push, not in CI. Log the rules-versus-model detection disagreement rate (labels only). Stop validateDetection from silently defaulting an invalid wants to "nothing" without a count.

Fallback and allowance: tier 2 first (issue 6). Add the chat probe to a weekly check so a retired snapshot is found before Gur is; add a third ModelEntry in a "paid" pool with a hard dollar cap behind its own switch as the escape hatch when the free list moves. Keep the ledger as it is; it is the best part of this layer.

## 6. Quick wins for the next two weeks

- Gur reads the second sk- literal today; rename both fixtures to sk-test-not-a-key; add gitleaks to pre-commit and CI.
- Apply the pg_cron timer migration, verify with a two-minute reminder, make handleDue return 5xx on misconfiguration.
- requireOwner on /api/speak; set a hard monthly spend limit on the OpenAI project and write it in the brain.
- Voice gates: unsure band and no-audio count as owner; wake 0.5 on one frame with buffer prefill; preload the speaker model; log score and verdict.
- Swedish crisis patterns with fixtures; guest crisis treated as Gur's.
- .github/workflows/ci.yml (tsc, lint, vitest, build, UTF-8 grep); protect main; fix .env.example and the deploy doc.
- Default showChat on; label listening "beta"; write the acceptance bar in the brain.
- lib/agent/tuning.ts plus the scripted-week snapshot test; weekly scripted pg_dump.

## 7. What the board would not change

- Pure, dependency-injected cores in lib with thin route files, tested without network or DOM; the voice machine and VoiceDeps are exactly the seam the voice fixes need.
- "Code decides, the model writes": one state step per turn, the model never saves, spends or reaches data; the strict JSON turn with crisis as the OR of code, field and bare word; validateDetection never trusts or throws.
- The ledger: upper-bound reserve before the call, HMAC-signed settle, second read for races, fail-closed, day-stop on model mismatch, no retries that could double-spend.
- Security containment: the service-role key in one file pinned to one user with a grep test; column grants that hide ciphertext and push keys; AES-GCM with row identity as authenticated data; constant-time cron secret; allow-listed push endpoints; idempotent reminder claim; store: false and hashed safety identifier; no message text in logs; no innerHTML sinks.
- Crisis plumbing: runs first on every surface, cancels waiting work, kept out of the model, logs, reminders and Telegram.
- The privacy stance as written: every switch says what leaves the device; listening and voiceprints stay in the browser; the connectors spec refuses Muse's AI approval agent on the record.
- Failure discipline: every path ends in exactly one reply, nothing throws into the voice, TTS falls back to the device voice, the service worker caches nothing, heavy dependencies load lazily.
- The one-character decision and the complementary feeling; the sandbox frame with its gaps written down; the shared brain with dated decisions, lanes, seams and honest "unverified" marks.

## 8. Where the lenses disagreed

- Sign-ups: the security lens verified disable_signup is true on the live project; the product and ops lenses read the brain and say open. Run the check from docs/osmo-deploy.md once more and record the date, then fix the brain.
- Fallback v2 order: the AI lens says build tier 2 now and leave the section 4 removals; the architecture lens says do the removals before run-turn.ts. The board takes both in sequence: tier 2 (a day), then removals, both before Telegram.
- Speaker ID: the voice lens asks whether it earns its keep on a passkey-locked single-owner device; the product lens counts guest handling as a strength. Board: keep it, fail toward the owner, revisit if a multi-user mode ever exists.
- Voice privacy: the product lens calls the privacy copy honest; the voice lens notes Chrome's default recognizer already sends audio to Google while the demo script says it never leaves the device. Fix the copy now, and make any streaming STT an explicit decision.
- Public: the product and ops lenses say template or guest demo; the architecture and security lenses lay out what multi-tenant would take without recommending it. The board recommends the template.
- Memory via connectors: the product lens frames onboarding as the fix for "getting to know him"; the AI and architecture lenses say memory needs a server-side writer first. The board agrees with the latter; onboarding is the second step.
