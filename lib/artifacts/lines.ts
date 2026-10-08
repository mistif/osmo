// Every line the build ever says, written by code in his register: full forms, no exclamation mark, no emoji. Spec 3.
import type { BuildError } from "./protocol";

export const LINES = {
	compile: "I could not get that to work. Shall I try a different approach?",
	runtime: "Something I built has stopped working.", // phase C appends "I can try to repair it."
	tooBig: "That came out larger than I allow, so I stopped. Could you ask for something smaller?",
	allowance: "I have used my share for today, so I cannot build that now.",
	cap: "I have reached today's limit for building.",
	failed: "I could not finish that just now. Would you like me to try again?",
	busy: "I am still building the last one.",
	off: "My building is switched off in Settings.",
	full: "You have as many things as I can keep. Please delete one first.",
	saveFailed: "I built it, but I could not keep it.",
} as const;

export function lineFor(code: BuildError): string {
	switch (code) {
		case "off":
			return LINES.off;
		case "allowance":
			return LINES.allowance;
		case "cap":
			return LINES.cap;
		case "too_big":
			return LINES.tooBig;
		default:
			return LINES.failed;
	}
}
