import { BANNED_WORDS } from "./lexicon/banned";
import { PURE_SLANG, WORD_SLANG } from "./lexicon/slang";
import { isKnownWord } from "./lexicon/words";
import { SLANG } from "./talk";

// Word questions: "what does ephemeral mean", "define petrichor", "what's a platypus".
// Definitions come from Datamuse, then Wiktionary, and are cached per user. Replies are whole spoken sentences.

type Sense = { text: string; pos: string | null; slang: boolean };
export type Lookup =
	| { kind: "found"; term: string; word: string; sense: Sense; source: "taught" | "slang" | "cache" | "datamuse" | "wiktionary" }
	| { kind: "blocked"; term: string }
	| { kind: "missing"; term: string };
export type CachedLookup = { term: string; word: string; definition: string; partOfSpeech: string | null; slang: boolean; source: string };
type Response = { ok: boolean; json: () => Promise<unknown> };
export type LookupDeps = {
	fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	taught?: Record<string, string>; // meanings the user taught, which win over any dictionary
	cacheGet?: (term: string) => Promise<CachedLookup | null>;
	cachePut?: (entry: CachedLookup) => Promise<void>;
	timeoutMs?: number;
};

const LOOKUP_MS = 4000;
// Openers people say before the question, typed or spoken.
const FILLER = /^(?:(?:um+|uh+|so|hey|ok|okay|osmo|hey osmo|yo)[,\s]+)+/;
// Words that make "what is X" small talk or a pronoun, not a word question ("what's up", "what is it").
const NOT_TERMS = new Set([
	"it", "this", "that", "up", "new", "wrong", "good", "happening", "going", "the", "a", "an", "me", "you", "him", "her",
	"them", "there", "here", "what", "who", "why", "how", "when", "where", "which", "so", "is", "today", "now",
]);
const TERM = /^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,2}$/;

