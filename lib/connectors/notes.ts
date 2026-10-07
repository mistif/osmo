// Notes (spec 3.2, 6.2): add, search and delete. Delete is the first tier 3 action: it holds for a yes, and the yes runs the stored id.
import { NOTES_TOTAL } from "../actions/caps";
import { clean, matchOne, only } from "../actions/match";
import type { Def } from "../actions/types";
import type { OwnerDb } from "../server/admin";

type Note = { id: string | number; text: string };

const READ_FAILED = "I could not read your notes just now.";
const SCAN = 200; // notes read for a search or a delete match
const SHOWN = 5;
const SHOWN_CHARS = 200;
const QUOTED_CHARS = 80;

const cut = (text: string, max: number) => Array.from(text).slice(0, max).join("");
const noun = (n: number) => (n === 1 ? "note" : "notes");

async function latest(c: { db: OwnerDb }): Promise<Note[] | null> {
	const { data, error } = await c.db.from("notes").select("id,text").order("created_at", { ascending: false }).limit(SCAN);
	return error || !Array.isArray(data) ? null : (data as unknown as Note[]);
}

export const noteAdd: Def = {
	name: "note_add",
	connector: "notes",
	tier: 2,
	needsResult: false,
	voiceOk: true,
	line: 'note_add {"text":"the note, 1000 characters"} tier 2: save a note.',
	unclear: "I did not catch what to save. Could you say it again?",
	check(a) {
		if (!only(a, ["text"])) return { ok: false };
		const text = clean(a.text, 1000);
		return text ? { ok: true, args: { text } } : { ok: false };
	},
	describe: () => "Add a note",
	async run(a, c) {
		const { count, error } = await c.db.from("notes").select("id", { count: "exact", head: true });
		if (error || count === null || count === undefined) return { ok: false, say: "I could not save that note just now." };
		if (count >= NOTES_TOTAL) return { ok: false, say: `You have reached the limit of ${NOTES_TOTAL} notes.` };
		const saved = await c.db.from("notes").insert({ text: (a as { text: string }).text });
		return saved.error ? { ok: false, say: "I could not save that note just now." } : { ok: true, say: "Saved the note.", result: null };
	},
};

export const noteSearch: Def = {
	name: "note_search",
	connector: "notes",
	tier: 1,
	needsResult: true,
	voiceOk: true,
	line: 'note_search {"query":"words, 80 characters, empty for the latest"} tier 1: look through the notes.',
	unclear: "I did not catch what to look for in your notes. Could you say it again?",
	check(a) {
		if (!only(a, ["query"]) || typeof a.query !== "string") return { ok: false };
		return { ok: true, args: { query: clean(a.query, 80) } };
	},
	describe: () => "Search the notes",
	async run(a, c) {
		const rows = await latest(c);
		if (rows === null) return { ok: false, say: READ_FAILED };
		const words = (a as { query: string }).query.toLowerCase().split(" ").filter(Boolean),
			hits = rows.filter((r) => words.every((w) => r.text.toLowerCase().includes(w))).slice(0, SHOWN);
		if (hits.length === 0) return { ok: true, say: "I found no notes like that.", result: null };
		const list = hits.map((r) => `${cut(r.text, SHOWN_CHARS).replace(/[.!?]+$/, "")}.`).join(" "),
			say = `${words.length === 0 ? "Your latest" : "I found"} ${hits.length} ${noun(hits.length)}. ${list}`;
		return { ok: true, say, result: say };
	},
};

export const noteDelete: Def = {
	name: "note_delete",
	connector: "notes",
	tier: 3,
	needsResult: false,
	voiceOk: true, // a note is small: a spoken yes may delete it (mail_send will not allow this)
	line: 'note_delete {"match":"words from the note, 80 characters"} tier 3: delete the one note that matches, after a yes.',
	unclear: "I did not catch which note to delete. Could you say it again?",
	check(a) {
		if (!only(a, ["match"])) return { ok: false };
		const match = clean(a.match, 80);
		return match ? { ok: true, args: { match } } : { ok: false };
	},
	async prepare(a, c) {
		const rows = await latest(c);
		if (rows === null) return { ok: false, say: READ_FAILED };
		const hit = matchOne(rows as { id: string | number; text: string }[], (a as { match: string }).match);
		if (!hit.ok) return { ok: false, say: hit.say };
		return { ok: true, args: { id: hit.row.id }, summary: `Delete this note: "${cut(hit.row.text, QUOTED_CHARS)}"? Say yes to delete it, or no.` };
	},
	describe: () => "Delete a note", // never the note's text
	async run(a, c) {
		const id = (a as { id?: unknown } | null)?.id;
		if (typeof id !== "string" && typeof id !== "number") return { ok: false, say: "I could not find that note." };
		const done = await c.db.from("notes").delete().eq("id", id).select("id");
		if (done.error) return { ok: false, say: "I could not delete that note just now." };
		if (!Array.isArray(done.data) || done.data.length === 0) return { ok: false, say: "I could not find that note." };
		return { ok: true, say: "Deleted the note.", result: null };
	},
};

export const noteDefs: Def[] = [noteAdd, noteSearch, noteDelete];
