import { describe, expect, it } from "vitest";
import { formatDefinition, lookupWord, parseLookup, type CachedLookup, type LookupDeps } from "./dictionary";

type Route = unknown | "down" | "hang" | "error";
// A fake network: the first route whose key appears in the URL answers.
function network(routes: Record<string, Route>) {
	const calls: string[] = [];
	const fetch: LookupDeps["fetch"] = async (url) => {
		calls.push(url);
		const key = Object.keys(routes).find((k) => url.includes(k));
		const route = key === undefined ? undefined : routes[key];
		if (route === "down") throw new Error("offline");
		if (route === "hang") return new Promise(() => {});
		if (route === undefined || route === "error") return { ok: false, json: async () => ({}) };
		return { ok: true, json: async () => route };
	};
	return { fetch, calls };
}
const muse = (word: string, defs: string[]) => [{ word, defs }];
const wiki = (pos: string, html: string) => ({ en: [{ partOfSpeech: pos, definitions: [{ definition: html }] }] });

describe("parseLookup", () => {
	it("finds the term in word questions, typed or spoken", () => {
		expect(parseLookup("what does ephemeral mean?")).toBe("ephemeral");
		expect(parseLookup("um what does ephemeral mean")).toBe("ephemeral");
		expect(parseLookup("hey osmo define petrichor")).toBe("petrichor");
		expect(parseLookup("What's a platypus")).toBe("platypus");
		expect(parseLookup("what is love")).toBe("love");
		expect(parseLookup("meaning of no cap")).toBe("no cap");
		expect(parseLookup("what does y'all mean")).toBe("y'all");
		expect(parseLookup("define self-care")).toBe("self-care");
	});

	it("leaves other questions alone", () => {
		for (const text of ["what's up", "what is my name", "what is 2+2", "what is it", "what is the weather like", "hello", "what is your favorite color"]) {
			expect(parseLookup(text), text).toBeNull();
		}
	});
});

