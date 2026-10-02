// The AI conversation's budget: which models may be called, how big Osmo's daily share of the free
// allowance is, and how a call is counted before it's made. Pure, with no imports at all, because
// scripts/chat-probe.mjs loads this file straight into Node, which only strips the types.

export type Pool = "mini" | "large";
export type ModelEntry = { model: string; pool: Pool; reasoning: boolean; verbosity: boolean; strict: boolean };
export type Env = Readonly<Record<string, string | undefined>>;
export type ChatConfig = { key: string; entry: ModelEntry; usable: number };

// The day the list and the pool sizes were read off Gur's dashboard. Recheck both when a listed
// model is about to retire.
export const ALLOWLIST_DATE = "2026-09-29";

// Dated snapshots only: OpenAI can move an alias to a snapshot that isn't on the free list.
// `reasoning` and `verbosity` say which request options the model accepts.
export const MODELS: readonly ModelEntry[] = [
	// probe 2026-10-02: 182 in, 69 out, 0 reasoning, 3338 ms; strict JSON, all 7 keys.
	{ model: "gpt-5.4-mini-2026-03-17", pool: "mini", reasoning: true, verbosity: true, strict: true },
	// probe 2026-10-02: 184 in, 77 out, 0 reasoning, 1753 ms; strict JSON, all 7 keys.
	{ model: "gpt-4.1-mini-2025-04-14", pool: "mini", reasoning: false, verbosity: false, strict: true },
];

export const DEFAULT_MODEL = "gpt-5.4-mini-2026-03-17";

// The free daily pools for traffic shared with OpenAI, as of ALLOWLIST_DATE.
export const POOL_SIZE: Readonly<Record<Pool, number>> = { mini: 2_500_000, large: 250_000 };

// The setting that holds Osmo's share of each pool. No setting means off, never a default.
export const CAP_SETTING: Readonly<Record<Pool, string>> = { mini: "OSMO_MINI_TOKENS_PER_DAY", large: "OSMO_LARGE_TOKENS_PER_DAY" };

// The cap covers reasoning and hidden formatting tokens too; three spoken sentences fit well under it.
// JSON adds about 50 tokens; measured in 1.2.
export const MAX_OUTPUT_TOKENS = 360;
// No single call may be estimated above this. The route trims the body until it fits.
export const CALL_CEILING = 20_000;
export const DEFAULT_RESERVE = 0.1;

// The listed entry for exactly this name, or null: an alias or a near miss is refused.
export function modelEntry(name: string): ModelEntry | null {
	return MODELS.find((entry) => entry.model === name) ?? null;
}

// A cap counts only as plain digits within its pool, so "700,000", "7e5" and "0" mean off.
export function parseCap(raw: string | undefined, pool: Pool): number | null {
	if (raw === undefined || !/^\d+$/.test(raw)) return null;
	const cap = Number(raw);
	return cap >= 1 && cap <= POOL_SIZE[pool] ? cap : null;
}

// The margin, written as 0 or "0." and digits. Anything else ("0,1", "10%", "1") is the default,
// so a typo can never make the budget NaN, which would never refuse a call.
export function parseReserve(raw: string | undefined): number {
	if (raw === undefined || !/^0(\.\d+)?$/.test(raw)) return DEFAULT_RESERVE;
	return Number(raw);
}

// Whole tokens from 0 to the cap. The small nudge keeps 700000 * (1 - 0.3), which floating point
// makes 489999.99999999994, at 490000. Anything but a finite number gives 0, which refuses every call.
export function usableBudget(cap: number, reserve: number): number {
	const usable = Math.floor(cap * (1 - reserve) + 1e-6);
	if (!Number.isFinite(usable)) return 0;
	return Math.min(cap, Math.max(0, usable));
}

// The OpenAI key the conversation uses: its own when one is set, otherwise the natural voice's
// (Gur's call on 2026-10-01: one project for both), read in /api/speak's order. Blank means none.
export function chatKey(env: Env): string | null {
	for (const name of ["OSMO_CHAT_OPENAI_KEY", "OPENAI_API_KEY", "CHATGPT_KEY"]) {
		const key = env[name]?.trim();
		if (key) return key;
	}
	return null;
}

// The conversation's settings, or null when it's off. Every part must be there and valid: there
// are no defaults for the switch, the key or the cap, so a push of main never turns it on. The
// voice's key alone never does either: OSMO_CHAT=on and the cap are still needed.
export function readConfig(env: Env): ChatConfig | null {
	if (env.OSMO_CHAT !== "on") return null;
	const key = chatKey(env);
	if (!key) return null;
	const entry = modelEntry(env.OSMO_CHAT_MODEL?.trim() || DEFAULT_MODEL);
	if (entry === null) return null;
	const cap = parseCap(env[CAP_SETTING[entry.pool]], entry.pool);
	if (cap === null) return null;
	return { key, entry, usable: usableBudget(cap, parseReserve(env.OSMO_TOKENS_RESERVE)) };
}

// Gur's Supabase user id, the one account the route serves. Missing or blank means nobody.
export function ownerId(env: Env): string | null {
	const owner = env.OSMO_OWNER_ID?.trim().toLowerCase();
	return owner ? owner : null;
}

// The owner is already trimmed and lowercased by ownerId. An empty owner matches nobody.
export function sameUser(owner: string, userId: string): boolean {
	return owner !== "" && owner === userId.trim().toLowerCase();
}

const encoder = new TextEncoder();

export function utf8Bytes(text: string): number {
	return encoder.encode(text).length;
}

// A strict upper bound on a call: a token never covers less than one byte, each input item and the
// request carry a little overhead, and the whole output cap may be spent.
export function estimateTokens(instructions: string, input: readonly { content: string }[], maxOutput = MAX_OUTPUT_TOKENS): number {
	let bytes = utf8Bytes(instructions);
	for (const item of input) bytes += utf8Bytes(item.content);
	return bytes + 8 * input.length + 16 + maxOutput;
}

// OpenAI resets the allowance at 00:00 UTC, so the ledger's day is UTC's, never a local one.
export function dayKey(now: number): string {
	return new Date(now).toISOString().slice(0, 10);
}

// Exactly filling the budget is allowed; one token more is refused.
export function fits(used: number, estimate: number, usable: number): boolean {
	return used + estimate <= usable;
}
