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

// Checked as typed, again with everyday typos fixed ("kill myslef"), and once more with crisis words
// read generously. Fixing typos can only add a match, never remove one.
export function isCrisis(text: string): boolean {
	return CRISIS.test(normalize(text, {}, false)) || CRISIS.test(normalize(text)) || CRISIS.test(crisisSpelling(text));
}

export const CRISIS_REPLY =
	"I'm really glad you told me, and I'm taking it seriously. I'm only a small program, so I can't keep you safe on my own, but you deserve to talk with a real person right now. " +
	"If you might act on this, please call your local emergency number (112 in Sweden and Europe, 911 in the US). " +
	"You can also reach a crisis line any time: Mind Självmordslinjen at 90101 in Sweden, 988 in the US, or find one for your country at findahelpline.com. " +
	"I'm still here if you want to keep talking.";
