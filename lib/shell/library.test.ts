import { describe, expect, it } from "vitest";
import { extractLinks, mergeLibrary, type LibraryInput } from "./library";
import { linkTitle } from "./link-card";

const input: LibraryInput = {
	memory: [{ fact: { key: "name", value: "Gur" }, at: "2026-10-02T10:00:00Z" }],
	notes: [{ id: "n1", text: "call Dad", created_at: "2026-10-07T10:00:00Z" }],
	things: [
		{ id: "t1", title: "Tip", version: 1, parent_id: null, created_at: "2026-10-05T10:00:00Z" },
		{ id: "t2", title: "Tip", version: 2, parent_id: "t1", created_at: "2026-10-06T10:00:00Z" },
	],
	links: [{ id: "9-0", messageId: 9, url: "https://a.dev/", host: "a.dev", title: "a.dev", at: "2026-10-08T10:00:00Z" }],
};
describe("mergeLibrary", () => {
	it("sorts newest first across kinds and keeps the latest of each thing chain", () => {
		expect(mergeLibrary(input, "everything").rows.map((r) => r.id)).toEqual(["9-0", "n1", "t2", "name"]);
	});
	it("filters by kind and limits, saying when there is more", () => {
		expect(mergeLibrary(input, "notes").rows.map((r) => r.kind)).toEqual(["note"]);
		const m = mergeLibrary(input, "everything", 2);
		expect(m.rows).toHaveLength(2);
		expect(m.more).toBe(true);
	});
	it("compares real instants, not strings", () => {
		const two = { ...input, links: [], things: [], notes: [{ id: "a", text: "x", created_at: "2026-10-08T10:00:00.5+00:00" }, { id: "b", text: "y", created_at: "2026-10-08T10:00:00Z" }] };
		expect(mergeLibrary(two, "notes").rows[0].id).toBe("a");
	});
});
describe("extractLinks", () => {
	const line = (id: number, text: string, extra = {}) => ({ id, role: "agent", text, created_at: `2026-10-0${id}T10:00:00Z`, ...extra });
	it("takes http and https addresses from Osmo's own lines only", () => {
		const out = extractLinks([
			line(1, "The Next.js docs: https://nextjs.org/docs."), line(2, "see javascript:alert(1) and ftp://x.org and http:// nothing"),
			line(3, "mine", { role: "user" }), line(4, "to a guest https://g.dev", { speaker: "guest" }), line(5, "again https://nextjs.org/docs"),
		]);
		expect(out.map((l) => l.url)).toEqual(["https://nextjs.org/docs"]);
		expect(out[0]).toMatchObject({ messageId: 5, host: "nextjs.org" });
	});
	it("strips trailing punctuation and shows a lookalike host as written", () => {
		const out = extractLinks([line(1, "Look (https://www.example.com/a?b=1), then https://xn--pple-43d.com!")]);
		expect(out.map((l) => l.url)).toEqual(["https://www.example.com/a?b=1", "https://xn--pple-43d.com/"]);
		expect(out[1].host).toBe("xn--pple-43d.com");
	});
});
describe("linkTitle", () => {
	it("uses the words before a colon, else the host without www", () => {
		const t = "Sure. The Next.js docs: https://nextjs.org/docs";
		expect(linkTitle(t, t.indexOf("https"), "nextjs.org")).toBe("The Next.js docs");
		expect(linkTitle("Here https://www.a.dev/x", 5, "www.a.dev")).toBe("a.dev");
		const long = `${"w".repeat(80)}: https://a.dev`;
		expect(linkTitle(long, long.indexOf("https"), "a.dev")).toHaveLength(60);
	});
});
