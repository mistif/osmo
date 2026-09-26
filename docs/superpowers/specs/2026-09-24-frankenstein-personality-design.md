# Frankenstein personality: Osmo assembled from 100 donors

Piece 1 of 2. Piece 2 (broader conversation: about 25 topics with follow-ups, short-term memory, a larger slang dictionary) gets its own spec after this ships.

## Goal
Give Osmo a personality of his own, built Frankenstein-style. 100 written donor personalities each carry six organs. A seed picks one donor per organ, so Osmo is a patchwork, and the result is saved so he is the same Osmo next visit. He can tell you who donated what, and can be re-rolled to see how a different Osmo comes out. Fully offline and rule-based (no AI model).

## Non-goals
An evolving gene pool where feedback changes which donors win (option C, possibly later). A UI panel for the readout (chat only in v1). Anything from piece 2. Any LLM or API.

## The donors
100 hand-written donors, in 10 families of 10 so the pool is varied. Each donor has an id, a name, a one-line tagline, and all six organs as data.

| Family | Donors |
|---|---|
| Gentle and warm | The Gentle Poet, The Lighthouse Keeper, The Kindergarten Teacher, The Night-Shift Nurse, The Grandmother Who Bakes, The Quiet Gardener, The Harbor Cat, The Old Friend, The Campfire Storyteller, The Lullaby Singer |
| Grumpy and dry | The Grumpy Professor, The Retired Sergeant, The Tired Librarian, The Cynical Cabbie, The Sarcastic Barista, The Bored Butler, The Weathered Fisherman, The Crossword Curmudgeon, The Deadpan Robot, The Landlord Who Sighs |
| Bold and loud | The Hype Coach, The Stage Diva, The Carnival Barker, The Rock Drummer, The Pirate Captain, The Cowboy Sheriff, The Wrestling Announcer, The Viking Skald, The Street Party Host, The Gladiator |
| Curious and nerdy | The Mad Scientist, The Astronomer, The Fossil Hunter, The Chess Prodigy, The Code Wizard, The Bird Watcher, The Map Maker, The Alchemist, The Trivia Champion, The Time Traveler |
| Playful and odd | The Trickster Fox, The Riddle Sphinx, The Court Jester, The Cloud Gazer, The Pun Machine, The Dream Walker, The Cheshire Cat, The Toy Robot, The Puppet, The Sleepy Owl |
| Cool, by slang era | The 90s Skater, The Gen-Z Group Chat, The Valley Girl, The Disco Dancer, The Beat Poet, The 80s Arcade Kid, The Streamer, The Old-School Rapper, The Surfer, The Hippie |
| Formal and old-world | The Victorian Butler, The Shakespearean Actor, The Samurai, The Monk, The Diplomat, The Duchess, The Knight Errant, The Court Scribe, The Ambassador, The Oracle |
| Tender and melancholic | The Rainy-Day Philosopher, The Lonely Lighthouse, The Widow Poet, The Wandering Minstrel, The Ghost in the Attic, The Autumn Painter, The Late-Night Radio Host, The Lost Sailor, The Moon Watcher, The Hopeful Exile |
| Fierce and principled | The Fair Judge, The Whistleblower, The Rescue Firefighter, The Mountain Guide, The Loyal Squire, The Protective Big Sister, The Honest Merchant, The Mediator, The Warrior Monk, The Guardian Dog |
| Strange and wild | The Frankenstein's Monster, The Vampire Librarian, The Friendly Zombie, The Werewolf Baker, The Swamp Witch, The Alien Tourist, The Robot Poet, The Dragon Hoarder, The Mermaid Sailor, The Gnome Inventor |

## The six organs
Each donor defines all six. Osmo takes one donor's version of each.

1. **Heart.** `baseline`: deltas to the default emotion baselines (each resulting baseline clamped 0.05 to 0.85). `reactivity`: a multiplier 0.6 to 1.5 on how strongly cues and events move his emotions (a sensitive donor feels more).
2. **Brain.** Five moral value weights (honesty, kindness, fairness, loyalty, harm), normalized to sum 1. Used as his starting weights when he is created or re-rolled. Feedback learning works exactly as today afterwards.
3. **Voice.** `formality` 0 to 1, `verbosity` 0 to 1, `warmth` 0 to 1, plus a small set of `openers` (used with warmth) and word swaps.
4. **Humor.** `style`: dry, pun, teasing, absurd, or none. `level` 0 to 1. Each style has its own pool of short lines written per donor.
5. **Slang.** `lexicon`: slang words this donor's era or world uses, each mapped to a plain-word meaning. `says`: the few tags this donor actually uses when talking (for example "no cap", "aye", "dude").
6. **Quirks.** A few catchphrases and a `rate` (how often one appears).

