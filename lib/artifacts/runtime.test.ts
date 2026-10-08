import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRuntime } from "../../scripts/build-artifact-runtime.mjs";
import { RUNTIME_PATH } from "./runtime-path";

describe("the committed runtime bundle", () => {
	it("is the bundle the sources build to, is on disk, and has no storage or fetch of its own", async () => {
		const built = await buildRuntime({ write: false });
		expect(built.path, "the committed bundle is stale: run npm run artifact:runtime").toBe(RUNTIME_PATH);
		expect(existsSync(join(process.cwd(), "public", RUNTIME_PATH))).toBe(true);
		expect(built.text).not.toMatch(/localStorage|sessionStorage/);
		expect(built.text).not.toContain("fetch(");
	}, 30_000);
});
