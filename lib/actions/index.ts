// The seam the language lane calls (spec 3.3): runAction, listEnabledActions and cancelWaiting.
// Everything is dark unless OSMO_ACTIONS is exactly "on"; then each function returns before it touches the db.
import { ownerDb, type OwnerDb } from "../server/admin";
import { capReached } from "./caps";
import { cancelAllPending, holdPending } from "./confirm";
import { execute, logger } from "./execute";
import { levelOf, loadProfile } from "./profile";
import { REGISTRY } from "./registry";
import { todayLine } from "./time";
import { decide } from "./tiers";
import type { ActionContext, ActionOutcome, ActionProposal, Def, Deps, EnabledActions, Env, Level, RunCtx } from "./types";

export type { ActionContext, ActionOutcome, ActionProposal, BuildTicket, EnabledActions } from "./types";

// Bigger than any real args text (the longest is a 1,000 character note); anything over it is not parsed.
const MAX_ARGS = 4000;
const FAILED = "That did not work just now.";

export const actionsOn = (env: Env) => env.OSMO_ACTIONS === "on";

export const realDeps = (): Deps => ({
	env: process.env,
	db: () => ownerDb(),
	fetch: (...a) => fetch(...a),
	registry: REGISTRY,
	count: (e) => console.warn(JSON.stringify({ event: e })),
});

const sameOwner = (db: OwnerDb, userId: unknown) => typeof userId === "string" && db.owner === userId.trim().toLowerCase();

// decide() unless the Def names the levels it works at (build: act only), in which case any other level refuses.
const levelVerdict = (def: Def, level: Level) => (def.levels && !def.levels.includes(level) ? "refuse" : decide(level, def.tier));

export async function runAction(p: ActionProposal, ctx: ActionContext, deps: Deps = realDeps()): Promise<ActionOutcome> {
	if (!actionsOn(deps.env)) return { kind: "ignored" };
	if (!p || typeof p.name !== "string" || typeof p.args !== "string") return { kind: "ignored" };
	const def = deps.registry.find((d) => d.name === p.name);
	if (!def) {
		deps.count("action.unknown");
		return { kind: "ignored" };
	}
	let db: OwnerDb;
	try {
		db = deps.db();
	} catch {
		return { kind: "ignored" };
	}
	if (!sameOwner(db, ctx.userId)) return { kind: "ignored" };
	const log = logger(db, def, ctx.surface);
	try {
		const profile = await loadProfile(db);
		if (profile.paused) return { kind: "ignored" };
		let raw: unknown;
		try {
			raw = p.args.length > MAX_ARGS ? undefined : JSON.parse(p.args);
		} catch {
			raw = undefined;
		}
		const checked = def.check(raw, { now: ctx.now, timezone: profile.timezone });
		if (!checked.ok) {
			await log("failed", `Could not read the details for ${def.name}`, "args");
			return { kind: "failed", line: checked.say ?? def.unclear };
		}
		const level = levelOf(profile, def.connector),
			verdict = levelVerdict(def, level);
		if (verdict === "refuse") {
			await log("refused", def.describe(checked.args), "level");
			return { kind: "refused", line: level === "off" ? `Your ${def.connector} setting is off.` : def.levelSay ?? `I can only read your ${def.connector} at the moment.` };
		}
		if (await capReached(db, def.name, ctx.now)) {
			await log("refused", def.describe(checked.args), "cap");
			return { kind: "refused", line: "I have reached today's limit for that." };
		}
		const rc: RunCtx = { now: ctx.now, timezone: profile.timezone, db, profile, fetch: deps.fetch, env: deps.env };
		if (verdict === "run") return await execute(def, checked.args, rc, log);
		const prep = def.prepare ? await def.prepare(checked.args, rc) : { ok: true as const, args: checked.args, summary: `${def.describe(checked.args)}? Say yes to go ahead, or no.`, logSummary: undefined };
		if (!prep.ok) {
			await log("failed", def.describe(checked.args), "prepare");
			return { kind: "failed", line: prep.say };
		}
		const id = await holdPending(db, { def, args: prep.args, summary: prep.summary, logSummary: prep.logSummary, surface: ctx.surface, now: ctx.now });
		if (id === null) {
			await log("failed", def.describe(checked.args), "hold");
			return { kind: "failed", line: "I could not set that up just now." };
		}
		return { kind: "waiting", line: prep.summary };
	} catch {
		await log("failed", `Could not run ${def.name}`, "exception"); // writeAction never throws
		return { kind: "failed", line: FAILED };
	}
}

// The gate /api/build re-checks itself (artifacts spec 3.3): the switch, the owner, the level (act only, since a build runs without asking) and the daily cap.
export async function buildGate(userId: string, now: number, deps: Deps = realDeps()): Promise<"ok" | "off" | "cap"> {
	try {
		if (!actionsOn(deps.env) || deps.env.OSMO_BUILD !== "on") return "off";
		const db = deps.db();
		if (!sameOwner(db, userId)) return "off";
		const profile = await loadProfile(db);
		if (profile.paused || decide(levelOf(profile, "artifacts"), 2) !== "run") return "off";
		return (await capReached(db, "build", now, 1)) ? "cap" : "ok"; // +1: this build's own ticket row is already counted
	} catch {
		return "off";
	}
}

// What the model may be offered this turn. Null when actions are off, Osmo is paused, or no connector is on.
export async function listEnabledActions(userId: string, deps: Deps = realDeps()): Promise<EnabledActions | null> {
	if (!actionsOn(deps.env)) return null;
	try {
		const db = deps.db();
		if (!sameOwner(db, userId)) return null;
		const profile = await loadProfile(db);
		if (profile.paused) return null;
		const defs = deps.registry.filter((d) => levelVerdict(d, levelOf(profile, d.connector)) !== "refuse");
		if (defs.length === 0) return null;
		return {
			names: defs.map((d) => d.name),
			lines: defs.map((d) => d.line),
			today: todayLine(Date.now(), profile.timezone),
			timezone: profile.timezone ?? "not saved yet",
			place: profile.place?.label ?? null,
		};
	} catch {
		return null;
	}
}

// A crisis cancels the waiting confirmation (spec 4.3, 9.1), whether or not OSMO_ACTIONS is on. Never throws.
export async function cancelWaiting(userId: string, deps: Deps = realDeps()): Promise<void> {
	try {
		const db = deps.db();
		if (sameOwner(db, userId)) await cancelAllPending(db);
	} catch {
		// nothing to do: a failed cancel leaves the row to expire after ten minutes
	}
}
