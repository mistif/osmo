// Educated guesses for misspelled words: how close the spelling is, how common the word is,
// and context (the phrase it sits in, the kind of word expected there, and what was said recently).

export type SpellContext = {
	// Words from the last few messages; a guess that matches one is likelier.
	recent?: readonly string[];
	// Words that must never change: the user's name, words they taught, names in the message.
	protect?: ReadonlySet<string>;
	// How often the user has used words Osmo didn't know. At MIN_USES a word is theirs.
	personal?: ReadonlyMap<string, number>;
};

export type SpellConfig = {
	known: (word: string) => boolean; // recognized words are never changed
	candidates: readonly string[]; // possible guesses
	rank: (word: string) => number; // 0 = most common
	phrases: readonly string[]; // phrases Osmo expects, as normalized text
	slotWords: ReadonlySet<string>; // words expected after "i am", "i feel", "feeling"
	banned: ReadonlySet<string>; // never offered as a guess
};

// Messages a word must appear in before Osmo treats it as the user's own.
export const MIN_USES = 2;

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
// Keys next to each other on a QWERTY keyboard, including the staggered rows above and below.
const NEIGHBORS = new Map<string, Set<string>>();
ROWS.forEach((row, r) => {
	[...row].forEach((key, c) => {
		const near = [row[c - 1], row[c + 1], ROWS[r - 1]?.[c], ROWS[r - 1]?.[c + 1], ROWS[r + 1]?.[c - 1], ROWS[r + 1]?.[c]];
		NEIGHBORS.set(key, new Set(near.filter((k): k is string => !!k)));
	});
});

// Edit distance where typo-shaped slips cost 0.6 instead of 1: swapping two letters, doubling or
// dropping a repeated letter, and hitting the key next door. Infinity once it passes `max`.
export function typoCost(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return Infinity;
	const d: number[][] = [];
	for (let i = 0; i <= a.length; i++) d.push([i, ...new Array<number>(b.length).fill(0)]);
	for (let j = 0; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		let rowBest = Infinity;
		for (let j = 1; j <= b.length; j++) {
			const x = a[i - 1];
			const y = b[j - 1];
			const sub = x === y ? 0 : NEIGHBORS.get(x)?.has(y) ? 0.6 : 1;
			const drop = x === a[i - 2] ? 0.6 : 1;
			const add = y === b[j - 2] ? 0.6 : 1;
			let v = Math.min(d[i - 1][j] + drop, d[i][j - 1] + add, d[i - 1][j - 1] + sub);
			if (i > 1 && j > 1 && x !== y && x === b[j - 2] && a[i - 2] === y) v = Math.min(v, d[i - 2][j - 2] + 0.6);
			d[i][j] = v;
			rowBest = Math.min(rowBest, v);
		}
		if (rowBest > max + 1e-9) return Infinity;
	}
	const cost = d[a.length][b.length];
	return cost <= max + 1e-9 ? cost : Infinity;
}

// Which letters a word contains, one bit per letter.
function letterMask(word: string): number {
	let mask = 0;
	for (let i = 0; i < word.length; i++) mask |= 1 << (word.charCodeAt(i) - 97);
	return mask;
}

function bitCount(n: number): number {
	let count = 0;
	for (let v = n; v !== 0; v &= v - 1) count++;
	return count;
}

// Longer words can take one more slip.
const maxEdits = (word: string) => (word.length >= 7 ? 2 : 1);

const MODIFIERS = new Set(["so", "really", "very", "super", "pretty", "kind", "of", "a", "bit", "little", "quite"]);

// True right after "i am", "i feel" or "feeling", allowing "so", "really" and the like in between.
function inFeelingSlot(words: readonly string[], i: number): boolean {
	for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
		if (words[k] === "am" || words[k] === "feel" || words[k] === "feeling") return true;
		if (!MODIFIERS.has(words[k])) return false;
	}
	return false;
}

