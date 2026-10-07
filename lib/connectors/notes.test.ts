/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { NOTES_TOTAL } from "../actions/caps";
import { fakeDb } from "../actions/fake-db";
import type { Def, Profile, RunCtx } from "../actions/types";
import { noteAdd, noteDefs, noteDelete, noteSearch } from "./notes";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const profile: Profile = { timezone: "Europe/Stockholm", place: null, paused: false, hideReminderText: false, levels: {} };
const check = (d: Def, a: unknown) => d.check(a, { now: NOW, timezone: "Europe/Stockholm" });
const noNetwork = (() => {
	throw new Error("no network");
}) as any;
const rc = (db: any): RunCtx => ({ db, now: NOW, timezone: "Europe/Stockholm", profile, fetch: noNetwork, env: {} });
// created_at climbs with the position, so the last one is the newest
const notes = (...texts: string[]) => texts.map((text, i) => ({ id: i + 1, text, created_at: new Date(NOW - (texts.length - i) * 60_000).toISOString() }));
// a db whose every read comes back as an error
const unreadable = () => ({ owner: "owner-1", from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { message: "x" } }) }) }) }) }) as any;

describe("the note defs", () => {
	it("are three, on the notes connector, with note_delete the only tier 3", () => {
		expect(noteDefs.map((d) => [d.name, d.tier, d.needsResult])).toEqual([
			["note_add", 2, false],
			["note_search", 1, true],
			["note_delete", 3, false],
		]);
		for (const d of noteDefs) {
			expect(d.connector).toBe("notes");
			expect(d.line).toContain(d.name);
			expect(d.line).toContain(`tier ${d.tier}`);
			expect(d.unclear).not.toContain("!");
			expect(d.line + d.unclear).toMatch(/^[\x20-\x7e]*$/);
			expect(d.voiceOk).toBe(true);
			if (d.tier === 3) expect(d.prepare).toBeTypeOf("function");
		}
	});
});

describe("note_add", () => {
	it("checks exact keys and cleans the text to 1000 characters", () => {
		expect(check(noteAdd, { text: "buy milk" })).toEqual({ ok: true, args: { text: "buy milk" } });
		expect((check(noteAdd, { text: "x".repeat(1500) }) as any).args.text).toHaveLength(1000);
		expect((check(noteAdd, { text: "a\u0000b\nc" }) as any).args.text).toBe("a b c");
		for (const v of [{}, { text: "" }, { text: "   " }, { text: 5 }, { text: "a", more: 1 }, null, "x", []]) expect(check(noteAdd, v)).toEqual({ ok: false });
	});
	it("saves the note and says so without repeating it", async () => {
		const db = fakeDb({}, "owner-1", () => NOW);
		const out = await noteAdd.run({ text: "buy milk" }, rc(db));
		expect(out).toEqual({ ok: true, say: "Saved the note.", result: null });
		expect(db.tables.notes).toHaveLength(1);
		expect(db.tables.notes[0]).toMatchObject({ text: "buy milk", user_id: "owner-1" });
	});
	it("stops at the total", async () => {
		const full = Array.from({ length: NOTES_TOTAL }, (_, i) => ({ id: i + 1, text: `n${i}` }));
		const db = fakeDb({ notes: full }, "owner-1", () => NOW);
		const out = await noteAdd.run({ text: "one more" }, rc(db));
		expect(out).toEqual({ ok: false, say: "You have reached the limit of 500 notes." });
		expect(db.tables.notes).toHaveLength(NOTES_TOTAL);
		const db2 = fakeDb({ notes: full.slice(1) }, "owner-1", () => NOW);
		expect((await noteAdd.run({ text: "the last" }, rc(db2))).ok).toBe(true);
	});
	it("says a plain line when the count or the insert fails", async () => {
		const db = fakeDb({}, "owner-1", () => NOW);
		const noInsert = { owner: "owner-1", from: (t: string) => ({ select: db.from(t).select, insert: () => Promise.resolve({ error: { message: "x" } }) }) } as any;
		expect(await noteAdd.run({ text: "a" }, rc(noInsert))).toEqual({ ok: false, say: "I could not save that note just now." });
		const noCount = { owner: "owner-1", from: () => ({ select: () => Promise.resolve({ count: null, error: { message: "x" } }) }) } as any;
		expect(await noteAdd.run({ text: "a" }, rc(noCount))).toEqual({ ok: false, say: "I could not save that note just now." });
	});
});

