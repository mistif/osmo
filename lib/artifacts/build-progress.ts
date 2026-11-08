// Pure functions behind the panel's animation (spec 6). No clock, no DOM.

// Rises smoothly with the bytes received, never reaches 1 on its own (it stops at 0.95), and is 1 only when finished.
export function buildProgress(bytes: number, expected: number, finished = false): number {
	if (finished) return 1;
	if (!(bytes > 0) || !(expected > 0)) return 0;
	return Math.min(0.95, 0.95 * (1 - Math.exp((-2 * bytes) / expected)));
}

const MAX_BLOCKS = 12;
const WORD = /[\w$)\]]/;

// How many page elements the source has opened so far: a "<" straight before a letter, outside comments and strings,
// and not right after a word, ")" or "]" (so "a<b" and "useState<number>" are not elements).
// A quote ends at the end of its line, so an apostrophe in the text of an element cannot swallow the rest.
export function sketchBlocks(source: string): number {
	let n = 0;
	for (let i = 0; i < source.length && n < MAX_BLOCKS; i++) {
		const c = source[i],
			next = source[i + 1];
		if (c === "/" && next === "/") {
			const end = source.indexOf("\n", i);
			if (end < 0) break;
			i = end;
		} else if (c === "/" && next === "*") {
			const end = source.indexOf("*/", i + 2);
			if (end < 0) break;
			i = end + 1;
		} else if (c === '"' || c === "'") {
			i++;
			while (i < source.length && source[i] !== c && source[i] !== "\n") i += source[i] === "\\" ? 2 : 1;
		} else if (c === "`") {
			i++;
			while (i < source.length && source[i] !== "`") i += source[i] === "\\" ? 2 : 1;
		} else if (c === "<" && next !== undefined && /[A-Za-z]/.test(next) && !(i > 0 && WORD.test(source[i - 1]))) {
			n++;
		}
	}
	return Math.min(n, MAX_BLOCKS);
}
