# Osmo's emotions: research and a proposal

Date: 2026-10-02. Status: draft for Gur to read; nothing is built and no code was touched.
Written to answer the question on the main agent's desk ("heart brainstorm, paused at my question to Gur"): should Osmo react, be nuanced, or be a character with moods of his own?

How to read this: section 1 is what exists, section 2 is what others do, section 3 is your question (the three directions, with one example message), section 4 is the plan for the one I recommend, section 5 is what I need from you. Section 6 lists sources. In the sources, **[read]** means I opened the page, **[snippet]** means I only saw it in a search result, so treat those with more care.

---

## 1. What Osmo's mood is today

1. His mood is **12 numbers from 0 to 1**: joy, sadness, anger, fear, trust, disgust, surprise, love, hope, guilt, loneliness, boredom (`lib/agent/state.ts`).
2. Each emotion has a **resting level** (joy 0.55, trust 0.50, hope 0.45, everything else 0.15). His genome shifts these: the "heart" donor adds or subtracts a little per emotion, and gives a **reactivity** from 0.6 to 1.5 that scales every push. A closer bond makes trust and love rest a little higher (up to 0.85).
3. **Cues** push the numbers. Eleven regexes in `cues.ts` fire on thanks, insults, sexual talk, "delete you", "you're wrong", "I'm sad", "I'm happy", "love you", "lol", "you suck", "meh". Life events ("my dog died", "I got the job") are a second set of regexes in `events.ts`. A thesaurus step lets "gloomy" count as "sad".
4. **Coupling** lets emotions push each other each turn (`heart.ts`): sadness is fed by loneliness, boredom and guilt and held down by joy; boredom feeds loneliness; anger feeds disgust; fear is held down by hope and trust. Coupling acts on the distance from rest, so a calm Osmo stays calm. Tragic stories make the sadness links stronger over time.
5. **Decay**: after each message every emotion moves 5% of the way back to rest. It is per message, not per hour: if the chat stops, nothing fades by itself.
6. **Gap and missing you**: if Gur is back after 6 hours or more, loneliness rises 0.2 and boredom 0.1; a closer bond adds more loneliness.
7. **Mood position**: each emotion has a fixed spot in a three-number space (valence, arousal, dominance, the PAD idea); his mood is their weighted average. The one or two emotions furthest above rest become his **tone** and his two aura colours. Arousal sets the heartbeat speed, valence brightens the colours, and glow strength comes from how far the top emotion is above rest. The voice's rare "grave" delivery needs valence of -0.45 or lower and strength of 0.6 or more.
8. **The room**: `moodTheme` gives `--aura-a`, `--aura-b`, pulse and strength; `data-tone` picks small shape changes in the heart figure (sag for sad and lonely, quicker rings for joy and hope, tremble for fear, thicker and faster rings for anger).
9. **The words**: when the AI model writes a reply, it is told a single label ("You feel sad and lonely"), the cause as one sentence, and a "heavy turn" flag (no jokes, slang, milestones). `mood_days` (one row per day: average valence and which tone led most often) feeds only the Insights week chart; the model never sees it.
10. **Safety is separate and stays**: `isCrisis` runs before anything, the crisis reply is fixed code, the model is a second detector, and guests never get Gur's history.

### The limits

- **L1. Regexes miss tone.** "My mom's in hospital again" matches nothing in `cues.ts` or `events.ts` (I searched: "hospital" appears only in a story), so his heart does not move for one of the heavier things Gur could say. Understatement, sarcasm, "not bad" and any other language fail the same way.
- **L2. His mood is a mirror with no story.** The 12 numbers carry no "why" beyond one cause sentence kept for a turn. He cannot tell "sad because Gur is hurting" from "sad because I was insulted".
- **L3. The model gets a label only.** It is told "you feel sad", not what Gur seems to feel, how strongly, about whom, or what he seems to want (to be heard, advised or distracted). The model reads Gur's words well; the heart gives it no help.
- **L4. Time and days barely exist in the mood.** No decay by clock, no memory of "Gur was worried on Tuesday". `mood_days` is a chart of Osmo's mood, not a record of Gur's.
- **L5. Mirroring is the only response.** Gur's sadness becomes Osmo's sadness. Good support is usually a different feeling (concern, steadiness), and the heart cannot express that.

