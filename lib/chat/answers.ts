import { fallbackReply } from "../agent/talk";
import { cleanMemoryKey, type MemoryFact } from "../facts";

// The reply chain's helpers, moved out of the room (app/assistant.tsx) so they can be tested: Osmo's built-in
// knowledge, answers from what he remembers, topics he doesn't know, and arithmetic.

// What Osmo knows about himself and a few topics. The keys are the same whether the AI conversation is on or off.
const KNOWLEDGE: MemoryFact[] = [
	{
		key: "local agent",
		value: "an assistant that runs in your browser, using its built-in knowledge and what you teach it",
	},
	{
		key: "internet access",
		value: "used only to look up word definitions from Datamuse and Wiktionary, and only the word itself is sent",
	},
	{
		key: "memory",
		value: "saved to your private account, so facts and learned explanations carry over between conversations",
	},
	{
		key: "math",
		value: "basic arithmetic, percentages, powers, and parentheses are supported locally",
	},
	{
		key: "conversation learning",
		value: "when the agent does not know a topic, it asks the user to explain it and saves that explanation",
	},
	{
		key: "history",
		value: "the study of people, societies, and events from the past",
	},
	{
		key: "ancient egypt",
		value: "a civilization in northeastern Africa known for the Nile River, hieroglyphics, pyramids, and pharaohs",
	},
	{
		key: "roman empire",
		value: "a large ancient empire centered on Rome that shaped law, government, language, engineering, and culture",
	},
	{
		key: "industrial revolution",
		value: "the period when mechanized manufacturing and factories transformed economies and societies, beginning in Britain in the 18th century",
	},
	{
		key: "world war ii",
		value: "a global war from 1939 to 1945 involving the Allied and Axis powers",
	},
	{
		key: "democracy",
		value: "a form of government in which political power is exercised by the people, directly or through representatives",
	},
	{
		key: "scientific method",
		value: "a process of asking questions, forming hypotheses, testing them with evidence, and revising conclusions",
	},
	{
		key: "gravity",
		value: "the attractive force between objects with mass; it keeps people on Earth and planets in orbit",
	},
	{
		key: "evolution",
		value: "the change in inherited traits in populations across generations, with natural selection as one important mechanism",
	},
	{
		key: "dna",
		value: "a molecule that stores genetic instructions used by living organisms",
	},
	{
		key: "solar system",
		value: "the Sun and the planets, moons, asteroids, comets, and other objects that orbit it",
	},
	{
		key: "earth",
		value: "the third planet from the Sun and the only world currently known to support life",
	},
	{
		key: "computer",
		value: "a machine that processes information according to programmed instructions",
	},
	{
		key: "artificial intelligence",
		value: "computer systems designed to perform tasks that usually require human reasoning, perception, or language ability",
	},
	{
		key: "internet",
		value: "a worldwide network of connected computer networks; this agent uses it only to look up word definitions",
	},
];

// With the AI conversation on, these four say honestly that an OpenAI model writes his everyday replies, and what is sent to it.
const WITH_AI: Record<string, string> = {
	"local agent": "an assistant that runs in your browser, while an OpenAI model writes its everyday replies",
	"internet access":
		"used to look up word definitions from Datamuse and Wiktionary, and to have an OpenAI model write its everyday replies, so your messages, what it remembers of you and your recent chat are sent to OpenAI",
	"conversation learning":
		"when the agent does not know a topic, an OpenAI model answers it; if the model can't be reached, the agent asks the user to explain it and saves that explanation",
	internet:
		"a worldwide network of connected computer networks; this agent uses it to look up word definitions and to have an OpenAI model write its everyday replies, which sends your messages, what it remembers of you and your recent chat to OpenAI",
};

export function agentKnowledge(aiOn: boolean): MemoryFact[] {
	return KNOWLEDGE.map((fact) => (aiOn && WITH_AI[fact.key] ? { key: fact.key, value: WITH_AI[fact.key] } : fact));
}

// His own knowledge answers "what is history" before any dictionary. Only an exact match counts, so "earthquake"
// is still looked up.
export function isBuiltInTopic(term: string): boolean {
	return KNOWLEDGE.some((fact) => fact.key === term);
}

// A saved value as a sentence says it: without its own closing marks ("Gur.", "Rex!"), since the sentence ends with a full stop.
const spoken = (value: string) => value.replace(/[.!?]+$/, "");

// One remembered fact as a spoken sentence; internal keys ("slang:bet") are never read out.
export function describeFact(fact: MemoryFact): string {
	const [kind, term] = fact.key.includes(":") ? fact.key.split(/:(.*)/) : ["", fact.key];
	const value = spoken(fact.value);
	if (kind === "slang") return `You use "${term}" to mean ${value}.`;
	if (kind === "meaning") return `"${term}" means ${value}.`;
	if (fact.key === "name") return `Your name is ${value}.`;
	if (fact.key === "likes") return `You like ${value}.`;
	return `Your ${fact.key} is ${value}.`;
}

