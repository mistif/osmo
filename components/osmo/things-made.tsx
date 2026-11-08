"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LINES } from "@/lib/artifacts/lines";
import { describeThing, latestOfChains, sanitizeThing, type ThingRow } from "@/lib/artifacts/things";
import panel from "./panels.module.css";
import styles from "./insights.module.css";

const OPEN_FAILED = "I could not open that. Try again.";

// A missing table (PGRST205, before the migration) and any other failure read as nothing made yet.
async function fetchRows(): Promise<ThingRow[]> {
	const { data, error } = await supabase.from("artifacts").select("id,title,version,parent_id,created_at").order("created_at", { ascending: false }).limit(200);
	return error ? [] : latestOfChains((data ?? []).map(sanitizeThing).filter((r): r is ThingRow => r !== null));
}

// "Things I made": one row per thing, its newest version, with Open and Delete. The list never asks for the source;
// Open reads the source of that one row. Until the table exists (or while there is nothing), the section stays hidden,
// so the feature is invisible while it is dark.
export function ThingsMade({ onOpen, onDeleted }: { onOpen(id: string, title: string, source: string): void; onDeleted?(id: string): void }) {
	const [rows, setRows] = useState<ThingRow[] | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	// Read once at mount, not live at render, so render stays pure.
	const [now] = useState(() => Date.now());

	useEffect(() => {
		(async () => setRows(await fetchRows()))();
	}, []);

	async function open(r: ThingRow) {
		const { data, error } = await supabase.from("artifacts").select("source").eq("id", r.id).maybeSingle();
		if (error || typeof data?.source !== "string") return setProblem(OPEN_FAILED);
		setProblem(null);
		onOpen(r.id, r.title, data.source);
	}

	async function remove(r: ThingRow) {
		setConfirming(null);
		const { error } = await supabase.from("artifacts").delete().eq("id", r.id);
		if (error) return setProblem(LINES.deleteFailed);
		setProblem(null);
		onDeleted?.(r.id); // a thing open in the room goes with its row
		// The version before it, if there is one, takes its place.
		setRows(await fetchRows());
	}

	if (rows === null || rows.length === 0) return null;
	return (
		<section className={panel.section}>
			<h3 className={panel.sectionTitle}>Things I made</h3>
			<ul className={styles.did}>
				{rows.map((r) => (
					<li key={r.id} className={panel.line}>
						<span>{describeThing(r, now)}</span>
						<div className={panel.actions}>
							<button type="button" className={panel.action} aria-label={`Open ${r.title}`} onClick={() => void open(r)}>
								Open
							</button>
							{confirming === r.id ? (
								<>
									<button type="button" className={panel.action} autoFocus onClick={() => void remove(r)}>
										Delete it
									</button>
									<button type="button" className={panel.action} onClick={() => setConfirming(null)}>
										Keep
									</button>
								</>
							) : (
								<button type="button" className={panel.action} aria-label={`Delete ${r.title}`} onClick={() => setConfirming(r.id)}>
									Delete
								</button>
							)}
						</div>
					</li>
				))}
			</ul>
			{problem && <p className={panel.error} role="alert">{problem}</p>}
		</section>
	);
}