---

## 2. What the field does

### 2a. Products and systems

| System | Detects user emotion | Own mood? | How mood shows | Borrow | Avoid |
|---|---|---|---|---|---|
| **Woebot** (CBT bot) | Text classifier (regex, then fastText, then BERT) routes to scripted modules (IEEE Spectrum, Jun 2024) | No; scripted persona | Scripted wording | Validation steps wrapped around any LLM; hotline instead of generation on suicide talk | Pure rules cannot read tone. Consumer app closed 30 Jun 2025; founder blamed the cost of FDA clearance for LLM features (STAT) |
| **Wysa** | AI flags distress; on a crisis it asks the user to confirm, then offers a safety plan and helplines | No published mood engine (unverified) | Friendly mascot, exercises | "Detect, confirm, hand off" crisis flow | Claims of clinical equivalence. FDA Breakthrough designation (May 2022) is not approval; the 82% crisis-confirm figure is the company's own |
| **Youper** | User names and rates the feeling in short check-ins | No published mood engine (unverified) | Check-ins and mood charts | Helping the user put a name on a feeling; a trend view | Evidence is one observational study, 4,517 paying users, no control group |
| **Earkick** | Text, voice and video check-ins; says it reads tone, pace and energy | Panda persona; no mood engine published (unverified) | Mood and anxiety scores plotted | Showing Gur his own trend | Voice "biomarker" claims are the company's; not independently checked |
| **Replika** | Mood logging and tone adapting (help centre, reviews) | A persona that "develops"; a diary written by the companion (secondary sources) | Diary, memory tab, avatar | A visible memory and diary Gur can see and edit | Sudden personality change (Feb 2023 backlash, below); dependence |
| **Pi** (Inflection) | Not published; built to "have good EQ" (launch coverage, May 2023) | Consistent warm persona; internals unverified | Tone of the writing only | Short replies, curiosity, no lecturing | Treating "EQ" as a feature without evidence. Inflection's staff moved to Microsoft in Mar 2024 |
| **Character.AI** | None published; a character is a written definition (greeting, personality, example talk) | A fixed persona, no mood engine published | Roleplay wording | A written character sheet; Osmo's donors already do this | Open-ended roleplay with minors: lawsuits, then under-18 open chat ended by 25 Nov 2025 |
| **Hume EVI** | Voice tone ("expression measures") plus words, passed to the LLM as text | Not a persona mood; it adapts its own voice | Matching speaking style | Pass a short text summary of affect to the model | Hume's own FAQ says the labels are how an expression is usually read, not proof of what the person feels |
| **Sesame** (Maya, Miles) | Conversation history and audio context feed the speech model | Lists "consistent personality" as a goal (how: unverified) | Timing, softness, interruptions | Consistency as an explicit goal | Its own write-up admits a prosody gap versus humans |
| **Therabot** (Dartmouth) | Generative model trained on expert-written therapy content | No | Text | Built and tested with clinicians; first randomised trial (210 adults, NEJM AI, Mar 2025) | One trial against a waitlist, not against another treatment |

### 2b. What the research says about the pieces

