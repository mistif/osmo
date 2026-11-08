// A bare yes or no, matched by code and never by the model. Pure, no imports, so the browser may use it too.
const YES = ["yes", "yep", "yeah", "sure", "go ahead", "do it", "send it", "confirm"];
const NO = ["no", "nope", "cancel", "do not", "don't", "stop", "never mind"];

export function decisionOf(text: string): "yes" | "no" | null {
	const t = text.trim().toLowerCase().replace(/[.!]+$/, "").replace(/\s+/g, " ");
	return YES.includes(t) ? "yes" : NO.includes(t) ? "no" : null;
}