// Greetings, feelings and small talk are handled by the conversation layer (lib/agent/talk.ts).
export function answerFromMemory(text: string, memory: MemoryFact[], turn: number, guest = false, aiOn = false): string {
	const normalizedText = text.toLowerCase();

	if (/what do you know|what have you remembered|list my memories/.test(normalizedText)) {
		if (memory.length === 0) return "I don't know anything about you yet.";
		return `Here's what I remember. ${memory.map(describeFact).join(" ")}`;
	}

	// An explained term ("meaning:zorp blat") answers questions about that term.
	const meaning = memory.find((item) => item.key.startsWith("meaning:") && normalizedText.includes(item.key.slice("meaning:".length)));
	if (meaning) return `In your usage, ${meaning.key.slice("meaning:".length)} means ${meaning.value}.`;

	// Gur's own name answers only a question about his own name, never "what's my sister's name".
	const fact = memory.find(
		(item) => !item.key.includes(":") && (item.key === "name" ? /\bmy name\b/.test(normalizedText) : normalizedText.includes(item.key)),
	);
	if (fact) return `Your ${fact.key} is ${spoken(fact.value)}.`;

	if (/\b(?:what(?:'s| is)?|whats|do you know|remember) my name\b/.test(normalizedText)) {
		// A guest's name can't be saved, so Osmo doesn't ask for it.
		return guest ? "I'm afraid I don't know your name." : "I don't know your name yet. What should I call you?";
	}

	const builtInFact = agentKnowledge(aiOn).find((item) => normalizedText.includes(item.key));
	if (builtInFact) return `About ${builtInFact.key}: ${builtInFact.value}.`;

	// Each exchange adds two messages, so halve the count to step through the fallbacks one by one.
	return fallbackReply(Math.floor(turn / 2), text, guest);
}

// "what is X", "tell me about X": a topic Osmo neither remembers nor knows, which he asks the user to explain.
export function findUnknownTopic(text: string, memory: MemoryFact[]): string | null {
	const topicMatch = text.match(/^(?:what is|what's|who is|tell me about|explain)\s+(.+?)[?.!]*$/i);
	if (!topicMatch) return null;

	const topic = cleanMemoryKey(topicMatch[1]);
	if (
		topic.startsWith("my ") || topic.startsWith("your ") || topic === "you" ||
		memory.some((fact) => topic.includes(fact.key.replace(/^(?:meaning|slang):/, ""))) ||
		KNOWLEDGE.some((fact) => topic.includes(fact.key))
	) return null;
	return topic;
}

export function calculateMath(text: string): number | null {
	const expression = text
		.toLowerCase()
		.replace(/^(calculate|what is|solve)\s+/, "")
		.replace(/[?=]/g, "")
		.trim();
	if (!/[0-9]/.test(expression) || !/^[0-9()+\-*/^%.\s]+$/.test(expression)) return null;

	const tokens: string[] = expression.match(/\d*\.?\d+|[()+\-*/^%]/g) ?? [];
	if (tokens.join("") !== expression.replace(/\s/g, "")) return null;
	// A sum needs an operator between two values, or a percentage: a bare number ("22" after "how old are you",
	// "2024") is an answer.
	if (!tokens.includes("%") && !tokens.some((token, i) => i > 0 && "+-*/^".includes(token) && /^[\d.)%]/.test(tokens[i - 1]))) return null;

	let position = 0;
	const parseExpression = (): number => {
		let value = parseTerm();
		while (tokens[position] === "+" || tokens[position] === "-") {
			const operator = tokens[position++];
			const right = parseTerm();
			value = operator === "+" ? value + right : value - right;
		}
		return value;
	};
	const parseTerm = (): number => {
		let value = parsePower();
		while (tokens[position] === "*" || tokens[position] === "/") {
			const operator = tokens[position++];
			const right = parsePower();
			value = operator === "*" ? value * right : value / right;
		}
		return value;
	};
	const parsePower = (): number => {
		let value = parsePrimary();
		if (tokens[position] === "^") {
			position++;
			value = value ** parsePower();
		}
		return value;
	};
	const parsePrimary = (): number => {
		if (tokens[position] === "-") {
			position++;
			return -parsePrimary();
		}
		if (tokens[position] === "(") {
			position++;
			const value = parseExpression();
			if (tokens[position] !== ")") throw new Error("Missing closing parenthesis");
			position++;
			return value;
		}
		const value = Number(tokens[position++]);
		if (tokens[position] === "%") {
			position++;
			return value / 100;
		}
		return value;
	};

	try {
		const result = parseExpression();
		// Rounded to 12 significant digits, so 0.1 + 0.2 is said as 0.3.
		return position === tokens.length && Number.isFinite(result) ? Number(result.toPrecision(12)) : null;
	} catch {
		return null;
	}
}
