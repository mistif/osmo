// The one real call to OpenAI before the AI conversation is switched on (Gur's checklist, step 6). It goes
// around the route and the ledger: a made-up message, no memory and a short made-up instruction. It prints
// the outcome and HTTP status, OpenAI's error code, type and param, the served model, the response status,
// the usage, whether the request options were accepted, and the reply's first 80 characters. Never the key.
// Its few thousand tokens aren't in the ledger; the margin covers them.
//
// Only with Gur's OK. From my-app/: node scripts/chat-probe.mjs
// Node loads the two .ts files itself by stripping their types, which is why neither imports anything
// else at runtime. It may warn that package.json has no "type"; that's harmless.

import { createHash } from "node:crypto";
import { chatKey, MAX_OUTPUT_TOKENS, MODELS } from "../lib/chat/allowance.ts";
import { callModel } from "../lib/chat/openai.ts";
import { TURN_FORMAT } from "../lib/chat/turn-schema.ts";

try {
	process.loadEnvFile(".env.local");
} catch {
	console.log("There's no .env.local here. Run this from my-app/, where the OpenAI key is.");
	process.exit(1);
}
// The key the route would use: OSMO_CHAT_OPENAI_KEY, else the natural voice's OPENAI_API_KEY or CHATGPT_KEY.
const key = chatKey(process.env);
if (!key) {
	console.log("There's no OpenAI key in .env.local (OSMO_CHAT_OPENAI_KEY, OPENAI_API_KEY or CHATGPT_KEY), so there's nothing to try.");
	process.exit(1);
}

for (const entry of MODELS) {
	// Read off the raw response on its way to callModel: the HTTP status, and the two options OpenAI echoes
	// back, which show whether it applied them.
	let httpStatus = null;
	let echoed = null;
	const watched = async (...args) => {
		const response = await fetch(...args);
		httpStatus = response.status;
		echoed = await response
			.clone()
			.json()
			.then(
				(json) => ({ "reasoning.effort": json?.reasoning?.effort ?? null, "text.verbosity": json?.text?.verbosity ?? null, "text.format": json?.text?.format !== undefined ? "present" : null }),
				() => null,
			);
		return response;
	};

	const started = performance.now();
	const outcome = await callModel(watched, key, {
		entry,
		instructions: "You are Osmo, composed and courteous. Answer as JSON with reply (one or two plain sentences), crisis, tone, intensity, about, wants and note, describing Gur's tone.",
		input: [{ role: "user", content: "my mom's in hospital again" }],
		safetyId: createHash("sha256").update("osmo chat-probe").digest("hex"),
		maxOutput: MAX_OUTPUT_TOKENS,
		format: TURN_FORMAT,
	});
	const elapsed = Math.round(performance.now() - started);

	console.log(`${entry.model}: outcome ${outcome.kind}, HTTP ${httpStatus ?? "none"}, elapsed ${elapsed} ms`);
	if (outcome.kind === "rejected") {
		console.log(`  error code: ${outcome.code}, type: ${outcome.type}, param: ${outcome.param}`);
		const option = /^(?:reasoning|text)\b/.test(outcome.param ?? "");
		console.log(`  request options accepted: ${option ? `no, OpenAI refused ${outcome.param}` : "not known, the request was refused for another reason"}`);
	} else if (outcome.kind === "answered") {
		const { parsed } = outcome;
		const { usage } = parsed;
		console.log(`  served model: ${parsed.model} (asked for ${entry.model})`);
		console.log(`  response status: ${parsed.status}${parsed.incomplete ? `, ${parsed.incomplete}` : ""}`);
		console.log(`  usage: ${usage ? `input ${usage.input} (cached ${usage.cached}), output ${usage.output} (reasoning ${usage.reasoning})` : "none reported"}`);
		console.log(`  request options accepted: yes, echoed back as ${JSON.stringify(echoed)}`);
		console.log(`  reply, first 80 characters: ${JSON.stringify(parsed.text.slice(0, 80))}`);

		// Check for valid JSON with all 7 keys
		let allKeysPresent = false;
		try {
			const json = JSON.parse(parsed.text);
			if (json && typeof json === "object" && !Array.isArray(json)) {
				const keys = new Set(Object.keys(json));
				allKeysPresent = keys.has("reply") && keys.has("crisis") && keys.has("tone") && keys.has("intensity") && keys.has("about") && keys.has("wants") && keys.has("note") && keys.size === 7;
			}
		} catch {
			// Not JSON
		}
		console.log(`  valid JSON with all 7 keys: ${allKeysPresent ? "yes" : "no"}`);
	} else {
		console.log("  no answer to read: a timeout, a network error, a 5xx or an unreadable body");
	}
}

process.exit(0);
