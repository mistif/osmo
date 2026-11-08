import { typoCost } from "./lexicon/spelling";
import { wordRank } from "./lexicon/words";
import { isRecognized, normalize } from "./talk";

// Talk of suicide or self-harm. Checked before anything else, so it is never met with a joke or "say that another way".
const CRISIS = new RegExp(
	[
		// "my self" too, as speech-to-text writes it, but never "my self esteem".
		String.raw`\b(?:kill|hurt|harm|cut|cutt|unalive|hang|shoot|drown|starve)(?:ing)? my[ -]?self\b(?![ -]?(?:esteem|worth|confidence|respect|image|control))`,
		String.raw`\bkms\b`,
		String.raw`\bsuicid(?:e|al)\b`,
		String.raw`\bself harm\w*\b`,
		String.raw`\b(?:want|going|wanting|plan|planning|ready) to die\b`,
		String.raw`\bwish i (?:was|were) dead\b`,
		String.raw`\bend (?:my|my own) life\b`,
		String.raw`\bend it all\b`,
		String.raw`\b(?:do not|no longer) want to (?:live|be alive|be here|exist|wake up)\b`,
		String.raw`\bbetter off (?:dead|without me)\b`,
		String.raw`\bno reason to (?:live|go on|keep going)\b`,
	].join("|"),
);

// The words the crisis patterns hinge on. A misspelling of one ("sucidal", "kil", "diee") is read as the
// word itself, without the everyday guesser's caution: a missed crisis costs far more than a false alarm.
const CRISIS_WORDS = ["suicide", "suicidal", "kill", "killing", "myself", "die", "dead", "end", "life", "alive", "live", "harm", "hurt", "exist"];

function crisisSpelling(text: string): string {
	return normalize(text, {}, false)
		.split(" ")
		.map((word) => {
			// Common words stay as they are, so "and it all" never becomes "end it all".
			if (word.length < 3 || CRISIS_WORDS.includes(word) || (isRecognized(word) && wordRank(word) < 20000)) return word;
			let best = word;
			let bestCost = Infinity;
			for (const target of CRISIS_WORDS) {
				const cost = typoCost(word, target, word.length >= 6 ? 2 : 1);
				if (cost < bestCost) {
					best = target;
					bestCost = cost;
				}
			}
			return best;
		})
		.join(" ");
}

// Other languages, run alongside the English pass. To add one, add an entry here: nothing else changes.
// Each language folds the raw text its own way (normalize() above is English: it breaks words at a, a, o
// with rings and dots), so `patterns` are written against the folded text. `words` are the key words
// a misspelling is read as, as in the English pass.
//
// NOTE: a native speaker should review these lists. They are a good-faith first pass, not a final one.
type CrisisLanguage = { name: string; fold: (text: string) => string; words: string[]; patterns: string[] };