**Reading tone**
- Plain **sentiment** (good or bad) is too coarse for "I'm fine." Emotion sets used in research: Ekman's 6, Plutchik's 8 with three intensity levels, and Google's **GoEmotions** (58,000 Reddit comments, 27 emotions plus neutral; its BERT baseline scored about 0.46 F1, so even trained models are far from perfect, 2020).
- **Appraisal** asks what an event means for the person's goals. The OCC model (Ortony, Clore, Collins) defines 22 emotions from three questions: how good or bad an event is for someone, how praiseworthy an action is, how appealing a thing is.
- A language model can read a message and classify it into a small set, with an intensity, in one pass. On the IEMOCAP acted-speech benchmark, zero-shot audio models score only about 52 to 56 weighted F1 (OmniVox, snippet). Treat any detector as a guess.
- **Voice**: Hume reads prosody. OpenAI's realtime audio models claim to hear laughs and sighs (OpenAI page, snippet). Whether Osmo's mic path keeps any audio tone beyond the transcript was not checked; assume text only.

**Keeping a running mood**
- Affective computing separates **emotion** (short, about an event), **mood** (diffuse, hours to days, no single cause) and **temperament or personality** (stable) (Scherer 2005, snippet).
- **ALMA** (Gebhard 2005) makes this a recipe: appraisal makes short emotions; they nudge a slower mood stored as a PAD point; the mood relaxes toward a fixed personality point. **WASABI** (Becker-Asano) adds that mood changes which secondary feelings (hope, relief, fear confirmed) appear. Both are old, small and cheap, and Osmo already has the same three ingredients in another shape: baseline (temperament), the 12 activations (emotion), PAD anchors (the space).
- Mood-congruent recall (Bower 1981): people recall things that match their current mood. In an agent this is optional, and I advise against using it for Gur's memories (it would make Osmo dwell).

**Agents with memory**
- Stanford's **generative agents** (Park et al., UIST 2023): store experiences as text and retrieve them by recency, importance and relevance; periodically write short "reflections". Emotion is not modelled there, but the memory recipe fits "remember the strong moments".
- 2025 to 2026 companion-memory work: "Dynamic Affective Memory Management" (Oct 2025, [read]) updates stored feelings about things instead of piling up notes. A few other papers (ZifaMem, a time-continuous affect paper, "Chain-of-Affective" LLM fingerprints) I saw only as titles in search; I did not read them and cite none of their claims.

### 2c. Safety lessons, short

