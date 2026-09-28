"use client";

import { useState } from "react";
import type { VoiceControls } from "./use-voice";
import { VoiceTeaching } from "./voice-teaching";
import styles from "./panels.module.css";

const UNREACHABLE = "I can't reach my memory right now. Try again in a moment.";
const FORGET_FAILED = "Couldn't save that. Try again.";

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
	const [confirming, setConfirming] = useState(false);
	const [forgetError, setForgetError] = useState<string | null>(null);
	const [taughtNow, setTaughtNow] = useState(false);
	const taught = Array.isArray(voice.prints) && voice.prints.length > 0;

	async function forget() {
		setConfirming(false);
		const done = await voice.forgetVoice();
		setForgetError(done ? null : FORGET_FAILED);
		if (done) setTaughtNow(false);
	}

	return (
		<section className={styles.section}>
			<h3 className={styles.sectionTitle}>Voice</h3>
			<p className={styles.note}>{voiceLine(voice.voiceName)}</p>

			<Switch label='Listen for "Osmo"' on={voice.listening} onChange={voice.setListen} disabled={!voice.listenSupported || voice.wakeReady !== true} />
			{!voice.listenSupported && <p className={styles.note}>Listening needs Chrome, Edge or Safari. I can still speak.</p>}
			{voice.listenSupported && voice.wakeReady === false && <p className={styles.note}>His wake word isn&apos;t trained yet.</p>}

			<Switch label="Speak typed replies too" on={voice.speakTyped} onChange={voice.setSpeakTyped} disabled={voice.voiceName === null} />

			{voice.teaching ? (
				<VoiceTeaching
					onDone={(saved) => {
						setTaughtNow(saved);
						void voice.finishTeaching(saved);
					}}
				/>
			) : (
				voice.listenSupported && (
					<>
						{taughtNow && (
							<p className={styles.note} role="status">
								I know your voice now.
							</p>
						)}
						<button type="button" className={styles.action} onClick={voice.startTeaching} disabled={voice.prints === null}>
							{taught ? "Teach again on this device" : "Teach Osmo my voice"}
						</button>
						{taught &&
							(confirming ? (
								<>
									<p className={styles.note}>I&apos;ll stop recognizing you on every device until you teach me again.</p>
									<div className={styles.actions}>
										<button type="button" className={styles.action} onClick={() => void forget()}>
											Forget my voice
										</button>
										<button type="button" className={styles.action} onClick={() => setConfirming(false)}>
											Keep
										</button>
									</div>
								</>
							) : (
								<button type="button" className={styles.action} onClick={() => setConfirming(true)}>
									Forget my voice
								</button>
							))}
					</>
				)
			)}

			{voice.prints === "error" && (
				<p className={styles.error} role="alert">
					{UNREACHABLE}
				</p>
			)}
			{voice.error && (
				<p className={styles.error} role="alert">
					{voice.error}
				</p>
			)}
			{forgetError && (
				<p className={styles.error} role="alert">
					{forgetError}
				</p>
			)}
		</section>
	);
}
