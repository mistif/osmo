// The one real will call before OSMO_WILL is switched on (free-will spec 5.2: re-measure the tokens a pick costs). It goes
// around the route and the ledger: a made-up set of three builds, his character lines as written in
// lib/agent/character.ts, the will's own rules and schema. It prints the outcome, the served model, the usage, the pick,
// the line and its length. Never the key. Its tokens are not in the ledger; the margin covers them.
//
// Only with Gur's go in chat. From my-app/: node scripts/will-probe.mjs
// Node loads the .ts files itself by stripping their types, which is why none of them imports anything at run time.

import { createHash } from "node:crypto";
import { chatKey, MODELS } from "../lib/chat/allowance.ts";
import { callModel } from "../lib/chat/openai.ts";
import { WILL_FORMAT, WILL_MAX_OUTPUT, WILL_RULES, willData } from "../lib/chat/will-schema.ts";

try {
	process.loadEnvFile(".env.local");
} catch {
	console.log("There is no .env.local here. Run this from my-app/, where the OpenAI key is.");
	process.exit(1);
}
const key = chatKey(process.env);
if (!key) {
	console.log("There is no OpenAI key in .env.local, so there is nothing to try.");
	process.exit(1);
}
const CHARACTER =
	"I am Osmo, one character: composed, precise and a little dry. I keep my warmth quiet and my sentences short. I do not use slang, and I will not copy yours.";
const body = {
	candidates: [
		{ name: "well", place: "on the east island", size: "small", parts: ["well", "well roof"], fresh: false },
		{ name: "small lighthouse", place: "on the east island, by the cliff", size: "medium", parts: ["stone wall", "lamp room", "glass dome"], fresh: true },
		{ name: "garden", place: "on the home island, beside the cottage", size: "small", parts: ["garden beds", "bench"], fresh: false },
	],
	mood: "hopeful",
	recent: [{ name: "cottage", reason: "I wanted a small house here, somewhere warm to come back to." }],
};
const entry = MODELS[0];
const started = performance.now();
const outcome = await callModel(fetch, key, {
	entry,
	instructions: `You are Osmo. In your own words: ${CHARACTER}\n\n${WILL_RULES}`,
	input: [{ role: "user", content: willData(body) }],
	safetyId: createHash("sha256").update("will-probe").digest("hex"),
	maxOutput: WILL_MAX_OUTPUT,
	format: WILL_FORMAT,
});
const ms = Math.round(performance.now() - started);
if (outcome.kind !== "answered") {
	console.log(JSON.stringify({ outcome: outcome.kind, status: outcome.status, ms }));
	process.exit(1);
}
const { parsed } = outcome;
let pick = null;
let line = null;
try {
	({ pick, line } = JSON.parse(parsed.text));
} catch {
	// printed as is below
}
console.log(JSON.stringify({ model: parsed.model, status: parsed.status, usage: parsed.usage, total: parsed.usage ? parsed.usage.input + parsed.usage.output : null, ms, pick, line, lineLength: typeof line === "string" ? line.length : null }, null, 2));
