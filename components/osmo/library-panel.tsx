"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { MemoryFact } from "@/lib/facts";
import { describeThing, type ThingRow } from "@/lib/artifacts/things";
import { forgetRow, openThingSource, readLinks, readMemoryDates, readNotes, readThings } from "@/lib/shell/data";
import { mergeLibrary, type LibraryFilter, type LibraryRow, type LinkItem } from "@/lib/shell/library";
import { memoryLine } from "@/lib/shell/memory-lines";
import type { NoteRow } from "@/lib/shell/reminders-notes";
import { LIBRARY_FILTERS, type Route } from "@/lib/shell/route";
import { ForgetButtons } from "./forget-buttons";
import { MemoryRow, useMemoryEdits } from "./library-memory";
import panels from "./panels.module.css";
import shell from "./shell.module.css";

const UNREACHABLE = "I cannot reach my memory right now. Try again in a moment.";
const SAVE_FAILED = "I could not save that. Try again.";
const OPEN_FAILED = "I could not open that. Try again.";
const PAGE = 40;

const FILTERS: { id: LibraryFilter; name: string }[] = [
	{ id: "everything", name: "Everything" },
	{ id: "memory", name: "Memory" },
	{ id: "notes", name: "Notes" },
	{ id: "things", name: "Things" },
	{ id: "links", name: "Links" },
];

const EMPTY: Record<LibraryFilter, string> = {
	everything: "I do not keep anything yet. Ask me to remember something, or to make a note.",
	memory: "I do not know much about you yet. Tell me something, like your favorite food.",
	notes: "I have not kept a note yet. Ask me to make one.",
	things: "I have not made anything yet. Ask me to build something small.",
	links: "I have not shared a link yet.",
};

const CONFIRM: Partial<Record<LibraryRow["kind"], string>> = {
	thing: "This also deletes earlier versions.",
	link: "This also removes the line from our conversation.",
};

