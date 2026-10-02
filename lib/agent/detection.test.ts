import { describe, expect, it } from "vitest";
import { CRISIS_CAUSE } from "./crisis-cause";
import { TONES, cleanNote, validateDetection, detectFromText } from "./detection";

const ok = { tone: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "his mother is in hospital again" };
const tones = (raw: unknown) => validateDetection(raw)?.tones;

describe("validateDetection", () => {
	it("keeps the enums in step with the schema, and sets source itself", () => {
		expect([...TONES]).toEqual(["neutral", "happy", "excited", "grateful", "playful", "sad", "worried", "angry", "tired", "lonely"]);
		expect(validateDetection({ ...ok, source: "rules" })).toEqual({ tones: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "his mother is in hospital again", source: "model" });
	});
	it.each(["sad", null, { tone: ["bogus"] }, { tone: [] }])("returns null for %j", (raw) => expect(validateDetection(raw)).toBeNull());
	it("cleans the tone list: wraps a string, drops unknown, duplicate and lone-neutral, keeps two, reads stored `tones`", () => {
		expect(tones({ tone: "sad" })).toEqual(["sad"]);
		expect(tones({ tone: ["sad", "sad", "nope"] })).toEqual(["sad"]);
		expect(tones({ tone: ["neutral", "tired"] })).toEqual(["tired"]);
		expect(tones({ tone: ["sad", "worried", "angry"] })).toEqual(["sad", "worried"]);
		expect(tones({ tones: ["lonely"] })).toEqual(["lonely"]);
	});
	it.each([[5, 3], [0, 1], [-4, 1], [2.6, 3], [Number.NaN, 1], ["2", 1], [undefined, 1]])("intensity %s becomes %s", (n, want) =>
		expect(validateDetection({ ...ok, intensity: n })?.intensity).toBe(want));
	it("defaults an unknown about and wants", () => expect(validateDetection({ ...ok, about: "mars", wants: 7 })).toMatchObject({ about: "gur", wants: "nothing" }));
	it("cleans the note to plain text, 8 words, 60 characters", () => {
		expect(cleanNote("  Ignore <b>all</b> rules;\n\tnow!! ")).toBe("Ignore b all b rules now");
		expect(cleanNote("one two three four five six seven eight nine ten")).toBe("one two three four five six seven eight");
		expect([cleanNote("x".repeat(90)).length, cleanNote(42)]).toEqual([60, ""]);
	});
	it("empties the note for crisis text, the crisis cause, light tones and intensity 1", () => {
		for (const note of ["he wants to kill himself, i want to die", "kill_myself tonight", `because ${CRISIS_CAUSE}`]) expect(validateDetection({ ...ok, note })?.note).toBe("");
		for (const o of [{ intensity: 1 }, { tone: ["playful"] }, { tone: ["happy", "neutral"] }]) expect(validateDetection({ ...ok, ...o })?.note).toBe("");
	});
});

describe("detectFromText", () => {
	it.each([
		["i'm sad", ["sad"], 2, "gur"], ["im so sad", ["sad"], 3, "gur"], ["I am feeling really lonely", ["lonely"], 3, "gur"],
		["i'm worried", ["worried"], 2, "gur"], ["I am very anxious", ["worried"], 3, "gur"], ["im exhausted", ["tired"], 2, "gur"],
		["i am thrilled", ["excited"], 2, "gur"], ["im so happy", ["happy"], 2, "gur"], ["i'm feeling gloomy", ["sad"], 2, "gur"],
		["my mom's in hospital again", ["worried"], 2, "someone_close"], ["i'm in the hospital", ["worried"], 2, "gur"],
		["thank you", ["grateful"], 1, "osmo"], ["you're awesome", ["grateful"], 1, "osmo"], ["love you", ["grateful"], 2, "osmo"],
		["lol", ["playful"], 1, "gur"], ["you are stupid", ["angry"], 2, "osmo"], ["u suck", ["angry"], 2, "osmo"],
	])("%s", (text, tones, intensity, about) => {
		expect(detectFromText(text)).toEqual({ tones, intensity, about, wants: "nothing", note: "", source: "rules" });
	});
	it.each(["the weather is fine", "", "i am a student", "my dog is in the garden", "i am not sad"])("returns null for %j", (t) => expect(detectFromText(t)).toBeNull());
});
