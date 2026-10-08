"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AgentState } from "@/lib/agent/state";
import type { ChatStatus } from "@/lib/chat/types";
import type { MemoryFact } from "@/lib/facts";
import { SETTINGS_PAGES } from "@/lib/shell/route";
import { FeedPanel } from "./feed-panel";
import { LibraryPanel } from "./library-panel";
import { PAGE_TITLES, SettingsIndex, SettingsPage, type SettingsPageId } from "./settings-pages";
import { ShellPanel } from "./shell-panel";
import type { useShell } from "./use-shell";
import type { VoiceControls } from "./use-voice";

// The open panel of shell v2, or nothing in Talk. A page or panel change changes the title, which takes focus.
export function ShellPanels({
	shell,
	memory,
	onMemoryChange,
	agent,
	voice,
	aiUsage,
	onOpenThing,
}: {
	shell: ReturnType<typeof useShell>;
	memory: MemoryFact[];
	onMemoryChange: Dispatch<SetStateAction<MemoryFact[]>>;
	agent: AgentState;
	voice: VoiceControls;
	aiUsage?: ChatStatus | null;
	onOpenThing(id: string, title: string, source: string): void;
}) {
	const { route } = shell;
	if (route.panel === null) return null;

	if (route.panel === "library") {
		return (
			<ShellPanel title="Library" onClose={shell.close}>
				<LibraryPanel route={route} go={shell.go} memory={memory} onMemoryChange={onMemoryChange} onOpenThing={onOpenThing} />
			</ShellPanel>
		);
	}
	if (route.panel === "feed") {
		return (
			<ShellPanel title="Feed" onClose={shell.close}>
				<FeedPanel onOpenThing={onOpenThing} />
			</ShellPanel>
		);
	}
	if (route.panel === "settings") {
		const page = (SETTINGS_PAGES as readonly string[]).includes(route.page ?? "") ? (route.page as SettingsPageId) : null;
		if (page === null) {
			return (
				<ShellPanel title="Settings" onClose={shell.close}>
					<SettingsIndex voice={voice} goTo={(p) => shell.open("settings", p)} />
				</ShellPanel>
			);
		}
		return (
			<ShellPanel title={PAGE_TITLES[page]} onBack={shell.back} onClose={shell.close}>
				<SettingsPage page={page} voice={voice} aiUsage={aiUsage} agent={agent} />
			</ShellPanel>
		);
	}
	return null;
}
