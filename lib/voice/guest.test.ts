import { describe, expect, it } from "vitest";
import { GUEST_GREETING, GUEST_MEMORY, greetGuest, ownerHistory } from "./guest";

describe("ownerHistory", () => {
	it("drops guests' lines and Osmo's replies to them, keeping the order", () => {
		const log = [
			{ role: "user", text: "hi" },
			{ role: "user", text: "I'm Sam", speaker: "guest" as const },
			{ role: "agent", text: "Hello.", speaker: "guest" as const },
			{ role: "agent", text: "Hello, Gur." },
		];
		expect(ownerHistory(log).map((m) => m.text)).toEqual(["hi", "Hello, Gur."]);
	});

	it("keeps everything when no guest has spoken", () => {
		const log: { text: string; speaker?: "guest" }[] = [{ text: "a" }, { text: "b" }];
		expect(ownerHistory(log)).toEqual(log);
	});

	it("returns an empty list for an empty log", () => {
		expect(ownerHistory([])).toEqual([]);
	});
});

describe("greetGuest", () => {
	it("opens a guest's first reply with the greeting", () => {
		expect(greetGuest("I'm well.", true, false)).toBe(`${GUEST_GREETING} I'm well.`);
	});

	it("leaves later replies alone", () => {
		expect(greetGuest("I'm well.", false, false)).toBe("I'm well.");
	});

	it("never greets over a crisis reply", () => {
		expect(greetGuest("Please call 988.", true, true)).toBe("Please call 988.");
	});
});

describe("GUEST_MEMORY", () => {
	it("is empty", () => {
		expect(GUEST_MEMORY).toEqual([]);
	});
});
