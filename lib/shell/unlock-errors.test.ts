import { describe, expect, it } from "vitest";
import { unlockMessage } from "./unlock-errors";

describe("unlockMessage", () => {
	it("explains a failed or cancelled passkey", () => {
		expect(unlockMessage({ name: "NotAllowedError" }, "passkey")).toBe("That didn't unlock. Try again, or use your email and password on this device.");
		expect(unlockMessage(new Error("anything"), "passkey")).toBe("That didn't unlock. Try again, or use your email and password on this device.");
	});

	it("explains a wrong email or password", () => {
		expect(unlockMessage({ status: 400, message: "Invalid login credentials" }, "password")).toBe("That email and password didn't match. Check them and try again.");
	});

	it("explains a network failure either way", () => {
		expect(unlockMessage(new TypeError("Failed to fetch"), "password")).toBe("Osmo can't be reached right now. Check your connection and try again.");
		expect(unlockMessage({ name: "AuthRetryableFetchError" }, "passkey")).toBe("Osmo can't be reached right now. Check your connection and try again.");
	});
});
