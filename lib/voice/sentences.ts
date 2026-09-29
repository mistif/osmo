// Cutting a reply into the pieces Osmo speaks one at a time.
// Each piece keeps the character offsets it came from, so the room can still reveal his words
// against the whole reply while the audio for one sentence plays.

export type SpokenChunk = {
	text: string;
	// Offsets into the reply this chunk was cut from: `reply.slice(start, end) === text`.
	start: number;
	end: number;
	// Silence after this chunk, like a breath. Zero on the last one.
	gapMs: number;
};

// A breath between sentences. A question or an exclamation lands a little longer.
export const GAP_AFTER: Record<string, number> = { ".": 300, "!": 380, "?": 380 };

// The most characters one request may carry. `/api/speak` rejects more, so a long
// sentence is cut at a word instead of being refused.
export const MAX_SPEAK_CHARS = 400;

// A title is always followed by a name, so its full stop never ends a sentence.
const TITLES = new Set(["mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr", "capt", "sgt"]);

// These may end a sentence or sit inside one ("biscuits, etc. Then sit." against "e.g. this one"),
// so a capital letter after them decides it.
const SHORTENINGS = new Set(["vs", "etc", "no", "approx", "dept", "est", "e.g", "i.e", "a.m", "p.m"]);

// A run of marks that has whitespace or the end of the text after it. "3.50" never matches,
// because a digit follows its stop.
const ENDING = /[.!?]+(?=\s|$)/g;

const WORD_BEFORE = /([A-Za-z](?:[A-Za-z.]*[A-Za-z])?)\.?$/;

// True when this stop belongs to an abbreviation ("Mr.", "e.g.") rather than ending a sentence.
function abbreviates(text: string, stop: number): boolean {
	const word = WORD_BEFORE.exec(text.slice(0, stop));
	if (word === null) return false;
	const short = word[1].toLowerCase();
	if (TITLES.has(short)) return true;
	if (!SHORTENINGS.has(short)) return false;
	// A new sentence starts with a capital; anything else continues this one.
	const next = /\S/.exec(text.slice(stop + 1));
	return next !== null && next[0] === next[0].toLowerCase();
}

// The chunk for `text.slice(start, end)` with the surrounding whitespace left out.
function trimmedChunk(text: string, start: number, end: number, gapMs: number): SpokenChunk | null {
	let from = start;
	let to = end;
	while (from < to && /\s/.test(text[from])) from += 1;
	while (to > from && /\s/.test(text[to - 1])) to -= 1;
	if (from === to) return null;
	return { text: text.slice(from, to), start: from, end: to, gapMs };
}

// One chunk that no request would accept, cut at the last word that fits.
function withinLimit(text: string, chunk: SpokenChunk): SpokenChunk[] {
	if (chunk.text.length <= MAX_SPEAK_CHARS) return [chunk];
	const pieces: SpokenChunk[] = [];
	let at = chunk.start;
	while (chunk.end - at > MAX_SPEAK_CHARS) {
		const window = text.slice(at, at + MAX_SPEAK_CHARS);
		const space = window.lastIndexOf(" ");
		// A single word longer than the limit has nowhere to break, so it breaks mid-word.
		const cut = space > 0 ? space : MAX_SPEAK_CHARS;
		const piece = trimmedChunk(text, at, at + cut, 0);
		if (piece) pieces.push(piece);
		at += cut + 1;
	}
	const last = trimmedChunk(text, at, chunk.end, chunk.gapMs);
	if (last) pieces.push(last);
	return pieces;
}

// The reply, cut into what he says one clip at a time. Blank text gives nothing to say.
export function splitSentences(reply: string): SpokenChunk[] {
	const chunks: SpokenChunk[] = [];
	let from = 0;
	ENDING.lastIndex = 0;
	for (let match = ENDING.exec(reply); match !== null; match = ENDING.exec(reply)) {
		const run = match[0];
		const stop = match.index;
		if (run === "." && abbreviates(reply, stop)) continue;
		const end = stop + run.length;
		const chunk = trimmedChunk(reply, from, end, GAP_AFTER[run[run.length - 1]] ?? 0);
		if (chunk) chunks.push(chunk);
		from = end;
	}
	// Anything after the last ending: a reply with no punctuation at all, or a trailing fragment.
	const rest = trimmedChunk(reply, from, reply.length, 0);
	if (rest) chunks.push(rest);
	// The last thing he says is followed by silence, not a breath.
	const last = chunks.at(-1);
	if (last) last.gapMs = 0;
	return chunks.flatMap((chunk) => withinLimit(reply, chunk));
}
