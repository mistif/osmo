import { describe, expect, it } from "vitest";
import {
	ALLOWLIST_DATE,
	CALL_CEILING,
	CAP_SETTING,
	DEFAULT_MODEL,
	DEFAULT_RESERVE,
	MAX_OUTPUT_TOKENS,
	MODELS,
	POOL_SIZE,
	dayKey,
	estimateTokens,
	fits,
	modelEntry,
	ownerId,
	parseCap,
	parseReserve,
	readConfig,
	sameUser,
	usableBudget,
	utf8Bytes,
} from "./allowance";

// Everything Gur sets on Vercel to switch the conversation on, with his values.
const ON = {
	OSMO_CHAT: "on",
	OSMO_CHAT_OPENAI_KEY: "sk-chat",
	OSMO_MINI_TOKENS_PER_DAY: "700000",
};

describe("the allowlist", () => {
	it("maps each listed snapshot to the small pool and its own request options", () => {
		expect(modelEntry("gpt-5.4-mini-2026-03-17")).toEqual({ model: "gpt-5.4-mini-2026-03-17", pool: "mini", reasoning: true, verbosity: true, strict: true });
		expect(modelEntry("gpt-4.1-mini-2025-04-14")).toEqual({ model: "gpt-4.1-mini-2025-04-14", pool: "mini", reasoning: false, verbosity: false, strict: true });
		// Both snapshots returned strict JSON with all seven keys in the 2026-10-02 probe; a change to either flag is deliberate.
		expect(MODELS.every((m) => typeof m.strict === "boolean")).toBe(true);
		expect(MODELS).toHaveLength(2);
		expect(DEFAULT_MODEL).toBe("gpt-5.4-mini-2026-03-17");
		expect(modelEntry(DEFAULT_MODEL)).not.toBeNull();
	});

	it("lists only dated snapshots, and no large-pool model in phase 1", () => {
		for (const entry of MODELS) {
			expect(entry.model, entry.model).toMatch(/-\d{4}-\d{2}-\d{2}$/);
			expect(entry.pool, entry.model).toBe("mini");
		}
	});

	it("refuses an alias, an unlisted model and anything not spelled exactly", () => {
		for (const name of [
			"gpt-5.4-mini",
			"gpt-4.1-mini",
			"GPT-5.4-MINI-2026-03-17",
			" gpt-5.4-mini-2026-03-17",
			"gpt-5.4-mini-2026-03-17 ",
			"gpt-5-mini",
			"gpt-5.4-nano",
			"gpt-4o-mini",
			"o4-mini",
			"gpt-4.1-nano",
			"",
		]) {
			expect(modelEntry(name), name).toBeNull();
		}
	});

	it("is dated, with the pool sizes read off Gur's dashboard that day", () => {
		// When a listed model nears retirement, recheck the dashboard and move this date with the list.
		expect(ALLOWLIST_DATE).toBe("2026-09-29");
		expect(POOL_SIZE).toEqual({ mini: 2_500_000, large: 250_000 });
		expect(CAP_SETTING).toEqual({ mini: "OSMO_MINI_TOKENS_PER_DAY", large: "OSMO_LARGE_TOKENS_PER_DAY" });
		expect(MAX_OUTPUT_TOKENS).toBe(360);
		expect(CALL_CEILING).toBe(20_000);
		expect(DEFAULT_RESERVE).toBe(0.1);
	});
});

describe("parseCap", () => {
	it("accepts plain digits from 1 up to the pool's size", () => {
		expect(parseCap("700000", "mini")).toBe(700_000);
		expect(parseCap("1", "mini")).toBe(1);
		expect(parseCap("2500000", "mini")).toBe(2_500_000);
		expect(parseCap("250000", "large")).toBe(250_000);
	});

	it("means off for anything else", () => {
		for (const raw of [undefined, "", "abc", "700,000", "700_000", "7e5", "Infinity", "-1", "0", "2500001", "700000.0", "+700000", " 700000", "700000 ", "700000\n", "0x10"]) {
			expect(parseCap(raw, "mini"), JSON.stringify(raw)).toBeNull();
		}
		expect(parseCap("250001", "large")).toBeNull();
	});
});

