"use client";

import type { VoiceControls } from "./use-voice";
import styles from "./panels.module.css";

export function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange(on: boolean): void; disabled?: boolean }) {
	return (
		<button type="button" role="switch" aria-checked={on} className={styles.switch} onClick={() => onChange(!on)} disabled={disabled}>
			<span className={styles.switchTrack} aria-hidden="true">
				<span className={styles.switchThumb} />
			</span>
			{label}
		</button>
	);
}

function voiceLine(name: string | null | undefined): string {
	if (name === undefined) return "Checking my voice…";
	if (name === null) return "This device has no English voice, so I'll only write.";
	return `I speak with ${name} on this device.`;
}

export function VoiceSettings({ voice }: { voice: VoiceControls }) {
	return (
		<section className={styles.section}>
			<h3 className={styles.sectionTitle}>Voice</h3>
			<p className={styles.note}>{voiceLine(voice.voiceName)}</p>
			<Switch label="Speak typed replies too" on={voice.speakTyped} onChange={voice.setSpeakTyped} disabled={voice.voiceName === null} />
		</section>
	);
}
