// What the room shows of the conversation. With the village on (WORLD), the room is a chat box and no history: his reply
// above his head, the owner's own line for a moment where "what he heard" goes, and the composer always there. The
// per-device setting "Show the conversation as text" (showChat) then brings only the history (the log) back. With the
// village off it keeps its old meaning: a device that can listen is voice only until the setting is on.

export type ChatShape = {
	// The message list is drawn.
	log: boolean;
	// The box to type in (and the mic at its ordinary size) is drawn, not the large mic alone.
	composer: boolean;
};

export function chatShape(options: { world: boolean; showChat: boolean; listenSupported: boolean }): ChatShape {
	if (options.world) return { log: options.showChat, composer: true };
	// A browser that cannot listen has no way in but typing, so it shows the conversation whatever the setting.
	const voiceOnly = !options.showChat && options.listenSupported;
	return { log: !voiceOnly, composer: !voiceOnly };
}

// The owner's last line, kept for a moment after it is sent so it can sit where the voice mode shows what he heard.
export const ECHO_MS = 4000;

export type Echo = { seen: number; armed: boolean; text: string | null; n: number };

export const noEcho: Echo = { seen: 0, armed: false, text: null, n: 0 };

type Line = { role: string; text: string };

// Called while rendering with the current lines and whether the room is ready. A new line of the owner's after the room
// was already ready sets the echo; the saved history arriving with the room becoming ready does not.
export function echoStep(prev: Echo, lines: readonly Line[], ready: boolean): Echo {
	if (prev.seen === lines.length && prev.armed === ready) return prev;
	const fresh = prev.armed && ready ? [...lines.slice(prev.seen)].reverse().find((line) => line.role === "user") : undefined;
	return { seen: lines.length, armed: ready, text: fresh ? fresh.text : prev.text, n: fresh ? prev.n + 1 : prev.n };
}

// The timer's end: drops the echo, but only if no newer one has replaced it.
export function clearEcho(prev: Echo, n: number): Echo {
	return prev.n === n && prev.text !== null ? { ...prev, text: null } : prev;
}

// The note under the switch "Show the conversation as text".
export function showChatNote(options: { world: boolean; showChat: boolean; listenSupported: boolean }): string {
	if (options.world) {
		return options.showChat
			? "The conversation stays on screen. Everything we say is saved either way."
			: "Keep the conversation on screen. Everything we say is saved either way.";
	}
	if (options.showChat) return "You can type to me, and everything we say stays on screen.";
	return options.listenSupported ? "The room is just me and the mic. Turn this on to type instead." : "This browser cannot listen, so the conversation stays on screen here.";
}