// "8 Oct", or nothing when the stamp cannot be read.
function shortDay(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type Loaded = { notes: NoteRow[]; things: ThingRow[]; links: LinkItem[]; dates: Record<string, string> };

export function LibraryPanel({
	route,
	memory,
	onMemoryChange,
	onOpenThing,
	go,
}: {
	route: Route;
	memory: MemoryFact[];
	onMemoryChange: Dispatch<SetStateAction<MemoryFact[]>>;
	onOpenThing(id: string, title: string, source: string): void;
	go(to: Route): void;
}) {
	const filter: LibraryFilter = (LIBRARY_FILTERS as readonly string[]).includes(route.page ?? "") ? (route.page as LibraryFilter) : "everything";
	const [data, setData] = useState<Loaded | null>(null);
	const [failed, setFailed] = useState(false);
	const [shown, setShown] = useState(PAGE);
	const [confirming, setConfirming] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	// The time the panel opened: the date of a fact that has no saved date (learned this session).
	const [openedAt] = useState(() => new Date().toISOString());
	const edits = useMemoryEdits(memory, onMemoryChange);

	// Nothing is fetched until the panel opens.
	useEffect(() => {
		let alive = true;
		async function load() {
			const [notes, things, links, dates] = await Promise.all([readNotes(), readThings(), readLinks(), readMemoryDates().catch(() => ({}))]);
			if (!alive) return;
			setFailed(notes.failed || things.failed || links.failed);
			setData({ notes: notes.rows, things: things.rows, links: links.rows, dates });
		}
		void load();
		return () => {
			alive = false;
		};
	}, []);

	const merged = useMemo(
		() =>
			data
				? mergeLibrary({ memory: memory.map((fact) => ({ fact, at: data.dates[fact.key] ?? openedAt })), notes: data.notes, things: data.things, links: data.links }, filter, shown)
				: { rows: [], more: false },
		[data, memory, filter, shown, openedAt],
	);

	// A deep link scrolls its row into view and lights it for 1.2 s. The class is set on the element itself,
	// so no state changes inside the effect.
	const loaded = data !== null;
	const item = route.item;
	useEffect(() => {
		if (!loaded || !item) return;
		const el = document.getElementById("row-" + item);
		if (!el) return;
		el.scrollIntoView({ block: "center" });
		el.classList.add(shell.lit);
		const timer = setTimeout(() => el.classList.remove(shell.lit), 1200);
		return () => {
			clearTimeout(timer);
			el.classList.remove(shell.lit);
		};
	}, [loaded, item]);

	async function forget(row: LibraryRow) {
		setConfirming(null);
		if (!data) return;
		const before = data;
		if (row.kind === "note") setData({ ...data, notes: data.notes.filter((n) => n.id !== row.id) });
		else if (row.kind === "thing") setData({ ...data, things: data.things.filter((t) => t.id !== row.id) });
		else if (row.kind === "link") {
			// One chat line can hold several addresses; deleting the line takes them all.
			setData({ ...data, links: data.links.filter((l) => l.messageId !== row.link.messageId) });
		} else return;
		const ok =
			row.kind === "note" ? await forgetRow("notes", row.id) : row.kind === "thing" ? await forgetRow("artifacts", row.id) : await forgetRow("messages", row.link.messageId);
		if (ok) setProblem(null);
		else {
			// Put back only what is still missing, so a row that came in meanwhile is not duplicated.
			setData((cur) => {
				if (!cur) return cur;
				if (row.kind === "note") return cur.notes.some((n) => n.id === row.id) ? cur : { ...cur, notes: before.notes };
				if (row.kind === "thing") return cur.things.some((t) => t.id === row.id) ? cur : { ...cur, things: before.things };
				return cur.links.some((l) => l.messageId === row.link.messageId) ? cur : { ...cur, links: before.links };
			});
			setProblem(SAVE_FAILED);
		}
	}

	async function openThing(id: string, title: string) {
		const source = await openThingSource(id);
		if (source === null) setProblem(OPEN_FAILED);
		else {
			setProblem(null);
			onOpenThing(id, title, source);
		}
	}

	function body(row: LibraryRow) {
		if (row.kind === "memory") return <MemoryRow item={memoryLine(row.fact)} edits={edits} />;
		const text =
			row.kind === "note" ? (
				row.text
			) : row.kind === "thing" ? (
				describeThing({ id: row.id, title: row.title, version: row.version, parent_id: null, created_at: row.at }, Date.parse(openedAt))
			) : (
				<>
					{row.link.title} <span className={shell.meta}>{row.link.host}</span>
				</>
			);
		const label = row.kind === "note" ? row.text : row.kind === "thing" ? row.title : row.link.title;
		return (
			<div className={panels.line}>
				<div>
					<span>{text}</span>
					<span className={`${shell.meta} ${shell.state}`}>{shortDay(row.at)}</span>
				</div>
				<div className={panels.actions}>
					{row.kind === "thing" && (
						<button type="button" className={panels.action} aria-label={`Open ${row.title}`} onClick={() => void openThing(row.id, row.title)}>
							Open
						</button>
					)}
					{row.kind === "link" && (
						<a className={panels.action} href={row.link.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${row.link.title}`}>
							Open
						</a>
					)}
					<ForgetButtons label={label} confirming={confirming === row.id} onAsk={() => setConfirming(row.id)} onKeep={() => setConfirming(null)} onForget={() => void forget(row)} />
				</div>
			</div>
		);
	}

	const empty = loaded && merged.rows.length === 0;
	return (
		<>
			<div className={shell.chips} role="group" aria-label="Show">
				{FILTERS.map((f) => (
					<button
						key={f.id}
						type="button"
						className={shell.chip}
						aria-pressed={filter === f.id}
						onClick={() => {
							setShown(PAGE);
							go({ panel: "library", page: f.id === "everything" ? undefined : f.id });
						}}
					>
						{f.name}
					</button>
				))}
			</div>

			<div>
				{!loaded && <p className={panels.note}>Checking what I keep...</p>}
				{merged.rows.map((row) => (
					<div key={`${row.kind}:${row.id}`} id={"row-" + row.id}>
						{body(row)}
						{confirming === row.id && CONFIRM[row.kind] && <p className={panels.note}>{CONFIRM[row.kind]}</p>}
					</div>
				))}
			</div>

			{empty && !failed && <p className={panels.empty}>{EMPTY[filter]}</p>}
			{merged.more && (
				<button type="button" className={panels.action} onClick={() => setShown((n) => n + PAGE)}>
					Show more
				</button>
			)}
			{failed && <p className={panels.error} role="alert">{UNREACHABLE}</p>}
			{(problem || edits.error) && <p className={panels.error} role="alert">{problem ?? edits.error}</p>}
		</>
	);
}
