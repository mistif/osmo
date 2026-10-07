// POST /api/act (spec 4.3): the room sends a bare yes or no here when the last chat answer said "waiting",
// and a crisis here so a waiting confirmation is cancelled. Every answer carries cache-control: no-store.
import type { UserLookup } from "../server/auth";
import { supabaseUser } from "../server/auth";
import { answerPending } from "./confirm";
import { actionsOn, cancelWaiting, realDeps } from "./index";
import { requireOwner } from "./owner";
import type { Deps } from "./types";

export type ActDeps = { deps: Deps; lookup: UserLookup; now(): number };

export const actDeps = (): ActDeps => ({ deps: realDeps(), lookup: supabaseUser, now: () => Date.now() });

const MAX_BODY = 4000;
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const bad = () => json(400, { error: "bad_request" });

type Body = { decision: "yes" | "no" | "crisis"; via: "typed" | "voice" };

// The body is a small object: decision, optional via, optional speaker. A guest is refused outright.
function readBody(text: string): Body | null {
	if (text.length > MAX_BODY) return null;
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
	const o = raw as Record<string, unknown>;
	if (o.decision !== "yes" && o.decision !== "no" && o.decision !== "crisis") return null;
	if (o.via !== undefined && o.via !== "typed" && o.via !== "voice") return null;
	if (o.speaker !== undefined && (typeof o.speaker !== "string" || o.speaker.trim().toLowerCase() === "guest")) return null;
	return { decision: o.decision, via: o.via ?? "typed" };
}

export async function handleAct(request: Request, d: ActDeps): Promise<Response> {
	if (request.method !== "POST") return json(405, { error: "method" });
	const who = await requireOwner(request, d.deps.env, d.lookup);
	if (who instanceof Response) return who;
	const declared = Number(request.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_BODY) return bad(); // before reading a byte
	let text: string;
	try {
		text = await request.text();
	} catch {
		return bad();
	}
	const body = readBody(text);
	if (body === null) return bad();
	// A crisis cancels the waiting one even while actions are off: a row may still be waiting from before.
	if (body.decision === "crisis") {
		await cancelWaiting(who.id, d.deps);
		return json(200, { handled: false, reply: null });
	}
	if (!actionsOn(d.deps.env)) return json(200, { handled: false, reply: null });
	try {
		const answer = await answerPending(d.deps, body.decision, body.via, d.now());
		return json(200, answer.handled ? answer : { handled: false, reply: null });
	} catch {
		return json(200, { handled: false, reply: null });
	}
}