export function parseLookup(text: string): string | null {
	const t = text
		.trim()
		.toLowerCase()
		.replace(/[’‘]/g, "'")
		.replace(/[?.!]+$/, "")
		.replace(/\s+/g, " ")
		.replace(FILLER, "");
	const m =
		t.match(/^(?:what does|what's|whats|what do)\s+"?(.+?)"?\s+mean$/) ??
		t.match(/^(?:define|definition of|meaning of|what is the meaning of|what's the meaning of|whats the meaning of)\s+"?(.+?)"?$/) ??
		t.match(/^(?:what is|what's|whats)\s+(?:a|an)\s+(.+)$/) ??
		t.match(/^(?:what is|what's|whats)\s+([a-z][a-z'-]*)$/);
	const term = m?.[1].trim();
	if (!term || !TERM.test(term)) return null;
	if (/^(?:my|your|his|her|their|our)\b/.test(term) || term.split(" ").every((w) => NOT_TERMS.has(w))) return null;
	return term;
}

const OFFENSIVE = /\b(?:vulgar|offensive|derogatory|slur|pejorative|obscene)\b/i;
const SLANGY = /\b(?:slang|informal|internet|colloquial)\b/i;
const POS: Record<string, string> = { n: "noun", v: "verb", adj: "adjective", adv: "adverb" };

// Turns raw senses into clean, speakable ones. Any offensive sense blocks the whole word.
function cleanSenses(raw: { pos: string | null; text: string }[]): { senses: Sense[]; blocked: boolean } {
	const senses: Sense[] = [];
	for (const r of raw) {
		let text = r.text.trim();
		const labels: string[] = [];
		let label = text.match(/^\(([^)]*)\)\s*/);
		while (label) {
			labels.push(label[1]);
			text = text.slice(label[0].length);
			label = text.match(/^\(([^)]*)\)\s*/);
		}
		const tags = labels.join(", ");
		// Only a sense's labels decide: "swear" is defined with the word "offensive" but isn't one.
		if (OFFENSIVE.test(tags)) return { senses: [], blocked: true };
		// Brackets would be read out loud, so asides go.
		text = text.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
		if (!text || /^(?:alternative|obsolete|archaic) (?:form|spelling) of\b|^(?:plural|misspelling) of\b/i.test(text)) continue;
		senses.push({ text, pos: r.pos, slang: SLANGY.test(tags) });
	}
	return { senses, blocked: false };
}

async function getJson(url: string, deps: LookupDeps, deadline: number): Promise<unknown | null> {
	const remaining = deadline - Date.now();
	if (remaining <= 0) return null;
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<null>((resolve) => {
		timer = setTimeout(() => {
			controller.abort();
			resolve(null);
		}, remaining);
	});
	try {
		const response = await Promise.race([deps.fetch(url, { signal: controller.signal }), timeout]);
		if (!response || !response.ok) return null;
		return await Promise.race([response.json(), timeout]);
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

type Source = { word: string; raw: { pos: string | null; text: string }[] };

async function fromDatamuse(term: string, deps: LookupDeps, deadline: number): Promise<Source | null> {
	const json = await getJson(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&md=dp&max=1`, deps, deadline);
	const first = Array.isArray(json) ? (json[0] as { word?: unknown; defs?: unknown } | undefined) : undefined;
	if (!first || typeof first.word !== "string") return null;
	const defs = Array.isArray(first.defs) ? first.defs.filter((d): d is string => typeof d === "string") : [];
	return {
		word: first.word,
		raw: defs.map((d) => {
			const [code, ...rest] = d.split("\t");
			return rest.length ? { pos: POS[code] ?? null, text: rest.join(" ") } : { pos: null, text: d };
		}),
	};
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&lt;": "<", "&gt;": ">" };
const stripHtml = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&(?:amp|quot|#39|nbsp|lt|gt);/g, (e) => ENTITIES[e]);

async function fromWiktionary(term: string, deps: LookupDeps, deadline: number): Promise<Source | null> {
	const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term.replace(/ /g, "_"))}`;
	const json = (await getJson(url, deps, deadline)) as { en?: { partOfSpeech?: string; definitions?: { definition?: string }[] }[] } | null;
	const raw = (json?.en ?? []).flatMap((entry) =>
		(entry.definitions ?? [])
			.filter((d) => typeof d.definition === "string")
			.map((d) => ({ pos: entry.partOfSpeech ? entry.partOfSpeech.toLowerCase() : null, text: stripHtml(d.definition!) })),
	);
	return raw.length ? { word: term, raw } : null;
}

const found = (term: string, word: string, sense: Sense, source: Extract<Lookup, { kind: "found" }>["source"]): Lookup => ({
	kind: "found",
	term,
	word,
	sense,
	source,
});

// A promise's value, or null once the deadline passes or it fails.
async function withinDeadline<T>(promise: Promise<T>, deadline: number): Promise<T | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()));
	});
	try {
		return await Promise.race([promise.catch(() => null), late]);
	} finally {
		clearTimeout(timer);
	}
}

export async function lookupWord(term: string, deps: LookupDeps): Promise<Lookup> {
	const key = term.trim().toLowerCase();
	if (BANNED_WORDS.has(key)) return { kind: "blocked", term: key };
	const taught = deps.taught && Object.hasOwn(deps.taught, key) ? deps.taught[key] : undefined;
	if (taught) return found(key, key, { text: taught, pos: null, slang: false }, "taught");
	// SLANG is a shorthand table for reading messages ("its" -> "it is", "bruh" -> ""), not a dictionary:
	// it only answers for words that aren't ordinary English, and never with an empty meaning.
	const builtIn = [WORD_SLANG, PURE_SLANG, SLANG].find(
		(table) => Object.hasOwn(table, key) && table[key].trim() !== "" && !(table === SLANG && isKnownWord(key)),
	);
	if (builtIn) return found(key, key, { text: builtIn[key], pos: null, slang: true }, "slang");

	// The time limit covers the cache too, so a stalled database can never leave Osmo "thinking".
	// The cache read gets the first quarter of the budget; the network gets whatever is left.
	const budget = deps.timeoutMs ?? LOOKUP_MS;
	const deadline = Date.now() + budget;
	const cached = deps.cacheGet ? await withinDeadline(deps.cacheGet(key), Date.now() + budget / 4) : null;
	if (cached) return found(key, cached.word, { text: cached.definition, pos: cached.partOfSpeech, slang: cached.slang }, "cache");

	// The first clean sense from a source, cached in the background; a blocked word stops the search.
	const tryFrom = async (from: Source | null, source: "datamuse" | "wiktionary"): Promise<Lookup | null> => {
		if (!from) return null;
		if (BANNED_WORDS.has(from.word.toLowerCase())) return { kind: "blocked", term: key };
		const { senses, blocked } = cleanSenses(from.raw);
		if (blocked) return { kind: "blocked", term: key };
		const sense = senses[0];
		if (!sense) return null;
		void deps
			.cachePut?.({ term: key, word: from.word, definition: sense.text, partOfSpeech: sense.pos, slang: sense.slang, source })
			.catch(() => undefined);
		return found(key, from.word, sense, source);
	};
	let muse = await fromDatamuse(key, deps, deadline);
	// Datamuse also fixes spelling. A real word must not be "corrected" into another one.
	if (muse && muse.word.toLowerCase() !== key && isKnownWord(key)) muse = null;
	return (
		(await tryFrom(muse, "datamuse")) ??
		(await tryFrom(await fromWiktionary(muse?.word ?? key, deps, deadline), "wiktionary")) ?? { kind: "missing", term: key }
	);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// "Lasting…" -> "lasting…", "A semiaquatic…" -> "a semiaquatic…"; acronyms ("NASA") stay as they are.
const lowerFirst = (s: string) => s.replace(/^([A-Z])(?=[a-z]|\s)/, (c) => c.toLowerCase());

// One short clause: long definitions stop at a semicolon or a word boundary.
function shorten(text: string): string {
	let t = text.trim().replace(/[.;,\s]+$/, "");
	if (t.length > 160) {
		const semi = t.indexOf(";");
		const comma = t.lastIndexOf(",", 160);
		// Prefer a semicolon, then the last comma, so the cut ends a phrase; a bare word cut is the last resort.
		if (semi > 20 && semi < 160) t = t.slice(0, semi);
		else if (comma > 60) t = t.slice(0, comma);
		else t = t.slice(0, t.lastIndexOf(" ", 160)).replace(/\s+(?:a|an|the|and|or|of|to|with|that|which)$/i, "");
	}
	return t;
}

// A guest can't teach Osmo anything, so they never hear the offer to learn.
export function formatDefinition(lookup: Lookup, guest = false): string {
	if (lookup.kind === "blocked") return "I'd rather not repeat that word.";
	if (lookup.kind === "missing") {
		return guest ? `I'm not familiar with "${lookup.term}".` : `I'm not familiar with "${lookup.term}". Could you explain it? I'll remember.`;
	}
	const { term, word, sense, source } = lookup;
	const body = lowerFirst(shorten(sense.text)).replace(/\bi\b/g, "I");
	if (source === "taught") return `In your usage, ${word} means ${body}.`;
	const guessed = word.toLowerCase() !== term.toLowerCase();
	const subject = guessed ? "It" : cap(word);
	let sentence: string;
	if (sense.slang) sentence = `${subject} is slang ${/^to /.test(body) ? "meaning" : "for"} ${body}.`;
	else if (sense.pos === "noun" && /^(?:a|an) /.test(body)) sentence = `${/^[aeiou]/i.test(word) ? "An" : "A"} ${word} is ${body}.`;
	else if (sense.pos === "noun" && /^the /.test(body)) sentence = `${subject} is ${body}.`;
	else sentence = `${subject} means ${body}.`;
	return guessed ? `I believe you meant ${word}. ${sentence}` : sentence;
}
