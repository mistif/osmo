import { describe, expect, it } from "vitest";
import { navKind, parentRoute, parseRoute, routeHash, TALK, type Route } from "./route";

const ALL = ["ideas", "goals", "library", "feed", "search", "settings"] as const;
const ROUTES: Route[] = [
	{ panel: "library" }, { panel: "library", page: "notes" }, { panel: "library", page: "memory", item: "slang:wassup" },
	{ panel: "library", page: "things", item: "3f2a" }, { panel: "feed" }, { panel: "settings" }, { panel: "settings", page: "voice" },
	{ panel: "settings", page: "may-do" }, { panel: "ideas", item: "a-b" }, { panel: "goals" }, { panel: "search" },
];
describe("routes", () => {
	it("round-trips every valid route", () => {
		for (const r of ROUTES) expect(parseRoute(routeHash(r), ALL)).toEqual(r);
		expect(routeHash(TALK)).toBe("");
	});
	it("maps the old hashes", () => {
		expect(parseRoute("#memory")).toEqual({ panel: "library", page: "memory" });
		expect(parseRoute("#insights")).toEqual({ panel: "feed" });
	});
	it("reads unknown, empty and unshipped hashes as Talk", () => {
		for (const h of ["", "#", "#nope", "#ideas", "#goals/x", "#search"]) expect(parseRoute(h)).toEqual(TALK);
	});
	it("never throws on bad escapes and never keeps a search word", () => {
		expect(parseRoute("#library/memory/%E0%A4%A")).toEqual({ panel: "library", page: "memory" });
		expect(parseRoute("#search/apple", ALL)).toEqual({ panel: "search" });
		expect(parseRoute("#settings/nope")).toEqual({ panel: "settings" });
		expect(parseRoute("#library/memory/" + "x".repeat(200))).toEqual({ panel: "library", page: "memory" });
	});
	it("goes up one level and leaves the app never", () => {
		expect(parentRoute({ panel: "settings", page: "voice" })).toEqual({ panel: "settings" });
		expect(parentRoute({ panel: "library", page: "notes", item: "i" })).toEqual({ panel: "library", page: "notes" });
		expect(parentRoute({ panel: "feed" })).toEqual(TALK);
	});
	it("pushes from Talk and into a page or row, replaces between rail items and filters", () => {
		expect(navKind(TALK, { panel: "library" })).toBe("push");
		expect(navKind({ panel: "library" }, { panel: "feed" })).toBe("replace");
		expect(navKind({ panel: "library" }, TALK)).toBe("replace");
		expect(navKind({ panel: "settings" }, { panel: "settings", page: "voice" })).toBe("push");
		expect(navKind({ panel: "library" }, { panel: "library", page: "notes" })).toBe("replace");
		expect(navKind({ panel: "library", page: "notes" }, { panel: "library", page: "notes", item: "i" })).toBe("push");
	});
});
