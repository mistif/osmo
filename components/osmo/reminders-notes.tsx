"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dueLine, sanitizeNote, sanitizeReminder, type NoteRow, type ReminderRow } from "@/lib/shell/reminders-notes";
import styles from "./panels.module.css";

const UNREACHABLE = "I cannot reach my memory right now. Try again in a moment.";
const REMOVE_FAILED = "I could not remove that. Try again.";
// A table that is not there yet (PGRST205, before the phase 1 migration) is an empty list, not unreachable memory.
const MISSING_TABLE = "PGRST205";
function hardError(error: { code?: string } | null): boolean {
	return error !== null && error.code !== MISSING_TABLE;
}

// Two short lists, each row with a Remove button. The browser may only read and delete these rows (RLS).
export function RemindersNotes() {
	const [reminders, setReminders] = useState<ReminderRow[] | null>(null);
	const [notes, setNotes] = useState<NoteRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Captured when the lists load, so render stays pure (no Date.now() there).
	const [now, setNow] = useState(0);

	async function refresh() {
		const [r, n] = await Promise.all([
			supabase.from("reminders").select("id,text,due_at,status").in("status", ["pending", "missed"]).order("due_at"),
			supabase.from("notes").select("id,text,created_at").order("created_at", { ascending: false }),
		]);
		if (hardError(r.error) || hardError(n.error)) {
			setError(UNREACHABLE);
			setReminders([]);
			setNotes([]);
		} else {
			setError(null);
			setReminders((r.data ?? []).map(sanitizeReminder).filter((x): x is ReminderRow => x !== null));
			setNotes((n.data ?? []).map(sanitizeNote).filter((x): x is NoteRow => x !== null));
		}
		setNow(Date.now());
	}

	useEffect(() => {
		// Nested so the compiler sees this effect's own setup, not a shared helper, doing the setting.
		async function load() {
			await refresh();
		}
		void load();
	}, []);

	async function remove(table: "reminders" | "notes", id: string) {
		const { error: failed } = await supabase.from(table).delete().eq("id", id);
		await refresh();
		if (failed) setError(REMOVE_FAILED);
	}

	return (
		<section className={styles.section}>
			<h3 className={styles.sectionTitle}>Reminders and notes</h3>
			{reminders === null && notes === null && <p className={styles.note}>Checking...</p>}
			{reminders && (
				<>
					<p className={styles.note}>Reminders waiting or missed</p>
					{reminders.length === 0 && !error && <p className={styles.note}>None waiting.</p>}
					{reminders.map((r) => (
						<div key={r.id} className={styles.line}>
							<div>
								{r.text}
								<p className={styles.note}>{r.missed ? "Missed " : ""}{dueLine(r.due_at, now)}</p>
							</div>
							<div className={styles.actions}>
								<button type="button" className={styles.action} onClick={() => void remove("reminders", r.id)}>
									Remove
								</button>
							</div>
						</div>
					))}
				</>
			)}
			{notes && (
				<>
					<p className={styles.note}>Notes</p>
					{notes.length === 0 && !error && <p className={styles.note}>No notes yet.</p>}
					{notes.map((n) => (
						<div key={n.id} className={styles.line}>
							<div>{n.text}</div>
							<div className={styles.actions}>
								<button type="button" className={styles.action} onClick={() => void remove("notes", n.id)}>
									Remove
								</button>
							</div>
						</div>
					))}
				</>
			)}
			{error && <p className={styles.error} role="alert">{error}</p>}
		</section>
	);
}