describe("note_search", () => {
	it("checks exact keys; the query is cut to 80 and may be empty", () => {
		expect(check(noteSearch, { query: "milk" })).toEqual({ ok: true, args: { query: "milk" } });
		expect(check(noteSearch, { query: "" })).toEqual({ ok: true, args: { query: "" } });
		expect(check(noteSearch, { query: "   " })).toEqual({ ok: true, args: { query: "" } });
		expect((check(noteSearch, { query: "x".repeat(200) }) as any).args.query).toHaveLength(80);
		for (const v of [{}, { query: 5 }, { query: null }, { query: "a", more: 1 }, null, "x", []]) expect(check(noteSearch, v)).toEqual({ ok: false });
	});
	it("finds notes holding every word, newest first, and returns the text as the result", async () => {
		const db = fakeDb({ notes: notes("buy milk and eggs", "call Dad", "milk the cow") }, "owner-1", () => NOW);
		const out = await noteSearch.run({ query: "MILK" }, rc(db));
		expect(out).toEqual({ ok: true, say: "I found 2 notes. milk the cow. buy milk and eggs.", result: "I found 2 notes. milk the cow. buy milk and eggs." });
		expect(await noteSearch.run({ query: "milk eggs" }, rc(db))).toMatchObject({ ok: true, say: "I found 1 note. buy milk and eggs." });
	});
	it("an empty query gives the latest five", async () => {
		const db = fakeDb({ notes: notes("a", "b", "c", "d", "e", "f", "g") }, "owner-1", () => NOW);
		expect(await noteSearch.run({ query: "" }, rc(db))).toMatchObject({ ok: true, say: "Your latest 5 notes. g. f. e. d. c." });
	});
	it("gives at most five matches, each cut to 200 characters", async () => {
		const db = fakeDb({ notes: notes("milk " + "x".repeat(400), "milk 1", "milk 2", "milk 3", "milk 4", "milk 5") }, "owner-1", () => NOW);
		const out = (await noteSearch.run({ query: "milk" }, rc(db))) as any;
		expect(out.say).toBe("I found 5 notes. milk 5. milk 4. milk 3. milk 2. milk 1."); // the oldest, long one fell outside the five
		const db2 = fakeDb({ notes: notes("milk " + "y".repeat(400)) }, "owner-1", () => NOW);
		const out2 = (await noteSearch.run({ query: "milk" }, rc(db2))) as any;
		expect(out2.say).toBe("I found 1 note. " + ("milk " + "y".repeat(195)) + ".");
	});
	it("does not double the full stop a note already ends with", async () => {
		const db = fakeDb({ notes: notes("call Dad.", "ring Sam?") }, "owner-1", () => NOW);
		expect(await noteSearch.run({ query: "" }, rc(db))).toMatchObject({ say: "Your latest 2 notes. ring Sam. call Dad." });
	});
	it("only reads the latest 200 notes", async () => {
		const rows = notes("old needle", ...Array.from({ length: 200 }, (_, i) => `filler ${i}`));
		const db = fakeDb({ notes: rows }, "owner-1", () => NOW);
		expect(await noteSearch.run({ query: "needle" }, rc(db))).toEqual({ ok: true, say: "I found no notes like that.", result: null });
	});
	it("says so when nothing matches, with no result for call 2", async () => {
		const db = fakeDb({ notes: notes("call Dad") }, "owner-1", () => NOW);
		expect(await noteSearch.run({ query: "milk" }, rc(db))).toEqual({ ok: true, say: "I found no notes like that.", result: null });
		expect(await noteSearch.run({ query: "" }, rc(fakeDb({}, "owner-1", () => NOW)))).toEqual({ ok: true, say: "I found no notes like that.", result: null });
	});
	it("says a plain line when the read fails", async () => {
		expect(await noteSearch.run({ query: "a" }, rc(unreadable()))).toEqual({ ok: false, say: "I could not read your notes just now." });
	});
});