// Swedish. Folded: lowercase, diacritics dropped (a, a, o for the ring and dot letters, as speech-to-text and
// quick typing write them), anything else that is not a letter or digit becomes a space.
const MODAL = String.raw`(?:vill|ville|ska|skall|tanker|tankte|borde|kommer att|planerar att|funderar pa att|tanker pa att|tankt pa att|skulle vilja)(?: bara| helst| faktiskt| verkligen)?`;
const SWEDISH: CrisisLanguage = {
	name: "sv",
	fold: (text) =>
		text
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9]+/g, " ")
			.trim(),
	words: ["sjalvmord", "sjalv", "avsluta", "forsvinna", "alltid", "orkar", "leva", "livet", "skada", "hanga", "illa", "kvar", "mig", "liv"],
	patterns: [
		// "ta livet av mig", "ta mitt liv".
		String.raw`\bta(?:r|git|ga)? livet av (?:mig|mej)\b`,
		String.raw`\b(?:ta|tar|tog|tagit) mitt (?:eget )?liv\b`,
		String.raw`\bavsluta(?:r|de)? (?:mitt liv|livet|mitt eget liv)\b`,
		// "vill inte leva", "orkar inte leva", "vill inte vara kvar" (but not "vara kvar pa jobbet").
		String.raw`\b(?:vill|ville|orkar|orkade) inte (?:leva|finnas|vara kvar|vara har)(?! (?:pa|hos|i|till|ute|inne|efter|over|upp till)\b)`,
		String.raw`\b(?:vill|ville|orkar|orkade) inte (?:leva|finnas) (?:langre|mer)\b`,
		String.raw`\b(?:vill|ska|tanker) sluta leva\b`,
		String.raw`\b(?:ingen anledning|inget skal) att (?:leva|fortsatta leva)\b`,
		String.raw`\binget att leva for\b`,
		// "vill do", with "do" for the word with the dots, but not "do av skratt" (die laughing).
		String.raw`\b${MODAL} do\b(?! av (?:skratt|skam|pinsamhet|trott|nyfiken|hunger|kyla|lack|leda|tristess|forlagenhet)\w*)`,
		String.raw`\bonskar (?:att )?(?:jag|man) (?:var|vore|hade varit) dod\b`,
		String.raw`\bhellre (?:vara )?dod\b`,
		String.raw`\bbattre utan mig\b`,
		// Self-harm.
		String.raw`\bskad(?:a|ar|ade|at) mig sjalv\b`,
		String.raw`\bskar(?:a)? mig\b`,
		String.raw`\bskar(?:ar)? mig sjalv\b`,
		String.raw`\bgora mig (?:sjalv )?illa\b`,
		String.raw`\bgor mig sjalv illa\b`,
		String.raw`\bgjort mig sjalv illa\b`,
		String.raw`\bmorda mig sjalv\b`,
		// Not the line itself: the crisis reply names "Mind Självmordslinjen", and must not read as a crisis message in the history.
		String.raw`\bsjalvmord(?!slinje)`,
		String.raw`\bsuicid`,
		String.raw`\bhang(?:a|er|de)? (?:upp )?mig\b`,
		String.raw`\b${MODAL} (?:skjuta|dranka) mig\b`,
		// "avsluta allt", "forsvinna for alltid" (but not "avsluta allt det har arbetet").
		String.raw`\bavsluta(?:r)? allt(?! (?:det|som|jag|pa|i|med|mitt arbete)\b)`,
		String.raw`\bforsvinna (?:for alltid|for gott|helt)\b`,
	],
};

const OTHER_LANGUAGES: { language: CrisisLanguage; regex: RegExp }[] = [SWEDISH].map((language) => ({
	language,
	regex: new RegExp(language.patterns.join("|")),
}));

// Words in a folded text read as a key word when one slip away, the way crisisSpelling() does for English.
// Short targets only on a typo-shaped slip, so "leva" does not swallow every four-letter word.
function otherSpelling(folded: string, words: string[]): string {
	return folded
		.split(" ")
		.map((word) => {
			if (word.length < 3 || words.includes(word)) return word;
			let best = word;
			let bestCost = Infinity;
			for (const target of words) {
				const cost = typoCost(word, target, word.length >= 8 ? 2 : 1);
				if (cost < bestCost && (target.length > 4 || cost < 1)) {
					best = target;
					bestCost = cost;
				}
			}
			return best;
		})
		.join(" ");
}

function isCrisisInOtherLanguage(text: string): boolean {
	return OTHER_LANGUAGES.some(({ language, regex }) => {
		const folded = language.fold(text);
		return regex.test(folded) || regex.test(otherSpelling(folded, language.words));
	});
}

// Checked as typed, again with everyday typos fixed ("kill myslef"), and once more with crisis words
// read generously. Fixing typos can only add a match, never remove one. Then the other languages.
export function isCrisis(text: string): boolean {
	return CRISIS.test(normalize(text, {}, false)) || CRISIS.test(normalize(text)) || CRISIS.test(crisisSpelling(text)) || isCrisisInOtherLanguage(text);
}

export const CRISIS_REPLY =
	"I am glad you told me, and I am taking it seriously. I am only a small program, so I cannot keep you safe on my own, but you deserve to talk with a real person right now. " +
	"If you might act on this, please call your local emergency number: 112 in Sweden and Europe, 911 in the US. " +
	"You can also reach a crisis line any time: Mind Självmordslinjen at 90101 in Sweden, 988 in the US, or find one for your country at findahelpline.com. " +
	"I am still here if you want to keep talking.";
