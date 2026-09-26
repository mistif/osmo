// Words in Osmo's own replies that can stand in for each other, so he repeats himself less.
// Only interchangeable words in his professional register; feelings and anything meaning-bearing stay out.
const SETS: readonly (readonly string[])[] = [
	["glad", "pleased"],
	["difficult", "hard", "tough"],
	["understood", "noted"],
	["entirely", "completely"],
];

// Swaps set words by turn. Quoted text and words the user just used (keep) stay as they are.
export function vary(text: string, turn: number, keep: ReadonlySet<string> = new Set()): string {
	let n = 0;
	return text.replace(/"[^"]*"|[A-Za-z]+/g, (token) => {
		if (token.startsWith('"')) return token;
		const lower = token.toLowerCase();
		const set = SETS.find((s) => s.includes(lower));
		if (!set || keep.has(lower)) return token;
		const pick = set[(turn + n++) % set.length];
		return token[0] === token[0].toUpperCase() ? pick[0].toUpperCase() + pick.slice(1) : pick;
	});
}
