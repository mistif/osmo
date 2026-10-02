import { blendLabel, dominantEmotions } from "./heart";
import { BASELINE, EMOTIONS, type Activations, type AgentState, type Emotion } from "./state";
import { BANNED_WORDS } from "./lexicon/banned";
import { FEELING_SYNONYMS, feelingFor } from "./lexicon/feelings";
import { PHRASES } from "./lexicon/phrases";
import { PURE_SLANG, WORD_SLANG } from "./lexicon/slang";
import { createCorrector, type SpellContext } from "./lexicon/spelling";
import { isKnownWord, WORD_LIST, wordRank } from "./lexicon/words";

// ---- 1. Clean up the text -------------------------------------------------

// Slang and abbreviations, read as plain words. An empty string drops a filler word.
// Words the user taught win over built-in slang (see normalize).
export const SLANG: Record<string, string> = {
	u: "you",
	ur: "your",
	r: "are",
	y: "why",
	ya: "you",
	yall: "you all",
	im: "i am",
	ive: "i have",
	youre: "you are",
	dont: "do not",
	doesnt: "does not",
	didnt: "did not",
	isnt: "is not",
	arent: "are not",
	cant: "cannot",
	wont: "will not",
	idk: "i do not know",
	thx: "thanks",
	ty: "thank you",
	tysm: "thank you so much",
	pls: "please",
	plz: "please",
	wat: "what",
	whats: "what is",
	hows: "how is",
	wanna: "want to",
	gonna: "going to",
	gotta: "got to",
	kinda: "kind of",
	sorta: "sort of",
	bc: "because",
	cuz: "because",
	tho: "though",
	thru: "through",
	bout: "about",
	lil: "little",
	nvm: "never mind",
	np: "no problem",
	ngl: "not gonna lie",
	tbh: "to be honest",
	imo: "in my opinion",
	rn: "right now",
	fr: "for real",
	smh: "shaking my head",
	irl: "in real life",
	omw: "on my way",
	ttyl: "talk to you later",
	gn: "good night",
	gm: "good morning",
	hru: "how are you",
	hbu: "how about you",
	wbu: "how about you",
	wyd: "what are you doing",
	sup: "what is up",
	wassup: "what is up",
	wazzup: "what is up",
	ily: "i love you",
	ilysm: "i love you so much",
	bruh: "",
	bro: "",
	dude: "",
	fam: "",
	// Missing apostrophes.
	thats: "that is",
	its: "it is",
	wheres: "where is",
	whos: "who is",
	theres: "there is",
	hes: "he is",
	shes: "she is",
	lets: "let us",
	theyre: "they are",
	youve: "you have",
	youll: "you will",
	wasnt: "was not",
	werent: "were not",
	havent: "have not",
	hasnt: "has not",
	shouldnt: "should not",
	wouldnt: "would not",
	couldnt: "could not",
	aint: "am not",
	// Dropped g's: "doin good", "feelin fine".
	doin: "doing",
	goin: "going",
	feelin: "feeling",
	nothin: "nothing",
	somethin: "something",
	// "im chillin" is a mood, so read it as one.
	chillin: "chill",
	chilling: "chill",
	talkin: "talking",
	workin: "working",
	walkin: "walking",
	livin: "living",
	vibin: "vibing",
	sittin: "sitting",
	hangin: "hanging",
	gettin: "getting",
	tryin: "trying",
	thinkin: "thinking",
	sayin: "saying",
	lookin: "looking",
	playin: "playing",
	studyin: "studying",
	eatin: "eating",
	mornin: "morning",
	evenin: "evening",
	// Shorthand and common misspellings.
	wut: "what",
	wot: "what",
	waht: "what",
	wats: "what is",
	whatcha: "what are you",
	watcha: "what are you",
	wuu2: "what are you up to",
	hyd: "how are you doing",
	nm: "not much",
	nmu: "not much you",
	dunno: "do not know",
	ik: "i know",
	lemme: "let me",
	gimme: "give me",
	gotcha: "got it",
	gud: "good",
	gr8: "great",
	luv: "love",
	rly: "really",
	rlly: "really",
	realy: "really",
	srsly: "seriously",
	prolly: "probably",
	probs: "probably",
	def: "definitely",
	obvi: "obviously",
	ofc: "of course",
	btw: "by the way",
	tbf: "to be fair",
	jk: "just kidding",
	omg: "oh my god",
	sm: "so much",
	alot: "a lot",
	abt: "about",
	ppl: "people",
	b4: "before",
	"2day": "today",
	tonite: "tonight",
	"2nite": "tonight",
	tmrw: "tomorrow",
	tmr: "tomorrow",
	tomoz: "tomorrow",
	l8r: "later",
	bday: "birthday",
	msg: "message",
	teh: "the",
	becuase: "because",
	becasue: "because",
	bcuz: "because",
	coz: "because",
	cos: "because",
	sry: "sorry",
	soz: "sorry",
	thnx: "thanks",
	thanx: "thanks",
	thankz: "thanks",
	tyvm: "thank you very much",
	heya: "hey",
	helo: "hello",
	hullo: "hello",
	okie: "okay",
	okey: "okay",
	oki: "okay",
	cya: "see you",
	cu: "see you",
	gtg: "got to go",
	g2g: "got to go",
	nite: "night",
	gnight: "good night",
	u2: "you too",
	lowkey: "kind of",
	highkey: "really",
};

