import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_SETTINGS, parseVoiceSettings } from "./settings";

describe("parseVoiceSettings", () => {
	it("reads saved settings", () => {
		expect(parseVoiceSettings('{"listen":true,"speakTyped":true}')).toEqual({ listen: true, speakTyped: true, naturalVoice: false, showChat: false, fadeSaid: false });
		expect(parseVoiceSettings('{"listen":true}')).toEqual({ listen: true, speakTyped: false, naturalVoice: false, showChat: false, fadeSaid: false });
		expect(parseVoiceSettings('{"naturalVoice":true}')).toEqual({ listen: false, speakTyped: false, naturalVoice: true, showChat: false, fadeSaid: false });
	});

	it("is voice only, with his words staying on screen, unless the device was told otherwise", () => {
		expect(parseVoiceSettings('{"listen":true}').showChat).toBe(false);
		expect(parseVoiceSettings('{"showChat":true,"fadeSaid":true}')).toMatchObject({ showChat: true, fadeSaid: true });
	});

	it("leaves the cloud voice off for a device that was saved before it existed", () => {
		expect(parseVoiceSettings('{"listen":true,"speakTyped":true}').naturalVoice).toBe(false);
	});

	it("treats anything unreadable or not exactly true as off", () => {
		for (const raw of [null, "", "garbage", "null", "[1]", '{"listen":"yes"}']) {
			expect(parseVoiceSettings(raw)).toEqual(DEFAULT_VOICE_SETTINGS);
		}
	});
});