describe("lookupWord and formatDefinition", () => {
	const put = () => {
		const saved: CachedLookup[] = [];
		return { saved, cachePut: async (e: CachedLookup) => void saved.push(e) };
	};

	it("defines a word from Datamuse as a spoken sentence, and caches it", async () => {
		const { fetch } = network({ datamuse: muse("ephemeral", ["adj\tLasting for a short period of time. "]) });
		const { saved, cachePut } = put();
		const result = await lookupWord("ephemeral", { fetch, cachePut });
		expect(formatDefinition(result)).toBe("Ephemeral means lasting for a short period of time.");
		expect(saved).toEqual([{ term: "ephemeral", word: "ephemeral", definition: "Lasting for a short period of time.", partOfSpeech: "adjective", slang: false, source: "datamuse" }]);
	});

	it("says when a sense is slang, and reads nouns naturally", async () => {
		// A made-up word, so no built-in slang list answers first.
		const slang = network({ datamuse: muse("blorptastic", ["n\t(slang, of a person) The ability to attract a love interest. "]) });
		expect(formatDefinition(await lookupWord("blorptastic", { fetch: slang.fetch }))).toBe("Blorptastic is slang for the ability to attract a love interest.");
		const noun = network({ datamuse: muse("platypus", ["n\tA semiaquatic monotreme from eastern Australia. "]) });
		expect(formatDefinition(await lookupWord("platypus", { fetch: noun.fetch }))).toBe("A platypus is a semiaquatic monotreme from eastern Australia.");
	});

	it("guesses the word a typo meant", async () => {
		const { fetch } = network({ datamuse: muse("ephemeral", ["adj\tLasting for a short period of time."]) });
		expect(formatDefinition(await lookupWord("ephemrel", { fetch }))).toBe("I believe you meant ephemeral. It means lasting for a short period of time.");
	});

	it("does not 'correct' a real word; it asks Wiktionary instead", async () => {
		const { fetch, calls } = network({ datamuse: muse("juggle", ["v\tTo toss objects."]), wiktionary: wiki("Verb", "To <a href=\"/wiki/shake\">shake</a> rapidly.") });
		expect(formatDefinition(await lookupWord("jiggle", { fetch }))).toBe("Jiggle means to shake rapidly.");
		expect(calls.some((u) => u.includes("wiktionary") && u.includes("jiggle"))).toBe(true);
	});

	it("falls back to Wiktionary when Datamuse fails, stripping HTML", async () => {
		const { fetch } = network({ datamuse: "error", wiktionary: wiki("Noun", "The <b>smell</b> of rain on dry ground &amp; soil.") });
		expect(formatDefinition(await lookupWord("petrichor", { fetch }))).toBe("Petrichor is the smell of rain on dry ground & soil.");
	});

	it("offers to learn the word when both sources are down or silent", async () => {
		const down = network({ datamuse: "down", wiktionary: "down" });
		expect(formatDefinition(await lookupWord("zorpquux", { fetch: down.fetch }))).toBe('I\'m not familiar with "zorpquux". Could you explain it? I\'ll remember.');
		const hang = network({ datamuse: "hang", wiktionary: "hang" });
		const started = Date.now();
		const result = await lookupWord("zorpquux", { fetch: hang.fetch, timeoutMs: 50 });
		expect(result.kind).toBe("missing");
		expect(Date.now() - started).toBeLessThan(1000);
	});

	it("won't repeat offensive words, and doesn't cache them", async () => {
		const { fetch } = network({ datamuse: muse("zlur", ["n\t(offensive, ethnic slur) A slur.", "n\tSomething harmless."]) });
		const { saved, cachePut } = put();
		const result = await lookupWord("zlur", { fetch, cachePut });
		expect(formatDefinition(result)).toBe("I'd rather not repeat that word.");
		expect(saved).toEqual([]);
		const banned = network({});
		expect((await lookupWord("faggot", { fetch: banned.fetch })).kind).toBe("blocked");
		expect(banned.calls).toEqual([]);
	});

	it("answers from what the user taught, built-in slang and the cache without going online", async () => {
		const { fetch, calls } = network({});
		expect(formatDefinition(await lookupWord("bet", { fetch, taught: { bet: "okay" } }))).toBe("In your usage, bet means okay.");
		expect(formatDefinition(await lookupWord("mid", { fetch }))).toBe("Mid is slang for mediocre or average.");
		expect(formatDefinition(await lookupWord("istg", { fetch }))).toBe("Istg is slang for I swear to god.");
		const cached: CachedLookup = { term: "ephemrel", word: "ephemeral", definition: "Lasting for a short time.", partOfSpeech: "adjective", slang: false, source: "datamuse" };
		expect(formatDefinition(await lookupWord("ephemrel", { fetch, cacheGet: async () => cached }))).toBe("I believe you meant ephemeral. It means lasting for a short time.");
		expect(calls).toEqual([]);
	});

	it("cuts a long definition at a clean phrase boundary, never mid-phrase", async () => {
		const def =
			"n\tA semiaquatic monotreme from eastern Australia with a bill resembling that of a duck, that has a mole-like body, a tail resembling that of a beaver, and webbed feet.";
		const { fetch } = network({ datamuse: muse("platypus", [def]) });
		expect(formatDefinition(await lookupWord("platypus", { fetch }))).toBe(
			"A platypus is a semiaquatic monotreme from eastern Australia with a bill resembling that of a duck, that has a mole-like body, a tail resembling that of a beaver.",
		);
	});

	it("keeps definitions short and speakable", async () => {
		const long = "A very long definition " + "that keeps going and going ".repeat(12) + "until the end.";
		const { fetch } = network({ datamuse: muse("wordy", [`adj\t(informal) ${long} (see also: talky)`]) });
		const text = formatDefinition(await lookupWord("wordy", { fetch }));
		expect(text.length).toBeLessThan(220);
		expect(text).not.toMatch(/[()[\]/]/);
	});
});

describe("final review fixes", () => {
	it("never hangs on a slow cache read or write", async () => {
		const { fetch } = network({ datamuse: muse("ephemeral", ["adj\tLasting for a short period of time."]) });
		const hang = () => new Promise<never>(() => {});
		const started = Date.now();
		const read = await lookupWord("ephemeral", { fetch, cacheGet: hang, timeoutMs: 100 });
		expect(formatDefinition(read)).toBe("Ephemeral means lasting for a short period of time.");
		const written = await lookupWord("ephemeral", { fetch, cachePut: hang, timeoutMs: 100 });
		expect(written.kind).toBe("found");
		expect(Date.now() - started).toBeLessThan(1000);
	});

	it("never answers from an empty or ordinary-word entry in the shorthand table", async () => {
		const empty = network({});
		expect(formatDefinition(await lookupWord("bruh", { fetch: empty.fetch }))).not.toMatch(/slang for \./);
		const real = network({ datamuse: muse("chilling", ["adj\tCausing a feeling of cold fear."]) });
		expect(formatDefinition(await lookupWord("chilling", { fetch: real.fetch }))).toBe("Chilling means causing a feeling of cold fear.");
	});

	it("only refuses a word whose sense is labeled offensive, not one whose definition mentions it", async () => {
		const { fetch } = network({ datamuse: muse("swear", ["v\tTo use offensive, profane, or obscene language."]) });
		expect(formatDefinition(await lookupWord("swear", { fetch }))).toBe("Swear means to use offensive, profane, or obscene language.");
		const banned = network({ datamuse: muse("faggot", ["n\tA bundle of sticks."]) });
		expect((await lookupWord("faggt", { fetch: banned.fetch })).kind).toBe("blocked");
	});
});