export function normalize(text: string, taught: Record<string, string> = {}, spell: SpellContext | false = {}): string {
	let t = text.toLowerCase().replace(/[’‘]/g, "'");
	t = t
		.replace(/\bcan't\b/g, "cannot")
		.replace(/\bwon't\b/g, "will not")
		.replace(/\blet's\b/g, "let us")
		.replace(/n't\b/g, " not")
		.replace(/\b(it|that|what|who|how|there|here|he|she|where|when|why)'s\b/g, "$1 is")
		.replace(/'m\b/g, " am")
		.replace(/'re\b/g, " are")
		.replace(/'ve\b/g, " have")
		.replace(/'ll\b/g, " will")
		.replace(/'d\b/g, " would");
	const lookUp = (w: string) => own(taught, w) ?? own(SLANG, w) ?? own(PURE_SLANG, w) ?? w;
	const mapped = t
		.replace(/[^\w\s]/g, " ")
		.split(/\s+/)
		.filter(Boolean)
		.map(unstretch)
		.map(lookUp)
		.filter(Boolean)
		.join(" ")
		.split(" ");
	const words =
		spell === false
			? mapped
			: fixTypos(mapped, { recent: spell.recent, protect: protectedWords(text, taught, spell), personal: spell.personal });
	return words
		// A corrected word can itself be slang ("ngl"), so look it up again.
		.map((w, i) => (w === mapped[i] ? w : lookUp(w)))
		.join(" ")
		// "ur" is "your" in "ur name" but "you are" in "ur so smart".
		.replace(/\byour (?=(?:so|really|very|pretty|super|such|not|welcome|right|wrong|the best|kind|nice|smart|sweet|cool|funny|great|awesome|amazing|helpful|stupid|dumb|useless|annoying|mean|weird|good|bad)\b)/g, "you are ")
		.replace(/\s+/g, " ")
		.trim();
}

// Words in a message that Osmo neither recognizes nor would correct: names, in-jokes, new slang.
// normalize() has already fixed typos, so "freind" arrives as "friend" and is recognized.
export function unfamiliarWords(text: string, taught: Record<string, string> = {}, spell: SpellContext = {}): string[] {
	const words = normalize(text, taught, spell).split(" ");
	return [...new Set(words.filter((w) => /^[a-z]{3,}$/.test(w) && !isRecognized(w)))];
}

// Words people stretch for effect ("heyyy", "sooo") and the plain word they mean.
const STRETCHED_TARGETS = new Set(["so", "hi", "hey", "yes", "no", "please", "pls", "good", "cool", "love", "sorry", "okay", "ok", "what", "why", "bye", "nice", "too", "wow", "yay", "ugh", "hmm", "omg"]);

function unstretch(word: string): string {
	if (!/(\w)\1\1/.test(word)) return word;
	const double = word.replace(/(\w)\1{2,}/g, "$1$1");
	const single = word.replace(/(\w)\1{2,}/g, "$1");
	const known = (w: string) => STRETCHED_TARGETS.has(w) || w in SLANG || ALL_FEELINGS.includes(w);
	if (known(double)) return double;
	return known(single) ? single : double;
}

// ---- 2. Work out what kind of sentence it is ------------------------------

export type Intent =
	| { type: "greeting" }
	| { type: "farewell" }
	| { type: "howAreYou" }
	| { type: "askFeeling" }
	| { type: "askWhyFeeling" }
	| { type: "askName" }
	| { type: "askAbilities" }
	| { type: "askActivity" }
	| { type: "thanks" }
	| { type: "apology" }
	| { type: "compliment" }
	| { type: "insult" }
	| { type: "laughter" }
	| { type: "affection" }
	| { type: "creator" }
	| { type: "brb" }
	| { type: "ack" }
	| { type: "incomplete" }
	| { type: "misunderstood" }
	| { type: "askOrigin" }
	| { type: "rudeFeedback" }
	| { type: "sexual" }
	| { type: "slashCommand" }
	| { type: "userFeeling"; feeling: string; positive: boolean }
	| { type: "feelingFromOsmo"; feeling: string; positive: boolean }
	| { type: "unknown" };

export type Parsed = { greeted: boolean; question: boolean; intent: Intent };

export const NEGATIVE_FEELINGS = (
	"sad|down|depressed|lonely|upset|miserable|angry|mad|anxious|worried|scared|stressed|tired|bored|sick|hurt|" +
	"annoyed|frustrated|bummed|gutted|shook|drained|exhausted|overwhelmed|nervous|hopeless|numb|empty|crushed|" +
	"heartbroken|jealous|ashamed|embarrassed|terrible|awful|horrible|rough"
).split("|");
export const POSITIVE_FEELINGS = (
	"happy|great|good|excited|glad|fine|ok|okay|proud|relaxed|thrilled|wonderful|calm|stoked|pumped|hyped|chill|" +
	"blessed|amazing|awesome|better|hopeful|loved|grateful|cheerful|well|alright|swell|decent|fantastic|lovely|" +
	"excellent|peachy|content|solid|superb|splendid"
).split("|");
const ALL_FEELINGS = [...NEGATIVE_FEELINGS, ...POSITIVE_FEELINGS];

// Feeling words Osmo understands but won't say himself: crude words and casual slang. He answers
// the feeling ("I'm sorry you're feeling this way") without repeating the word.
const NOT_SAID = new Set([
	...BANNED_WORDS,
	"pissed", "crappy", "crummy", "cooked", "dope", "rad", "fab", "salty", "chuffed", "knackered", "pooped", "psyched",
	"amped", "buzzing", "comfy", "zen", "fried", "wiped", "blah", "hyped", "stoked", "pumped", "gutted", "bummed", "shook",
	"peachy", "chill",
]);
const sayable = (feeling: string) => !NOT_SAID.has(feeling);

const own = (table: Record<string, string>, word: string) => (Object.hasOwn(table, word) ? table[word] : undefined);
const PHRASE_WORDS = new Set(PHRASES.flatMap((p) => p.split(" ")));
const FEELING_WORDS = new Set([...ALL_FEELINGS, ...Object.keys(FEELING_SYNONYMS)]);

// A word Osmo recognizes: a real word, his slang, a feeling, or part of a phrase he expects.
export const isRecognized = (w: string): boolean =>
	isKnownWord(w) ||
	FEELING_WORDS.has(w) ||
	PHRASE_WORDS.has(w) ||
	own(SLANG, w) !== undefined ||
	own(PURE_SLANG, w) !== undefined ||
	own(WORD_SLANG, w) !== undefined;

// One typo guesser for everything Osmo reads. A word he recognizes is never changed.
const fixTypos = createCorrector({
	known: isRecognized,
	candidates: [...new Set([...WORD_LIST, ...FEELING_WORDS, ...PHRASE_WORDS])],
	rank: wordRank,
	phrases: PHRASES,
	slotWords: FEELING_WORDS,
	banned: BANNED_WORDS,
});

// Words the guesser must leave alone: the context's list, anything the user taught,
// and capitalized words mid-sentence, which are probably names ("my dog Nala").
function protectedWords(text: string, taught: Record<string, string>, spell: SpellContext): Set<string> {
	const keep = new Set<string>(spell.protect ?? []);
	for (const [word, meaning] of Object.entries(taught)) {
		keep.add(word);
		for (const w of meaning.toLowerCase().split(/\s+/)) keep.add(w);
	}
	let sentenceStart = true;
	for (const token of text.split(/\s+/)) {
		const bare = token.replace(/[^A-Za-z]/g, "");
		if (!sentenceStart && /^[A-Z][a-z]+$/.test(bare)) keep.add(bare.toLowerCase());
		if (token) sentenceStart = /[.!?]$/.test(token);
	}
	return keep;
}

function distance(a: string, b: string): number {
	const row = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let prev = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = tmp;
		}
	}
	return row[b.length];
}

// The feeling a word means, forgiving one typo or a cut-off ending ("hapy", "happ").
function matchFeeling(word: string): string | null {
	if (ALL_FEELINGS.includes(word)) return word;
	if (word.length < 4) return null;
	return (
		ALL_FEELINGS.find(
			(f) => f.length >= 4 && (distance(word, f) <= 1 || (f.startsWith(word) && f.length - word.length <= 2)),
		) ?? null
	);
}

const MODIFIERS = String.raw`(?:so |really |very |kind of |a bit |a little |pretty |quite |super )*`;
const USER_FEELING = new RegExp(String.raw`\bi (?:am|feel)\s+(?:feeling\s+|doing\s+)?${MODIFIERS}([a-z]+)\b`);
const FEELING_FROM_OSMO = new RegExp(
	String.raw`\b(?:you|osmo|talking|chatting)\b.*\b(?:made|makes|make)\s+me\s+(?:feel\s+)?${MODIFIERS}([a-z]+)\b`,
);
const NEGATED_FEELING = /\bi (?:am|feel) not\b/;
// Tails that change nothing about what was said: "how have you been lol", "good thanks, you?".
const TRAILING_FILLER =
	/(?:\s+(?:lol|lmao|haha\w*|though|then|man|mate|buddy|dude|pal|not gonna lie|to be honest|honestly|for real))+$/;
// A feeling said on its own, as a reply to "how are you": "good", "pretty good hbu", "not bad".
// Group 1 is the feeling word; no group means a lukewarm "okay".
const BARE_FEELING = new RegExp(
	String.raw`^(?:i am |i feel |i am feeling |i am doing |feeling |doing )?${MODIFIERS}` +
		String.raw`(?:not (?:too |that |so )?bad|could be worse|meh|eh|so so|same as always|([a-z]+))` +
		String.raw`(?: (?:thanks|thank you|and you|how about you|what about you|you))*$`,
);
const GREETING_PREFIX = /^(hi+|hello+|hey+|hiya|yo+|howdy|good morning|good afternoon|good evening)\b\s*/;
// Openers that change nothing: "honestly kind of stressed", "ngl pretty tired".
const LEADING_FILLER = /^(?:(?:honestly|well|um+|uh+|like|i mean|to be honest|not gonna lie|oh|ah|aw+)\s+)+/;

// Sexual messages aimed at Osmo. Plain swearing ("fuck you") is an insult, not this.
const SEXUAL =
	/\b(?:(?:going to|want to|would|will|let me) (?:fuck|screw|bang|smash|rail|have sex with|sleep with) you|(?:fuck|screw|bang|smash|rail)(?:ing)? you (?:raw|hard|all night|so good)|have sex|sex with (?:you|me)|nudes?|sexting|horny|naked pics?|blow ?job|suck my|(?:my|your) (?:dick|cock|pussy|tits|boobs))\b/;
const INSULT =
	/\b(?:you suck|shut up|stfu|i hate you|(?:fuck|screw) (?:you|off)|(?:you are|your|you) (?:(?:so|really|very|such|a|an|the|total|complete|fucking|freaking) )*(?:stupid|dumb|useless|idiot|moron|retard(?:ed)?|trash|garbage|loser|clown|dumbass|pathetic|bitch|dick|cunt|piece of (?:shit|crap)))\b/;
// The user telling Osmo he came across rude: he should own it, not get defensive.
// Only when it is aimed at him ("you", "that was"), not "my boss was so rude".
const CALLED_RUDE =
	/\b(?:you(?: are| were| was)?(?: being)? (?:(?:so|really|kinda|kind of|pretty|very|super|a bit|a little) )*rude|you\b.*\brudely|that was (?:(?:so|really|kinda|pretty|a bit) )*rude)\b/;

export function parse(original: string, taught: Record<string, string> = {}, spell: SpellContext | false = {}): Parsed {
	const question = /\?\s*$/.test(original.trim());
	if (/^\//.test(original.trim())) return { greeted: false, question, intent: { type: "slashCommand" } };
	let words = normalize(original, taught, spell);
	let greeted = false;
	const g = words.match(GREETING_PREFIX);
	if (g) {
		greeted = true;
		words = words.slice(g[0].length).trim();
	}
	words = words.replace(LEADING_FILLER, "").replace(TRAILING_FILLER, "");
	const done = (intent: Intent): Parsed => ({ greeted, question, intent });
	const feelingIntent = (word: string | undefined, type: "userFeeling" | "feelingFromOsmo"): Parsed | null => {
		if (!word) return null;
		// A thesaurus word keeps the user's own word ("gloomy"); its mapped feeling says if it is good or bad.
		const base = ALL_FEELINGS.includes(word) ? null : feelingFor(word);
		if (base) return done({ type, feeling: word, positive: POSITIVE_FEELINGS.includes(base) });
		const feeling = matchFeeling(word);
		return feeling ? done({ type, feeling, positive: POSITIVE_FEELINGS.includes(feeling) }) : null;
	};

	if (words === "") return done(greeted ? { type: "greeting" } : { type: "unknown" });
	if (SEXUAL.test(words)) return done({ type: "sexual" });
	if (/^(bye|goodbye|see you|good night|goodnight|later|got to go|talk to you later)\b/.test(words)) return done({ type: "farewell" });
	if (
		(/^why (?:are you|do you (?:feel|seem)|is your mood)\b/.test(words) &&
			/\b(?:feel|feeling|seem|sad|down|upset|happy|angry|mad|lonely|bored|tired|anxious|worried|depressed|moody|different)\b/.test(words)) ||
		/^what is wrong( with you)?$/.test(words)
	) {
		return done({ type: "askWhyFeeling" });
	}
	if (/^(how are you feeling|how do you feel|what are you feeling|are you (?:ok|okay|sad|happy|upset|angry|feeling))\b/.test(words)) {
		return done({ type: "askFeeling" });
	}
	// "ok" and "cool" on their own are acknowledgements, not moods.
	const bare = /^(ok|okay|cool|nice)$/.test(words) ? null : words.match(BARE_FEELING);
	const bareFeeling = bare && (bare[1] ? feelingIntent(bare[1], "userFeeling") : done({ type: "userFeeling", feeling: "okay", positive: true }));
	if (bareFeeling) return bareFeeling;
	if (
		/^(how (?:are )?you( doing| going| feeling)?( today| now| right now| tonight)?|how (?:have )?you been|how is it going|how is (your day|life|everything|things)( going)?|what is (up|good|new)|how about you|what about you|and you)$/.test(words)
	) {
		return done({ type: "howAreYou" });
	}
	if (/^what are you (doing|up to)( now| right now)?$/.test(words)) return done({ type: "askActivity" });
	if (
		/\b(your (?:story|backstory|origin)|where (?:do|did) you come from|where are you from|(?:tell me )?about yourself|how were you (?:made|born|built)|who (?:made|built|created) you|are you (?:a |an )?(?:bot|robot|ai|human|real|person)|what are you made of|who are you really|what is your personality|tell me about your personality|what makes you you)\b/.test(words) ||
		/^what are you$/.test(words)
	) {
		return done({ type: "askOrigin" });
	}
	if (/\b(your name|who are you|what are you called|what should i call you)\b/.test(words)) return done({ type: "askName" });
	if (/^(what can you do|what do you do|how can you help|what are you good at|help)\b/.test(words)) {
		return done({ type: "askAbilities" });
	}
	if (/\bi (?:made|built|created|programmed) you\b/.test(words)) return done({ type: "creator" });
	if (/\b(thanks|thank you|appreciate)\b/.test(words)) return done({ type: "thanks" });
	if (/^(i am )?(sorry|my bad|apologies)\b/.test(words)) return done({ type: "apology" });
	if (INSULT.test(words)) return done({ type: "insult" });
	if (CALLED_RUDE.test(words)) return done({ type: "rudeFeedback" });
	if (/\byou are (?:so |really |very )?(nice|kind|smart|great|awesome|amazing|funny|sweet|cool|helpful)\b/.test(words)) {
		return done({ type: "compliment" });
	}
	if (/^(lol|lmao|lmfao|haha+|hehe+|rofl)\b/.test(words)) return done({ type: "laughter" });
	if (/^(i love you|love you|i love you so much)$/.test(words)) return done({ type: "affection" });
	// The user is frustrated that Osmo missed their point.
	if (
		/\b(what part|you (?:do not|did not) (?:understand|get)|are you (?:even )?listening)\b/.test(words) ||
		/^(what do you mean|what|huh|wdym|what are you talking about)$/.test(words)
	) {
		return done({ type: "misunderstood" });
	}
	if (/^(brb|be right back|one sec|one second|hold on)$/.test(words)) return done({ type: "brb" });
	if (!NEGATED_FEELING.test(words)) {
		const fromOsmo = feelingIntent(words.match(FEELING_FROM_OSMO)?.[1], "feelingFromOsmo");
		if (fromOsmo) return fromOsmo;
		const own = feelingIntent(words.match(USER_FEELING)?.[1], "userFeeling");
		if (own) return own;
	}
	if (/^(ok|okay|k|kk|cool|nice|bet|ikr|word|true|got it|makes sense|sure|fair|fair enough|i see|i know|same|facts|gotcha|mhm|oh|(?:not|nothing) much(?: you| how about you)?|nothing)$/.test(words)) return done({ type: "ack" });
	if (/^(you are|i am|i feel|you|i|it is|this is)$/.test(words)) return done({ type: "incomplete" });
	return done({ type: "unknown" });
}

// Where one thought ends and the next begins: "im good and i made you", "hi, whats your name".
const CLAUSE_BREAK = /\s*(?:[.!?;,]+|\band\b|\bbut\b|\balso\b|\bplus\b)\s*/i;
// Parts that only make sense on their own; beside anything else they would get their own clumsy answer.
const MINOR = new Set<Intent["type"]>(["greeting", "ack", "incomplete", "unknown"]);

// Everything Osmo recognizes in a message, one part per thought (at most three). Empty if nothing is recognized.
export function understand(original: string, taught: Record<string, string> = {}, spell: SpellContext | false = {}): Parsed[] {
	const whole = parse(original, taught, spell);
	const clauses = original.split(CLAUSE_BREAK).filter((c) => c.trim() !== "");
	if (clauses.length > 1) {
		const seen = new Set<string>();
		const parts = clauses
			.map((c) => parse(c, taught, spell))
			.filter((p) => !MINOR.has(p.intent.type) && !seen.has(p.intent.type) && seen.add(p.intent.type));
		if (parts.length > 1) {
			parts[0] = { ...parts[0], greeted: parts[0].greeted || whole.greeted };
			return parts.slice(0, 3);
		}
	}
	return whole.intent.type === "unknown" ? [] : [whole];
}

// Joins answers to several parts, keeping a question only on the last so Osmo asks one thing at a time.
export function combineReplies(replies: string[]): string {
	return replies
		.map((r, i) => {
			if (i === replies.length - 1) return r;
			const statement = r.replace(/\s*[^.!?]*\?$/, "");
			return statement === "" ? r : statement;
		})
		.join(" ");
}

// Why Osmo would feel the way it does: the clause after "because".
export function causeOf(intent: Intent): string | null {
	if (intent.type !== "userFeeling") return null;
	return sayable(intent.feeling) ? `you told me you were ${intent.feeling}` : "you told me how you were feeling";
}

// ---- 3. Say how it feels, in words ----------------------------------------

const ADJECTIVE: Record<Emotion, string> = {
	joy: "happy",
	sadness: "sad",
	anger: "angry",
	fear: "anxious",
	trust: "at ease",
	disgust: "disgusted",
	surprise: "surprised",
	love: "affectionate",
	hope: "hopeful",
	guilt: "guilty",
	loneliness: "lonely",
	boredom: "bored",
};

// A mood label ("sadness", "joy and trust") in adjectives ("sad", "happy and at ease"). "calm", a named blend
// ("bittersweet") and any word that isn't an emotion stay as they are.
export function feelingWords(label: string): string {
	const toAdjective = (name: string) => ((EMOTIONS as readonly string[]).includes(name) ? ADJECTIVE[name as Emotion] : name);
	return label.split(" and ").map(toAdjective).join(" and ");
}

export function feelingPhrase(a: Activations, baseline: Activations = BASELINE): string {
	return feelingWords(blendLabel(dominantEmotions(a, 3, baseline)));
}

// ---- 4. Answer in proper sentences ----------------------------------------

export type TalkContext = {
	state: AgentState;
	cause: string | null;
	turn: number;
	userName?: string | null;
	baseline?: Activations;
	// How the last day has felt, in words ("a little low"); absent or empty says nothing. Never set for a guest.
	mood?: string;
};

const pick = <T>(options: T[], turn: number): T => options[turn % options.length];

export function respond(parsed: Parsed, ctx: TalkContext): string | null {
	const { intent, greeted } = parsed;
	const { turn, userName } = ctx;
	const feeling = feelingPhrase(ctx.state.activations, ctx.baseline);
	const calm = feeling === "calm";
	const shownName = userName ? userName.charAt(0).toUpperCase() + userName.slice(1) : "";
	const withName = shownName ? ` ${shownName}` : "";

	switch (intent.type) {
		case "greeting":
			return calm
				? `${pick(["Hello", "Good to see you", "Welcome back"], turn)}${shownName ? `, ${shownName}` : ""}. How can I help?`
				: `Hello${shownName ? `, ${shownName}` : ""}. I'll admit I'm feeling ${feeling} today. How are you?`;
		case "farewell":
			return pick([`Goodbye${withName}. Take care.`, `Until next time${withName}.`], turn);
		case "howAreYou": {
			const day = ctx.mood ? ` Over the day I have felt ${ctx.mood}.` : "";
			return calm ? `I'm doing well, thank you.${day} How are you?` : `Honestly, I'm feeling ${feeling}.${day} How are you?`;
		}
		case "askActivity":
			return "I'm here and ready to help. What are you working on?";
		case "askFeeling":
		case "askWhyFeeling": {
			if (calm) return "I'm calm at the moment. Nothing in particular is stirring. Why do you ask?";
			const why = ctx.cause
				? ` I believe it's because ${ctx.cause}.`
				: " I'm not entirely sure why. It built up over our conversation.";
			return `I'm feeling ${feeling}.${why} Thank you for asking.`;
		}
		case "askName":
			return userName ? `I'm Osmo. And you're ${shownName}, I remember.` : "I'm Osmo. What should I call you?";
		case "askAbilities":
			return "I can hold a conversation, remember what you tell me, define words, do quick math, work through moral dilemmas and tell stories. You can also ask me about myself. Where would you like to start?";
		case "thanks":
			return pick(["You're welcome.", "Happy to help.", "Anytime."], turn);
		case "apology":
			return pick(["No need to apologize.", "That's quite all right. Thank you for saying so."], turn);
		case "compliment":
			return pick(["Thank you. That's kind of you.", "I appreciate that, thank you."], turn);
		case "insult":
			return pick(
				[
					"That's a little harsh. If I got something wrong, tell me what, and I'll do better.",
					"I'd rather we kept things civil. What's actually bothering you?",
				],
				turn,
			);
		case "rudeFeedback":
			return pick(
				[
					"You're right, that came across as rude. My apologies. Shall we start over?",
					"Fair point. That wasn't my best start, and I apologize. How can I help?",
				],
				turn,
			);
		case "sexual":
			return "I won't engage with that. I'm happy to help with almost anything else.";
		case "slashCommand":
			return "There are no slash commands here. Just talk to me normally. I can chat, remember things, define words, do quick math, tell a story, pose a moral dilemma, or tell you about myself.";
		case "laughter":
			return pick(["Glad that amused you.", "I'll take that as a compliment."], turn);
		case "affection":
			return "That means a great deal. I care about you too.";
		case "creator":
			return "You made me? Then I owe you my existence. Thank you.";
		case "brb":
			return "Of course. I'll be here.";
		case "ack":
			return pick(["Understood. What's next?", "Very well. Is there anything else on your mind?"], turn);
		case "incomplete":
			return "Go on, I'm listening.";
		case "askOrigin":
			return "I am Osmo, one character, written by a group of students. Everything I feel and remember comes from conversations like this one.";
		case "misunderstood":
			return pick(
				[
					"My apologies, I misunderstood. I'm still learning how people phrase things. Could you put it more simply?",
					"That's fair. I only recognize some phrasings so far. A shorter version would help.",
				],
				turn,
			);
		case "feelingFromOsmo": {
			const said = sayable(intent.feeling);
			if (intent.positive) {
				return said
					? `That means a great deal. I'm glad talking with me makes you feel ${intent.feeling}.`
					: "That means a great deal. I'm glad talking with me helps.";
			}
			return said
				? `I'm sorry I made you feel ${intent.feeling}. Tell me what went wrong, and I'll do better.`
				: "I'm sorry I upset you. Tell me what went wrong, and I'll do better.";
		}
		case "userFeeling": {
			const hello = greeted ? "Hello. " : "";
			const f = intent.feeling;
			const said = sayable(f);
			return intent.positive
				? hello + pick([
						said ? `I'm glad you're feeling ${f}. What's made it a good day?` : "I'm glad to hear it. What's made it a good day?",
						"That's good to hear. What's been going well?",
					], turn)
				: hello + pick([
						said
							? `I'm sorry you're feeling ${f}. Would you like to talk about what's going on?`
							: "I'm sorry you're feeling this way. Would you like to talk about what's going on?",
						said
							? `That sounds difficult. I'm here if you'd like to talk about why you're feeling ${f}.`
							: "That sounds difficult. I'm here if you'd like to talk about it.",
					], turn);
		}
		case "unknown":
			return null;
	}
}

// `turn` should step by one per exchange, so consecutive misses never get the same line.
// Said to a guest who tries to teach Osmo a fact or a word: only his owner's notes are kept.
export const GUEST_NO_NOTES = "I'm afraid I can only remember things for the person I belong to.";

// A guest gets the same fallbacks, minus the offer to learn a word from them.
export function fallbackReply(turn: number, text = "", guest = false): string {
	if (/\?\s*$/.test(text.trim())) {
		return pick(
			[
				"That's a good question, but I don't have an answer yet. Could you ask it another way?",
				"I'm afraid that's beyond me for now. Could you try a simpler question?",
				"I can't answer that one yet. Is there something else I can help with?",
			],
			turn,
		);
	}
	return pick(
		[
			"I'm not sure I follow. Could you rephrase that?",
			"I didn't quite catch that. Could you say it another way?",
			"That's new to me. What do you mean?",
			guest
				? "I don't recognize that, I'm afraid. Could you put it another way?"
				: "I don't recognize that. If it's a word I haven't learned, tell me what it means.",
		],
		turn,
	);
}
