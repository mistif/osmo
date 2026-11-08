// Who may call /api/act: a signed-in caller (401) and only Gur (403), the same two checks as /api/chat.
// With no OSMO_OWNER_ID set the answer is 403 for everybody, because Supabase sign-ups are open.
import { ownerId, sameUser } from "../chat/allowance";
import { requireUser, supabaseUser, type UserLookup } from "../server/auth";
import type { Env } from "./types";

const refuse = (status: 401 | 403, error: "unauthorized" | "forbidden") =>
	new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function requireOwner(request: Request, env: Env, lookup: UserLookup = supabaseUser): Promise<{ id: string } | Response> {
	const user = await requireUser(request, lookup);
	if (user === null) return refuse(401, "unauthorized");
	const owner = ownerId(env);
	if (owner === null || !sameUser(owner, user.id)) return refuse(403, "forbidden");
	return { id: user.id };
}
