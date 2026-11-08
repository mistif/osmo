import { describe, expect, it } from "vitest";
import { MAX_REPLY_CHARS, MAX_SENTENCES, isCrisisFlag, lastFullSentence, saidWhole, speakable } from "./speakable";

// "word0 word1 … word{n-1}", with no punctuation.
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("isCrisisFlag", () => {
	it("flags the model's CRISIS answer, with the slips a model makes", () => {
		for (const raw of [
			"CRISIS",
			"CRISIS.",
			"crisis",
			"Crisis",
			" crisis!\n",
			"**CRISIS**",
			"`CRISIS`",
			"\"CRISIS\"",
			"CRISIS I'm sorry…",
			"**CRISIS** I'm sorry…",
			"I'm so sorry. CRISIS",
			"I'm so sorry.\n\nCRISIS",
		]) {
			expect(isCrisisFlag(raw), raw).toBe(true);
		}
	});

	it("does not flag the word in an ordinary reply", () => {
		for (const raw of [
			"Crisis management is a field…",
			"That sounds like a midlife crisis, honestly.",
			"Crisis? Hardly.",
			"The CRISISES were many.",
			"The word is crises.",
			"",
		]) {
			expect(isCrisisFlag(raw), raw).toBe(false);
		}
	});
});

describe("lastFullSentence", () => {
	it("cuts a reply back to its last sentence end", () => {
		expect(lastFullSentence("Good evening. How are y")).toBe("Good evening.");
		expect(lastFullSentence("It went well! Then we")).toBe("It went well!");
		expect(lastFullSentence("Is it? Yes. Mayb")).toBe("Is it? Yes.");
		expect(lastFullSentence("  Already whole.")).toBe("Already whole.");
	});

	it("keeps a closing quote or bracket with its sentence", () => {
		expect(lastFullSentence("He said \"stop.\" And th")).toBe("He said \"stop.\"");
		expect(lastFullSentence("Fine (really.) Then")).toBe("Fine (really.)");
	});

	it("gives nothing when no sentence ended", () => {
		expect(lastFullSentence("No end at all")).toBe("");
		expect(lastFullSentence("")).toBe("");
		// A decimal point and a title's full stop don't end a sentence.
		expect(lastFullSentence("It costs 3.5")).toBe("");
		expect(lastFullSentence("I met Dr. Pat")).toBe("");
		expect(lastFullSentence("Hello. I met Dr.")).toBe("Hello.");
	});

	it("never stops inside an abbreviation, but a reply that ends with one is whole", () => {
		expect(lastFullSentence("You could meet at 9 a.m. at the stat")).toBe("");
		expect(lastFullSentence("Hello. It's Arsenal vs.")).toBe("Hello.");
		expect(lastFullSentence("Come at 9 a.m.")).toBe("Come at 9 a.m.");
		expect(lastFullSentence("Hello. He moved to the U.S.")).toBe("Hello. He moved to the U.S.");
	});
});