describe("note_delete", () => {
	it("checks exact keys and cleans match to 80", () => {
		expect(check(noteDelete, { match: "milk" })).toEqual({ ok: true, args: { match: "milk" } });
		expect((check(noteDelete, { match: "x".repeat(200) }) as any).args.match).toHaveLength(80);
		for (const v of [{}, { match: "" }, { match: 5 }, { match: "a", more: 1 }, null, []]) expect(check(noteDelete, v)).toEqual({ ok: false });
	});
	it("prepare goes ahead on exactly one match and asks with the note quoted", async () => {
		const db = fakeDb({ notes: notes("buy milk and eggs", "call Dad") }, "owner-1", () => NOW);
		const p = await noteDelete.prepare!({ match: "milk" }, rc(db));
		expect(p).toEqual({ ok: true, args: { id: 1 }, summary: 'Delete this note: "buy milk and eggs"? Say yes to delete it, or no.' });
		expect(db.tables.notes).toHaveLength(2);
	});
	it("prepare quotes at most the first 80 characters", async () => {
		const db = fakeDb({ notes: notes("z".repeat(300)) }, "owner-1", () => NOW);
		const p = (await noteDelete.prepare!({ match: "zzz" }, rc(db))) as any;
		expect(p.summary).toBe(`Delete this note: "${"z".repeat(80)}"? Say yes to delete it, or no.`);
	});
	it("prepare refuses none and several, with the match line", async () => {
		const db = fakeDb({ notes: notes("buy milk", "milk the cow", "call Dad") }, "owner-1", () => NOW);
		expect(await noteDelete.prepare!({ match: "milk" }, rc(db))).toEqual({ ok: false, say: "I found 2 like that. Please say a little more." });
		expect(await noteDelete.prepare!({ match: "pizza" }, rc(db))).toEqual({ ok: false, say: "I could not find one like that." });
	});
	it("prepare only looks at the latest 200 and says a plain line on a read error", async () => {
		const rows = notes("old needle", ...Array.from({ length: 200 }, (_, i) => `filler ${i}`));
		expect(await noteDelete.prepare!({ match: "needle" }, rc(fakeDb({ notes: rows }, "owner-1", () => NOW)))).toEqual({ ok: false, say: "I could not find one like that." });
		expect(await noteDelete.prepare!({ match: "a" }, rc(unreadable()))).toEqual({ ok: false, say: "I could not read your notes just now." });
	});
	it("run deletes only the stored id, even if a newer note now matches the words", async () => {
		const db = fakeDb({ notes: notes("buy milk and eggs") }, "owner-1", () => NOW);
		const p = (await noteDelete.prepare!({ match: "milk" }, rc(db))) as any;
		db.tables.notes.push({ id: 2, user_id: "owner-1", text: "milk again", created_at: new Date(NOW).toISOString() });
		expect(await noteDelete.run(p.args, rc(db))).toEqual({ ok: true, say: "Deleted the note.", result: null });
		expect(db.tables.notes.map((n) => n.id)).toEqual([2]);
	});
	it("run says so when the note is already gone, and rejects a bad stored id", async () => {
		const db = fakeDb({ notes: notes("a") }, "owner-1", () => NOW);
		expect(await noteDelete.run({ id: 99 }, rc(db))).toEqual({ ok: false, say: "I could not find that note." });
		expect(await noteDelete.run({ id: { x: 1 } }, rc(db))).toEqual({ ok: false, say: "I could not find that note." });
		expect(await noteDelete.run(null, rc(db))).toEqual({ ok: false, say: "I could not find that note." });
		expect(db.tables.notes).toHaveLength(1);
	});
	it("describes itself without the note's text", () => {
		expect(noteDelete.describe({ match: "secret words" })).toBe("Delete a note");
		expect(noteDelete.describe({ id: 3 })).toBe("Delete a note");
		expect(noteAdd.describe({ text: "secret words" })).not.toContain("secret");
		expect(noteSearch.describe({ query: "secret words" })).not.toContain("secret");
	});
});
