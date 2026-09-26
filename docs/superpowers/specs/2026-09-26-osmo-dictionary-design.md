# Osmo's dictionary: design

Date: 2026-09-26. Status: approved 2026-09-26 (sections 1 to 5 and the voice section). Amended while planning; see the last section.

## Goal

Give Osmo a much bigger vocabulary, in six ways:

1. **Answer word questions.** "what does ephemeral mean", "define petrichor" and "what's a platypus" get a real definition, where today he asks the user to explain.
2. **Understand more of what people say.** Feeling words he has never seen still land ("im gloomy" is sad).
3. **Know far more slang.** About 300 modern slang terms on top of the ~200 he has.
4. **Talk with richer words.** His own replies rotate synonyms, so he repeats himself less.
5. **Understand typos.** A misspelled word gets an educated guess from spelling, how common a word is, and context (the phrase it sits in, the kind of word expected there, and what was said recently). Osmo then understands the message as intended.
6. **Learn your vocabulary.** Words you use often (names, in-jokes, jargon) become his words, so he never mistakes them for typos. His own wording stays professional (see "Voice").

## Decisions already made

- **Hybrid source.** Definitions come online and are cached; everything used for understanding ships with the app, so it is instant and works offline.
- **Online source: Datamuse first, Wiktionary as backup.** dictionaryapi.dev was down (HTTP 522, then timeouts) when checked on 2026-09-25, so it is not used. Datamuse (`https://api.datamuse.com/words?sp=<word>&md=dp&max=1`) returns plain-text definitions from Wiktionary, with part of speech, allows browser calls, needs no key, and knows modern slang ("rizz"). The Wiktionary REST API (`https://en.wiktionary.org/api/rest_v1/page/definition/<word>`) is the backup; it returns HTML, which is stripped to text.
- **Per-user cache** in a new Supabase table, protected by RLS like every other table. A shared cache was rejected: any signed-in user could write definitions others would see.

## 1. Word questions

**Triggers** (case-insensitive, trailing punctuation ignored), for a term of 1 to 3 words:
- `what does X mean`, `what's X mean`, `whats X mean`
- `define X`, `definition of X`, `meaning of X`
- `what is a/an X`, `what's a/an X`, `whats a/an X`
- `what is X`, `what's X`, `whats X` when X is a single word

**Precedence on the page.** A lookup runs only when nothing earlier claims the message: a taught-meaning answer, a name answer, a recall, a `processTurn` reply (so "what's up" stays small talk), a taught slang or fact, or math (so "what is 2+2" stays math). A remembered fact or Osmo's own knowledge (`what is my X`, `what is the internet`) also answers first. Multi-word `what is X` topics without "a/an" keep the existing explain-and-I'll-remember flow (now worded "I'm not familiar with "X". Could you explain it? I'll remember.").

**Lookup order.** The first hit wins:
1. A meaning the user taught him (memory facts, `slang:` keys).
2. His built-in slang, including the new list and the "also a normal word" list below.
3. His Supabase cache (`word_lookups`).
4. Datamuse.
5. Wiktionary.

A result from steps 4 and 5 is written to the cache.

**Reply.** Osmo voice, the first clean sense, written as a full sentence that reads well aloud (see "Works with a future voice"):
- "Ephemeral means lasting for a short period of time."
- A noun sense reads "A platypus is a semiaquatic monotreme from eastern Australia…".
- A slang sense says so in words: "Rizz is slang for charm or attractiveness."
- Datamuse's leading `(slang, of a person)`-style labels are turned into that wording. The part-of-speech prefix (`adj\t`) is dropped.

**Filtering.** A sense labeled vulgar, offensive, derogatory, slur or ethnic slur is skipped. If any sense is labeled that way, he answers "I'd rather not repeat that word." and nothing is cached.

**Failure.** On a 4-second timeout, a network error, an HTTP error or no result from both sources, he falls back to "I'm not familiar with "X". Could you explain it? I'll remember." and remembers the user's explanation as today. The UI never hangs: the typing indicator shows while the lookup runs.

**Privacy.** Only the looked-up term goes to Datamuse or Wiktionary, never the user's message.

## 2. Understanding more (built-in)

**Feelings thesaurus.** About 300 feeling words, each mapped to one of the feelings `talk.ts` already knows, with the same positive/negative split.
- Examples: gloomy, blue, glum → sad; furious, livid, fuming → angry; ecstatic, elated, overjoyed → happy; jittery, uneasy, antsy → anxious. Single words only, since the feeling patterns read one word.
- `matchFeeling` checks it after its exact match and typo match.
- The reply uses the user's own word ("I'm sorry you're feeling gloomy"), but mood cues and positivity come from the mapped feeling.

