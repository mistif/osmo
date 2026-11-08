import { describe, expect, it } from "vitest";
import { CHARACTER, type Character } from "../character";
import { emptyBond, recordTurn, stageOf, type Bond } from "../bond/bond";
import { milestoneLine } from "../bond/lines";
import { flavor, flavorTurn } from "./flavor";

const person = (over: Partial<Character> = {}): Character => ({ ...CHARACTER, ...over });
const ctx = (p: Character, o: Partial<{ intent: string; turn: number; tone: string; sensitive: boolean }> = {}) => ({
	intent: "thanks",
	turn: 0,
	tone: "calm",
	sensitive: false,
	personality: p,
	...o,
});
const count = (p: Character, marker: string, o: Parameters<typeof ctx>[1], turns = 400) => {
	let n = 0;
	for (let t = 0; t < turns; t++) if (flavor("You are welcome!", ctx(p, { ...o, turn: t })).includes(marker)) n++;
	return n;
};

const DAY = 24 * 3600_000;
const grown = (messages: number): Bond => {
	let b = emptyBond();
	for (let i = 0; i < messages; i++) b = recordTurn(b, { now: 1_000_000, feeling: false, event: false, nameKnown: true, demo: true });
	return { ...b, toMention: [] };
};
// The rolls follow bond.messages, which keeps counting across sessions, so a sweep moves it along with the turn.
// grown(10) stays a friend and grown(30) an old friend for the whole of a 400-step sweep.
const nth = (bond: Bond, t: number): Bond => ({ ...bond, messages: bond.messages + t });

describe("flavor: CHARACTER and determinism", () => {
	it("speaks in full forms, as the character does", () => {
		expect(flavor("Hi! I'm here.", ctx(CHARACTER, { intent: "greeting" }))).toBe("Greetings! I am here.");
		expect(flavor("That wasn't it, and you'd know. Here's why we've waited: let's see, you'll agree it isn't hard.", ctx(CHARACTER, { intent: "greeting" }))).toBe(
			"That was not it, and you would know. Here is why we have waited: let us see, you will agree it is not hard.",
		);
	});

	// Goes through flavorTurn with a bond past stranger: with no bond at all (now = stranger), dry humor
	// never fires, so this would no longer exercise roll() determinism.
	it("is deterministic for the same seed and turn", () => {
		const p = person({ humor: { style: "dry", level: 1, lines: ["H1 joke."] } });
		const bond = grown(10);
		const once = flavorTurn("You are welcome!", { ...ctx(p, { turn: 9 }), bond }).text;
		const twice = flavorTurn("You are welcome!", { ...ctx(p, { turn: 9 }), bond }).text;
		expect(once).toBe(twice);
	});
});

describe("flavor: voice", () => {
	it("goes formal above 0.75: formal words and no contractions", () => {
		const p = person({ voice: { formality: 0.9, verbosity: 0.5, warmth: 0, openers: ["O1."], elaboration: "E1 more." } });
		expect(flavor("Hi! I'm sorry you're feeling sad. It's okay.", ctx(p, { intent: "userFeeling" }))).toBe(
			"Greetings! I am sorry you are feeling sad. It is okay.",
		);
	});

	it("drops a trailing question when terse, but only when there is more than one sentence", () => {
		const p = person({ voice: { formality: 0.5, verbosity: 0.1, warmth: 0, openers: ["O1."], elaboration: "E1 more." } });
		expect(flavor("I'm doing well, thank you. How are you?", ctx(p, { intent: "howAreYou" }))).toBe("I'm doing well, thank you.");
		expect(flavor("Why do you ask?", ctx(p, { intent: "askFeeling" }))).toBe("Why do you ask?");
	});
});

