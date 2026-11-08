// The artifacts build probe (artifacts plan, task A7; spec 13, 15.6): thirty realistic briefs sent through the real
// build prompt to the real model, each compiled with the sealed-frame checks, repaired once when it fails. Run from
// my-app/ with the key in .env.local, outside the token ledger (as chat-probe.mjs is):
//   npx vite-node -c vitest.config.mts scripts/build-probe.mjs 2            two briefs
//   npx vite-node -c vitest.config.mts scripts/build-probe.mjs              all thirty
//   npx vite-node -c vitest.config.mts scripts/build-probe.mjs 1 --stream   one brief through the streaming call; prints the event names seen
// vite-node resolves the extensionless imports (plain node cannot). Results go to the language desk, never to the repo.

import { createHash } from "node:crypto";
import { chatKey, MODELS } from "../lib/chat/allowance.ts";
import { callModel } from "../lib/chat/openai.ts";
import { streamModel } from "../lib/chat/openai-stream.ts";
import { buildPrompt, repairPrompt } from "../lib/chat/build-prompt.ts";
import { cleanOutput, compileSource, LIMITS } from "../lib/artifacts/compile.ts";

const BRIEFS = [
	"a tip splitter",
	"a countdown to a date I type in",
	"a unit converter between kilometres and miles",
	"a small memory game with eight cards",
	"a pomodoro timer",
	"a BMI calculator",
	"a loan repayment calculator",
	"a habit counter for three habits",
	"a dice roller",
	"a colour mixer with three sliders",
	"a word counter for a pasted text",
	"a simple budget list with a total",
	"a stopwatch with laps",
	"a reading-time estimator",
	"a temperature converter",
	"tic-tac-toe for two people",
	"flashcards with three cards I can flip",
	"a mood diary that keeps entries while open",
	"an age calculator from a birth date",
	"a percentage calculator",
	"a bar chart of five numbers I type in",
	"a metronome with a visual beat",
	"a packing checklist",
	"a currency converter with fixed rates",
	"a quiz of three questions",
	"a sleep calculator that suggests bedtimes",
	"a click-the-target game",
	"a recipe scaler",
	"a reaction-time tester",
	"a page of five quick calculations",
];

try {
	process.loadEnvFile(".env.local");
} catch {
	console.log("Run this from my-app/, where .env.local is.");
	process.exit(1);
}
const key = chatKey(process.env);
if (!key) {
	console.log("No OpenAI key in .env.local.");
	process.exit(1);
}
const entry = MODELS[0];
const safetyId = createHash("sha256").update("osmo build-probe").digest("hex");
const args = process.argv.slice(2);
const stream = args.includes("--stream");
const limit = Number(args.find((a) => /^\d+$/.test(a)) ?? BRIEFS.length);

const ask = async ({ instructions, input }) => {
	const t0 = performance.now();
	const o = await callModel(fetch, key, { entry, instructions, input, safetyId, maxOutput: LIMITS.outputTokens }, 90_000);
	return { o, ms: Math.round(performance.now() - t0) };
};

if (stream) {
	const { instructions, input } = buildPrompt(BRIEFS[0]);
	let first = null;
	const t0 = performance.now();
	const controller = new AbortController();
	const out = await streamModel(
		fetch,
		key,
		{ entry, instructions, input, safetyId, maxOutput: LIMITS.outputTokens },
		() => {
			if (first === null) first = Math.round(performance.now() - t0);
			return true;
		},
		controller.signal,
		90_000,
	);
	console.log(JSON.stringify({ kind: out.kind, status: out.status ?? null, incomplete: out.incomplete ?? null, model: out.model ?? null, usage: out.usage ?? null, firstDeltaMs: first, chars: out.text?.length ?? 0 }));
	process.exit(0);
}

const rows = [];
for (const brief of BRIEFS.slice(0, limit)) {
	const first = await ask(buildPrompt(brief));
	const source = first.o.kind === "answered" ? cleanOutput(first.o.parsed.text) : "";
	let res = await compileSource(source);
	let repaired = false;
	let tokens = first.o.kind === "answered" ? (first.o.parsed.usage?.input ?? 0) + (first.o.parsed.usage?.output ?? 0) : 0;
	let ms = first.ms;
	let final = source;
	if (!res.ok) {
		const again = await ask(repairPrompt(res.error, source));
		repaired = true;
		ms += again.ms;
		if (again.o.kind === "answered") {
			final = cleanOutput(again.o.parsed.text);
			tokens += (again.o.parsed.usage?.input ?? 0) + (again.o.parsed.usage?.output ?? 0);
			res = await compileSource(final);
		}
	}
	const words = final.replace(/\/\/[^\n]*|[{}()<>;=]/g, " ");
	rows.push({
		brief,
		ok: res.ok,
		repaired,
		tokens,
		ms,
		bytes: new TextEncoder().encode(final).length,
		bang: /!/.test(words.replace(/!==?|!\w|!\(/g, "")),
		emoji: /\p{Extended_Pictographic}/u.test(final),
		why: res.ok ? "" : res.error.slice(0, 80),
	});
	console.log(JSON.stringify(rows.at(-1)));
}
const n = rows.length;
const pct = (k) => `${rows.filter(k).length}/${n}`;
console.log(`first try ${pct((r) => r.ok && !r.repaired)}, after one repair ${pct((r) => r.ok)}, exclamation ${pct((r) => r.bang)}, emoji ${pct((r) => r.emoji)}`);
const sorted = (k) => rows.map((r) => r[k]).sort((a, b) => a - b);
console.log(`tokens median ${sorted("tokens")[n >> 1]}, max ${sorted("tokens").at(-1)}; ms median ${sorted("ms")[n >> 1]}, max ${sorted("ms").at(-1)}; bytes max ${sorted("bytes").at(-1)}`);