describe("speakable", () => {
	it("keeps a plain reply as it is", () => {
		expect(speakable("Good evening, Gur. It's 50% off, $5 & 3/4 of 12 = 9.")).toBe("Good evening, Gur. It's 50% off, $5 & 3/4 of 12 = 9.");
	});

	it("strips markdown marks", () => {
		expect(speakable("**Good evening.** I hope your *day* went `well`.")).toBe("Good evening. I hope your day went well.");
		expect(speakable("__Quite__ ~~so~~ right.")).toBe("Quite so right.");
		expect(speakable("See [the guide](https://example.com/guide) for more.")).toBe("See the guide for more.");
		expect(speakable("> A quote here.")).toBe("A quote here.");
		expect(speakable("## Summary\nIt went well.")).toBe("Summary. It went well.");
		expect(speakable("Above.\n\n---\n\nBelow.")).toBe("Above. Below.");
		expect(speakable("```\nThat's it.\n```")).toBe("That's it.");
	});

	it("strips list bullets and numbering, and ends each item as a sentence", () => {
		expect(speakable("Three ideas:\n- Walk\n- Read a book\n* Sleep early")).toBe("Three ideas: Walk. Read a book. Sleep early.");
		expect(speakable("1. Stretch.\n2) Breathe\n3. Rest!")).toBe("Stretch. Breathe. Rest!");
		expect(speakable("• **Tea** 🍵")).toBe("Tea.");
	});

	it("leaves a number or a minus sign at the start of a line alone", () => {
		expect(speakable("3.5 degrees today.")).toBe("3.5 degrees today.");
		expect(speakable("-5 degrees outside.")).toBe("-5 degrees outside.");
		expect(speakable("2026 was a good year.")).toBe("2026 was a good year.");
	});

	it("strips emoji, with their skin tones, flags, joiners and keycaps", () => {
		expect(speakable("Well done! 🎉👏🏽 You earned it 🇸🇪.")).toBe("Well done! You earned it.");
		expect(speakable("The whole 👨‍👩‍👧 came.")).toBe("The whole came.");
		expect(speakable("Keycap 1️⃣ first.")).toBe("Keycap 1 first.");
		expect(speakable("I love it 😀 so much❤️")).toBe("I love it so much");
	});

	it("keeps letters of every script, and accents, while stripping emoji and symbols", () => {
		expect(speakable("שלום גור! 😀 מה שלומך?")).toBe("שלום גור! מה שלומך?");
		expect(speakable("Åsa och José åt smörgås (igen) 🎉.")).toBe("Åsa och José åt smörgås igen.");
	});

	it("strips brackets and the symbols a voice would read out", () => {
		expect(speakable("The answer (as I recall) is [roughly] 42 {give or take} <more or less>.")).toBe(
			"The answer as I recall is roughly 42 give or take more or less.",
		);
		expect(speakable("#1 | best \\ choice ^_^ → yes.")).toBe("1 best choice yes.");
		expect(speakable("snake_case")).toBe("snake case");
	});

	it("joins runs of whitespace, and never leaves a space before a mark", () => {
		expect(speakable("Hello,\n\n   Gur.\tHow   are you ?")).toBe("Hello, Gur. How are you?");
	});

	it("keeps at most three sentences, cutting from the end", () => {
		expect(MAX_SENTENCES).toBe(3);
		expect(speakable("One. Two! Three? Four.")).toBe("One. Two! Three?");
		expect(speakable("One. Two. Three.")).toBe("One. Two. Three.");
		expect(speakable("He said \"stop.\" Then he left. Odd. Truly.")).toBe("He said \"stop.\" Then he left. Odd.");
		// The piece after the last full stop is dropped first.
		expect(speakable("One. Two. Three. And a trailing thought")).toBe("One. Two. Three.");
	});

	it("keeps a closing piece without a full stop when it fits", () => {
		expect(speakable("Of course. Here it is")).toBe("Of course. Here it is");
	});

	it("never cuts at a title's full stop or inside a decimal", () => {
		expect(speakable("One. Two. Ask Dr. Patel. Bye.")).toBe("One. Two. Ask Dr. Patel.");
		expect(speakable("It costs 3.50 today. Fine. Good. Done.")).toBe("It costs 3.50 today. Fine. Good.");
	});

	it("never cuts the third sentence at an abbreviation or an initial", () => {
		for (const reply of [
			"Good match. Both sides are strong. It's Arsenal vs. Chelsea on Sunday.",
			"Rates may drop. Inflation is falling. The U.S. economy looks steady.",
			"Leave early. Traffic is lighter then. Meet her at 9 a.m. at the station.",
			"Try a sauce. Keep it simple. Something green, e.g. pesto, works well.",
			"It was bold. It was costly. It was John F. Kennedy's plan.",
		]) {
			expect(speakable(reply), reply).toBe(reply);
		}
		// Hebrew has no capitals, so its full stops still end sentences.
		expect(speakable("שלום. מה שלומך. טוב. ביי.")).toBe("שלום. מה שלומך. טוב.");
	});

	it("keeps at most 400 characters, dropping whole sentences from the end so the first stays", () => {
		expect(MAX_REPLY_CHARS).toBe(400);
		const first = `${words(25)}.`;
		const second = `${words(25)}.`;
		const third = `${words(25)}.`;
		// Each is 165 characters: two fit in 400, three don't.
		expect(speakable(`${first} ${second} ${third}`)).toBe(`${first} ${second}`);
		// A long second sentence goes, and the first stays alone.
		expect(speakable(`${first} ${words(60)}.`)).toBe(first);
	});

	it("allows exactly 400 characters", () => {
		const exactly = `Short one. ${"a".repeat(388)}.`;
		expect(exactly).toHaveLength(400);
		expect(speakable(exactly)).toBe(exactly);
		expect(speakable(`Short one. ${"a".repeat(389)}.`)).toBe("Short one.");
	});

	it("cuts an over-long first sentence at the last word that fits, and ends it with a full stop", () => {
		// 100 words make 690 characters; the first 58 make 395, and the 59th would pass 399.
		const reply = speakable(`${words(100)}. And more.`);
		expect(reply).toBe(`${words(58)}.`);
		expect(reply.length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
		// A comma left at the cut goes before the full stop is added.
		const listing = `${Array.from({ length: 80 }, (_, i) => `step${i},`).join(" ").slice(0, -1)}.`;
		expect(speakable(listing)).toBe(`${Array.from({ length: 51 }, (_, i) => `step${i},`).join(" ").slice(0, -1)}.`);
		// With no ending at all, the whole reply is one over-long sentence.
		expect(speakable(words(100))).toBe(`${words(58)}.`);
		// One word longer than the limit has nowhere to break.
		expect(speakable(`${"x".repeat(500)}.`)).toBe(`${"x".repeat(399)}.`);
	});

	it("is empty when nothing speakable is left", () => {
		for (const raw of ["", "   \n\t ", "**", "🎉🎉🎉", "- \n* \n1. ", "(( [] ))", "... !!! ???", "#### ---", "`~~`"]) {
			expect(speakable(raw), JSON.stringify(raw)).toBe("");
		}
	});
});

describe("saidWhole", () => {
	it("is true when speakable keeps every sentence, markdown and emoji aside", () => {
		for (const raw of ["You have two reminders. Call Dad at nine. The dentist at ten.", "**Pasta** with lemon. 🍝", "Sunny and 14 degrees", "One. Two. Three!"]) {
			expect(saidWhole(raw), raw).toBe(true);
		}
	});

	it("is false when speakable drops a sentence or cuts the only one", () => {
		expect(saidWhole("One. Two. Three. Four.")).toBe(false);
		expect(saidWhole(`${"word ".repeat(90)}word.`)).toBe(false);
		expect(saidWhole(`First. ${"x".repeat(MAX_REPLY_CHARS)}.`)).toBe(false);
	});
});