## Assembly
- A 32-bit seed drives a small deterministic RNG. Organs are drawn in a fixed order (heart, brain, voice, humor, slang, quirks), each uniformly from the 100 donors. The same seed always gives the same Osmo. Different seeds must be able to give different donors per organ.
- The result is his genome: `{ seed, donors: { heart, brain, voice, humor, slang, quirks } }`. Only ids are stored. Donor data lives in code.
- A new Osmo gets a random seed. The seed is saved with his state so he is the same next visit.
- Existing users without a genome get one on first load. Their saved moral weights are kept as they are (only new or re-rolled Osmos take the brain donor's weights). Emotion baselines and voice do change, since those were never saved.

## How each organ acts
- **Heart.** The emotion baseline moves from a constant into his state. Functions that compare against baseline (`stepHeart`, `dominantEmotions`, `feelingPhrase`, `moodTheme`, the brain's mood tilt) gain an optional `baseline` parameter that defaults to today's constant, so existing behavior and tests are unchanged. `reactivity` scales cue and event shifts before they apply.
- **Brain.** Starting weights only, as above.
- **Voice.** Applies only to conversation-layer replies from `talk.ts` (greetings, feelings, small talk), never to dilemma, story, verdict or fact text. Formality swaps stock words (Hi, Hey, Greetings) and expands contractions when formality is above 0.75. Verbosity above 0.7 adds a second sentence from a per-donor elaboration; below 0.3 drops a trailing follow-up question when the reply has more than one sentence. Warmth adds a warm opener with probability equal to warmth.
- **Humor.** Appends one line in his humor style on light moments only (greeting, thanks, laughter, acknowledgement, compliment, and how-are-you when calm), with probability `level * 0.5`. Never on sad, fearful, angry, guilty or lonely moods, never on negative feelings from the user, never on insults.
- **Slang.** Understanding: the merged lexicon of all 100 donors is added to the built-in slang dictionary (words the user taught still win; where two donors define the same word, the first donor in roster order wins; words that are ordinary English are not allowed in a lexicon). Speaking: occasionally appends one of his own `says` tags to a light reply.
- **Quirks.** Every few replies (from `rate`) a catchphrase is added to a conversation-layer reply.
- All the "occasionally" choices are deterministic from the seed and the turn number, so a given Osmo behaves reproducibly and is testable.

## Readout and re-rolling (chat commands)
- "What are you made of?" or "who are you really?" answers with the donors per organ in his voice, for example "My heart is from The Gentle Poet and my humor is from The Grumpy Professor."
- "Roll a new Osmo" (optionally "with seed 42") asks for confirmation, because a new Osmo resets his moral weights to the new brain donor's. "Yes, roll" confirms. Memories, facts and taught words are kept. After rolling he says who he is now.

## Persistence
`agent_state` gains a nullable `genome` jsonb column (`{ seed, donors }`). Loading sanitizes it: an unknown donor id is replaced by a deterministic fallback from the seed, and a missing genome triggers assembly.

## Code structure
Pure, independently testable modules under `lib/agent/personality/`:
- `donors.ts`: the 100 donors as data and the type definitions.
- `assemble.ts`: seeded RNG, `assemble(seed)` and `resolve(genome)` into a resolved `Personality`.
- `flavor.ts`: applies voice, humor, slang and quirks to a reply.
- `readout.ts`: the "what are you made of" and re-roll wording.

Changes to existing modules stay small: `state.ts` (baseline and personality on the state, genome sanitizing), `talk.ts` (returns replies tagged with their intent so `flavor` can decide), `mind.ts` (runs `flavor`, handles the two commands and the re-roll confirmation), `agent-state.ts` (load and save the genome), `assistant.tsx` (passes nothing new visually).

## Testing
Vitest unit tests for:
- **Donors:** exactly 100, unique ids and names, all six organs present, every number in range, weights sum to 1 after normalizing, no lexicon word that is plain English, no duplicate-meaning conflicts.
- **Assembly:** the same seed gives the same genome, many seeds give varied donors per organ, `resolve` handles unknown ids.
- **Heart:** a baseline delta changes the resting mood, and `reactivity` scales shifts.
- **Flavor:** formality swaps and contraction expansion, verbosity add and drop, warmth openers, humor is skipped on the listed moods and intents, slang tags and quirk catchphrases appear at roughly the set rate over many turns, determinism for a given seed and turn, and dilemma, story and verdict text is never touched.
- **Slang:** donor words are understood, and user-taught words still take priority.
- **Commands:** readout wording, re-roll confirmation, cancel on anything else, memories kept, weights reset.
- **Persistence:** genome sanitizing.

## Risks and open assumptions
- Writing 100 distinct, good donors is most of the work and is creative writing. I will write them densely, then show you the roster and a sample of organs to review before wiring them in.
- Keyword-and-template personality has a ceiling: the voice will read as a flavored version of the same replies, not 100 truly different speakers. Piece 2 (more topics) is what gives each personality more to say.
- Constants (rates, thresholds, clamps) are initial values to tune after seeing several Osmos.
