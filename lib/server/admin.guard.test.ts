// Spec 13: the service-role key is named in one source file only, and no secret is public.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIRS = ["app", "lib", "components", "scripts"];
const KEY_NAME = "SUPABASE_SERVICE_ROLE_KEY";
const ALLOWED = new Set(["lib/server/admin.ts", "lib/server/admin.test.ts", "lib/server/admin.guard.test.ts"]);
const PUBLIC_SECRET = /NEXT_PUBLIC_\w*(SECRET|SERVICE|PRIVATE|TOKEN|CRON)/;

function sources(): { path: string; text: string }[] {
	const out: { path: string; text: string }[] = [];
	for (const dir of DIRS) {
		const abs = join(ROOT, dir);
		try {
			if (!statSync(abs).isDirectory()) continue;
		} catch {
			continue;
		}
		for (const entry of readdirSync(abs, { recursive: true, encoding: "utf8" })) {
			const parts = entry.split(sep);
			if (parts.includes("node_modules")) continue;
			if (!/\.(ts|tsx|mjs)$/.test(entry)) continue;
			const full = join(abs, entry);
			if (!statSync(full).isFile()) continue;
			out.push({ path: relative(ROOT, full).split(sep).join("/"), text: readFileSync(full, "utf8") });
		}
	}
	return out;
}

describe("secret guard", () => {
	const files = sources();

	it("scans the source tree", () => {
		expect(files.length).toBeGreaterThan(50);
		expect(files.some((f) => f.path === "lib/server/admin.ts")).toBe(true);
	});

	it("names the service-role key only in the admin client and its tests", () => {
		const hits = files.filter((f) => f.text.includes(KEY_NAME)).map((f) => f.path);
		expect(hits.filter((p) => !ALLOWED.has(p))).toEqual([]);
		expect(hits).toContain("lib/server/admin.ts");
	});

	it("has no public variable that looks like a secret", () => {
		expect(files.filter((f) => PUBLIC_SECRET.test(f.text)).map((f) => f.path)).toEqual([]);
	});
});
