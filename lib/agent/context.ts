import { parseLookup } from "./dictionary";
import { normalize, parse } from "./talk";

// What Osmo reads from the conversation so far, so a short answer can be understood in context.

type Line = { role: "user" | "agent"; text: string };

// True when Osmo's last message asked the user for their name.
export function askedForName(lastAgentText: string | undefined): boolean {
	return !!lastAgentText && /what's yours\?|what should i call you\?|what(?:'s| is) your name\?|and you are\?/i.test(lastAgentText);
}

// Short answers that are clearly not names, even though "Gur" looks just like them.
const NOT_NAMES = new Set(["no", "yes", "nope", "nah", "yeah", "idk", "nothing", "never", "why", "what", "secret", "nobody", "nope", "none", "you", "me"]);

// The name in a reply to "what's your name?": "Gur", "its Gur", "im gur", "my name is gur". Null if it is not a name.
export function nameFromAnswer(text: string): string | null {
	const trimmed = text.trim();
	if (/\?$/.test(trimmed)) return null;
	const rest = trimmed
		.replace(/[.!]+$/, "")
		.replace(/^(?:it['’]?s|it is|i['’]?m|i am|my name is|my name['’]?s|name['’]?s|call me|you can call me)\s+/i, "")
		.trim();
	const words = rest.split(/\s+/);
	if (words.length > 2 || !words.every((w) => /^[a-zA-ZÀ-ÿ'-]{2,}$/.test(w))) return null;
	// Read as typed: a name must never be "corrected" into a word ("Zenn" is not "zen").
	if (NOT_NAMES.has(rest.toLowerCase()) || parse(rest, {}, false).intent.type !== "unknown") return null;
	return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// The name Osmo just said out loud: "Nice to meet you, Gu!", "And you're Gu, I remember.", "Your name is Gu."
// Right after one of these, the user can correct it.
function justLearnedName(lastAgentText: string | undefined): string | null {
	const said =
		lastAgentText?.match(/^Nice to meet you, ([^!]+)!/) ??
		lastAgentText?.match(/\bAnd you're ([^,]+), I remember\./) ??
		lastAgentText?.match(/^Your name is ([^.]+)\./);
	return said?.[1] ?? null;
}

const LEADING_NO = /^(?:(?:no|nope|nah|actually|wait|sorry|oops)[,\s]+)+/i;
const CORRECTION = /^(?:i meant|i said|it['’]?s|its|it is|my name is|i['’]?m|i am|call me)\s+/i;

// A fix right after Osmo got the name wrong: "i meant gur", "no its Gur", or just "gur" when it is
// close to what he heard ("gu"). An unrelated single word ("pizza") is not a correction.
export function nameCorrection(text: string, lastAgentText: string | undefined): string | null {
	const heard = justLearnedName(lastAgentText)?.toLowerCase();
	if (!heard) return null;
	const trimmed = text.trim().replace(/[.!]+$/, "");
	const flagged = LEADING_NO.test(trimmed) || CORRECTION.test(trimmed);
	const name = nameFromAnswer(trimmed.replace(LEADING_NO, "").replace(CORRECTION, ""));
	const said = name?.toLowerCase();
	if (!name || !said || said === heard) return null;
	const close =
		said.startsWith(heard) ||
		heard.startsWith(said) ||
		(said[0] === heard[0] && Math.abs(said.length - heard.length) <= 1);
	return flagged || close ? name : null;
}

// The latest name the user gave anywhere in the chat, or null.
export function nameFromHistory(history: Line[]): string | null {
	let found: string | null = null;
	history.forEach((line, i) => {
		const before = history[i - 1];
		if (line.role === "agent") {
			found = justLearnedName(line.text) ?? found;
			return;
		}
		const answer = before?.role === "agent" && askedForName(before.text) ? nameFromAnswer(line.text) : null;
		const correction = before?.role === "agent" ? nameCorrection(line.text, before.text) : null;
		const stated = /^(?:my name is|my name['’]?s|call me|you can call me)\s+/i.test(line.text.trim())
			? nameFromAnswer(line.text)
			: line.text.trim().match(/^(?:[Ii]['’]?m|[Ii] am)\s+([A-Z][a-z]+)\s*[.!]?$/)
				? nameFromAnswer(line.text)
				: null;
		found = correction ?? answer ?? stated ?? found;
	});
	return found;
}

// "cant u see in the chat my name", "i already told you my name".
export function wantsNameFromChat(text: string): boolean {
	return /\b(?:see|read|look|scroll|check)\b.*\bmy name\b|\bmy name\b.*\b(?:in the chat|above|already|earlier|before)\b|\bi (?:already )?told you my name\b/.test(
		normalize(text),
	);
}

// Meanings the user taught Osmo: slang ("slang:bet") and explained terms ("meaning:zorp blat").
// Ordinary facts ("my dog is Nala" saved as "dog") are never read as definitions.
export function taughtMeanings(memory: readonly { key: string; value: string }[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const { key, value } of memory) {
		const term = key.match(/^(?:slang|meaning):(.+)$/)?.[1];
		if (term) out[term] = value;
	}
	return out;
}

// After "Could you explain it? I'll remember.", is this message the explanation? A new question
// ("what does serendipity mean", "why?") is not, so it gets answered instead of being saved as a meaning.
export function answersPendingLearning(text: string): boolean {
	return !/\?\s*$/.test(text.trim()) && parseLookup(text) === null;
}

export function wantsRecall(text: string): boolean {
	return /\b(?:what did i (?:just )?say|what (?:were|are) we talking about|what did we talk about|remember what i said)\b/.test(
		normalize(text),
	);
}

// Quotes the user's last two messages back to them, newest first.
export function recallReply(history: Line[]): string {
	const said = history.filter((line) => line.role === "user").slice(-2).reverse();
	if (said.length === 0) return "You haven't said anything to me yet. What's on your mind?";
	if (said.length === 1) return `You just said "${said[0].text}".`;
	return `You just said "${said[0].text}", and before that "${said[1].text}".`;
}
