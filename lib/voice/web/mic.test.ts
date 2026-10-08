import { afterEach, describe, expect, it, vi } from "vitest";
import { MicError } from "../engine";
import { MIC_CONSTRAINTS, openMic } from "./mic";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("the microphone constraints", () => {
	it("turn off noise suppression, automatic gain and echo cancellation for the detector's feed", () => {
		expect(MIC_CONSTRAINTS).toEqual({ channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
	});

	it("are what openMic asks the browser for", async () => {
		const getUserMedia = vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError"));
		vi.stubGlobal("window", {});
		vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
		vi.stubGlobal("AudioWorkletNode", class {});
		await expect(openMic(() => undefined)).rejects.toMatchObject({ problem: "blocked" });
		expect(getUserMedia).toHaveBeenCalledWith({ audio: MIC_CONSTRAINTS });
	});

	it("reports an unavailable microphone when the browser can't capture audio", async () => {
		vi.stubGlobal("window", {});
		vi.stubGlobal("navigator", {});
		vi.stubGlobal("AudioWorkletNode", class {});
		await expect(openMic(() => undefined)).rejects.toBeInstanceOf(MicError);
	});
});