describe("flavor: humor and heavy/sensitive gating", () => {
	// Only dry humor can be added, so this covers dry humor only.
	// Goes through flavorTurn with a bond past stranger: with no bond, humor is already blocked by the
	// stranger stage regardless of tone/sensitivity/intent, so this would assert nothing about those gates.
	it("never adds a humor line on a heavy mood or a sensitive reply", () => {
		const loud = person({ humor: { style: "dry", level: 1, lines: ["H1 joke."] } });
		const bond = grown(10);
		const countTurn = (o: Parameters<typeof ctx>[1]) => {
			let n = 0;
			for (let t = 0; t < 400; t++) if (flavorTurn("You are welcome!", { ...ctx(loud, { ...o, turn: t }), bond: nth(bond, t) }).text.includes("H1")) n++;
			return n;
		};
		for (const tone of ["sadness", "fear", "anger", "guilt", "loneliness"]) expect(countTurn({ tone })).toBe(0);
		expect(countTurn({ sensitive: true })).toBe(0);
		for (const intent of ["userFeeling", "insult", "askWhyFeeling"]) expect(countTurn({ intent })).toBe(0);
	});

	it("keeps the offer to talk on a heavy reply even for a terse voice", () => {
		const terse = person({ voice: { formality: 0.5, verbosity: 0.1, warmth: 0, openers: [], elaboration: "" } });
		const reply = "I'm sorry you're feeling sad. Do you want to tell me what's going on?";
		expect(flavor(reply, ctx(terse, { intent: "userFeeling", sensitive: true }))).toBe(reply);
		expect(flavor(reply, ctx(terse, { intent: "userFeeling", tone: "sadness" }))).toBe(reply);
	});

	// Was pun-based; only dry humor can be added now. This is the only test exercising the calmEnough
	// gate: intent "howAreYou" only counts as light (so humor can appear) when the tone is calm.
	// Goes through flavorTurn with a bond past stranger, since no bond now means stranger and strangers get no humor.
	it("never adds a humor line to how-are-you when the mood is not calm", () => {
		const loud = person({ humor: { style: "dry", level: 1, lines: ["H1 joke."] } });
		const bond = grown(10);
		const countTurn = (o: Parameters<typeof ctx>[1]) => {
			let n = 0;
			for (let t = 0; t < 400; t++) if (flavorTurn("You are welcome!", { ...ctx(loud, { ...o, turn: t }), bond: nth(bond, t) }).text.includes("H1")) n++;
			return n;
		};
		expect(countTurn({ intent: "howAreYou", tone: "joy" })).toBe(0);
		expect(countTurn({ intent: "howAreYou", tone: "calm" })).toBeGreaterThan(100);
	});

	// Goes through flavorTurn with a bond past stranger, since a strangerless bond blocks dry humor entirely.
	it("differs between seeds", () => {
		const a = person({ seed: 1, humor: { style: "dry", level: 1, lines: ["H1 joke."] } });
		const b = person({ seed: 2, humor: { style: "dry", level: 1, lines: ["H1 joke."] } });
		const bond = grown(10);
		let differs = false;
		for (let t = 0; t < 50; t++) {
			const at = { ...ctx(a, { turn: t }), bond: nth(bond, t) };
			if (flavorTurn("You are welcome!", at).text !== flavorTurn("You are welcome!", { ...at, personality: b }).text) differs = true;
		}
		expect(differs).toBe(true);
	});
});

describe("flavor: professional voice", () => {
	// Goes through flavorTurn with a bond past stranger and the humor level at 0, so nothing but the checks in
	// flavor.ts could put an opener, an elaboration or a quirk phrase into the reply.
	it("never adds openers, elaborations or quirks", () => {
		const loud = person({
			voice: { formality: 0.5, verbosity: 0.9, warmth: 1, openers: ["O1."], elaboration: "E1 more." },
			humor: { style: "dry", level: 0, lines: ["H1 joke."] },
			quirks: { phrases: ["Q1 phrase."], rate: 0.3 },
		});
		const bond = grown(10);
		for (let t = 0; t < 300; t++) {
			const out = flavorTurn("Hi! You are welcome!", { ...ctx(loud, { intent: "greeting", turn: t }), bond: nth(bond, t) }).text;
			expect(out, String(t)).not.toMatch(/O1\.|E1 more\.|Q1 phrase\.|H1 joke\./);
		}
	});

	it("keeps casual words as they are for low formality", () => {
		const p = person({ voice: { formality: 0.1, verbosity: 0.5, warmth: 0, openers: [], elaboration: "" } });
		expect(flavor("Hello! Thank you.", ctx(p, { intent: "greeting" }))).toBe("Hello! Thank you.");
	});

	it("allows dry humor lines only, from friend on", () => {
		const dry = person({ humor: { style: "dry", level: 1, lines: ["D1 dry."] } });
		let n = 0;
		for (let t = 0; t < 400; t++) if (flavorTurn("You are welcome!", { ...ctx(dry, { turn: t }), bond: nth(grown(10), t) }).text.includes("D1 dry.")) n++;
		expect(n).toBeGreaterThan(0);
		// count calls flavor with no bond, which now means stranger, so no dry humor.
		expect(count(dry, "D1 dry.", {})).toBe(0);
	});

	// The spec's tone table: dry wit shows from friend on, not at acquaintance.
	it("adds no dry humor at acquaintance, whatever the seed", () => {
		const acquaintance = grown(3);
		expect(stageOf(acquaintance)).toBe("acquaintance");
		let n = 0;
		for (let seed = 1; seed <= 400; seed++) {
			const dry = person({ seed, humor: { style: "dry", level: 1, lines: ["D1 dry."] } });
			if (flavorTurn("You are welcome!", { ...ctx(dry), bond: acquaintance }).text.includes("D1 dry.")) n++;
		}
		expect(n).toBe(0);
	});
});