describe("parseReserve", () => {
	it("accepts 0, or 0. followed by digits", () => {
		expect(parseReserve("0")).toBe(0);
		expect(parseReserve("0.1")).toBe(0.1);
		expect(parseReserve("0.25")).toBe(0.25);
		expect(parseReserve("0.3")).toBe(0.3);
		expect(parseReserve("0.999")).toBe(0.999);
	});

	it("falls back to 0.1 for anything else, and never gives NaN", () => {
		for (const raw of [undefined, "", "0,1", "10%", "abc", "1", "1.0", "0.", ".5", " 0.2", "0.2 ", "-0.1", "NaN", "Infinity", "1e-1", "0x1"]) {
			const reserve = parseReserve(raw);
			expect(reserve, JSON.stringify(raw)).toBe(DEFAULT_RESERVE);
			expect(Number.isNaN(reserve), JSON.stringify(raw)).toBe(false);
		}
	});
});

describe("usableBudget", () => {
	it("applies the margin and rounds down to whole tokens", () => {
		expect(usableBudget(700_000, 0.1)).toBe(630_000);
		// 700000 * (1 - 0.3) is 489999.99999999994 in floating point; the budget is still 490,000.
		expect(usableBudget(700_000, 0.3)).toBe(490_000);
		expect(usableBudget(700_000, 0)).toBe(700_000);
		expect(usableBudget(7, 0.5)).toBe(3);
	});

	it("is always a whole number from 0 to the cap", () => {
		for (const cap of [1, 7, 999, 700_000, 2_500_000]) {
			for (const reserve of [0, 0.1, 0.25, 0.28, 0.3, 0.5, 0.9, 0.999999]) {
				const usable = usableBudget(cap, reserve);
				const label = `${cap} with ${reserve}`;
				expect(Number.isInteger(usable), label).toBe(true);
				expect(usable, label).toBeGreaterThanOrEqual(0);
				expect(usable, label).toBeLessThanOrEqual(cap);
			}
		}
	});

	it("stays inside 0 to the cap for values no setting can produce, and is never NaN", () => {
		expect(usableBudget(100, -1)).toBe(100);
		expect(usableBudget(100, 2)).toBe(0);
		expect(usableBudget(100, Number.NaN)).toBe(0);
		expect(usableBudget(Number.NaN, 0.1)).toBe(0);
		expect(usableBudget(Number.POSITIVE_INFINITY, 0.1)).toBe(0);
	});
});

