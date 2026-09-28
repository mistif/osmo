import { defineConfig } from "vitest/config";

// The voice check runs the real models on clips from scripts/voice-clips.ps1. Kept out of the normal suite.
export default defineConfig({
	test: { include: ["scripts/voice-check.test.ts"], environment: "node", testTimeout: 180_000 },
});
