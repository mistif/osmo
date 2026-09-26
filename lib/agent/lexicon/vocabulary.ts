import { unfamiliarWords } from "../talk";

// How many of the user's messages each unfamiliar word has appeared in. Understanding only:
// Osmo reads these words, but never adopts them in his own professional replies.
export function learnWords(vocab: Readonly<Record<string, number>>, words: readonly string[]): Record<string, number> {
	const next = { ...vocab };
	for (const word of new Set(words)) next[word] = (Object.hasOwn(next, word) ? next[word] : 0) + 1;
	return next;
}

// What one message teaches Osmo about the user's words. It is read with the words they already
// use, so "vlao" counts as their "valo" rather than as a new word. Returns only the changed counts.
export function learnFromMessage(
	text: string,
	vocab: Readonly<Record<string, number>>,
	taught: Record<string, string> = {},
): Record<string, number> {
	const fresh = unfamiliarWords(text, taught, { personal: new Map(Object.entries(vocab)) });
	const next = learnWords(vocab, fresh);
	return Object.fromEntries(fresh.map((word) => [word, next[word]]));
}