describe("readConfig", () => {
	it("is on with Gur's settings, on the default model and a 10% margin", () => {
		expect(readConfig(ON)).toEqual({ key: "sk-chat", entry: modelEntry(DEFAULT_MODEL), usable: 630_000 });
	});

	it("is off unless OSMO_CHAT is exactly on", () => {
		for (const value of [undefined, "", "ON", "On", "on ", " on", "true", "1", "yes"]) {
			expect(readConfig({ ...ON, OSMO_CHAT: value }), JSON.stringify(value)).toBeNull();
		}
	});

	it("is off with no key at all, blank ones included", () => {
		for (const value of [undefined, "", "   "]) {
			expect(readConfig({ ...ON, OSMO_CHAT_OPENAI_KEY: value }), JSON.stringify(value)).toBeNull();
			expect(readConfig({ ...ON, OSMO_CHAT_OPENAI_KEY: value, OPENAI_API_KEY: value, CHATGPT_KEY: value }), JSON.stringify(value)).toBeNull();
		}
	});

	it("uses the voice's key when it has none of its own, in the voice's order", () => {
		// Gur's call on 2026-10-01: the conversation shares /api/speak's key and project.
		const shared = { ...ON, OSMO_CHAT_OPENAI_KEY: undefined };
		expect(readConfig({ ...shared, OPENAI_API_KEY: "sk-voice", CHATGPT_KEY: "sk-alias" })?.key).toBe("sk-voice");
		expect(readConfig({ ...shared, CHATGPT_KEY: " sk-alias\n" })?.key).toBe("sk-alias");
		expect(readConfig({ ...shared, OPENAI_API_KEY: "  ", CHATGPT_KEY: "sk-alias" })?.key).toBe("sk-alias");
		// Its own key, when set, still comes first.
		expect(readConfig({ ...ON, OPENAI_API_KEY: "sk-voice" })?.key).toBe("sk-chat");
		// The voice's key alone never switches it on.
		expect(readConfig({ OPENAI_API_KEY: "sk-voice", OSMO_MINI_TOKENS_PER_DAY: "700000" })).toBeNull();
	});

	it("drops whitespace pasted around the key", () => {
		expect(readConfig({ ...ON, OSMO_CHAT_OPENAI_KEY: " sk-chat\n" })?.key).toBe("sk-chat");
	});

	it("uses the model setting when it names a listed snapshot, and the default when it's blank", () => {
		expect(readConfig({ ...ON, OSMO_CHAT_MODEL: " gpt-4.1-mini-2025-04-14 " })?.entry).toEqual(modelEntry("gpt-4.1-mini-2025-04-14"));
		expect(readConfig({ ...ON, OSMO_CHAT_MODEL: "   " })?.entry).toEqual(modelEntry(DEFAULT_MODEL));
		expect(readConfig({ ...ON, OSMO_CHAT_MODEL: "" })?.entry).toEqual(modelEntry(DEFAULT_MODEL));
	});

	it("is off for an alias or an unlisted model", () => {
		for (const model of ["gpt-5.4-mini", "gpt-4o-mini", "o4-mini", "gpt-5.4-mini-2099-01-01"]) {
			expect(readConfig({ ...ON, OSMO_CHAT_MODEL: model }), model).toBeNull();
		}
	});

	it("is off for each cap that isn't plain digits within the pool", () => {
		for (const cap of [undefined, "", "abc", "700,000", "7e5", "Infinity", "-1", "0", "2500001"]) {
			expect(readConfig({ ...ON, OSMO_MINI_TOKENS_PER_DAY: cap }), JSON.stringify(cap)).toBeNull();
		}
		// The large pool's setting never stands in for the small pool's.
		expect(readConfig({ ...ON, OSMO_MINI_TOKENS_PER_DAY: undefined, OSMO_LARGE_TOKENS_PER_DAY: "70000" })).toBeNull();
	});

	it("applies a valid margin, and 0.1 in place of a malformed one", () => {
		expect(readConfig({ ...ON, OSMO_TOKENS_RESERVE: "0.3" })?.usable).toBe(490_000);
		expect(readConfig({ ...ON, OSMO_TOKENS_RESERVE: "0" })?.usable).toBe(700_000);
		for (const reserve of ["", "0,1", "10%", "abc", "1"]) {
			expect(readConfig({ ...ON, OSMO_TOKENS_RESERVE: reserve })?.usable, reserve).toBe(630_000);
		}
	});
});

describe("the owner", () => {
	it("is OSMO_OWNER_ID, trimmed and lowercased", () => {
		expect(ownerId({ OSMO_OWNER_ID: " 0B7C-AA12 \n" })).toBe("0b7c-aa12");
	});

	it("is nobody when the setting is missing or blank", () => {
		for (const value of [undefined, "", "   "]) {
			expect(ownerId({ OSMO_OWNER_ID: value }), JSON.stringify(value)).toBeNull();
		}
		expect(ownerId({})).toBeNull();
	});

	it("matches the caller's id with spaces or capitals, and no one else", () => {
		expect(sameUser("0b7c-aa12", "0b7c-aa12")).toBe(true);
		expect(sameUser("0b7c-aa12", " 0B7C-AA12 ")).toBe(true);
		expect(sameUser("0b7c-aa12", "0b7c-aa13")).toBe(false);
		expect(sameUser("0b7c-aa12", "")).toBe(false);
	});

	it("never matches when the owner is empty", () => {
		expect(sameUser("", "")).toBe(false);
		expect(sameUser("", "  ")).toBe(false);
	});
});

