import { describe, expect, it } from "vitest";
import { roomEvents, type RoomSignals } from "./signals";

const S: RoomSignals = { lines: 3, inTalk: false, speaking: false, thinking: false };
describe("room signals", () => {
	it("says nothing on the first look", () => {
		expect(roomEvents(null, S, 5)).toEqual([]);
	});
	it("hears a new line or the wake word as a message", () => {
		expect(roomEvents(S, { ...S, lines: 4 }, 5)).toEqual([{ type: "message", now: 5 }]);
		expect(roomEvents(S, { ...S, inTalk: true }, 5)).toEqual([{ type: "message", now: 5 }]);
		expect(roomEvents(S, { ...S, lines: 4, inTalk: true }, 5)).toEqual([{ type: "message", now: 5 }]);
	});
	it("follows his speech", () => {
		expect(roomEvents(S, { ...S, speaking: true }, 5)).toEqual([{ type: "reply", now: 5 }]);
		expect(roomEvents({ ...S, speaking: true }, S, 5)).toEqual([{ type: "replyDone", now: 5 }]);
	});
	it("rests when the voice conversation closes and he is not speaking", () => {
		expect(roomEvents({ ...S, inTalk: true }, S, 5)).toEqual([{ type: "rest", now: 5 }]);
		expect(roomEvents({ ...S, inTalk: true, speaking: true }, { ...S, speaking: true }, 5)).toEqual([]);
	});
	it("ignores thinking on its own and a shorter log", () => {
		expect(roomEvents(S, { ...S, thinking: true }, 5)).toEqual([]);
		expect(roomEvents(S, { ...S, lines: 2 }, 5)).toEqual([]);
	});
	it("puts the message before the reply when both arrive at once", () => {
		expect(roomEvents(S, { ...S, lines: 5, speaking: true }, 5).map((e) => e.type)).toEqual(["message", "reply"]);
	});
});
