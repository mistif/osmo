// POST /api/artifacts (artifacts spec 3.7, 7, 9): the only way a thing is stored. The room sends the source it compiled;
// the route compiles it again as a gate, so nothing that does not compile is ever kept, and inserts through the owner-pinned
// admin client (the browser has no insert right). A second body shape, {failed, actionId}, settles the build's log row.
// Every answer carries cache-control: no-store. The brief never reaches this route.
import { requireOwner } from "../actions/owner";
import { resolveLog } from "../actions/log";
import type { Env } from "../actions/types";
import type { OwnerDb } from "../server/admin";
import { ownerDb } from "../server/admin";
import { supabaseUser, type UserLookup } from "../server/auth";
import { compileSource, LIMITS } from "./compile";
import { cleanTitle } from "./title";

export type SaveDeps = { env: Env; lookup: UserLookup; db(): OwnerDb; now(): number };

export const saveDeps = (): SaveDeps => ({ env: process.env, lookup: supabaseUser, db: () => ownerDb(), now: () => Date.now() });

const MAX_BODY = 20_000;
const STARTED = "Started building something."; // the text-free summary the build action logs (lib/actions/build.ts)
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const bad = () => json(400, { error: "bad_request" });

type Body = { kind: "save"; source: string; actionId: number | null } | { kind: "failed"; actionId: number };
const isId = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

// A guest, an unknown key or the wrong shape is refused outright.
function readBody(text: string): Body | null {
	if (new TextEncoder().encode(text).length > MAX_BODY) return null; // bytes, not characters
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
	const o = raw as Record<string, unknown>;
	if (o.speaker !== undefined && (typeof o.speaker !== "string" || o.speaker.trim().toLowerCase() === "guest")) return null;
	const keys = Object.keys(o).filter((k) => k !== "speaker");
	if (o.failed !== undefined) {
		return o.failed === true && isId(o.actionId) && keys.length === 2 ? { kind: "failed", actionId: o.actionId } : null;
	}
	if (typeof o.source !== "string" || keys.some((k) => k !== "source" && k !== "actionId")) return null;
	if (o.actionId !== undefined && !isId(o.actionId)) return null;
	return { kind: "save", source: o.source, actionId: o.actionId ?? null };
}

const firstLineTitle = (source: string): string => /^\s*\/\/ title:\s*(.*)$/.exec(source.split("\n", 1)[0])?.[1] ?? "";

// The log row of a build that has started and not yet been settled; any other row is left alone.
async function openBuildRow(db: OwnerDb, id: number): Promise<boolean> {
	const { data, error } = await db.from("actions").select("id,name,status,summary").eq("id", id).maybeSingle();
	const row = data as { name?: string; status?: string; summary?: string } | null;
	return !error && row !== null && row.name === "build" && row.status === "done" && row.summary === STARTED;
}

export async function handleArtifacts(request: Request, d: SaveDeps): Promise<Response> {
	if (request.method !== "POST") return json(405, { error: "method" });
	const who = await requireOwner(request, d.env, d.lookup);
	if (who instanceof Response) return who;
	if (d.env.OSMO_BUILD !== "on" || d.env.OSMO_ACTIONS !== "on") return json(404, { error: "off" });
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
	let db: OwnerDb;
	try {
		db = d.db();
	} catch {
		return json(500, { error: "failed" });
	}
	try {
		if (body.kind === "failed") {
			if (await openBuildRow(db, body.actionId)) await resolveLog(db, body.actionId, "failed", "build_failed");
			return json(200, { ok: true });
		}
		const compiled = await compileSource(body.source);
		if (!compiled.ok) return json(422, { error: "compile", message: compiled.error });
		const { count, error: countError } = await db.from("artifacts").select("id", { count: "exact", head: true });
		if (countError) return json(500, { error: "failed" }); // a count that cannot be read refuses
		if ((count ?? 0) >= LIMITS.perUser) return json(409, { error: "full" });
		const title = cleanTitle(firstLineTitle(body.source)) ?? "Something small";
		const { data, error } = await db.from("artifacts").insert({ title, kind: "react", source: body.source, version: 1, parent_id: null, kept: true }).select("id,version").single();
		if (error || !data) return json(500, { error: "failed" });
		const row = data as { id: string; version: number };
		if (body.actionId !== null && (await openBuildRow(db, body.actionId))) await resolveLog(db, body.actionId, "done", undefined, `Built ${title}`);
		return json(200, { id: row.id, version: row.version, title });
	} catch {
		return json(500, { error: "failed" });
	}
}
