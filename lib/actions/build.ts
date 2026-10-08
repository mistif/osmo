// The build action (artifacts spec 3, 10): code decides, the room builds. The Def only validates the brief and hands back a ticket;
// the model call is /api/build's. The log row says "Started building something." and never carries the brief.
import { LIMITS } from "../artifacts/compile";
import type { Def } from "./types";

export type { BuildTicket } from "./types";

export const buildDef: Def = {
	name: "build",
	connector: "artifacts",
	tier: 2,
	needsResult: false,
	voiceOk: false,
	line: 'build: make a small working thing for Gur (a calculator, timer, converter or little game) that appears beside you. args {"brief": what to make, plain words, 1 to 500 characters}. Use it only when he asks for something that runs. Tier 2.',
	unclear: "I could not tell what you would like me to build.",
	check(args) {
		if (typeof args !== "object" || args === null || Array.isArray(args)) return { ok: false };
		const o = args as Record<string, unknown>;
		if (Object.keys(o).some((k) => k !== "brief" && k !== "from") || (o.from !== undefined && o.from !== "")) return { ok: false };
		const brief = typeof o.brief === "string" ? o.brief.trim() : "";
		return brief.length >= 1 && brief.length <= LIMITS.briefChars ? { ok: true, args: { brief } } : { ok: false };
	},
	describe: () => "Build a small thing",
	logLine: () => "Started building something.",
	run: async (args) => ({ ok: true, say: "", result: null, ticket: { brief: (args as { brief: string }).brief } }),
};
