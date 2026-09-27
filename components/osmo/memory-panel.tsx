"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/lib/supabase";
import type { MemoryFact } from "@/lib/facts";
import { cleanEditedValue, GROUP_TITLES, groupMemory, type MemoryGroup, type MemoryLine } from "@/lib/shell/memory-lines";
import styles from "./panels.module.css";

const SAVE_FAILED = "Couldn't save that. Try again.";
const GROUPS: MemoryGroup[] = ["about", "words", "explained"];

// onChange is setMemory itself: functional updates touch only the edited/forgotten key, so a fact
// learned mid-request (e.g. from a chat reply) is never clobbered by a revert built from a stale list.
export function MemoryPanel({ memory, onChange }: { memory: MemoryFact[]; onChange: Dispatch<SetStateAction<MemoryFact[]>> }) {
	const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const groups = groupMemory(memory);
	const empty = memory.length === 0;

	// One commit (save or cancel) per edit: Enter's save can be followed by the blur it causes, which
	// would otherwise save a second time. Reset when a new edit starts, set on the first commit/cancel.
	const committingRef = useRef(false);
	// Focus targets keyed by fact key, restored after an edit or a forget/keep decision ends.
	const lineRefs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
	const forgetRefs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
	const confirmRefs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});

	async function save() {
		if (!editing || committingRef.current) return;
		committingRef.current = true;
		const key = editing.key;
		const value = cleanEditedValue(editing.value);
		const previous = memory.find((f) => f.key === key)?.value;
		setEditing(null);
		requestAnimationFrame(() => lineRefs.current[key]?.focus());
		if (value === null || previous === value) return;
		onChange((cur) => cur.map((f) => (f.key === key ? { ...f, value } : f)));
		// Upsert, not update: a fact learned this session may not have a row yet, and an update matching
		// zero rows reports no error, which would silently drop the edit.
		const { error: failed } = await supabase
			.from("memory_facts")
			.upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
		if (failed) {
			if (previous !== undefined) onChange((cur) => cur.map((f) => (f.key === key ? { ...f, value: previous } : f)));
			setError(SAVE_FAILED);
		} else setError(null);
	}

	function cancelEdit(key: string) {
		if (committingRef.current) return;
		committingRef.current = true;
		setEditing(null);
		requestAnimationFrame(() => lineRefs.current[key]?.focus());
	}

	async function forget(key: string) {
		const removed = memory.find((f) => f.key === key);
		setConfirming(null);
		requestAnimationFrame(() => document.getElementById("osmo-panel-title")?.focus());
		onChange((cur) => cur.filter((f) => f.key !== key));
		const { error: failed } = await supabase.from("memory_facts").delete().eq("key", key);
		if (failed) {
			if (removed) onChange((cur) => (cur.some((f) => f.key === key) ? cur : [...cur, removed]));
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
								cancelEdit(item.key);
							}
						}}
						onBlur={() => void save()}
					/>
				</div>
			);
		}
		return (
			<div key={item.key} className={styles.line}>
				<button
					type="button"
					className={styles.lineText}
					ref={(el) => {
						lineRefs.current[item.key] = el;
					}}
					onClick={() => {
						committingRef.current = false;
						setEditing({ key: item.key, value: item.value });
					}}
				>
					{item.sentence}
				</button>
				<div className={styles.actions}>
					{confirming === item.key ? (
						<>
							<button
								type="button"
								className={styles.action}
								ref={(el) => {
									confirmRefs.current[item.key] = el;
								}}
								onClick={() => void forget(item.key)}
							>
								Forget this
							</button>
							<button
								type="button"
								className={styles.action}
								onClick={() => {
									setConfirming(null);
									requestAnimationFrame(() => forgetRefs.current[item.key]?.focus());
								}}
							>
								Keep
							</button>
						</>
					) : (
						<button
							type="button"
							className={styles.action}
							aria-label={`Forget: ${item.sentence}`}
							ref={(el) => {
								forgetRefs.current[item.key] = el;
							}}
							onClick={() => {
								setConfirming(item.key);
								requestAnimationFrame(() => confirmRefs.current[item.key]?.focus());
							}}
						>
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
