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
import { DEFAULT_MODEL, MAX_OUTPUT_TOKENS, modelEntry } from "../lib/chat/allowance.ts";
import { callModel } from "../lib/chat/openai.ts";

try {
	process.loadEnvFile(".env.local");
} catch {
	console.log("There's no .env.local here. Run this from my-app/, once OSMO_CHAT_OPENAI_KEY is in .env.local.");
	process.exit(1);
}
const key = process.env.OSMO_CHAT_OPENAI_KEY;
if (!key) {
	console.log("OSMO_CHAT_OPENAI_KEY isn't in .env.local yet, so there's nothing to try.");
	process.exit(1);
}
const entry = modelEntry(process.env.OSMO_CHAT_MODEL?.trim() || DEFAULT_MODEL);
if (!entry) {
	console.log("OSMO_CHAT_MODEL isn't on the allowlist in lib/chat/allowance.ts.");
	process.exit(1);
}

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
			(json) => ({ "reasoning.effort": json?.reasoning?.effort ?? null, "text.verbosity": json?.text?.verbosity ?? null }),
			() => null,
		);
	return response;
};

const outcome = await callModel(watched, key, {
	entry,
	instructions: "You are Osmo, a composed and courteous companion. Reply in one or two plain spoken sentences.",
	input: [{ role: "user", content: "Good evening. How are you today?" }],
	safetyId: createHash("sha256").update("osmo chat-probe").digest("hex"),
	maxOutput: MAX_OUTPUT_TOKENS,
});

console.log(`outcome: ${outcome.kind}, HTTP ${httpStatus ?? "none"}`);
if (outcome.kind === "rejected") {
	console.log(`error code: ${outcome.code}, type: ${outcome.type}, param: ${outcome.param}`);
	const option = /^(?:reasoning|text)\b/.test(outcome.param ?? "");
	console.log(`request options accepted: ${option ? `no, OpenAI refused ${outcome.param}` : "not known, the request was refused for another reason"}`);
} else if (outcome.kind === "answered") {
	const { parsed } = outcome;
	const { usage } = parsed;
	console.log(`served model: ${parsed.model} (asked for ${entry.model})`);
	console.log(`response status: ${parsed.status}${parsed.incomplete ? `, ${parsed.incomplete}` : ""}`);
	console.log(`usage: ${usage ? `input ${usage.input} (cached ${usage.cached}), output ${usage.output} (reasoning ${usage.reasoning})` : "none reported"}`);
	console.log(`request options accepted: yes, echoed back as ${JSON.stringify(echoed)}`);
	console.log(`reply, first 80 characters: ${JSON.stringify(parsed.text.slice(0, 80))}`);
} else {
	console.log("no answer to read: a timeout, a network error, a 5xx or an unreadable body");
}
process.exit(outcome.kind === "answered" ? 0 : 1);
