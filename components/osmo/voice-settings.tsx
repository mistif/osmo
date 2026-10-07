"use client";

import { useState } from "react";
import type { VoiceControls } from "./use-voice";
import { VoiceTeaching } from "./voice-teaching";
import styles from "./panels.module.css";

const UNREACHABLE = "I cannot reach my memory right now. Try again in a moment.";
const FORGET_FAILED = "I could not save that. Try again.";

function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange(on: boolean): void; disabled?: boolean }) {
	return (
		<button type="button" role="switch" aria-checked={on} className={styles.switch} onClick={() => onChange(!on)} disabled={disabled}>
			<span className={styles.switchTrack} aria-hidden="true">
				<span className={styles.switchThumb} />
			</span>
			{label}
		</button>
	);
}

function voiceLine(name: string | null | undefined, natural: boolean): string {
	if (natural) return "I speak with my natural voice.";
	if (name === undefined) return "Checking my voice…";
	if (name === null) return "This device has no English voice, so I will only write.";
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
			<p className={styles.note}>{voiceLine(voice.voiceName, voice.naturalVoice)}</p>

			{/* Speaking lane's block. The note is deliberately plain: turning this on sends the words he
			    says to OpenAI, and Gur should read that here rather than find it out later. */}
			<Switch label="Natural voice" on={voice.naturalVoice} onChange={voice.setNaturalVoice} />
			<p className={styles.note}>
				{voice.naturalVoice
					? "The words I say are sent to OpenAI to be spoken. What you say to me is not sent, and neither is your voice."
					: "A warmer, more human voice. It sends the words I say to OpenAI to be spoken; your own words and your voice stay on this device."}
			</p>

			<Switch label='Listen for "Osmo"' on={voice.listening} onChange={voice.setListen} disabled={!voice.listenSupported || voice.wakeReady !== true} />
			{!voice.listenSupported && <p className={styles.note}>Listening needs Chrome, Edge or Safari. I can still speak.</p>}
			{voice.listenSupported && voice.wakeReady === false && <p className={styles.note}>His wake word isn&apos;t trained yet.</p>}

			<Switch label="Show the conversation as text" on={voice.showChat} onChange={voice.setShowChat} />
			<p className={styles.note}>
				{voice.showChat
					? "You can type to me, and everything we say stays on screen."
					: voice.listenSupported
						? "The room is just me and the mic. Turn this on to type instead."
						: "This browser cannot listen, so the conversation stays on screen here."}
			</p>
			{voice.showChat && <Switch label="Speak typed replies too" on={voice.speakTyped} onChange={voice.setSpeakTyped} disabled={voice.voiceName === null} />}
			<Switch label="Fade my words after I say them" on={voice.fadeSaid} onChange={voice.setFadeSaid} />

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
