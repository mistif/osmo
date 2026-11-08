// Every API route that spends money or touches Gur's data must be for Gur alone (board review
// 2026-10-08, issue 1). Supabase sign-ups are open, so "signed in" is not enough. This test reads
// the route files, follows each one's `@/lib/...` imports to the module that holds the logic, and
// fails if a route never checks the owner. Cron and Telegram are exempt: they authenticate with
// their own secret, not a user token.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const EXEMPT = /^app\/api\/(cron|telegram)\//;

function routeFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return routeFiles(path);
		return name === "route.ts" ? [path] : [];
	});
}

const posix = (path: string) => relative(ROOT, path).split("\\").join("/");

// Comments out, so a route that only mentions requireOwner in a comment does not pass.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function source(file: string): string {
	return code(readFileSync(join(ROOT, file), "utf8"));
}

// The route's own text plus the modules it imports from "@/lib/...", where the handler lives.
function reachable(route: string): string {
	const own = source(route);
	const handlers = [...own.matchAll(/from\s+"@\/(lib\/[^"]+)"/g)].map((m) => `${m[1]}.ts`);
	return [own, ...handlers.map(source)].join("\n");
}

// requireOwner, or requireUser followed by a comparison with OSMO_OWNER_ID (directly or through ownerId()).
const checksOwner = (text: string) => /\brequireOwner\s*\(/.test(text) || (/\brequireUser\s*\(/.test(text) && /OSMO_OWNER_ID|\bownerId\s*\(/.test(text));

const routes = routeFiles(join(ROOT, "app/api"))
	.map(posix)
	.filter((file) => !EXEMPT.test(file))
	.sort();

describe("every API route is for the owner only", () => {
	it("finds the routes (so the test cannot pass by looking at nothing)", () => {
		expect(routes.length).toBeGreaterThanOrEqual(7);
		expect(routes).toContain("app/api/speak/route.ts");
		expect(routes).toContain("app/api/chat/route.ts");
		expect(routes.some((file) => EXEMPT.test(file))).toBe(false);
	});

	it.each(routes)("%s checks the owner", (route) => {
		expect(checksOwner(reachable(route)), `${route} must call requireOwner, or requireUser with OSMO_OWNER_ID`).toBe(true);
	});

	it("the check itself recognises the wrong shapes", () => {
		expect(checksOwner("const user = await requireUser(request);")).toBe(false);
		expect(checksOwner(code("// requireOwner(request)\nexport const POST = () => ok();"))).toBe(false);
		expect(checksOwner("const who = await requireOwner(request, env);")).toBe(true);
		expect(checksOwner("await requireUser(r); const o = env.OSMO_OWNER_ID;")).toBe(true);
	});
});