**Word list.** The 50,000 most common words in English film and TV subtitles, from `en_50k.txt` (hermitdave/FrequencyWords, 2018 OpenSubtitles). It is in frequency order and conversational, so it knows "jiggle", "gloomy", "platypus" and "ephemeral". Only plain lowercase words are kept (about 47,000, roughly 370 KB), stored as a data module with an attribution note. Its content license is CC-BY-SA-4.0, so the attribution is required. It is used by:
- the typo guesser, as both "is this a real word" and "how common is it";
- the slang validator.

It is **not** used to tell names from words: it contains first names (john, sarah, jessica), so name detection keeps its current rules.

## 3. More slang (built-in)

Two lists, with different rules:

- **Pure slang, about 250 terms:** words with no ordinary-English meaning (rizz, delulu, istg, ngl, fr, bussin, situationship, …). These are added to `normalize` like today's `SLANG`: rewritten to a plain meaning. Built-in `SLANG` wins a clash, and taught words win over everything.
- **Slang that is also a normal word, about 50 terms:** mid, cooked, ate, salty, based, glazing, lit, cap, bet… These are **never** rewritten, so "I ate pizza" stays intact. They are only used by word questions ("what does mid mean" gives the slang sense first).

A validator test enforces the split: no pure-slang key may appear in the word list, except keys on a short explicit allowlist of abbreviations the list happens to contain (such as lol, tbh, fr). Every key is one lowercase token with a 1-to-6-word plain meaning.

## 4. Richer words

A small table of synonym sets for words in Osmo's own replies, all in his professional register: glad/pleased, difficult/hard/tough, understood/noted, entirely/completely, wonderful/great.
- `vary(text, turn)` swaps whole words, keeps capitalization, and is deterministic per turn.
- It runs on conversation-layer replies only, the same scope as `flavor`: never on the crisis reply, dilemmas, stories, readout or re-roll text.
- On sad or sensitive replies it may still swap words, since swapping "hard" for "tough" does no harm, but it adds nothing.

## 5. Understanding typos

There are two layers, one offline for every message and one online for word questions.

### A. Offline, on every message (instant)

A spell-guesser runs inside `normalize` on each word Osmo does not recognize.

**Recognized words are never changed.** A word is recognized if it is:
- in the word list, any slang list (built-in, pure, also-a-word, donor) or the feelings thesaurus;
- a taught word;
- a number;
- the user's saved name.

**Candidates** come from a vocabulary made of:
- the word list;
- all slang keys;
- the feeling words;
- the words in Osmo's own phrases.

A candidate must be within:
- one edit for a 4-to-6-letter word;
- two edits for a word of 7 or more letters.

Typo-shaped edits cost less than others:
- swapped neighbors ("teh");
- a missing, extra or doubled letter;
- a keyboard-neighbor letter ("thsnks").

Swear words and slurs are recognized (never corrected) but are never offered as a candidate, so a typo can't turn into one.

**Short words.** Words of 3 letters or fewer are only corrected when phrase context makes the fit clear ("how are yuo"). They are otherwise too easy to mangle ("gur", "lol", "idk").

**The educated guess.** Each candidate is scored on:
1. **Edit cost.** Typo-shaped mistakes are cheaper.
2. **How common it is.** The word list is in frequency order, so "whta" becomes "what", not "wheat".
3. **Phrase context.** A candidate that completes one of Osmo's known phrases with its neighbors gets a large boost ("how are yuo" → you, "thnak you" → thank, "whats yuor name" → your).
4. **Slot context.** After "i am", "i feel", "feeling", "im so" and similar, feeling words are preferred ("i feel sda" → sad, not "sea").
5. **Conversation context.** Words from the last few messages (both sides) get a boost ("piza" right after talking about pizza).

**Confidence.** A word is only changed when the best candidate clearly beats the runner-up. Otherwise it is left alone, because a wrong guess is worse than none.

**Never corrected:**
- the term inside a word question (the dictionary handles it; see B);
- a reply to "what's your name?";
- taught words;
- capitalized words in the middle of a sentence (probably names).

**Silent.** Chat replies do not announce corrections; Osmo just understands.

**Safety.** The crisis check also runs on the corrected text, so "i want to kill myslef" is caught. It still runs on the raw text first, and the corrector can only add crisis matches, never remove one.

