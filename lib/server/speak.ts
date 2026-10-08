// Osmo's cloud voice, server side. The browser sends the words; this sends them to OpenAI with
// the key and returns the audio. The model, the voice and the instructions are chosen here, never
// by the caller, so nobody who reaches this route can put their own words in Osmo's mouth or spend
// the key on something else.
//
// Only Gur may call it (2026-10-08, board review issue 1): Supabase sign-ups are open, the speech
// is billed from the first character, and any signed-in account used to be able to spend the key.
// The owner check is the real protection. The daily character cap below is a second, weaker one.

import { MAX_SPEAK_CHARS } from "../voice/sentences";
import { type SpeechTone, TONE_INSTRUCTIONS, TTS_MODEL, TTS_SPEED, TTS_VOICE } from "../voice/tts";
import { requireOwner } from "../actions/owner";
import type { Env } from "../actions/types";
import { supabaseUser, type UserLookup } from "./auth";

const SPEECH_URL = "https://api.openai.com/v1/audio/speech";

// How many characters Osmo may speak in a UTC day when OSMO_SPEAK_CHARS_PER_DAY is not set.
export const DEFAULT_SPEAK_CHARS_PER_DAY = 20000;

export type SpeakDeps = {
	// The server-only key, or undefined when Gur hasn't added one.
	apiKey(): string | undefined;
	// OSMO_OWNER_ID and OSMO_SPEAK_CHARS_PER_DAY.
	env: Env;
	// Who a bearer token belongs to; injected so the route can be tested without Supabase.
	lookup: UserLookup;
	fetch: typeof fetch;
	// Characters spoken today, keyed by "<UTC day>:<user id>". See the note on `spokenToday`.
	spoken: Map<string, number>;
	now(): number;
};

// This count lives in the memory of one server instance. On Vercel, instances are many and short
// lived, so it resets whenever a new one starts and is NOT a hard limit; do not rely on it for
// money. The owner check is what keeps strangers out; this only stops one runaway page or loop
// of Gur's own from speaking without end on a warm instance. A shared, exact count would need a
// table, which is out of scope for now.
const spokenToday = new Map<string, number>();

export function speakDeps(): SpeakDeps {
	return {
		// `OPENAI_API_KEY` is the name in project.md. `CHATGPT_KEY` is accepted because that is
		// what Gur typed first; either works, and neither is ever logged or returned.
		apiKey: () => process.env.OPENAI_API_KEY ?? process.env.CHATGPT_KEY,
		env: process.env,
		lookup: supabaseUser,
		fetch: (...args) => fetch(...args),
		spoken: spokenToday,
		now: () => Date.now(),
	};
}

// Digits only, anything else is the default: a typo in Vercel must not turn the cap off.
function capOf(env: Env): number {
	const raw = env.OSMO_SPEAK_CHARS_PER_DAY?.trim();
	return raw !== undefined && /^[0-9]+$/.test(raw) ? Number(raw) : DEFAULT_SPEAK_CHARS_PER_DAY;
}

const fail = (status: number, error: string) =>
	new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Only a tone we know: anything else is spoken composed, so an unexpected value can never
// reach the model as an instruction.
const toneOf = (value: unknown): SpeechTone => (value === "grave" ? "grave" : "composed");

function textOf(value: unknown): string | null {
	if (typeof value !== "object" || value === null) return null;
	const text = (value as Record<string, unknown>).text;
	if (typeof text !== "string") return null;
	const trimmed = text.trim();
	if (trimmed === "" || trimmed.length > MAX_SPEAK_CHARS) return null;
	return trimmed;
}

export async function handleSpeak(request: Request, deps: SpeakDeps): Promise<Response> {
	const who = await requireOwner(request, deps.env, deps.lookup);
	if (who instanceof Response) return who;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return fail(400, "bad_request");
	}
	const text = textOf(body);
	if (text === null) return fail(400, "bad_request");

	const key = deps.apiKey();
	// No key is a normal state, not a fault: the browser hears this and uses the device's voice.
	if (!key) return fail(503, "no_key");

	// Reserve the characters before calling OpenAI so two quick requests cannot both slip under the
	// cap; give them back below if OpenAI fails.
	const day = new Date(deps.now()).toISOString().slice(0, 10);
	const slot = `${day}:${who.id}`;
	for (const old of deps.spoken.keys()) if (!old.startsWith(day)) deps.spoken.delete(old);
	const used = deps.spoken.get(slot) ?? 0;
	if (used + text.length > capOf(deps.env)) return fail(429, "daily_cap");
	deps.spoken.set(slot, used + text.length);
	const refund = () => deps.spoken.set(slot, Math.max(0, (deps.spoken.get(slot) ?? 0) - text.length));

	const tone = toneOf((body as Record<string, unknown>).tone);
	let upstream: Response;
	try {
		upstream = await deps.fetch(SPEECH_URL, {
			method: "POST",
			headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
			body: JSON.stringify({
				model: TTS_MODEL,
				voice: TTS_VOICE,
				speed: TTS_SPEED,
				instructions: TONE_INSTRUCTIONS[tone],
				input: text,
				response_format: "mp3",
			}),
		});
	} catch {
		refund();
		return fail(502, "upstream");
	}
	// Whatever went wrong upstream stays upstream: its body could name the key or the account.
	if (!upstream.ok) {
		refund();
		return fail(502, "upstream");
	}

	return new Response(upstream.body, {
		status: 200,
		headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
	});
}
