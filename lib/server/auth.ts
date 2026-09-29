// Who is calling a route. The browser sends its Supabase access token, so a route acts as that
// user and row-level security still applies. There is no service-role key anywhere.

import { createClient } from "@supabase/supabase-js";

export type ServerUser = { id: string };

// A lookup is injected so the routes can be tested without Supabase.
export type UserLookup = (token: string) => Promise<ServerUser | null>;

export function bearerToken(request: Request): string | null {
	const header = request.headers.get("authorization");
	if (!header) return null;
	const [scheme, ...rest] = header.split(" ");
	if (scheme.toLowerCase() !== "bearer") return null;
	const token = rest.join(" ").trim();
	return token === "" ? null : token;
}

// The user Supabase says the token belongs to, or null.
export const supabaseUser: UserLookup = async (token) => {
	const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const { data, error } = await client.auth.getUser(token);
	if (error || !data.user) return null;
	return { id: data.user.id };
};

// The caller, or null when there's no usable token. A lookup that fails counts as no user:
// a route must refuse, never hand out access because a check broke.
export async function requireUser(request: Request, lookup: UserLookup = supabaseUser): Promise<ServerUser | null> {
	const token = bearerToken(request);
	if (token === null) return null;
	try {
		return await lookup(token);
	} catch {
		return null;
	}
}
