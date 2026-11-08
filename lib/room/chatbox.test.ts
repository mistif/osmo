import { describe, expect, it } from "vitest";
import { chatShape, clearEcho, echoStep, noEcho, showChatNote } from "./chatbox";

describe("chatShape", () => {
	it("keeps the old meaning with the world off", () => {
		expect(chatShape({ world: false, showChat: false, listenSupported: true })).toEqual({ log: false, composer: false });
		expect(chatShape({ world: false, showChat: true, listenSupported: true })).toEqual({ log: true, composer: true });
		expect(chatShape({ world: false, showChat: false, listenSupported: false })).toEqual({ log: true, composer: true });
		expect(chatShape({ world: false, showChat: true, listenSupported: false })).toEqual({ log: true, composer: true });
	});

	it("with the world on, always shows the composer and lets the setting decide the log alone", () => {
		for (const listenSupported of [true, false]) {
			expect(chatShape({ world: true, showChat: false, listenSupported })).toEqual({ log: false, composer: true });
			expect(chatShape({ world: true, showChat: true, listenSupported })).toEqual({ log: true, composer: true });
		}
	});
});

describe("echo", () => {
	const owner = { role: "user", text: "I slept badly" };
	const osmo = { role: "agent", text: "I am sorry to hear it." };
	const ready = echoStep(echoStep(noEcho, [], false), [], true);

	it("does not echo the saved history that arrives with the room", () => {
		const loaded = echoStep(echoStep(noEcho, [], false), [owner, osmo], true);
		expect(loaded.text).toBeNull();
		expect(loaded.n).toBe(0);
		expect(loaded.seen).toBe(2);
	});

	it("echoes the owner's new line once the room is ready, and not his reply", () => {
		const sent = echoStep(ready, [owner], true);
		expect(sent).toMatchObject({ text: "I slept badly", n: 1 });
		expect(echoStep(sent, [owner, osmo], true)).toMatchObject({ text: "I slept badly", n: 1 });
	});

	it("takes the owner's line when a crisis turn adds two at once", () => {
		expect(echoStep(ready, [owner, osmo], true).text).toBe("I slept badly");
	});

	it("returns the same object when nothing changed", () => {
		expect(echoStep(ready, [], true)).toBe(ready);
	});

	it("counts the same words sent twice as two echoes", () => {
		const first = echoStep(ready, [owner], true);
		expect(echoStep(first, [owner, osmo, owner], true).n).toBe(2);
	});

	it("clears only the echo it was started for", () => {
		const first = echoStep(ready, [owner], true);
		const second = echoStep(first, [owner, osmo, owner], true);
		expect(clearEcho(second, first.n)).toBe(second);
		expect(clearEcho(second, second.n).text).toBeNull();
	});
});

describe("showChatNote", () => {
	it("keeps today's notes with the world off", () => {
		expect(showChatNote({ world: false, showChat: true, listenSupported: true })).toBe("You can type to me, and everything we say stays on screen.");
		expect(showChatNote({ world: false, showChat: false, listenSupported: true })).toBe("The room is just me and the mic. Turn this on to type instead.");
		expect(showChatNote({ world: false, showChat: false, listenSupported: false })).toBe("This browser cannot listen, so the conversation stays on screen here.");
	});

	it("speaks of the history alone with the world on, in his register", () => {
		for (const showChat of [true, false]) {
			for (const listenSupported of [true, false]) {
				const note = showChatNote({ world: true, showChat, listenSupported });
				expect(note).toContain("Everything we say is saved either way.");
				expect(note).not.toContain("!");
				expect(note).toMatch(/^[\x20-\x7e]+$/);
			}
		}
	});
});