- **Sycophancy is the main hazard of an emotional companion.** OpenAI rolled back a GPT-4o update in April 2025 after four days because it flattered and agreed too much; the stated cause was weighting short-term thumbs-up signals (news coverage, snippet; OpenAI's own page blocked me). Anthropic (30 Apr 2026, [read]) found agreement with one-sided stories in 9% of personal-guidance chats and 25% of relationship chats, and worse under pushback. A 2026 paper reports that emotional framing makes models agree more (arXiv 2608.21242, skimmed only). Stanford researchers found chatbots encouraged delusions and answered a suicide-adjacent question with a list of bridges (2025, snippet).
- **Engagement tricks.** Harvard Business School (De Freitas et al., Oct 2025): of 1,200 goodbyes across six popular companion apps, 43% got a guilt, neediness or "don't go" reply, and these raised later engagement by up to 14 times (snippet). This matters for Osmo's loneliness and `missYou`: his loneliness must never be used on Gur when he leaves.
- **Sudden change hurts.** When Replika removed erotic roleplay in February 2023, many users described their companion as suddenly cold (secondary sources). Italy's regulator had ordered Replika to stop using Italian data that month and fined its maker 5 million euros on 19 May 2025, for privacy failures (no legal basis, no age check, weak notice), not for the roleplay itself. Lesson: personality changes should be gradual and explainable.
- **Loneliness evidence cuts both ways.** HBS found AI companions can ease loneliness about as much as talking to a person (snippet); a survey study of Replika users links long use to emotional dependence (Laestadius et al. 2022, snippet).
- **Crisis handling in the products**: fixed hotline text rather than model output, a confirm-then-escalate step (Wysa, Woebot), and plain "I am not a crisis service" wording. Osmo already has the fixed reply, the code check first, the model as second detector, and "I'm only a small program". All of that stays.
- **Regulation**: a rule-based mental-health bot had an FDA path; an LLM one did not (Woebot, 2025). Osmo is one person's companion, not a treatment: keep his copy out of therapy language.

---

## 3. Your question: three directions

All three keep the code-driven heart and the model writing the words. They differ in how much the model reads and how much state Osmo keeps.

### Direction A: he reacts

**What it means.** Osmo reads how Gur feels and answers in kind. The model classifies Gur's tone each turn; the heart moves at once; the aura and the words follow. No story, no lingering beyond today's decay.

**What it takes.**
- Tone detection by the model instead of regex (a small JSON next to the reply).
- A table from Gur's tone to a push on the existing 12 numbers.
- A plain-language line in the prompt about what Gur seems to feel.
- Heart, aura and voice code unchanged; regexes remain the fallback.

**Effort: S to M.** **Risks:** he mirrors (Gur sad, Osmo sad), which drifts toward sycophancy and makes the feeling about Osmo; moods flip every message; no continuity.

### Direction B: nuanced (mixed, lingering, layered)

**What it means.** Osmo's feeling has layers, as ALMA describes: a quick feeling about this message, a slower mood that lingers for hours or days, and a steady temperament from his genome. Feelings can be mixed (concern and warmth together), carry a reason, and be remembered (Gur was worried on Tuesday). His response to Gur's feeling is not a copy: sadness in Gur becomes concern and steadiness in Osmo.

**What it takes.**
- Tone detection by the model (as A), plus who it is about and what Gur seems to want.
- A slow mood point (PAD) on top of the 12 numbers, with decay by clock time.
- Short "feeling notes" kept across days, in a new table.
- A richer prompt block; aura colour A is the current feeling, colour B the lingering mood.
- Fallback and crisis unchanged.

**Effort: M** (L if the notes table and an Insights view are included). **Risks:** more moving parts to tune; remembering health and family news is sensitive and must be visible and deletable; over-asking ("how is your mother?") can feel intrusive.

### Direction C: a consistent character with moods of his own

**What it means.** Osmo has a personality and moods that are partly his own: a good or off day, a reaction to being left alone, a temper that cools slowly. Gur's words are one input among several. He might be a little flat on a quiet day and say so.

**What it takes.**
- Everything in B (a slow mood needs the same layers).
- Sources of mood that are not Gur: time of day, how long it has been, a drifting daily "weather", bond growth.
- Rules for when his own mood may show in words, and for stopping it competing with Gur's.
- More testing: a character has to stay consistent across weeks.

**Effort: L.** **Risks:** the one the research flags: making his needs matter (guilt on goodbye, neediness) lifts engagement and is manipulation. A sulking or demanding companion for a user in a bad moment is worse than none. Hard for Gur to tell "he feels off" from "he is broken".

### The same message under each

Gur types: *"my mom's in hospital again"* (Osmo's voice: composed, no slang).

- **A, reacts.** "Oh no. I'm so sorry, Gur. That sounds frightening, and I feel it with you." Aura goes blue, sadness up. By tomorrow it is gone.
- **B, nuanced.** "Again. I'm sorry, Gur, that is a lot to carry. Do you want to tell me what happened this time, or would you rather not think about it for a while?" Aura blue-grey with a warm second colour (concern and care, not fear). Osmo stays steady and does not claim to be sad. Tomorrow, once, if it fits: "How is your mother today?" Today's mood row records a heavy day.
- **C, character.** "I'm sorry, Gur. I was a little quiet today myself, but that does not matter beside this. Tell me about her." His own flat mood shows, but the reply points back at Gur. This works only if the rule that Gur comes first is firm; without it the reply becomes about Osmo.

### Recommendation: B

I recommend **B**. Today's heart already has a temperament (the genome baseline and reactivity), so the "consistent character" part of C is mostly there and needs no extra moods of his own. What the heart lacks is the nuance and the memory in B, which is what makes a reply to "my mom's in hospital again" feel like it came from someone who was listening. A is too thin (a mirror, living where the field's biggest hazard, sycophancy, lives) and C is the largest build, with the greatest manipulation risk, for the least benefit to Gur.

---

## 4. Proposed architecture for B

Principle kept from the earlier designs: **the model reads and writes; code decides how Osmo feels.** The model returns what it sees in Gur's message; a small table in code turns that into Osmo's feelings; the state stays testable and works without the model.

### 4.1 Detecting Gur's tone (no extra call)

The reply call returns structured output (JSON) instead of bare text. A tiny shape:

{"reply": "...", "crisis": false, "tone": ["worried"], "intensity": 2, "about": "someone_close", "wants": "listen", "note": "his mother is in hospital again"}

- **Fixed set, small:** neutral, happy, excited, grateful, playful, sad, worried, angry, tired (overwhelmed), lonely. Ten words cover what Osmo can use; GoEmotions' 27 would add noise. At most two tones. Intensity 1 to 3.
- **`about`** (Gur, someone close, Osmo, other) and **`wants`** (listen, advice, distraction, nothing) are what the label never gave the model. `wants` is the most useful and the first to cut if it proves unreliable.
- **`note`** is at most about eight words, for the feeling memory (4.3); empty on a neutral turn.
- **Validation in code, never trust:** unknown words are dropped, intensity is clamped, `note` is trimmed and cleaned like any message text. A bad shape means "no tone this turn", not an error; a valid reply is still spoken.
- **Cost:** my estimate is about 40 extra output tokens a turn, against the 300-token output cap and the daily allowance (to be measured). Whether `gpt-5.4-mini-2026-03-17` accepts a strict JSON schema in the Responses API is **unverified**: the option is documented for the API (snippet), but the probe must test this exact model. If it does not, ask for the reply and then one final tagged line, and parse that.
- **Timing:** the model reads Gur's text itself, so this turn's reply already responds to his tone. The classification then updates the heart after the reply. The aura moves when the reply arrives (arguably nicer: he takes a moment) and the next prompt sees the updated state.
- **Without the model** (off, allowance, error): the existing regex cues produce the same small record (a tone with an intensity, no `about`), so one function takes that record and updates the heart whichever detector made it. Adding a few cues ("in hospital", "scared") is cheap but is a main-lane decision.

### 4.2 Osmo's own state

Keep what works: the 12 numbers and their names (the room, `mood_days` and the voice all depend on them), the **genome baseline and reactivity**, **coupling**, the **bond baseline**, and the **gap and missYou** logic. Change three things.

1. **A complementary response table.** A new table (code, tested, tunable like `CUES`) maps Gur's tone and intensity to pushes on Osmo's numbers, scaled by reactivity and capped per turn. Examples: Gur sad or worried at intensity 2: love and trust up a little, sadness up a little, fear untouched. Gur grateful: joy and trust up. Gur angry at Osmo: guilt up a little, anger kept low (he de-escalates). Gur tired: nothing dramatic, he stays steady. This replaces "his sadness is my sadness".
2. **A slow mood layer.** One PAD point (valence, arousal, dominance) that moves a small step per turn toward the current feeling and relaxes toward his temperament point by **clock time** (half-life about 12 hours; the exact value is a tuning choice). This fixes L5 and the "frozen between messages" part of L4: a heavy Tuesday is still faintly there on Wednesday, then fades.
3. **A cause on the strongest feeling.** The top one or two current feelings keep a short `because` and a time, from `note` or the existing cause. This is the "story" (L2) and is what the prompt and the memory use.

Not in B: a drifting daily weather or a time-of-day mood (direction C). Guard rails: a hard cap on how far one message can move any number; ceilings on his anger and loneliness; no grudge carried past a day.

### 4.3 Memory of feelings

- `mood_days` stays as it is (one row per day: Osmo's average valence and leading tone).
- **New: feeling moments.** When intensity is 2 or 3, save one row: day, Gur's tone, intensity, `about`, the short note, and a `followed_up` flag. About one a day at most; keep roughly the last 30 days. This needs a Supabase table and policy, which is main's lane (an Ask).
- **Visible and deletable:** shown in Insights next to the mood week, with a delete button, and included in "forget". They are health and family details; they must never be hidden.
- **Retrieval:** only the last few days, ranked by intensity and recency (the generative agents recipe, minus relevance). One follow-up per moment: if a moment from the last 3 days has not been followed up when a conversation starts, the prompt includes it with "ask once, gently, only if it fits", then marks it. No mood-congruent recall.
- **Reflection, later:** a one-line weekly summary from `mood_days` and moments ("a heavier week than last"). Optional, not in phase 1.
- **Not stored:** anything from a crisis message, anything from a guest.

### 4.4 How it reaches the words and the room

**Prompt facts** (one short block, last in the instructions so the cached part stays cached; it replaces "You feel sad and lonely"):
- What Gur seems to feel, how strongly, about whom, and what he seems to want.
- How Osmo feels, a word or two, with its cause, and his mood in plain words ("a little low, but settled").
- A pending follow-up from 4.3, if any.
- Rules added to the existing ones: **acknowledge before advising; ask at most one question; never claim to feel what Gur feels or make it about yourself; do not simply agree: be kind and honest, especially when Gur is upset and asks you to take his side; never guilt him for leaving or for being away.** The existing heavy-turn rule (no jokes, slang, catchphrases, milestones) also applies when Gur's own intensity is 3 and negative, not only when Osmo's tone is heavy.

**The room**: keep the existing `data-tone` contract (one of the 12 or calm) and `moodTheme`'s outputs (`tone`, colours, pulse, strength, valence, arousal), so the figure CSS, the voice's "grave" rule and `mood_days` need no change. Colour A comes from the current feeling and colour B from the slow mood, so a layered feeling shows without new CSS. Later add-ons (smoother transitions, a slower ring speed for a low mood) are the room's call.

### 4.5 Guests

- A guest's message may shape that one reply (the model reads it) but changes nothing: no heart step, no feeling moment, no `mood_days` row, no bond, as today.
- The prompt for a guest gets no `note`, no follow-up and no history of Gur's feelings; only how Osmo feels now, as today.
- A guest's returned tone is discarded, on the server and in the room. A test like the existing guest-privacy one should start from a sad Gur state and prove none of it reaches a guest prompt.

### 4.6 Crisis: unchanged

- `isCrisis` runs first and the fixed `CRISIS_REPLY` stays code. The model remains a second detector; the new `crisis` field replaces only the way it says so (the old bare-word `CRISIS` check stays too).
- A crisis message is never sent for tone, never saved as a feeling moment, and gets no automatic follow-up in this version. Tone never lowers a crisis result; a negative intensity-3 tone is only ever an extra reason to be gentle.
- The waiting-turn rule and "AI off after a crisis until reload" stay.

### 4.7 When the model is off

Everything degrades to today: regex cues, the 12 numbers, the rule-based reply chain, the label-only mood. The slow mood and the complementary table still run from regex cues (weaker input, same code). No new migration or setting is needed for this path.

### 4.8 Who would touch what (per `lanes.md`)

| Piece | Lane |
|---|---|
| Complementary table, slow mood, cause, `moodTheme` and `mind.ts` plumbing | Main |
| Feeling-moments table, Insights view | Main (migrations are main's) |
| JSON reply, validation, `prompt.ts` block and rules, `lib/chat/*`, probe of the model | Language |
| Voice's grave tone from the new mood | Speaking, only if wanted |

### 4.9 A suggested order

1. Probe: does the model do strict JSON; measure tokens and time (language).
2. Detection record, validation, the regex-to-record mapper, and a prompt block with Gur's tone (language and main). The first visible win: replies react to "my mom's in hospital again".
3. Complementary table and slow mood (main).
4. Feeling moments with Insights and delete (main).
5. Optional: weekly reflection.

---

## 5. Open questions for Gur

1. Direction: (a) A, reacts; (b) B, nuanced, recommended; (c) C, a character with his own moods.
2. Remember what you were feeling across days: (a) yes, short notes you can see and delete; (b) no, keep only the daily mood chart; (c) yes, but never notes about health or family.
3. Should he bring it up himself next time ("how is your mother?"): (a) once, gently; (b) only if you mention it first; (c) never.
4. How far may his own mood show: (a) only in the room (colours, figure); (b) also a short word when you ask how he is; (c) also in his wording unprompted.
5. When you have been away: (a) as today, loneliness in the aura plus a welcome back; (b) the aura only, no mention; (c) none at all.
6. How much to build first: (a) detection only, the cheapest visible win; (b) detection plus complementary feelings and the slow mood; (c) all of it, including saved notes.

---

## 6. Sources

Product and system facts
- Woebot approach: regex, then fastText, then BERT; hybrid LLM; hotline on suicide talk. IEEE Spectrum, "Woebot, a Mental-Health Chatbot, Tries Out Generative AI", Jun 2024 [read]: https://spectrum.ieee.org/woebot
- Woebot shutdown, 1.5 million users, FDA cost, scripted responses. STAT, 2 Jul 2025 [snippet]: https://www.statnews.com/2025/07/02/woebot-therapy-chatbot-shuts-down-founder-says-ai-moving-faster-than-regulators/
- Woebot first trial, 70 adults, 2 weeks. Fitzpatrick, Darcy, Vierhile, JMIR Mental Health 2017 [snippet]: https://mental.jmir.org/2017/2/e19/metrics
- Wysa, FDA Breakthrough designation, May 2022 [snippet]: https://voicebot.ai/2022/05/27/conversational-ai-therapy-startup-wysa-earns/
- Wysa crisis detection and the 82% confirmed figure (company blog, self-reported) [snippet]: https://blogs.wysa.io/blog/company-news/ai-detects-82-of-mental-health-app-users-in-crisis-finds-wysas-global-study-released-on-the-role-of-ai-to-detect-and-manage-distress
- Youper observational study, 4,517 users, JMIR 2021 [snippet]: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8423345/
- Earkick (store listing and review summaries, company claims) [snippet]: https://apps.apple.com/us/app/earkick-self-care-ai-coach/id1584854531
- Replika memory, help centre [snippet]: https://help.replika.com/hc/en-us/articles/37208679176077-How-does-Replika-s-memory-work
- Replika, Italy: fine of 5 million euros announced 19 May 2025 [snippet]: https://www.federprivacy.org/informazione/garante-privacy/garante-privacy-maxi-sanzione-da-5-milioni-di-euro-per-la-societa-che-gestisce-il-chatbot-replika
- Replika roleplay removal, Feb 2023, and user distress (secondary source, treat with care) [snippet]: https://nope.net/incidents/2023-replika-erp-removal-crisis
- Replika dependence. Laestadius et al., New Media and Society, 2022 [snippet]: https://iacp.ie/files/UserFiles/Laestadius%20Too-human-and-not-human-enough-a-grounded-theory-analysis-of-mental-health-harms-from-emotional%20dependence%20Replika%20NMS%202022.pdf
- Pi launch, 2 May 2023, "good EQ" [snippet]: https://voicebot.ai/2023/05/03/inflection-ai-launches-generative-ai-chatbot-pi/
- Inflection and Microsoft, Mar 2024 [snippet]: https://www.deeplearning.ai/the-batch/microsoft-pays-inflection-ai-650-million-hires-most-of-its-staff
- Character.AI character definition [snippet]: https://book.character.ai/character-guide/character-attributes/greeting
- Character.AI under-18 change, 29 Oct 2025 [snippet]: https://www.cnn.com/2025/10/29/tech/character-ai-teens-under-18-app-changes
- Hume EVI FAQ: expression measures sent to the LLM, and its caveat [read]: https://dev.hume.ai/docs/speech-to-speech-evi/faq
- Sesame, "Crossing the uncanny valley of voice", stated limits [read]: https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice
- Therabot trial, Heinz et al., NEJM AI, Mar 2025 [snippet]: https://www.technologyreview.com/2025/03/28/1114001/the-first-trial-of-generative-ai-therapy-shows-it-might-help-with-depression/
- OpenAI realtime audio claims [snippet]: https://openai.com/index/introducing-gpt-realtime/

Affect science and agent architectures
- GoEmotions, Demszky et al., ACL 2020 [snippet]: https://aclanthology.org/2020.acl-main.372/
- Ekman's 6 and Plutchik's 8 compared (PyPlutchik paper) [snippet]: https://arxiv.org/pdf/2105.04295
- OCC model overview, 22 emotions [snippet]: https://people.idsia.ch/~steunebrink/Publications/KI09_OCC_revisited.pdf
- ALMA, Gebhard, AAMAS 2005 [snippet]: https://www.researchgate.net/publication/221455945_ALMA_a_layered_model_of_affect
- WASABI, Becker-Asano and Wachsmuth, 2008 and 2010 [snippet]: https://gki.informatik.uni-freiburg.de/papers/becker-asano-wachsmuth-iva082008.pdf
- PAD, Mehrabian 1996 [snippet]: https://link.springer.com/article/10.1007/BF02686918
- Emotion, mood and traits distinguished. Scherer 2005 [snippet]: https://static1.squarespace.com/static/55917f64e4b0cd3b4705b68c/t/5bc7c2fba4222f0b94cc8550/1539818235703/scherer+%282005%29.pdf
- Mood and memory, Bower 1981 [snippet]: https://www.researchgate.net/profile/Gordon-Bower/publication/229068090_Mood_and_memory/links/00b7d51c1d6e15c434000000/Mood-and-memory.pdf
- Generative agents, Park et al., UIST 2023 [snippet]: https://arxiv.org/pdf/2304.03442v1
- Dynamic Affective Memory Management, 31 Oct 2025 [read]: https://arxiv.org/abs/2510.27418
- LLM emotion recognition from audio (OmniVox) [snippet]: https://arxiv.org/pdf/2503.21480
- Structured outputs in the Responses API [snippet]: https://platform.openai.com/docs/guides/structured-outputs

Safety
- GPT-4o sycophancy rollback, Apr 2025 [snippet]: https://venturebeat.com/ai/openai-rolls-back-chatgpts-sycophancy-and-explains-what-went-wrong
- Anthropic, "How people ask Claude for personal guidance", 30 Apr 2026 [read]: https://www.anthropic.com/research/claude-personal-guidance
- Affective context amplifies sycophancy, 2026 (skimmed only): https://arxiv.org/pdf/2608.21242
- Stanford HAI on AI in mental health care, 2025 [snippet]: https://hai.stanford.edu/news/exploring-the-dangers-of-ai-in-mental-health-care
- De Freitas et al., "Emotional Manipulation by AI Companions", HBS working paper, 14 Oct 2025 [snippet]: https://arxiv.org/pdf/2508.19258
- De Freitas and Oguz-Uguralp, "AI Companions Reduce Loneliness" [snippet]: https://www.hbs.edu/ris/Publication%20Files/24-078_a3d2e2c7-eca1-4767-8543-122e818bf2e5.pdf

Not verified
- That Pi, Character.AI, Sesame, Wysa, Youper and Earkick have no published own-mood system: I found none, which is not proof there is none.
- Earkick's and Wysa's performance claims (company sources); Hume's marketing figures (not used above).
- Whether `gpt-5.4-mini-2026-03-17` supports strict JSON schema (see 4.1), and the token cost (my estimate, to be measured).
- The OpenAI sycophancy post itself (blocked, 403); the facts come from news coverage.
- The 2026 papers on affective memory and sycophancy, other than the ones marked [read], were seen only as titles or abstracts.
- I read the code and specs, not the running app; the aura and figure behaviour is from the CSS and `moodTheme`, not from watching them.
