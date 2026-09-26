// What went wrong while unlocking, and what to do next, in plain words.
const NETWORK = "Osmo can't be reached right now. Check your connection and try again.";

function isNetwork(error: unknown): boolean {
	if (error instanceof TypeError) return true;
	const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
	return name === "AuthRetryableFetchError";
}

export function unlockMessage(error: unknown, via: "passkey" | "password"): string {
	if (isNetwork(error)) return NETWORK;
	if (via === "password") return "That email and password didn't match. Check them and try again.";
	return "That didn't unlock. Try again, or use your email and password on this device.";
}
