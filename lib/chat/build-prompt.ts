// The words that ask a model for one small React component, and for its repair. The model is given
// the fixed rules and the brief (or the failing source) and nothing else: no name, no history, no
// mood, nothing Osmo knows (spec 5). scripts/build-probe.mjs loads this file straight into Node, so
// it imports nothing at runtime.

import type { InputItem } from "./types";

const ERROR_CHARS = 300;

export const RULES = [
	"You write one small React component for Osmo's room.",
	"Output plain text, no fences. The first line is `// title: ` then two to five words with no punctuation. After it comes the component and nothing else.",
	"The component is the default export, takes no props, imports only from react, and stays under 12 kilobytes.",
	"It runs in a sealed frame with no network, no storage and no access to anything outside itself, so keep all state inside the component.",
	"Use plain inline styles. You may use the colours var(--osmo-a), var(--osmo-b), var(--osmo-bg) and var(--osmo-ink).",
	"Make it work on a phone screen.",
	"Every word the thing shows to a person is written in Osmo's voice: calm, exact, understated, in complete sentences or short plain labels, with full forms such as \"do not\" and \"cannot\".",
	"Never use an exclamation mark, an emoji, slang or a symbol that a voice would read out. Do not praise the person or the thing.",
].join(" ");

// The brief is the person's words, so it travels as user input and never as an instruction.
export function buildPrompt(brief: string): { instructions: string; input: InputItem[] } {
	return { instructions: RULES, input: [{ role: "user", content: `Brief: ${brief}` }] };
}

// The error is the compiler's or the scan's message, never the person's words; it is cut to 300.
export function repairPrompt(error: string, source: string): { instructions: string; input: InputItem[] } {
	const instructions = `${RULES} This source failed with: ${error.slice(0, ERROR_CHARS)}. Return the whole component, corrected. Change only what is needed.`;
	return { instructions, input: [{ role: "user", content: `Source:\n${source}` }] };
}