### B. Online, for word questions

Datamuse's lookup tolerates misspellings ("ephemrel" returns "ephemeral", checked 2026-09-26). When the word it returns differs from the word asked, Osmo says so:
- "I believe you meant ephemeral. It means lasting for a short period of time."
- The cache stores the result under the typed term too, so the same typo is instant next time.

## 6. Learning your vocabulary

Osmo learns the words **you** use, so he stops treating them as typos. This is understanding only: he never adopts your grammar, slang or spelling in his own replies (see "Voice").

**What counts.** A word is counted when it is:
- letters only, 3 or more characters long;
- not something Osmo already recognizes (word list, slang lists, feelings, phrases);
- not something the typo guesser confidently corrects ("freind" is a typo of "friend", not a new word).

Names, in-jokes, gaming terms and new slang are exactly these words. Each message counts a word at most once.

**When it becomes yours.** Once a word has appeared in 2 or more of your messages:
- **Recognized:** the typo guesser never changes it.
- **Preferred:** it becomes a typo candidate ranked as very common, so "vlao" is read as your "valo".

**Storage.** A new Supabase table `user_words(user_id uuid default auth.uid(), word text, uses int, updated_at timestamptz, primary key (user_id, word))`, per-user RLS like every other table. The page loads your 1,000 most-used words at start and saves changed counts after each message. If saving is unavailable, learning still works for the session.

**Never learned:** banned words and slurs (they are already recognized, never offered), and words inside a crisis message.

## Voice: professional, like JARVIS

Osmo will be a speaking agent, so his own wording stays **relatively professional at all times, like JARVIS**:
- **Tone:** composed, polite, articulate and concise, with occasional dry wit.
- **Never in his replies:** slang, internet abbreviations ("lol", "ngl", "fr"), emoji, or mirroring the user's grammar or spelling.
- **Still understood:** slang and typos in what the user says.

This replaces the casual wording set on 2026-09-25 ("Lol, you lost me", "Bet. What's next?"). This feature rewrites every line it owns:
- the conversation replies and fallbacks in `talk.ts`;
- the dictionary replies;
- the page's name, learning, fact and math lines.

Examples:
- "I'm not sure I follow. Could you rephrase that?"
- "I believe you meant ephemeral. It means lasting for a short period of time."
- "I'm not familiar with "zorp". Could you explain it? I'll remember."
- "I'd rather not repeat that word."
- "In your usage, bet means okay."

The personality donors' flavor (openers, catchphrases, slang tags, humor), the readout and the event and dilemma replies belong to the other session. It has been told about this direction and owns those changes.

## Works with a future voice

Osmo will eventually speak aloud (text-to-speech) and may listen (speech-to-text). This feature must not get in the way of that:

- **Every reply is plain, speakable text.** No markdown, emoji, bullet lists, brackets or symbols that a speech engine would read out literally ("(slang)", ":", "/"). Definitions are whole sentences ("Rizz is slang for…").
- **One place where a reply is final.** The page already sets one `response` string per turn. Lookups resolve to that same string, so a later `speak(response)` hooks in at one spot and gets definitions, corrections and chat alike.
- **Spoken input has no typos, but it has no punctuation either.** Lookup triggers and intents must work without "?" ("what does ephemeral mean"). The typo guesser only touches words Osmo does not recognize, so correctly transcribed speech passes through untouched.
- **Waiting is audible.** A lookup can take up to 4 seconds, so the page shows the thinking state while it runs. A spoken "let me look that up" filler is left for the voice project.
- **No new text-only tricks.** Reply variety swaps words, never adds formatting.

## Structure

- `lib/agent/lexicon/feelings.ts`: the thesaurus and `feelingFor(word)`.
- `lib/agent/lexicon/words.ts` and its data module `words-data.ts`: `isKnownWord(word)` and `wordRank(word)`.
- `lib/agent/lexicon/slang.ts`: the `PURE_SLANG` and `WORD_SLANG` maps.
- `lib/agent/lexicon/variety.ts`: `vary(text, turn)`.
- `lib/agent/lexicon/spelling.ts`:
  - `correctTypos(words: string[], ctx: SpellContext): string[]`
  - `SpellContext = { recent?: string[]; protect?: Set<string> }`
  - the phrase list it scores against.
  - `normalize` gains an optional `spell` context. `parse` and `understand` pass it through, and `TurnContext` gains `recent?: string[]` (words from the last few messages), which the page supplies.
