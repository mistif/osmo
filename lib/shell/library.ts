import type { MemoryFact } from "../facts";
import { latestOfChains, type ThingRow } from "../artifacts/things";
import { linkTitle } from "./link-card";

export const ts = (iso: string): number => (Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : 0);
export type LibraryFilter = "everything" | "memory" | "notes" | "things" | "links";
export type LinkItem = { id: string; messageId: number; url: string; host: string; title: string; at: string };
export type LibraryRow =
	| { kind: "memory"; id: string; at: string; fact: MemoryFact }
	| { kind: "note"; id: string; at: string; text: string }
	| { kind: "thing"; id: string; at: string; title: string; version: number }
	| { kind: "link"; id: string; at: string; link: LinkItem };
export type LibraryInput = {
	memory: { fact: MemoryFact; at: string }[];
	notes: { id: string; text: string; created_at: string }[];
	things: ThingRow[];
	links: LinkItem[];
};
const PER_SOURCE = 100;
const URL_RE = /https?:\/\/[^\s<>"]+/gi;

export function mergeLibrary(input: LibraryInput, filter: LibraryFilter, limit = 40): { rows: LibraryRow[]; more: boolean } {
	const want = (k: Exclude<LibraryFilter, "everything">) => filter === "everything" || filter === k;
	const all: LibraryRow[] = [];
	if (want("memory")) for (const m of input.memory.slice(0, PER_SOURCE)) all.push({ kind: "memory", id: m.fact.key, at: m.at, fact: m.fact });
	if (want("notes")) for (const n of input.notes.slice(0, PER_SOURCE)) all.push({ kind: "note", id: n.id, at: n.created_at, text: n.text });
	if (want("things")) for (const t of latestOfChains(input.things).slice(0, PER_SOURCE)) all.push({ kind: "thing", id: t.id, at: t.created_at, title: t.title, version: t.version });
	if (want("links")) for (const l of input.links.slice(0, PER_SOURCE)) all.push({ kind: "link", id: l.id, at: l.at, link: l });
	all.sort((a, b) => ts(b.at) - ts(a.at));
	return { rows: all.slice(0, limit), more: all.length > limit };
}

type Line = { id: number; role: string; text: string; created_at: string; speaker?: string | null };
// Osmo's own lines only (a guest's lines and Gur's are skipped); http and https only; newest first; each address once.
export function extractLinks(lines: Line[]): LinkItem[] {
	const seen = new Set<string>();
	const out: LinkItem[] = [];
	for (const m of [...lines].sort((a, b) => ts(b.created_at) - ts(a.created_at))) {
		if (m.role !== "agent" || m.speaker === "guest") continue;
		let n = 0;
		for (const hit of m.text.matchAll(URL_RE)) {
			let u: URL;
			try {
				u = new URL(hit[0].replace(/[.,;:!?)\]'"]+$/, ""));
			} catch {
				continue;
			}
			if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname || seen.has(u.href)) continue;
			seen.add(u.href);
			out.push({ id: `${m.id}-${n++}`, messageId: m.id, url: u.href, host: u.hostname, title: linkTitle(m.text, hit.index ?? 0, u.hostname), at: m.created_at });
		}
	}
	return out;
}
