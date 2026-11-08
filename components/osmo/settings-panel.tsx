"use client";

import { OSMO_BUILD, OSMO_BUILT_AT, OSMO_VERSION, versionLine } from "@/lib/shell/version";
import type { ChatStatus } from "@/lib/chat/types";
import { ConnectorsSettings } from "./connectors-settings";
import { AiLine, DevicesBlock, LockBlock } from "./devices-lock";
import { RemindersNotes } from "./reminders-notes";
import { VoiceSettings } from "./voice-settings";
import type { VoiceControls } from "./use-voice";
import styles from "./panels.module.css";

export function SettingsPanel({ voice, aiUsage }: { voice: VoiceControls; aiUsage?: ChatStatus | null }) {
	return (
		<>
			<DevicesBlock />

			<VoiceSettings voice={voice} />

			<ConnectorsSettings />
			<RemindersNotes />

			<AiLine aiUsage={aiUsage} />

			<LockBlock />

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>About</h3>
				<p className={styles.note}>{versionLine(OSMO_VERSION, OSMO_BUILD, OSMO_BUILT_AT)}</p>
			</section>
		</>
	);
}
