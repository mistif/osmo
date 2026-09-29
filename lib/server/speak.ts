// Osmo's cloud voice, server side. The browser sends the words; this sends them to OpenAI with
// the key and returns the audio. The model, the voice and the instructions are chosen here, never
// by the caller, so nobody who reaches this route can put their own words in Osmo's mouth or spend
// the key on something else.

import { MAX_SPEAK_CHARS } from "../voice/sentences";
import { type SpeechTone, TONE_INSTRUCTIONS, TTS_MODEL, TTS_SPEED, TTS_VOICE } from "../voice/tts";
import { requireUser, type ServerUser } from "./auth";

const SPEECH_URL = "https://api.openai.com/v1/audio/speech";

export type SpeakDeps = {
	// The server-only key, or undefined when Gur hasn't added one.
	apiKey(): string | undefined;
	user(request: Request): Promise<ServerUser | null>;
	fetch: typeof fetch;
};

export function speakDeps(): SpeakDeps {
	return {
		// `OPENAI_API_KEY` is the name in project.md. `CHATGPT_KEY` is accepted because that is
		// what Gur typed first; either works, and neither is ever logged or returned.
		apiKey: () => process.env.OPENAI_API_KEY ?? process.env.CHATGPT_KEY,
		user: (request) => requireUser(request),
		fetch: (...args) => fetch(...args),
	};
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
	const user = await deps.user(request);
	if (!user) return fail(401, "unauthorized");

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
		return fail(502, "upstream");
	}
	// Whatever went wrong upstream stays upstream: its body could name the key or the account.
	if (!upstream.ok) return fail(502, "upstream");

	return new Response(upstream.body, {
		status: 200,
		headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
	});
}
