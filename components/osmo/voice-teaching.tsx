"use client";

// Teaching Osmo Gur's voice: five sentences read aloud, each turned into numbers on the device and the audio
// thrown away. Readings that don't match the rest are asked for again. Only the averaged voiceprint is saved.

import { useEffect, useRef, useState } from "react";
import { MIC_BLOCKED, MicError, MODEL_FAILED, NO_MIC, type MicHandle } from "@/lib/voice/engine";
import { readingDone, readingProblem, trimSilence } from "@/lib/voice/levels";
import { averagePrint, outliers, TEACHING_SENTENCES } from "@/lib/voice/voiceprint";
import { openMic } from "@/lib/voice/web/mic";
import { voiceEmbedding } from "@/lib/voice/web/speaker-id";
import { saveVoiceprint } from "@/lib/voice/web/voiceprints";
import styles from "./panels.module.css";

const TOO_QUIET = "That was too quiet to learn from. Try again somewhere quieter.";
const READ_AGAIN = "That one didn't sound like the others. Please read it again.";
const SAVE_FAILED = "Couldn't save your voice. Try again.";

type Phase = "ready" | "recording" | "learning" | "saving" | "failed";

export function VoiceTeaching({ onDone }: { onDone(saved: boolean): void }) {
	const [readings, setReadings] = useState<(number[] | null)[]>(() => TEACHING_SENTENCES.map(() => null));
	const [phase, setPhase] = useState<Phase>("ready");
	const [error, setError] = useState<string | null>(null);
	const micRef = useRef<MicHandle | null>(null);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const finishRef = useRef<(() => void) | null>(null);
	// Cancelled mid-flight (unmounted, or Cancel pressed): every step still in the air becomes a no-op.
	const cancelledRef = useRef(false);
	const next = readings.findIndex((r) => r === null);
	const current = next === -1 ? TEACHING_SENTENCES.length - 1 : next;

	function release() {
		if (timerRef.current) clearInterval(timerRef.current);
		timerRef.current = null;
		finishRef.current = null;
		micRef.current?.close();
		micRef.current = null;
	}

	useEffect(
		() => () => {
			cancelledRef.current = true;
			release();
		},
		[],
	);

	async function save(filled: number[][]) {
		setPhase("saving");
		const saved = await saveVoiceprint(averagePrint(filled));
		if (cancelledRef.current) return;
		if (saved) {
			onDone(true);
			return;
		}
		setError(SAVE_FAILED);
		setPhase("failed");
	}

	async function record() {
		setError(null);
		setPhase("recording");
		try {
			const mic = await openMic(() => {});
			if (cancelledRef.current) {
				mic.close();
				return;
			}
			micRef.current = mic;
			const start = mic.ring.total;
			const heard = () => Float32Array.from(mic.ring.since(start), (s) => s / 32768);
			const samples = await new Promise<Float32Array>((resolve) => {
				timerRef.current = setInterval(() => {
					const sofar = heard();
					if (readingDone(sofar)) resolve(sofar);
				}, 150);
				finishRef.current = () => resolve(heard());
			});
			release();
			if (cancelledRef.current) return;
			if (readingProblem(samples)) {
				setError(TOO_QUIET);
				setPhase("ready");
				return;
			}
			setPhase("learning");
			const embedding = await voiceEmbedding(trimSilence(samples));
			if (cancelledRef.current) return;
			const updated = readings.map((r, i) => (i === current ? embedding : r));
			if (updated.some((r) => r === null)) {
				setReadings(updated);
				setPhase("ready");
				return;
			}
			const filled = updated as number[][];
			const bad = outliers(filled);
			if (bad.length > 0) {
				setReadings(filled.map((r, i) => (bad.includes(i) ? null : r)));
				setError(READ_AGAIN);
				setPhase("ready");
				return;
			}
			setReadings(updated);
			await save(filled);
		} catch (problem) {
			release();
			setError(problem instanceof MicError ? (problem.problem === "blocked" ? MIC_BLOCKED : NO_MIC) : MODEL_FAILED);
			setPhase("ready");
		}
	}

	function cancel() {
		cancelledRef.current = true;
		release();
		onDone(false);
	}

	return (
		<div className={styles.teach}>
			<p className={styles.note} aria-live="polite">
				Reading {current + 1} of {TEACHING_SENTENCES.length}
			</p>
			<p className={styles.sentence}>{TEACHING_SENTENCES[current]}</p>
			{phase === "ready" && (
				<button type="button" className={styles.action} onClick={() => void record()} autoFocus>
					Start reading
				</button>
			)}
			{phase === "recording" && (
				<>
					<p className={styles.note} role="status">
						Listening. I&apos;ll stop when you pause.
					</p>
					<button type="button" className={styles.action} onClick={() => finishRef.current?.()}>
						Done
					</button>
				</>
			)}
			{phase === "learning" && (
				<p className={styles.note} role="status">
					Learning that one…
				</p>
			)}
			{phase === "saving" && (
				<p className={styles.note} role="status">
					Saving your voice…
				</p>
			)}
			{phase === "failed" && (
				<button type="button" className={styles.action} onClick={() => void save(readings as number[][])}>
					Save again
				</button>
			)}
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{phase !== "saving" && (
				<button type="button" className={styles.action} onClick={cancel}>
					Cancel
				</button>
			)}
		</div>
	);
}
