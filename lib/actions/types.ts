import type { OwnerDb } from "../server/admin";

export type Tier = 1 | 2 | 3;
export type Level = "off" | "read" | "ask" | "act";
export type Surface = "room" | "telegram" | "cron" | "confirm";
export type Env = Readonly<Record<string, string | undefined>>;
export type ActionProposal = { name: string; args: string };
// The build action's hand-off to the room (artifacts spec 3.2): the validated brief and the id of the log row to settle later.
export type BuildTicket = { brief: string; actionId: number | null };
export type ActionContext = { userId: string; surface: Surface; now: number };
export type ActionOutcome =
	| { kind: "ignored" }
	| { kind: "done"; line: string; result: string | null; ticket?: BuildTicket } // result non-null means "call 2 follows"; a ticket means the room starts a build
	| { kind: "waiting"; line: string }
	| { kind: "failed" | "refused"; line: string };
export type EnabledActions = { names: string[]; lines: string[]; today: string; timezone: string; place: string | null };
export type Place = { label: string; lat: number; lon: number };
export type Profile = {
	timezone: string | null;
	place: Place | null;
	paused: boolean;
	hideReminderText: boolean;
	levels: Record<string, Level>;
};
export type CheckCtx = { now: number; timezone: string | null };
export type RunCtx = CheckCtx & { db: OwnerDb; profile: Profile; fetch: typeof fetch; env: Env };
export type RunResult = { ok: true; say: string; result: string | null; ticket?: { brief: string } } | { ok: false; say: string };
export type Def = {
	name: string;
	connector: string;
	tier: Tier;
	needsResult: boolean;
	voiceOk: boolean;
	line: string; // the model's one-line description: name, args, tier
	unclear: string; // said when the args are invalid
	check(args: unknown, c: CheckCtx): { ok: true; args: unknown } | { ok: false; say?: string };
	// required for tier 3. summary is shown to the user and kept in pending_actions (server-only, swept);
	// logSummary is what the waiting log row says, and it carries no message text.
	prepare?(args: unknown, c: RunCtx): Promise<{ ok: true; args: unknown; summary: string; logSummary?: string } | { ok: false; say: string }>;
	describe(args: unknown): string; // short, code-written, never message text, for log rows of failed or refused actions
	logLine?(args: unknown, outcome: RunResult, c?: RunCtx): string; // the log row of a done run, code-written, never message text (default: the say line)
	run(args: unknown, c: RunCtx): Promise<RunResult>;
};
export type Deps = { env: Env; db(): OwnerDb; fetch: typeof fetch; registry: readonly Def[]; count(event: string): void };
export const CONNECTORS = ["reminders", "notes", "weather", "calendar", "mail", "spotify", "artifacts"] as const;
