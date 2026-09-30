"use client";

import { Bricolage_Grotesque } from "next/font/google";
import { useRouter } from "next/navigation";
import { type CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import styles from "./assistant.module.css";
import { ensureSession, supabase } from "@/lib/supabase";
import { loadState, persistTurn } from "@/lib/agent/agent-state";
import { moodTheme } from "@/lib/agent/mood-theme";
import { adoptGenome, assemble, newSeed, resolve } from "@/lib/agent/personality/assemble";
import { charDelay, speechBeat } from "@/lib/agent/speech";
import { beatTargets, BETWEEN_WORDS, currentSentence, wordTargets } from "@/lib/room/heart-motion";
import { fallbackReply, feelingPhrase, GUEST_NO_NOTES } from "@/lib/agent/talk";
import { formatDefinition, lookupWord, parseLookup, type Lookup } from "@/lib/agent/dictionary";
import { getCachedLookup, putCachedLookup } from "@/lib/agent/dictionary-store";
import { learnFromMessage } from "@/lib/agent/lexicon/vocabulary";
import { loadVocabulary, saveVocabulary } from "@/lib/agent/vocabulary-store";
import { newSession, processTurn, type Session } from "@/lib/agent/mind";
import {
	answersPendingLearning,
	askedForName,
	taughtMeanings,
	nameCorrection,
	nameFromAnswer,
	nameFromHistory,
	recallReply,
	turnView,
	wantsNameFromChat,
	wantsRecall,
} from "@/lib/agent/context";
import { greetGuest, type SendOptions, type Via } from "@/lib/voice/guest";
import { isCrisis } from "@/lib/agent/safety";
import { defaultState, type AgentState } from "@/lib/agent/state";
import { cleanMemoryKey, learnFact, learnSlang, type MemoryFact } from "@/lib/facts";
import { newId } from "@/lib/uuid";
import { Panel, PanelLinks, usePanels } from "@/components/osmo/panel";
import { MemoryPanel } from "@/components/osmo/memory-panel";
import { InsightsPanel } from "@/components/osmo/insights-panel";
import { SettingsPanel } from "@/components/osmo/settings-panel";
import { SPEECH_CHAR_MS } from "@/lib/voice/voices";
import { useVoice } from "@/components/osmo/use-voice";
import { useHeartMotion } from "@/components/osmo/use-heart-motion";
import { Figure } from "@/components/osmo/figure";

type ChatMessage = {
	role: "user" | "agent";
	text: string;
	// Set on a guest's line and on Osmo's reply to it; unset means Gur.
	speaker?: "guest";
};

const font = Bricolage_Grotesque({ subsets: ["latin"], display: "swap" });

const agentKnowledge: MemoryFact[] = [
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

// One remembered fact as a spoken sentence; internal keys ("slang:bet") are never read out.
function describeFact(fact: MemoryFact): string {
	const [kind, term] = fact.key.includes(":") ? fact.key.split(/:(.*)/) : ["", fact.key];
	if (kind === "slang") return `You use "${term}" to mean ${fact.value}.`;
	if (kind === "meaning") return `"${term}" means ${fact.value}.`;
	if (fact.key === "name") return `Your name is ${fact.value}.`;
	if (fact.key === "likes") return `You like ${fact.value}.`;
	return `Your ${fact.key} is ${fact.value}.`;
}

// Greetings, feelings and small talk are handled by the conversation layer (lib/agent/talk.ts).
function answerFromMemory(text: string, memory: MemoryFact[], turn: number, guest = false) {
	const normalizedText = text.toLowerCase();

	if (/what do you know|what have you remembered|list my memories/.test(normalizedText)) {
		if (memory.length === 0) return "I don't know anything about you yet.";
		return `Here's what I remember. ${memory.map(describeFact).join(" ")}`;
	}

	// An explained term ("meaning:zorp blat") answers questions about that term.
	const meaning = memory.find((item) => item.key.startsWith("meaning:") && normalizedText.includes(item.key.slice("meaning:".length)));
	if (meaning) return `In your usage, ${meaning.key.slice("meaning:".length)} means ${meaning.value}.`;

	const fact = memory.find((item) => !item.key.includes(":") && normalizedText.includes(item.key));
	if (fact) return `Your ${fact.key} is ${fact.value}.`;

	if (/\b(?:what(?:'s| is)?|whats|do you know|remember) my name\b/.test(normalizedText)) {
		// A guest's name can't be saved, so Osmo doesn't ask for it.
		return guest ? "I'm afraid I don't know your name." : "I don't know your name yet. What should I call you?";
	}

	const builtInFact = agentKnowledge.find((item) => normalizedText.includes(item.key));
	if (builtInFact) return `About ${builtInFact.key}: ${builtInFact.value}.`;

	// Each exchange adds two messages, so halve the count to step through the fallbacks one by one.
	return fallbackReply(Math.floor(turn / 2), text, guest);
}

function findUnknownTopic(text: string, memory: MemoryFact[]) {
	const topicMatch = text.match(/^(?:what is|what's|who is|tell me about|explain)\s+(.+?)[?.!]*$/i);
	if (!topicMatch) return null;

	const topic = cleanMemoryKey(topicMatch[1]);
	if (
		topic.startsWith("my ") || topic.startsWith("your ") || topic === "you" ||
		memory.some((fact) => topic.includes(fact.key.replace(/^(?:meaning|slang):/, ""))) ||
		agentKnowledge.some((fact) => topic.includes(fact.key))
	) return null;
	return topic;
}

function calculateMath(text: string): number | null {
	const expression = text
		.toLowerCase()
		.replace(/^(calculate|what is|solve)\s+/, "")
		.replace(/[?=]/g, "")
		.trim();
	if (!/[0-9]/.test(expression) || !/^[0-9()+\-*/^%.\s]+$/.test(expression)) return null;

	const tokens = expression.match(/\d*\.?\d+|[()+\-*/^%]/g) ?? [];
	if (tokens.join("") !== expression.replace(/\s/g, "")) return null;

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
		return position === tokens.length && Number.isFinite(result) ? result : null;
	} catch {
		return null;
	}
}

// Without a saved genome (first visit, or saving is unavailable) the seed is remembered in this browser.
function stableSeed(): number {
	try {
		const saved = Number(window.localStorage.getItem("osmo-seed"));
		if (Number.isInteger(saved) && saved > 0) return saved;
		const fresh = newSeed() || 1;
		window.localStorage.setItem("osmo-seed", String(fresh));
		return fresh;
	} catch {
		return newSeed() || 1;
	}
}

export default function AgentChat() {
	const [messages, setMessages] = useState<ChatMessage[]>([
		{ role: "agent", text: "Hello, I'm Osmo. How can I help?" },
	]);
	const router = useRouter();
	const panels = usePanels();
	const [input, setInput] = useState("");
	const [memory, setMemory] = useState<MemoryFact[]>([]);
	const [pendingLearning, setPendingLearning] = useState<string | null>(null);
	// True while Osmo looks a word up; the composer waits so replies stay in order.
	const [thinking, setThinking] = useState(false);
	// The user's own words and how often they've used them (understanding only).
	const [vocabulary, setVocabulary] = useState<Record<string, number>>({});
	useEffect(() => {
		void loadVocabulary().then(setVocabulary);
	}, []);
	const latestMessageRef = useRef<HTMLLIElement>(null);
	const memoryLoadedRef = useRef(false);
	const [agent, setAgent] = useState<AgentState>(defaultState);
	const [session, setSession] = useState<Session>(newSession);
	const [ready, setReady] = useState(false);
	const lastAtRef = useRef<number | null>(null);
	// Only save agent state after a successful load, so a failed load can never overwrite real data.
	const canSaveRef = useRef(false);
	const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
	const baseline = resolve(agent.genome).baseline;
	const theme = moodTheme(agent.activations, baseline);

	// Osmo "speaks" each reply: it types out, and his heart and rings follow the rhythm.
	const stageRef = useRef<HTMLDivElement>(null);
	const reduceMotionRef = useRef(false);
	const [speaking, setSpeaking] = useState<{ index: number; chars: number } | null>(null);
	const heart = useHeartMotion(stageRef);
	// How the typed-out reply keeps time: its own timer, his spoken words, or speaking pace when the device gives no word timing.
	const paceRef = useRef<"timer" | "words" | "stretched">("timer");
	// Which reply his voice is saying. Only that one follows his words; any other reply keeps the timer.
	const spokenIndexRef = useRef<number | null>(null);

	useEffect(() => {
		reduceMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	}, []);

	useEffect(() => {
		latestMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messages, speaking]);

	useEffect(() => {
		if (!speaking) return;
		const text = messages[speaking.index]?.text ?? "";
		if (speaking.chars >= text.length) {
			// Let the last word's voice fade before settling back to a still heart.
			const done = setTimeout(() => {
				heart.rest();
				setSpeaking(null);
			}, 160);
			return () => clearTimeout(done);
		}
		// His spoken words move the text of the reply he's saying; every other reply keeps its own timer.
		const spoken = speaking.index === spokenIndexRef.current;
		if (spoken && paceRef.current === "words") return;
		const beat = speechBeat(text[speaking.chars], text[speaking.chars - 1]);
		// A short beat of thinking before the first word, and a breath after each mark.
		const breath = speaking.chars > 0 ? speechBeat(text[speaking.chars - 1], text[speaking.chars - 2]).pause : 0;
		const pace = spoken && paceRef.current === "stretched" ? SPEECH_CHAR_MS : charDelay(text.length, theme.pulseSeconds);
		const wait = pace + breath + (speaking.chars === 0 ? 350 : 0);
		const timer = setTimeout(() => {
			heart.aim(beatTargets(text[speaking.chars], beat, theme.strength));
			if (beat.wordStart) heart.roll();
			setSpeaking({ index: speaking.index, chars: speaking.chars + 1 });
		}, wait);
		return () => clearTimeout(timer);
	}, [speaking, messages, theme.pulseSeconds, theme.strength, heart]);

	useEffect(() => {
		(async () => {
			try {
				if (!(await ensureSession())) {
					router.replace("/lock");
					return;
				}
				const [loaded, facts, history] = await Promise.all([
					loadState(),
					supabase.from("memory_facts").select("key,value"),
					supabase.from("messages").select("role,text,speaker").order("created_at").order("id"),
				]);
				canSaveRef.current = loaded.ok;
				lastAtRef.current = loaded.lastAt;
				let state = loaded.state;
				if (state.genome === null) {
					// A new Osmo: assemble him now and save him straight away so he is the same next time.
					state = adoptGenome(state, assemble(stableSeed()), { resetWeights: false });
					const assembled = state;
					if (loaded.ok) persistQueueRef.current = persistQueueRef.current.then(() => persistTurn(assembled, []));
				}
				setAgent(state);
				if (facts.data) setMemory(facts.data as MemoryFact[]);
				if (history.data?.length) {
					// A null speaker is Gur's line; only "guest" is kept as a marker.
					const saved = (history.data as { role: ChatMessage["role"]; text: string; speaker: string | null }[]).map(
						({ role, text, speaker }): ChatMessage => (speaker === "guest" ? { role, text, speaker } : { role, text }),
					);
					setMessages((current) => [...current, ...saved]);
				}
			} catch (error) {
				console.error("Could not load saved memory", error);
			} finally {
				memoryLoadedRef.current = true;
				setReady(true);
			}
		})();
	}, []);

	// Locking in another tab, or a session ending, sends this tab to the lock screen too.
	useEffect(() => {
		const { data } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_OUT") router.replace("/lock");
		});
		return () => data.subscription.unsubscribe();
	}, [router]);

	async function saveFact(fact: MemoryFact) {
		const { error } = await supabase
			.from("memory_facts")
			.upsert({ ...fact, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
		if (error) console.error("Could not save fact", error);
	}

	async function saveMessages(rows: ChatMessage[]) {
		const { error } = await supabase.from("messages").insert(rows);
		if (error) console.error("Could not save messages", error);
	}

	// The voice calls the latest sendText through sendTextRef, so a spoken message never runs on an old
	// render's memory or conversation, and hears every reply through onReplyRef.
	const sendTextRef = useRef<((text: string, options: SendOptions) => boolean) | null>(null);
	const onReplyRef = useRef<((reply: string, via: Via) => void) | null>(null);
	const voice = useVoice({
		speech: {
			onSpeechStart: () => {
				paceRef.current = "words";
				// The reply he is saying is the newest one: deliver's update is already queued ahead of this call.
				setSpeaking((s) => {
					spokenIndexRef.current = s ? s.index : null;
					return s;
				});
			},
			onNoWordTiming: () => {
				paceRef.current = "stretched";
				// A fresh object, so the effect runs again at the new pace.
				setSpeaking((s) => (s && s.index === spokenIndexRef.current ? { ...s } : s));
			},
			onWord: (end, word) => {
				setSpeaking((s) => (s && s.index === spokenIndexRef.current ? { ...s, chars: Math.max(s.chars, end) } : s));
				if (reduceMotionRef.current) return;
				heart.aim(wordTargets(word));
				heart.roll();
				setTimeout(() => heart.aim(BETWEEN_WORDS), 170);
			},
			onSpeechEnd: () => {
				paceRef.current = "timer";
				heart.rest();
				setSpeaking((s) => (s && s.index === spokenIndexRef.current ? { ...s, chars: Number.MAX_SAFE_INTEGER } : s));
			},
		},
		sendTextRef,
		openSettings: () => panels.open("settings"),
	});
	useEffect(() => {
		onReplyRef.current = voice.onReply;
	}, [voice.onReply]);

	function sendMessage(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		sendText(input, { via: "typed", speaker: "you" });
	}

	// One path for every message, typed or spoken. Returns false when the message can't be taken now
	// (empty, Osmo still waking up, or a word lookup in flight), so the voice knows it was dropped.
	function sendText(raw: string, options: SendOptions): boolean {
		const text = raw.trim();
		if (!text || !ready || thinking) return false;
		const { via } = options;
		// A guest (a voice that isn't Gur's) reads nothing of Gur's, and nothing is learned or saved from
		// their turn except the conversation itself.
		const guest = options.speaker === "guest";
		const view = turnView(messages, memory, vocabulary, guest);

		const taughtSlang = learnSlang(text);
		const now = Date.now();
		// A crisis message is never treated as an answer to "what does X mean?" or "what's your name?".
		const crisis = isCrisis(text);
		// A new question is answered, not saved as the explanation Osmo asked for. A guest's words never
		// answer Gur's pending question, and leave it waiting for him.
		const learning = guest || crisis || !answersPendingLearning(text) ? null : pendingLearning;
		if (!learning && !guest) setPendingLearning(null);
		// Read the reply in light of what Osmo just asked this speaker.
		const lastAgentText = view.lastAgentText;
		const correctedName = guest || crisis ? null : nameCorrection(text, lastAgentText);
		const answeredName = guest || crisis || correctedName || !askedForName(lastAgentText) ? null : nameFromAnswer(text);
		// "whats my name" or "cant u see my name in the chat" when Osmo never saved it: look back through the chat.
		const knownName = view.userName;
		const asksOwnName =
			!guest && !crisis && !knownName && (wantsNameFromChat(text) || /\b(?:what(?:'s| is)?|whats|do you know|remember) my name\b/i.test(text));
		const foundName = asksOwnName ? nameFromHistory(view.history) : null;
		const rememberName = (name: string) => {
			const nameFact = { key: "name", value: name };
			setMemory((current) => [...current.filter((fact) => fact.key !== "name"), nameFact]);
			void saveFact(nameFact);
		};
		const turn = learning
			? null
			: processTurn(agent, session, text, {
					now,
					lastAt: lastAtRef.current,
					uuid: newId,
					seed: newSeed(),
					userName: view.userName,
					slang: view.slang,
					recent: view.recent,
					vocabulary: view.vocabulary,
					guest,
				});
		// The gap since Gur last spoke drives his heart, so a guest's turn doesn't reset it.
		if (!guest) lastAtRef.current = now;

		const learnedFact = learnFact(text);
		const mathResult = learnedFact ? null : calculateMath(text);
		// "what does X mean" and friends: looked up once nothing earlier has claimed the message.
		// His own knowledge ("what is history") answers first; only an exact match counts, so "earthquake" still gets looked up.
		const askedTerm = crisis ? null : parseLookup(text);
		const lookupTerm = askedTerm && !agentKnowledge.some((fact) => fact.key === askedTerm) ? askedTerm : null;

		// Learn the user's own words (names, in-jokes, jargon). Not from a crisis message, and not from a
		// word question, whose term goes to the dictionary (a misspelled one must never become "theirs").
		if (!guest && !crisis && !askedTerm) {
			const changed = learnFromMessage(text, vocabulary, view.slang);
			if (Object.keys(changed).length > 0) {
				setVocabulary((current) => ({ ...current, ...changed }));
				if (canSaveRef.current) void saveVocabulary(changed);
			}
		}
		let response: string;
		if (learning) {
			// Saved as "meaning:<term>", so it answers "what does <term> mean" later and is never mixed up
			// with ordinary facts ("my dog is Nala" is not the meaning of "dog").
			const explanation = text.replace(/[.!?]+$/, "").replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());
			const learnedTopic = { key: `meaning:${learning}`, value: explanation };
			setMemory((current) => [
				...current.filter((fact) => fact.key !== learnedTopic.key),
				learnedTopic,
			]);
			setPendingLearning(null);
			void saveFact(learnedTopic);
			response = `Understood. "${learning}" means ${explanation}. I'll remember that.`;
		} else if (correctedName) {
			rememberName(correctedName);
			response = `My apologies, ${correctedName}. I've corrected that.`;
		} else if (answeredName) {
			rememberName(answeredName);
			response = `Nice to meet you, ${answeredName}! I'll remember that.`;
		} else if (foundName) {
			rememberName(foundName);
			response = `You're ${foundName}. My apologies, I should have caught that.`;
		} else if (asksOwnName && wantsNameFromChat(text)) {
			response = "I looked back but couldn't find it. What's your name?";
		} else if (!crisis && wantsRecall(text)) {
			response = recallReply(view.history);
		} else if (turn?.reply != null) {
			response = turn.reply;
		} else if (guest && (taughtSlang || learnedFact)) {
			// Nothing a guest says is kept, so Osmo says so rather than pretending to note it.
			response = GUEST_NO_NOTES;
		} else if (taughtSlang) {
			const slangFact = { key: `slang:${taughtSlang.word}`, value: taughtSlang.meaning };
			setMemory((current) => [...current.filter((fact) => fact.key !== slangFact.key), slangFact]);
			void saveFact(slangFact);
			response = `Understood. When you say "${taughtSlang.word}", I'll read it as "${taughtSlang.meaning}".`;
		} else if (learnedFact) {
			setMemory((current) => [
				...current.filter((fact) => fact.key !== learnedFact.key),
				learnedFact,
			]);
			void saveFact(learnedFact);
			response = `Noted. Your ${learnedFact.key} is ${learnedFact.value}.`;
		} else if (mathResult !== null) {
			response = `That comes to ${mathResult}.`;
		} else if (lookupTerm) {
			response = ""; // filled in when the lookup finishes, below
		} else {
			const unknownTopic = findUnknownTopic(text, view.memory);
			if (unknownTopic && guest) {
				response = formatDefinition({ kind: "missing", term: unknownTopic }, true);
			} else if (unknownTopic) {
				setPendingLearning(unknownTopic);
				response = formatDefinition({ kind: "missing", term: unknownTopic });
			} else {
				response = answerFromMemory(text, view.memory, guest ? messages.length : view.history.length, guest);
			}
		}

		// A guest's turn is for its reply only: his mood, bond and session stay exactly as they were.
		if (turn && !guest) {
			if (turn.state.genome && turn.state.genome !== agent.genome) {
				try {
					window.localStorage.setItem("osmo-seed", String(turn.state.genome.seed));
				} catch {
					/* remembering the seed is best-effort */
				}
			}
			setAgent(turn.state);
			setSession(turn.session);
			if (canSaveRef.current) {
				// Serialize saves so a verdict never runs before its dilemma row exists.
				persistQueueRef.current = persistQueueRef.current.then(() =>
					persistTurn(turn.state, turn.effects),
				);
			}
		}

		// A guest's line and Osmo's reply to it are marked, so they never feed Gur's context later.
		const mark = guest ? ({ speaker: "guest" } as const) : {};
		const userMessage: ChatMessage = { role: "user", text, ...mark };
		// A spoken message leaves a half-typed draft alone.
		if (via === "typed") setInput("");
		// Every reply ends here: typed out by the circle, and handed to the voice.
		// The user's message sits at messages.length, so the reply is at messages.length + 1; the
		// composer is locked during a lookup, so nothing can land in between.
		const deliver = (reply: string) => {
			const agentMessage: ChatMessage = { role: "agent", text: greetGuest(reply, guest && (options.greet ?? false), crisis), ...mark };
			// Cut off any reply still being spoken, then speak the new one (or show it at once).
			heart.rest();
			setSpeaking(reduceMotionRef.current ? null : { index: messages.length + 1, chars: 0 });
			setMessages((current) => [...current, agentMessage]);
			void saveMessages([userMessage, agentMessage]);
			// Handed over once sendText has returned, so the voice always knows its message was taken
			// before the reply arrives, even when the reply is ready at once.
			queueMicrotask(() => onReplyRef.current?.(agentMessage.text, via));
		};
		setMessages((current) => [...current, userMessage]);
		if (lookupTerm && response === "") {
			setThinking(true);
			void lookupWord(lookupTerm, {
				fetch: (url, init) => fetch(url, init),
				taught: taughtMeanings(view.memory),
				cacheGet: canSaveRef.current ? getCachedLookup : undefined,
				cachePut: canSaveRef.current && !guest ? putCachedLookup : undefined,
			})
				.catch((): Lookup => ({ kind: "missing", term: lookupTerm }))
				.then((result) => {
					if (result.kind === "missing" && !guest) setPendingLearning(result.term);
					setThinking(false);
					deliver(formatDefinition(result, guest));
				});
			return true;
		}
		deliver(response);
		return true;
	}
	useEffect(() => {
		sendTextRef.current = sendText;
	});

	// The subtitle under him: the sentence he's saying. After the last word it keeps the reply's last
	// sentence while it fades (figure.module.css shows it only while data-speaking is set).
	const spokenText = speaking ? messages[speaking.index]?.text.slice(0, speaking.chars) : [...messages].reverse().find((m) => m.role === "agent")?.text;
	// A browser that can't listen has no way in but typing, so it shows the conversation whatever the setting.
	const voiceOnly = !voice.showChat && voice.listenSupported;
	// Voice only: while he thinks, "One moment…" sits under him, and what he heard you say sits above him.
	const said = thinking && voiceOnly ? "One moment…" : spokenText ? currentSentence(spokenText) : null;
	const lastHeard = [...messages].reverse().find((m) => m.role === "user")?.text ?? null;
	const heard = voiceOnly ? (voice.liveText ?? (thinking ? lastHeard : null)) : null;

	const stageStyle = {
		"--aura-a": theme.colorA,
		"--aura-b": theme.colorB,
		"--base": theme.base,
		"--pulse": `${theme.pulseSeconds.toFixed(2)}s`,
		"--strength": theme.strength.toFixed(2),
	} as CSSProperties;

	return (
		<div ref={stageRef} className={`${styles.stage} ${font.className}`} style={stageStyle}
			data-tone={theme.tone}
			data-speaking={speaking ? "" : undefined}
			data-panel={panels.panel ?? undefined}
			data-listening={voice.mode === "awake" || voice.mode === "followup" ? "" : undefined}
			data-chat={voiceOnly ? undefined : ""}
			data-fade={voice.fadeSaid ? "" : undefined}
		>
			<div className={styles.aura} aria-hidden="true">
				<span className={`${styles.orb} ${styles.orbA}`} />
				<span className={`${styles.orb} ${styles.orbB}`} />
				<Figure className={styles.figure} said={said} heard={heard} />
			</div>

			<main className={styles.column}>
				<header className={styles.head}>
					<span className={styles.heart} aria-hidden="true" />
					<div>
						<h1 className={styles.name}>Osmo</h1>
						<p className={styles.mood} role="status">
							Feeling {feelingPhrase(agent.activations, baseline)}
						</p>
					</div>
					<PanelLinks panel={panels.panel} toggle={panels.toggle} linkRef={panels.linkRef} />
				</header>

				{!voiceOnly && (
				<ol
					className={styles.log}
					aria-label="Conversation with Osmo"
					aria-live="polite"
					aria-busy={speaking !== null}
				>
					{messages.map((message, index) => {
						const talking = speaking?.index === index;
						return (
							<li
								key={`${message.role}-${index}`}
								className={`${styles.item} ${message.role === "user" ? styles.user : styles.agent} ${
									talking ? styles.speaking : ""
								} ${message.speaker === "guest" && message.role === "user" ? styles.guest : ""}`}
								hidden={talking && speaking.chars === 0}
							>
								{message.speaker === "guest" && message.role === "user" && <span className={styles.who}>Someone else</span>}
								<p className={styles.bubble}>{talking ? message.text.slice(0, speaking.chars) : message.text}</p>
							</li>
						);
					})}
					{thinking && (
					<li className={`${styles.item} ${styles.agent}`} aria-live="polite">
						<p className={styles.bubble}>One moment…</p>
					</li>
				)}
				<li ref={latestMessageRef} className={styles.end} aria-hidden="true" />
				</ol>
				)}

				<form onSubmit={sendMessage} className={styles.composer}>
					<input
						className={styles.field}
						value={voice.liveText ?? input}
						onChange={(event) => setInput(event.target.value)}
						placeholder={ready ? "Tell Osmo how you're doing" : "Osmo is waking up…"}
						aria-label="Message"
						disabled={!ready || thinking}
						readOnly={voice.liveText !== null}
					/>
					{(voice.listenSupported || voice.mode === "speaking") && (
						<button
							type="button"
							className={styles.mic}
							onClick={voice.mode === "speaking" ? voice.stop : voice.micPress}
							disabled={voice.mode !== "speaking" && (!ready || thinking)}
							aria-label={voice.mode === "speaking" ? "Stop speaking" : "Talk to Osmo"}
						>
							{voice.mode === "speaking" ? <Square aria-hidden="true" size={18} /> : <Mic aria-hidden="true" size={18} />}
						</button>
					)}
					<button type="submit" className={styles.send} disabled={!ready || thinking || voice.liveText !== null}>
						Send
					</button>
				</form>
				{voice.micOpen && (
					<p className={styles.voiceLine} role="status">
						{voice.mode === "sleeping" ? 'Listening for "Osmo"' : "Listening…"}
					</p>
				)}
				{voice.error && (
					<p className={styles.voiceError} role="alert">
						{voice.error}
					</p>
				)}
			</main>

			{panels.panel && (
				<Panel id={panels.panel} onClose={panels.close}>
					{panels.panel === "memory" && <MemoryPanel memory={memory} onChange={setMemory} />}
					{panels.panel === "insights" && <InsightsPanel agent={agent} />}
					{panels.panel === "settings" && <SettingsPanel voice={voice} />}
				</Panel>
			)}
		</div>
	);
}