- `lib/agent/dictionary.ts`:
  - `parseLookup(text): string | null`
  - `lookupWord(term, deps): Promise<Lookup>`, where `deps` supplies `fetch`, cache get/put and taught words, so tests use fakes.
  - `cleanSenses(raw)` (filter and clean)
  - `formatDefinition(lookup): string`
- `lib/agent/dictionary-store.ts`: Supabase cache read and write (`word_lookups`).
- `app/assistant.tsx`: when `parseLookup` matches, await `lookupWord` and reply. Otherwise the flow is unchanged.
- Migration `add_word_lookups`: `word_lookups(user_id uuid default auth.uid(), term text, word text, definition text, part_of_speech text, source text, created_at timestamptz default now(), primary key (user_id, term))`. `term` is what was asked and `word` is what was found, so a typo and its correction are both cached. RLS allows select, insert and update only on the user's own rows.

## Testing

- **Dictionary:** a fake `fetch` covers Datamuse hit; Datamuse miss then Wiktionary hit; both down; timeout; HTTP 500; a vulgar-only result; cache hit (no fetch); taught-word override; slang tag formatting; HTML stripping.
- **Triggers:** `parseLookup` positive and negative cases, including memory and math questions.
- **Lexicon:** feelings map only to known feelings. The slang split validator runs. `vary` is deterministic, never changes meaning-bearing words and leaves protected text alone. The word list loads with the expected size and order.
- **Typos:**
  - Corrected: "how are yuo", "im feelign sda", "thnaks", "waht is yuor name", "i hvae a dog", "whta", "piza" with pizza in recent context, and "kill myslef" (caught as crisis).
  - Untouched: "gur", "Nala", "rizz", "yeet", "petrichor", "ok", "lol", numbers, and a word inside a word question.
  - An ambiguous typo with no clear winner is left unchanged.
  - Online: "what does ephemrel mean" gives "I believe you meant ephemeral…".
- **Vocabulary:** a new word becomes yours after 2 messages. It is then never corrected, and a typo of it is read as it. Real-word typos ("freind") and short words are never learned.
- **Voice:** no conversation, fallback or dictionary reply contains slang, internet abbreviations or emoji.
- **Regression:** the full existing suite stays green, including `chatlog.test.ts`.
- **Manual check in the browser:**
  - "what does ephemeral mean" is looked up once, then cached on the second ask.
  - "im gloomy" gets a sympathetic reply.
  - "what does mid mean" gives the slang sense.
  - "I ate pizza" is not rewritten.
  - Datamuse blocked gives the fallback reply.

## Review focus

1. **A normal word that looks like slang:** "I ate", "that's lit", "no cap on the bottle". Expected: never rewritten unless it is pure slang.
2. **Lookups for offensive words:** "what does [slur] mean". Expected: no slur definitions repeated, nothing cached.
3. **Slow or blocked network:** Expected: a reply within about 4 seconds, the chat stays usable, and the fallback offers to learn.
4. **Look-alike questions:** "what is my name", "what is 2+2", "what's up", "what is love". Expected: the existing answers, not dictionary lookups (except "what is love", which is a fair lookup).
5. **Taught word vs. dictionary:** after "bet means okay", "what does bet mean". Expected: the user's meaning wins.
6. **The corrector mangles a name or rare word:** "gur", "my dog Nala", "yeet", "petrichor". Expected: untouched. Only unrecognized words with a clear winner change.

## Out of scope

- Other languages.
- Pronunciation and audio.
- Example sentences.
- A shared or global cache.
- Using definitions to understand arbitrary sentences, beyond feelings and typos.
- Telling names from ordinary words.

## Amendments made while planning (2026-09-26)

- **The word list changed** from the 10,000-word Google list to the 50,000-word subtitle list. The Google list is too small: it lacks "gloomy", "suicidal", "jiggle", "platypus" and "ephemeral", so the typo guesser would have "corrected" real words ("jiggle" → "juggle").
- **Name detection was dropped from this feature.** Both lists contain common first names, so neither can tell "pizza" from "Sarah".
- **The feelings thesaurus is single words only**, because the feeling patterns in `talk.ts` capture one word.
- **Professional voice (added 2026-09-26 at the user's request):** Osmo's wording is professional like JARVIS and never mirrors the user. Only vocabulary learning was chosen from the "learn from the user" options; mirroring the user's style was explicitly rejected.
- **The cache is keyed by the asked term**, with the found word stored beside it, so a typo is cached too.
