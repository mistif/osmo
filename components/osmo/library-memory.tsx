"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/lib/supabase";
import type { MemoryFact } from "@/lib/facts";
import { cleanEditedValue, type MemoryLine } from "@/lib/shell/memory-lines";
import { ForgetButtons } from "./forget-buttons";
import panel from "./panels.module.css";

const SAVE_FAILED = "I could not save that. Try again.";

// The same calls and rollbacks as MemoryPanel, on purpose, until the old panel is removed. `onChange` is setMemory
// itself: functional updates touch only the edited or forgotten key, so a fact learned mid-request is never clobbered.
export function useMemoryEdits(memory: MemoryFact[], onChange: Dispatch<SetStateAction<MemoryFact[]>>) {
	const [error, setError] = useState<string | null>(null);

	async function save(key: string, value: string) {
		const previous = memory.find((f) => f.key === key)?.value;
		if (previous === value) return;
		onChange((cur) => cur.map((f) => (f.key === key ? { ...f, value } : f)));
		// Upsert, not update: a fact learned this session may not have a row yet, and an update matching
		// zero rows reports no error, which would silently drop the edit.
		const { error: failed } = await supabase.from("memory_facts").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
		if (failed) {
			if (previous !== undefined) onChange((cur) => cur.map((f) => (f.key === key ? { ...f, value: previous } : f)));
			setError(SAVE_FAILED);
		} else setError(null);
	}

	async function forget(key: string) {
		const removed = memory.find((f) => f.key === key);
		onChange((cur) => cur.filter((f) => f.key !== key));
		const { error: failed } = await supabase.from("memory_facts").delete().eq("key", key);
		if (failed) {
			if (removed) onChange((cur) => (cur.some((f) => f.key === key) ? cur : [...cur, removed]));
			setError(SAVE_FAILED);
		} else setError(null);
	}

	return { save, forget, error };
}

export type MemoryEdits = ReturnType<typeof useMemoryEdits>;

// A remembered sentence: click to edit in place (Enter or blur saves, Escape cancels and keeps the panel open).
export function MemoryRow({ item, edits }: { item: MemoryLine; edits: MemoryEdits }) {
	const [editing, setEditing] = useState<string | null>(null);
	const [confirming, setConfirming] = useState(false);
	// One commit (save or cancel) per edit: Enter's save can be followed by the blur it causes.
	const committing = useRef(false);
	const text = useRef<HTMLButtonElement>(null);

	function finish() {
		setEditing(null);
		requestAnimationFrame(() => text.current?.focus());
	}

	function commit(value: string) {
		if (committing.current) return;
		committing.current = true;
		finish();
		const clean = cleanEditedValue(value);
		if (clean !== null) void edits.save(item.key, clean);
	}

	function cancel() {
		if (committing.current) return;
		committing.current = true;
		finish();
	}

	if (editing !== null) {
		return (
			<div className={panel.line}>
				<span>{item.lead}</span>
				<input
					className={panel.input}
					aria-label={item.lead}
					value={editing}
					autoFocus
					onChange={(e) => setEditing(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") commit(editing);
						if (e.key === "Escape") {
							// Cancel the edit only; do not also let the panel's document-level listener close it.
							e.preventDefault();
							e.stopPropagation();
							cancel();
						}
					}}
					onBlur={() => commit(editing)}
				/>
			</div>
		);
	}
	return (
		<div className={panel.line}>
			<button
				type="button"
				className={panel.lineText}
				ref={text}
				onClick={() => {
					committing.current = false;
					setEditing(item.value);
				}}
			>
				{item.sentence}
			</button>
			<div className={panel.actions}>
				<ForgetButtons
					label={item.sentence}
					confirming={confirming}
					onAsk={() => setConfirming(true)}
					onKeep={() => setConfirming(false)}
					onForget={() => {
						setConfirming(false);
						requestAnimationFrame(() => document.getElementById("osmo-panel-title")?.focus());
						void edits.forget(item.key);
					}}
				/>
			</div>
		</div>
	);
}