// How many of the neighbors (two either side) line up with a phrase that contains the guess.
function phraseFit(words: readonly string[], i: number, guess: string, phrases: readonly string[][]): number {
	let best = 0;
	for (const phrase of phrases) {
		phrase.forEach((w, k) => {
			if (w !== guess) return;
			let matches = 0;
			for (const off of [-2, -1, 1, 2]) if (phrase[k + off] !== undefined && phrase[k + off] === words[i + off]) matches++;
			best = Math.max(best, matches);
		});
	}
	return best;
}

// Guesses rarer than this all count the same.
const RARE = 60000;
// A guess must score at least this well, and beat the runner-up by at least MARGIN, or the word stays as typed.
const MAX_SCORE = 6.5;
const MARGIN = 1;

export function createCorrector(config: SpellConfig) {
	const phrases = config.phrases.map((p) => p.split(" "));
	const nearbyCache = new Map<string, { word: string; cost: number }[]>();
	// Candidates grouped by length, so a word only meets the ones within reach of its own length,
	// each with a bitmask of the letters it contains for a cheap first check.
	const byLength = new Map<number, { word: string; mask: number }[]>();
	for (const candidate of config.candidates) {
		if (config.banned.has(candidate)) continue;
		const group = byLength.get(candidate.length) ?? [];
		group.push({ word: candidate, mask: letterMask(candidate) });
		byLength.set(candidate.length, group);
	}

	// Every candidate within reach of a word, with its spelling cost. Cached per word.
	const nearby = (word: string) => {
		const cached = nearbyCache.get(word);
		if (cached) return cached;
		const max = maxEdits(word);
		const mask = letterMask(word);
		// The most slips that fit in the budget if every one is a cheap 0.6 slip.
		const slips = Math.floor(max / 0.6 + 1e-9);
		const found: { word: string; cost: number }[] = [];
		for (let length = word.length - max; length <= word.length + max; length++) {
			for (const candidate of byLength.get(length) ?? []) {
				// Each slip changes at most two of the letters present, so anything further off is skipped unscored.
				if (candidate.word === word || bitCount(mask ^ candidate.mask) > 2 * slips) continue;
				const cost = typoCost(word, candidate.word, max);
				if (cost !== Infinity) found.push({ word: candidate.word, cost });
			}
		}
		if (nearbyCache.size > 2000) nearbyCache.clear();
		nearbyCache.set(word, found);
		return found;
	};

	return function correctTypos(words: readonly string[], ctx: SpellContext = {}): string[] {
		const out = [...words];
		const recent = new Set(ctx.recent ?? []);
		const yours = [...(ctx.personal ?? [])].filter(([, uses]) => uses >= MIN_USES).map(([w]) => w);
		const isYours = new Set(yours);
		for (let i = 0; i < out.length; i++) {
			const word = out[i];
			if (!/^[a-z]+$/.test(word) || config.known(word) || ctx.protect?.has(word) || isYours.has(word)) continue;
			const slot = inFeelingSlot(out, i);
			// The user's own words can be guesses too, and count as very common.
			const theirs = yours.flatMap((w) => {
				const cost = typoCost(word, w, maxEdits(word));
				return cost === Infinity ? [] : [{ word: w, cost }];
			});
			const scored = [...nearby(word), ...theirs]
				.map(({ word: guess, cost }) => {
					const fit = phraseFit(out, i, guess, phrases);
					const slotted = slot && config.slotWords.has(guess);
					const score =
						cost * 3 +
						Math.log10(Math.min(isYours.has(guess) ? 0 : config.rank(guess), RARE) + 10) -
						fit * 1.2 -
						(slotted ? 2 : 0) -
						(recent.has(guess) ? 1.5 : 0);
					return { guess, fit, slotted, score };
				})
				.sort((x, y) => x.score - y.score);
			const [best, next] = scored;
			if (!best || best.score > MAX_SCORE || (next && next.score - best.score < MARGIN)) continue;
			// Short words are too easy to mangle ("gur", "idk") without a phrase or a feeling slot to go on.
			if (word.length <= 3 && best.fit < 2 && !best.slotted) continue;
			out[i] = best.guess;
		}
		return out;
	};
}