describe("estimateTokens", () => {
	it("adds the UTF-8 bytes, 8 per input item, 16 per request and the whole output cap", () => {
		// "You are Osmo." is 13 bytes, "Hi" 2 and "Good evening." 13.
		const input = [{ content: "Hi" }, { content: "Good evening." }];
		expect(estimateTokens("You are Osmo.", input)).toBe(13 + 2 + 13 + 8 * 2 + 16 + MAX_OUTPUT_TOKENS);
		expect(estimateTokens("You are Osmo.", input, 50)).toBe(13 + 2 + 13 + 8 * 2 + 16 + 50);
		expect(estimateTokens("", [], 0)).toBe(16);
	});

	it("counts bytes, which a count of characters would come out lower than", () => {
		// A token never covers less than one byte, so bytes bound the tokens from above.
		for (const { label, text, bytes } of [
			{ label: "emoji", text: "😀🎉👍🏽", bytes: 16 },
			{ label: "digits", text: "444 ٤٤٤ ４４４", bytes: 20 },
			{ label: "Hebrew", text: "שלום, מה שלומך היום?", bytes: 35 },
		]) {
			expect(utf8Bytes(text), label).toBe(bytes);
			expect(estimateTokens("", [{ content: text }]), label).toBe(bytes + 8 + 16 + MAX_OUTPUT_TOKENS);
			expect(estimateTokens(text, []), label).toBe(bytes + 16 + MAX_OUTPUT_TOKENS);
			// Characters, whether UTF-16 units or code points, and the old characters-over-three guess.
			expect(text.length, label).toBeLessThan(bytes);
			expect([...text].length, label).toBeLessThan(bytes);
			expect(Math.ceil(text.length / 3), label).toBeLessThan(bytes);
		}
	});
});

describe("fits", () => {
	it("allows use plus the estimate exactly equal to the usable budget, and refuses one token more", () => {
		const usable = usableBudget(700_000, 0.1);
		const estimate = estimateTokens("You are Osmo.", [{ content: "Good evening." }]);
		expect(fits(usable - estimate, estimate, usable)).toBe(true);
		expect(fits(usable - estimate + 1, estimate, usable)).toBe(false);
		expect(fits(0, usable + 1, usable)).toBe(false);
	});

	it("never fits a count that isn't a number", () => {
		expect(fits(Number.NaN, 1, 630_000)).toBe(false);
	});
});

describe("dayKey", () => {
	it("is the UTC date, rolling over at 00:00 UTC", () => {
		expect(dayKey(Date.UTC(2026, 8, 29, 23, 59, 59, 999))).toBe("2026-09-29");
		expect(dayKey(Date.UTC(2026, 8, 30, 0, 0, 0, 0))).toBe("2026-09-30");
		expect(dayKey(Date.UTC(2026, 11, 31, 23, 59, 59, 999))).toBe("2026-12-31");
		expect(dayKey(Date.UTC(2027, 0, 1))).toBe("2027-01-01");
	});

	it("ignores local midnight", () => {
		// 01:30 in Stockholm on the 30th is still the 29th in UTC.
		expect(dayKey(Date.parse("2026-09-30T01:30:00+02:00"))).toBe("2026-09-29");
		// 20:00 in New York on the 29th is already the 30th in UTC.
		expect(dayKey(Date.parse("2026-09-29T20:00:00-05:00"))).toBe("2026-09-30");
	});
});
