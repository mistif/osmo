import type { Organ } from "../state";

// The organs that decide how Osmo sounds. These come only from present-day donors,
// so he never talks like a butler or a knight. His heart and brain can come from anyone.
export const MODERN_ORGANS: Organ[] = ["voice", "humor", "slang", "quirks"];

export const MODERN_DONORS = new Set([
	"the-hype-coach",
	"the-street-party-host",
	"the-gen-z-group-chat",
	"the-streamer",
	"the-code-wizard",
	"the-trivia-champion",
	"the-sarcastic-barista",
	"the-night-shift-nurse",
	"the-old-friend",
	"the-rescue-firefighter",
	"the-protective-big-sister",
	"the-pun-machine",
]);
