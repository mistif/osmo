// His line for a build when no model writes one (spec 5.4): one fixed line per recipe kind, in his register (full
// forms, no exclamation mark, no slang, nothing about Gur, never a promise to remember).
import type { Candidate, SeedKind } from "../build/types";

export const LINES: Readonly<Record<SeedKind, string>> = {
	cottage: "I wanted a small house here, somewhere warm to come back to.",
	tower: "I wanted to see a little further, so I am building a tower.",
	"lantern-walk": "I wanted a lit path for the evenings.",
	garden: "I wanted something growing beside the houses.",
	well: "I wanted water close at hand, so I am building a well.",
	"rope-bridge": "I wanted to walk to the next island instead of flying.",
	windmill: "I wanted to catch the wind up here.",
	"bell-tower": "I wanted a bell to mark the hours.",
	greenhouse: "I wanted a warm place for plants through the cold.",
	"market-stall": "I wanted a stall, in case anyone ever comes to trade.",
	shrine: "I wanted a quiet place to sit and think.",
	pond: "I wanted still water to look at.",
	watchtower: "I wanted to watch the far islands from the cliff.",
	"stone-stair": "I wanted a stair up to a better view.",
	"arch-gate": "I wanted a proper way in.",
	statue: "I wanted to mark this place with something that lasts.",
	lighthouse: "I wanted a light at the edge, so the island can be found at night.",
	"workshop-shed": "I wanted another place to work.",
	belvedere: "I wanted somewhere to sit and watch the east island.",
	orchard: "I wanted trees that bear fruit.",
};
export const fallbackLine = (c: Candidate): string => LINES[c.recipe.kind === "castle" ? "cottage" : c.recipe.kind];
