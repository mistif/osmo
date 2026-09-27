"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MemoryFact } from "@/lib/facts";
import { cleanEditedValue, GROUP_TITLES, groupMemory, type MemoryGroup, type MemoryLine } from "@/lib/shell/memory-lines";
import styles from "./panels.module.css";

const SAVE_FAILED = "Couldn't save that. Try again.";
const GROUPS: MemoryGroup[] = ["about", "words", "explained"];

export function MemoryPanel({ memory, onChange }: { memory: MemoryFact[]; onChange: (next: MemoryFact[]) => void }) {
	const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const groups = groupMemory(memory);
	const empty = memory.length === 0;

	async function save() {
		if (!editing) return;
		const value = cleanEditedValue(editing.value);
		const key = editing.key;
		setEditing(null);
		const before = memory;
		if (value === null || before.find((f) => f.key === key)?.value === value) return;
		onChange(before.map((f) => (f.key === key ? { ...f, value } : f)));
		const { error: failed } = await supabase
			.from("memory_facts")
			.update({ value, updated_at: new Date().toISOString() })
			.eq("key", key);
		if (failed) {
			onChange(before);
			setError(SAVE_FAILED);
		} else setError(null);
	}

	async function forget(key: string) {
		setConfirming(null);
		const before = memory;
		onChange(before.filter((f) => f.key !== key));
		const { error: failed } = await supabase.from("memory_facts").delete().eq("key", key);
		if (failed) {
			onChange(before);
			setError(SAVE_FAILED);
		} else setError(null);
	}

	function line(item: MemoryLine) {
		if (editing?.key === item.key) {
			return (
				<div key={item.key} className={styles.line}>
					<span>{item.lead}</span>
					<input
						className={styles.input}
						aria-label={item.lead}
						value={editing.value}
						autoFocus
						onChange={(e) => setEditing({ key: item.key, value: e.target.value })}
						onKeyDown={(e) => {
							if (e.key === "Enter") void save();
							if (e.key === "Escape") {
								// Cancel the edit only; do not also let Panel's document-level listener close the whole panel.
								e.preventDefault();
								e.stopPropagation();
								setEditing(null);
							}
						}}
						onBlur={() => void save()}
					/>
				</div>
			);
		}
		return (
			<div key={item.key} className={styles.line}>
				<button type="button" className={styles.lineText} onClick={() => setEditing({ key: item.key, value: item.value })}>
					{item.sentence}
				</button>
				<div className={styles.actions}>
					{confirming === item.key ? (
						<>
							<button type="button" className={styles.action} onClick={() => void forget(item.key)}>Forget this</button>
							<button type="button" className={styles.action} onClick={() => setConfirming(null)}>Keep</button>
						</>
					) : (
						<button type="button" className={styles.action} aria-label={`Forget: ${item.sentence}`} onClick={() => setConfirming(item.key)}>
							×
						</button>
					)}
				</div>
			</div>
		);
	}

	return (
		<>
			{empty && <p className={styles.empty}>I don&apos;t know much about you yet. Tell me something, like your favorite food.</p>}
			{GROUPS.filter((g) => groups[g].length > 0).map((g) => (
				<section key={g} className={styles.section}>
					<h3 className={styles.sectionTitle}>{GROUP_TITLES[g]}</h3>
					{groups[g].map(line)}
				</section>
			))}
			{error && <p className={styles.error} role="alert">{error}</p>}
		</>
	);
}
