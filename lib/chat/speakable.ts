// The model's reply, made fit for Osmo to say: no markdown, lists, emoji or symbols a voice would
// read out, and short. Pure, so the route can check every reply the same way before answering.

export const MAX_SENTENCES = 3;
export const MAX_REPLY_CHARS = 400;

// The all-uppercase word CRISIS standing alone, anywhere in the reply.
const CRISIS_WORD = /(^|[^A-Za-z])CRISIS([^A-Za-z]|$)/;

// A sentence ends at . ! or ?, perhaps with closing quotes, brackets or markdown marks after it,
// before a space or the end. "3.50" never matches, because a digit follows its stop.
const SENTENCE_END = /[.!?]+["'”’»)\]}*_`]*(?=\s|$)/g;
// A title is always followed by a name, and "vs." by its other side, so their full stop never ends a sentence
// ("Dr. Patel", "Arsenal vs. Chelsea").
const TITLE = /(?:^|[^A-Za-z])(?:mr|mrs|ms|dr|prof|vs)$/i;
// With more text after it, a full stop is inside the sentence when it closes a dotted abbreviation ("U.S.", "a.m.",
// "e.g.") or a lone capital initial ("John F. Kennedy"). At the very end of the text it still ends one ("at 9 a.m.").
const DOTTED = /(?:^|[^\p{L}])(?:\p{L}\.)+\p{L}$/u;
const INITIAL = /(?:^|\s)\p{Lu}$/u;

// A code fence, or a line that only draws a rule ("---", "***").
const FENCE_OR_RULE = /^\s*(?:```.*|(?:[-*_=~]\s*){3,})$/;
// What starts a heading or a list item: "## ", "- ", "* ", "• ", "1. ", "2) ".
const BLOCK_START = /^\s*(?:#{1,6}\s+|[-*+•◦▪‣]\s+|\d{1,3}[.)]\s+)/;
// A line that already ends like a sentence or a clause.
const ENDS_CLAUSE = /[.!?:;,]["'”’»)\]}*_`]*$/;
// A markdown link or image: only its text is said.
const LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
// Pictographs, skin tones and flag letters take a space, so the words around them stay apart.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}]/gu;
// The invisible pieces that join or style them (joiner, variation selectors, keycap, tags).
const EMOJI_JOINERS = /[‍︎️⃣\u{e0020}-\u{e007f}]/gu;
// Markdown marks, brackets and symbols a voice would read out ("asterisk", "hash", "arrow").
const SYMBOLS = /[*_~^|\\#`()[\]{}<>•◦▪‣←-⇿]/g;
// Something a voice can actually say.
const SAYABLE = /[\p{L}\p{N}]/u;

// True when the model answered CRISIS: the reply's letters alone spell it, in any case
// ("**Crisis.**"), or the all-uppercase word stands alone ("CRISIS I'm sorry…").
// "Crisis management is a field…" is neither.
export function isCrisisFlag(raw: string): boolean {
	return raw.replace(/\P{L}/gu, "").toLowerCase() === "crisis" || CRISIS_WORD.test(raw);
}

// Where each sentence of the text ends, as offsets just past its closing marks.
function sentenceEnds(text: string): number[] {
	const ends: number[] = [];
	for (const match of text.matchAll(SENTENCE_END)) {
		const end = match.index + match[0].length;
		if (match[0] === ".") {
			const before = text.slice(Math.max(0, match.index - 12), match.index);
			if (TITLE.test(before)) continue;
			const more = text.slice(end).trim() !== "";
			if (more && (DOTTED.test(before) || INITIAL.test(before))) continue;
		}
		ends.push(end);
	}
	return ends;
}

// A reply the model was cut off in, kept up to its last full sentence. Nothing if none ended.
export function lastFullSentence(text: string): string {
	const end = sentenceEnds(text).at(-1);
	return end === undefined ? "" : text.slice(0, end).trim();
}

// Markdown, lists, emoji and symbols out; whitespace joined.
function plain(raw: string): string {
	const lines = raw.split(/\r?\n/).map((line) => {
		if (FENCE_OR_RULE.test(line)) return "";
		const start = BLOCK_START.exec(line);
		if (start === null) return line;
		// A heading or a list item stands alone, so it's said as a sentence of its own.
		const body = line.slice(start[0].length).trim();
		return body === "" || ENDS_CLAUSE.test(body) ? body : `${body}.`;
	});
	return lines
		.join(" ")
		.replace(LINK, "$1")
		.replace(EMOJI_JOINERS, "")
		.replace(EMOJI, " ")
		.replace(SYMBOLS, " ")
		.replace(/\s+/g, " ")
		.replace(/ (?=[.,!?;:])/g, "")
		.trim();
}

// A first sentence too long to say whole: cut at the last word that fits, closed with a full stop.
function cutAtWord(sentence: string): string {
	const head = sentence.slice(0, MAX_REPLY_CHARS - 1);
	const space = head.lastIndexOf(" ");
	const kept = space > 0 ? head.slice(0, space) : head;
	return `${kept.replace(/[\s,;:…–—-]+$/, "")}.`;
}

// At most MAX_SENTENCES sentences and MAX_REPLY_CHARS characters, dropping whole sentences from the
// end, so the first one (where a milestone goes) always stays.
function fitted(text: string): string {
	const ends = sentenceEnds(text);
	// Words after the last full stop count as one more sentence, the first to go.
	const cuts = ends.at(-1) === text.length ? ends : [...ends, text.length];
	for (let count = Math.min(cuts.length, MAX_SENTENCES); count > 0; count -= 1) {
		const kept = text.slice(0, cuts[count - 1]);
		if (kept.length <= MAX_REPLY_CHARS) return kept;
	}
	return cutAtWord(text.slice(0, cuts[0]));
}

// The reply as Osmo says it, or "" when nothing speakable is left.
export function speakable(raw: string): string {
	const text = plain(raw);
	if (!SAYABLE.test(text)) return "";
	const reply = fitted(text);
	return SAYABLE.test(reply) ? reply : "";
}
