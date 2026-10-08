"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { characterLines } from "@/lib/agent/character";
import type { AgentState } from "@/lib/agent/state";
import type { ChatStatus } from "@/lib/chat/types";
import { loadProfileRow } from "@/lib/shell/profile-client";
import { listDevices } from "@/lib/shell/passkeys";
import type { SETTINGS_PAGES } from "@/lib/shell/route";
import { devicesLine, mayDoLine, placeLine, voiceLine } from "@/lib/shell/settings-lines";
import { storyLines } from "@/lib/shell/story";
import { OSMO_BUILD, OSMO_BUILT_AT, OSMO_VERSION, versionLine } from "@/lib/shell/version";
import { CONNECTORS, ConnectorsSettings } from "./connectors-settings";
import { AiLine, DevicesBlock, LockBlock } from "./devices-lock";
import { VoiceSettings } from "./voice-settings";
import type { VoiceControls } from "./use-voice";
import insights from "./insights.module.css";
import panel from "./panels.module.css";
import s from "./shell.module.css";

export type SettingsPageId = (typeof SETTINGS_PAGES)[number];

// The panel title for each page (the index is just "Settings").
export const PAGE_TITLES: Record<SettingsPageId, string> = {
	devices: "Devices and lock",
	voice: "Voice",
	"may-do": "What he may do",
	place: "Place and notifications",
	about: "About",
};

const ORDER: SettingsPageId[] = ["devices", "voice", "may-do", "place", "about"];

// Whether this device has a push subscription. False when the browser has no service worker or anything throws.
async function thisDevicePushes(): Promise<boolean> {
	try {
		const registration = await navigator.serviceWorker.ready;
		return (await registration.pushManager.getSubscription()) !== null;
	} catch {
		return false;
	}
}

type Lines = Partial<Record<SettingsPageId, string>>;

export function SettingsIndex({ voice, goTo }: { voice: VoiceControls; goTo(page: SettingsPageId): void }) {
	// Loaded once. A line that has not loaded, or failed, is simply empty.
	const [lines, setLines] = useState<Lines>({});

	useEffect(() => {
		let alive = true;
		const put = (page: SettingsPageId, text: string) => {
			if (alive) setLines((current) => ({ ...current, [page]: text }));
		};
		async function load() {
			const [devices, profile, pushing] = await Promise.all([
				listDevices().catch(() => null),
				loadProfileRow(supabase).catch(() => "error" as const),
				thisDevicePushes(),
			]);
			if (devices && !devices.error) put("devices", devicesLine(devices.devices.length));
			if (profile !== "error") {
				const on = CONNECTORS.filter((c) => (profile.levels[c.id] ?? "off") !== "off").length;
				put("may-do", mayDoLine(profile.paused, on));
				put("place", placeLine(profile.place, pushing));
			}
		}
		void load();
		return () => {
			alive = false;
		};
	}, []);

	// The voice line follows the switches as they change, so it is not part of the one-time load.
	const lineFor = (page: SettingsPageId) => (page === "voice" ? voiceLine(voice.naturalVoice, voice.listening) : lines[page]);

	return (
		<div>
			{ORDER.map((page) => (
				<button key={page} type="button" className={s.pageLink} onClick={() => goTo(page)}>
					<span className={s.h3}>{PAGE_TITLES[page]}</span>
					<span className={`${panel.note} ${s.state}`}>{lineFor(page)}</span>
				</button>
			))}
		</div>
	);
}

export function SettingsPage({ page, voice, aiUsage, agent }: { page: SettingsPageId; voice: VoiceControls; aiUsage?: ChatStatus | null; agent: AgentState }) {
	// Read once at mount, not live at render, so render stays pure.
	const [now] = useState(() => Date.now());

	if (page === "devices") {
		return (
			<>
				<DevicesBlock />
				<LockBlock />
			</>
		);
	}
	if (page === "voice") return <VoiceSettings voice={voice} />;
	if (page === "may-do") {
		return (
			<>
				<ConnectorsSettings parts={["mayDo"]} />
				<AiLine aiUsage={aiUsage} />
			</>
		);
	}
	if (page === "place") return <ConnectorsSettings parts={["place", "notifications"]} />;

	const story = storyLines(agent.bond, now);
	return (
		<>
			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>About</h3>
				<p className={panel.note}>{versionLine(OSMO_VERSION, OSMO_BUILD, OSMO_BUILT_AT)}</p>
			</section>

			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>Who I am</h3>
				{characterLines().map((text) => (
					<p key={text} className={panel.line}>{text}</p>
				))}
			</section>

			<section className={panel.section}>
				<h3 className={panel.sectionTitle}>Our story</h3>
				{story.length === 0 ? (
					<p className={panel.note}>Our story starts with your first message.</p>
				) : (
					<ol className={insights.story}>
						{story.map((m) => (
							<li key={m.id} className={insights.moment}>
								<span className={insights.when}>{m.date}</span>
								{m.text}
							</li>
						))}
					</ol>
				)}
			</section>
		</>
	);
}