describe("flavorTurn: bond", () => {
	it("mentions a queued milestone once and reports it", () => {
		const bond = { ...grown(3), toMention: ["friend" as const] };
		const out = flavorTurn("You are welcome!", { ...ctx(CHARACTER), bond });
		expect(out.text).toMatch(/think of you as a friend/);
		expect(out.mentioned).toBe("friend");
	});

	it("welcomes back after 20+ hours, replacing a leading greeting instead of stacking", () => {
		const out = flavorTurn("Hello, Gur! How are you?", { ...ctx(CHARACTER, { intent: "greeting" }), bond: grown(30), userName: "Gur", awayMs: DAY });
		expect(out.text).toMatch(/^There you are, Gur\.|^Welcome back, Gur\./);
		expect(out.text).not.toMatch(/Hello/);
		expect(out.text).toMatch(/How are you\?$/);
	});

	it("does not welcome back after a short break", () => {
		const out = flavorTurn("Hello! How are you?", { ...ctx(CHARACTER, { intent: "greeting" }), bond: grown(30), awayMs: 3600_000 });
		expect(out.text).toBe("Hello! How are you?");
	});

	it("still welcomes back when he is only lonely from the wait", () => {
		const out = flavorTurn("Hello! How are you?", { ...ctx(CHARACTER, { intent: "greeting", tone: "loneliness" }), bond: grown(10), awayMs: DAY });
		expect(out.text).toMatch(/^Welcome back|^Good to have you back/);
	});

	it("adds nothing on a heavy moment, even when a welcome or milestone is due", () => {
		const bond = { ...grown(30), toMention: ["friend" as const] };
		for (const o of [{ tone: "sadness" }, { sensitive: true }]) {
			const out = flavorTurn("I am sorry to hear that.", { ...ctx(CHARACTER, { intent: "userFeeling", ...o }), bond, awayMs: DAY });
			expect(out).toEqual({ text: "I am sorry to hear that.", mentioned: null });
		}
	});

	it("adds at most one extra", () => {
		const loud = person({ humor: { style: "dry", level: 1, lines: ["D1 dry."] } });
		// The milestone marker matches the "friend" line's own wording (not just "friend" or "remember"),
		// so it never overlaps the shared-memory line ("I still remember...") and double-counts.
		const MARKERS = [
			/come to think of you as a friend/,
			/Welcome back|There you are|Good to/,
			/still remember|first week/,
			/D1 dry/,
		];
		const extrasIn = (out: string) => MARKERS.map((re, i) => (re.test(out) ? i : -1)).filter((i) => i !== -1);

		// A welcome is due every turn here, so only the welcome-back line (marker 1) can ever appear.
		const withWelcome = { ...grown(30), toMention: ["friend" as const] };
		for (let t = 0; t < 100; t++) {
			const out = flavorTurn("You are welcome!", { ...ctx(loud, { turn: t }), bond: nth(withWelcome, t), awayMs: DAY, userName: "Gur" }).text;
			expect(extrasIn(out).length, out).toBeLessThanOrEqual(1);
		}

		// No welcome and nothing due, so shared memory and dry humor each get a turn to win.
		const noneDue = { ...grown(30), toMention: [] };
		const seen = new Set<number>();
		for (let t = 0; t < 200; t++) {
			const out = flavorTurn("You are welcome!", { ...ctx(loud, { turn: t }), bond: nth(noneDue, t) }).text;
			const hits = extrasIn(out);
			expect(hits.length, out).toBeLessThanOrEqual(1);
			hits.forEach((i) => seen.add(i));
		}
		// Confirms the lower branches actually fire here, not just silently never reached.
		expect(seen.has(2) && seen.has(3)).toBe(true);
	});

	it("is speakable and never talks down", () => {
		const loud = person({ humor: { style: "dry", level: 1, lines: ["D1 dry."] } });
		const speakable = (out: string) => {
			expect(out).not.toMatch(/[()[\]{}<>#*_~|]/);
			expect(out).not.toMatch(/\b(squirt|kiddo|little one|sweetheart|darling|dear|sir|madam|boss|buddy|mate|dude|champ)\b/i);
		};
		const bond = grown(30);
		let humorHits = 0;
		for (let t = 0; t < 200; t++) {
			// A welcome is due, so only the welcome-back line can appear.
			speakable(flavorTurn("You are welcome!", { ...ctx(loud, { turn: t }), bond: nth(bond, t), awayMs: DAY, userName: "Gur" }).text);

			// Nothing due and no away time, so dry humor gets a turn to appear.
			const free = flavorTurn("You are welcome!", { ...ctx(loud, { turn: t }), bond: nth(bond, t) }).text;
			speakable(free);
			if (free.includes("D1 dry.")) humorHits++;
		}
		expect(humorHits).toBeGreaterThan(0);
	});
});

describe("flavorTurn: extras vary across sessions", () => {
	// session.turns restarts at 0 on every page load, so turn alone would give the same extra on the same turn.
	const p = person({ humor: { style: "dry", level: 1, lines: ["D1 dry.", "D2 dry."] } });
	const at = (messages: number) => flavorTurn("You are welcome!", { ...ctx(p, { turn: 0 }), bond: { ...grown(30), messages } }).text;

	it("two calls that differ only in bond.messages do not always give the same extra", () => {
		let differs = false;
		for (let m = 40; m < 140; m++) if (at(m) !== at(m + 1)) differs = true;
		expect(differs).toBe(true);
	});

	it("gives more than one distinct extra across bond.messages 1 to 200 with turn fixed at 0", () => {
		const extras = new Set<string>();
		for (let m = 1; m <= 200; m++) {
			const extra = at(m).slice("You are welcome!".length).trim();
			if (extra) extras.add(extra);
		}
		expect(extras.size).toBeGreaterThan(1);
	});
});

describe("flavorTurn: first feeling and first event", () => {
	const feeling = { ...grown(10), toMention: ["firstFeeling" as const] };

	it("says the first-feeling line only on a feeling turn that is not sensitive", () => {
		const said = flavorTurn("I'm glad to hear that.", { ...ctx(CHARACTER, { intent: "userFeeling" }), bond: feeling });
		expect(said.text).toContain(milestoneLine("firstFeeling"));
		expect(said.mentioned).toBe("firstFeeling");
		for (const o of [{ intent: "thanks" }, { intent: "greeting" }, { intent: "userFeeling", sensitive: true }]) {
			const out = flavorTurn("You are welcome!", { ...ctx(CHARACTER, o), bond: feeling });
			expect(out.text, o.intent).not.toContain(milestoneLine("firstFeeling"));
			expect(out.mentioned, o.intent).toBeNull();
		}
	});

	it("never says the first-event line, which belongs to the turn the event is told", () => {
		const bond = { ...grown(10), toMention: ["firstEvent" as const] };
		for (const intent of ["thanks", "greeting", "userFeeling"]) {
			const out = flavorTurn("You are welcome!", { ...ctx(CHARACTER, { intent }), bond });
			expect(out).toEqual({ text: "You are welcome!", mentioned: null });
		}
	});
});

describe("flavorTurn: placement", () => {
	it("puts an extra before the reply's closing question, so the question stays last", () => {
		const bond = { ...grown(10), toMention: ["friend" as const] };
		const out = flavorTurn("Hello, Gur. How can I help?", { ...ctx(CHARACTER, { intent: "greeting" }), bond });
		expect(out.text).toBe(`Hello, Gur. ${milestoneLine("friend")} How can I help?`);
		expect(out.mentioned).toBe("friend");
	});

	it("keeps the question last for light extras too", () => {
		const loud = person({ humor: { style: "dry", level: 1, lines: ["D1 dry."] } });
		let extras = 0;
		for (let t = 0; t < 200; t++) {
			const out = flavorTurn("Hello. How can I help?", { ...ctx(loud, { intent: "greeting", turn: t }), bond: nth(grown(30), t) }).text;
			expect(out).toMatch(/^Hello\. /);
			expect(out).toMatch(/ How can I help\?$/);
			if (out !== "Hello. How can I help?") extras++;
		}
		expect(extras).toBeGreaterThan(0);
	});

	it("still adds an extra at the end of a reply with no question", () => {
		const bond = { ...grown(10), toMention: ["friend" as const] };
		expect(flavorTurn("You are welcome!", { ...ctx(CHARACTER), bond }).text).toBe(`You are welcome! ${milestoneLine("friend")}`);
	});
});

describe("flavorTurn: welcome back", () => {
	const away = (reply: string, bond: Bond, intent = "greeting") =>
		flavorTurn(reply, { ...ctx(CHARACTER, { intent }), bond, userName: "gur", awayMs: DAY }).text;

	it("replaces talk's calm openers too, keeping the name once and capitalized", () => {
		for (const reply of ["Good to see you, Gur. How can I help?", "Welcome back, Gur. How can I help?", "Hello, Gur. How can I help?"]) {
			const out = away(reply, grown(10));
			expect(out, reply).toMatch(/^Good to have you back, Gur\. How can I help\?$/);
		}
	});

	it("leaves no trailing space when the greeting was the whole reply", () => {
		const out = away("Hello, Gur!", grown(10));
		expect(out).toMatch(/^Good to have you back, Gur\.$/);
	});

	it("at stranger, keeps the greeting and its name, and only prepends the welcome", () => {
		const stranger: Bond = { ...emptyBond(), messages: 2, days: 2, lastDay: "2026-09-25" };
		expect(stageOf(stranger)).toBe("stranger");
		expect(away("Hello, Gur. How can I help?", stranger)).toBe("Welcome back. Hello, Gur. How can I help?");
		// talk's own "Welcome back" already says it, so it is not said twice.
		expect(away("Welcome back, Gur. How can I help?", stranger)).toBe("Welcome back, Gur. How can I help?");
	});

	it("never welcomes back on a farewell", () => {
		for (const bond of [grown(10), grown(30)]) expect(away("Goodbye, Gur. Take care.", bond, "farewell")).toBe("Goodbye, Gur. Take care.");
	});
});

describe("flavorTurn: a frustrated user", () => {
	it("says no milestone line when misunderstood or told he was rude, and leaves it queued", () => {
		const bond = { ...grown(10), toMention: ["friend" as const] };
		for (const intent of ["misunderstood", "rudeFeedback"]) {
			const out = flavorTurn("My apologies, I misunderstood.", { ...ctx(CHARACTER, { intent }), bond });
			expect(out, intent).toEqual({ text: "My apologies, I misunderstood.", mentioned: null });
		}
	});
});

describe("the dry line", () => {
	const isDry = (text: string) => CHARACTER.humor.lines.some((l) => text.includes(l));
	it("shows on about one light friend turn in ten, never at acquaintance, never on a heavy turn", () => {
		let hits = 0;
		for (let t = 0; t < 1000; t++) {
			const at = (b: Bond, o = {}) => flavorTurn("You are welcome!", { ...ctx(CHARACTER, { turn: t, ...o }), bond: nth(b, t) }).text;
			if (isDry(at(grown(10)))) hits++;
			// An acquaintance cannot be moved along the messages without becoming a friend, so the sweep is over seeds.
			const acq = flavorTurn("You are welcome!", { ...ctx(person({ seed: t + 1 }), { turn: t }), bond: grown(3) }).text;
			expect(isDry(acq), "acquaintance").toBe(false);
			expect(isDry(at(grown(30), { intent: "userFeeling", tone: "sadness" })), "heavy").toBe(false);
		}
		expect(hits / 1000).toBeGreaterThan(0.04);
		expect(hits / 1000).toBeLessThan(0.16);
	});
});
