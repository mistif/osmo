import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const FORBIDDEN = ["Math", "random"].join(".");
const sources = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
	});

describe("lib/world", () => {
	it("never draws a random number: every choice is a fixed hash, so a seed always gives the same world", () => {
		expect(sources(ROOT).filter((f) => readFileSync(f, "utf8").includes(FORBIDDEN))).toEqual([]);
	});
});
