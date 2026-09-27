import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_SETTINGS, parseVoiceSettings } from "./settings";

describe("parseVoiceSettings", () => {
	it("reads saved settings", () => {
		expect(parseVoiceSettings('{"listen":true,"speakTyped":true}')).toEqual({ listen: true, speakTyped: true });
		expect(parseVoiceSettings('{"listen":true}')).toEqual({ listen: true, speakTyped: false });
	});

	it("treats anything unreadable or not exactly true as off", () => {
		for (const raw of [null, "", "garbage", "null", "[1]", '{"listen":"yes"}']) {
			expect(parseVoiceSettings(raw)).toEqual(DEFAULT_VOICE_SETTINGS);
		}
	});
});
