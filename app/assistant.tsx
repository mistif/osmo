"use client";

import { Bricolage_Grotesque } from "next/font/google";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { type CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import styles from "./assistant.module.css";
import { ensureSession, supabase } from "@/lib/supabase";
import { ensureTimezone } from "@/lib/shell/profile-client";
import { loadState, persistTurn } from "@/lib/agent/agent-state";
import { moodTheme } from "@/lib/agent/mood-theme";
import { CHARACTER } from "@/lib/agent/character";
import { charDelay, speechBeat } from "@/lib/agent/speech";
import { beatTargets, BETWEEN_WORDS, currentSentence, wordTargets } from "@/lib/room/heart-motion";
import { feelingPhrase, GUEST_NO_NOTES } from "@/lib/agent/talk";
import { formatDefinition, lookupWord, parseLookup, type Lookup } from "@/lib/agent/dictionary";
import { getCachedLookup, putCachedLookup } from "@/lib/agent/dictionary-store";
import { learnFromMessage } from "@/lib/agent/lexicon/vocabulary";
import { loadVocabulary, saveVocabulary } from "@/lib/agent/vocabulary-store";
import { newSession, prepareTurn, type Session, type TurnContext, type TurnResult } from "@/lib/agent/mind";
import { feelTurn } from "@/lib/agent/feelings";
import {
	answersPendingLearning,
	taughtMeanings,
	nameAnswer,
	nameCorrection,
	nameFromHistory,
	recallReply,
	turnView,
	wantsNameFromChat,
	wantsRecall,
} from "@/lib/agent/context";
import { greetGuest, type SendOptions, type Via } from "@/lib/voice/guest";
import { CRISIS_REPLY, isCrisis } from "@/lib/agent/safety";
import { defaultState, type AgentState } from "@/lib/agent/state";
import { learnFact, learnSlang, type MemoryFact } from "@/lib/facts";
import { answerFromMemory, calculateMath, findUnknownTopic, isBuiltInTopic } from "@/lib/chat/answers";
import { askForReply, askStatus, nextUsage } from "@/lib/chat/ask";
import { chatBody } from "@/lib/chat/body";
import { sendDecision, UNREACHED } from "@/lib/chat/decision";
import { decisionEnd, decisionFor, detectionOf, keptTurn, pickBranch, quietEffects, waitingAfter, whileWaiting, writerFor, type QuietPlan, type Waiting as Confirming } from "@/lib/chat/branch";
import type { ChatStatus } from "@/lib/chat/types";
import { newId } from "@/lib/uuid";
import { Panel, PanelLinks, usePanels } from "@/components/osmo/panel";
import { MemoryPanel } from "@/components/osmo/memory-panel";
import { InsightsPanel } from "@/components/osmo/insights-panel";
import { SettingsPanel } from "@/components/osmo/settings-panel";
import { SPEECH_CHAR_MS } from "@/lib/voice/voices";
import { useVoice } from "@/components/osmo/use-voice";
import { useHeartMotion } from "@/components/osmo/use-heart-motion";
import { Figure } from "@/components/osmo/figure";
import { useBuild } from "@/components/osmo/use-build";
import { ThingPanel } from "@/components/osmo/thing-panel";
import { SHELL2, WORLD } from "@/lib/shell/flag";
import { useShell } from "@/components/osmo/use-shell";
import { Rail } from "@/components/osmo/rail";
import { ShellPanels } from "@/components/osmo/shell-panels";
import type { WorldControl } from "@/components/osmo/world";
import type { BuildTicket } from "@/lib/actions/types";

type ChatMessage = {
	role: "user" | "agent";
	text: string;
	// Set on a guest's line and on Osmo's reply to it; unset means Gur.
	speaker?: "guest";
};
// The turn Osmo is waiting on, for a model reply or a word lookup. Its id is the index of its user line in messages,
// and line is that line itself. A crisis message taken meanwhile marks it quiet, and aborts a model request.
type Waiting = { id: number; on: "model" | "lookup"; controller: AbortController | null; quiet: boolean; line: ChatMessage };

const font = Bricolage_Grotesque({ subsets: ["latin"], display: "swap" });
// The village loads after first paint, and only behind both switches (lib/shell/flag.ts).
const WorldStage = dynamic(() => import("@/components/osmo/world").then((m) => m.WorldStage), { ssr: false });

// How long a turn waits for the session before his own words answer; the model call keeps its own 15 s.
const SESSION_TIMEOUT_MS = 3_000;

export default function AgentChat() {
	const [messages, setMessages] = useState<ChatMessage[]>([
		{ role: "agent", text: "Hello. I am Osmo. What is on your mind?" },
	]);
	const router = useRouter();
	const panels = usePanels();
	const [input, setInput] = useState("");
	const [memory, setMemory] = useState<MemoryFact[]>([]);
	const [pendingLearning, setPendingLearning] = useState<string | null>(null);
	// True while Osmo waits on a reply (the model, or a word lookup); the composer waits so replies stay in order.
	const [thinking, setThinking] = useState(false);
	// The AI conversation: today's usage for Settings (null means off), whether it's on (the GET below says so, and a
	// 403 or "off" says it isn't), and whether this visit has stopped it (a crisis message, a crisis flag, a 403 or
	// "off"). Nothing is posted unless aiOn().
	const [aiUsage, setAiUsage] = useState<ChatStatus | null>(null);
	const aiEnabledRef = useRef(false);
	const aiStoppedRef = useRef(false);
	// Whether the last answer left an action waiting for Gur's yes or no (spec 4.3), and which row: null when none waits.
	// Only then does a bare yes or no go to /api/act instead of the conversation, with that row's id, so a row held from
	// another tab is never answered by it. Its rules are waitingAfter's and decisionEnd's (lib/chat/branch.ts).
	const confirmWaitingRef = useRef<Confirming>(null);
	const waitingRef = useRef<Waiting | null>(null);
	// Read in handlers only, never while rendering.
	const aiOn = () => aiEnabledRef.current && !aiStoppedRef.current;
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
	const baseline = CHARACTER.baseline;
	const theme = moodTheme(agent.activations, baseline, agent.mood);

	// Osmo "speaks" each reply: it types out, and his heart and rings follow the rhythm.
	const stageRef = useRef<HTMLDivElement>(null);
	const reduceMotionRef = useRef(false);
	const [speaking, setSpeaking] = useState<{ index: number; chars: number } | null>(null);
	const heart = useHeartMotion(stageRef);
	const shell = useShell(SHELL2, stageRef, ready);
	// The village's control: the composer's focus and typing turn him to Gur (components/osmo/world.tsx).
	const worldRef = useRef<WorldControl | null>(null);
	const openPanel = SHELL2 ? shell.route.panel : panels.panel;
	// The thing he builds beside the conversation. buildRef is how sendText hands over a ticket (language, task B8);
	// until a ticket arrives nothing renders. Locking unmounts the room, and the hook cancels a running build then.
	const build = useBuild();
	const buildRef = useRef<{ start(t: BuildTicket): void; cancel(): void } | null>(null);
	useEffect(() => {
		buildRef.current = build;
	});
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
					supabase.from("memory_facts").select("key,value").order("updated_at"),
					supabase.from("messages").select("role,text,speaker").order("created_at").order("id"),
				]);
				canSaveRef.current = loaded.ok;
				lastAtRef.current = loaded.lastAt;
				// The old per-browser seed belonged to the personality roll, which is gone.
				try {
					window.localStorage.removeItem("osmo-seed");
				} catch {
					/* best-effort */
				}
				setAgent(loaded.state);
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
	}, [router]);

	// Once per load, silently: remember this device's time zone for reminders if the profile has none (spec 6.2).
	useEffect(() => {
		void (async () => {
			const signedIn = await ensureSession().catch(() => null);
			if (signedIn) await ensureTimezone(supabase, signedIn.user.id, Intl.DateTimeFormat().resolvedOptions().timeZone);
		})();
	}, []);

	// Locking in another tab, or a session ending, sends this tab to the lock screen too.
	useEffect(() => {
		const { data } = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_OUT") router.replace("/lock");
		});
		return () => data.subscription.unsubscribe();
	}, [router]);

	// Whether the AI conversation is on for this visit. Until this answers yes, nothing is posted to /api/chat.
	useEffect(() => {
		let live = true;
		void (async () => {
			const signedIn = await ensureSession().catch(() => null);
			if (!signedIn || !live) return;
			const status = await askStatus(fetch, signedIn.access_token);
			if (!live) return;
			aiEnabledRef.current = status?.enabled === true;
			setAiUsage(status);
		})();
		return () => {
			live = false;
		};
	}, []);

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
		openSettings: () => (SHELL2 ? shell.open("settings", "voice") : panels.open("settings")),
	});
	useEffect(() => {
		onReplyRef.current = voice.onReply;
	}, [voice.onReply]);

	function sendMessage(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		sendText(input, { via: "typed", speaker: "you" });
	}

	// A crisis cancels every waiting confirmation, so a yes afterwards finds nothing (spec 4.3, 9.1). It's posted whatever
	// the flag says: a confirmation may still wait from before a reload, from another tab, or after a later answer
	// cleared the flag. A crisis is rare, and the server's cancel is cheap.
	function cancelConfirmation() {
		confirmWaitingRef.current = null;
		void ensureSession().catch(() => null).then((s) => s && sendDecision(fetch, s.access_token, "crisis", "typed"));
	}

	// A crisis message that arrives while Osmo waits on another turn is answered at once, never dropped. The
	// waiting turn owns this step of his heart, so it isn't stepped here; that turn finishes quietly instead.
	function takeCrisis(text: string, options: SendOptions): boolean {
		setPendingLearning(null);
		aiStoppedRef.current = true;
		cancelConfirmation();
		const wait = waitingRef.current;
		// A model turn cut short gets no reply, so its line is saved here, ahead of the crisis pair as on screen.
		// Only the crisis message that first quiets it saves it.
		const cutShort = wait !== null && wait.on === "model" && !wait.quiet;
		const waitingLine = cutShort ? wait.line : undefined;
		if (wait) {
			wait.quiet = true;
			if (wait.on === "model") wait.controller?.abort();
		}
		// A guest's line and Osmo's reply to it are marked, so they never feed Gur's context later.
		const mark = options.speaker === "guest" ? ({ speaker: "guest" } as const) : {};
		const crisisLine: ChatMessage = { role: "user", text, ...mark };
		const reply: ChatMessage = { role: "agent", text: CRISIS_REPLY, ...mark };
		// The reply's index comes from the list this update extends, never from this render's messages: the
		// waiting turn's reply can land just before, without a render in between.
		let index = 0;
		setMessages((current) => {
			index = current.length + 1;
			return [...current, crisisLine, reply];
		});
		// Cut off any reply still being typed out, then type this one out; queued after the update above.
		heart.rest();
		setSpeaking(() => (reduceMotionRef.current ? null : { index, chars: 0 }));
		void saveMessages(waitingLine ? [waitingLine, crisisLine, reply] : [crisisLine, reply]);
		// Handed over once sendText has returned: the voice has just moved to waiting for this message.
		queueMicrotask(() => onReplyRef.current?.(CRISIS_REPLY, options.via));
		return true;
	}

	// One path for every message, typed or spoken. Returns false when the message can't be taken now
	// (empty, Osmo still waking up, or a reply still on its way and this isn't a crisis message), so the
	// voice knows it was dropped.
	function sendText(raw: string, options: SendOptions): boolean {
		const text = raw.trim();
		if (!text || !ready) return false;
		// While Osmo waits on a reply, only a crisis message is taken; any other is dropped, as before. waitingRef
		// is set the moment a turn starts waiting, before the render that shows thinking.
		if (thinking || waitingRef.current !== null) return whileWaiting(text) === "take" ? takeCrisis(text, options) : false;
		const { via } = options;
		// A guest (a voice that isn't Gur's) reads nothing of Gur's, and nothing is learned or saved from
		// their turn except the conversation itself.
		const guest = options.speaker === "guest";
		const view = turnView(messages, memory, vocabulary, guest);

		const taughtSlang = learnSlang(text);
		const now = Date.now();
		// A crisis message is never treated as an answer to "what does X mean?" or "what's your name?".
		const crisis = isCrisis(text);
		// After a crisis message the model is asked nothing more until the room is reloaded, and the waiting
		// confirmation is cancelled (spec 9.1).
		if (crisis) {
			aiStoppedRef.current = true;
			cancelConfirmation();
		}
		// A new question is answered, not saved as the explanation Osmo asked for. A guest's words never
		// answer Gur's pending question, and leave it waiting for him.
		const learning = guest || crisis || !answersPendingLearning(text) ? null : pendingLearning;
		if (!learning && !guest) setPendingLearning(null);
		// Read the reply in light of what Osmo just asked this speaker.
		const lastAgentText = view.lastAgentText;
		const knownName = view.userName;
		const correctedName = guest || crisis ? null : nameCorrection(text, lastAgentText);
		// Only an answer to code's own name question counts, and only while no name is saved.
		const answeredName = guest || crisis || correctedName ? null : nameAnswer(text, lastAgentText, knownName);
		// "whats my name" or "cant u see my name in the chat" when Osmo never saved it: look back through the chat.
		const asksOwnName =
			!guest && !crisis && !knownName && (wantsNameFromChat(text) || /\b(?:what(?:'s| is)?|whats|do you know|remember) my name\b/i.test(text));
		const foundName = asksOwnName ? nameFromHistory(view.history) : null;
		const rememberName = (name: string) => {
			const nameFact = { key: "name", value: name };
			setMemory((current) => [...current.filter((fact) => fact.key !== "name"), nameFact]);
			void saveFact(nameFact);
		};
		// His inner life steps once. prepareTurn runs it, and carries the rule-based result (processed) beside the facts the
		// model puts into words; it is pure, and only the result whose reply is used is kept (keptTurn).
		const ctx: TurnContext = {
			now,
			lastAt: lastAtRef.current,
			uuid: newId,
			userName: view.userName,
			slang: view.slang,
			recent: view.recent,
			vocabulary: view.vocabulary,
			guest,
		};
		const prepared = learning ? null : prepareTurn(agent, session, text, ctx);
		const turn = prepared ? prepared.processed : null;
		// The gap since Gur last spoke drives his heart, so a guest's turn doesn't reset it.
		if (!guest) lastAtRef.current = now;

		const learnedFact = learnFact(text);
		const mathResult = learnedFact ? null : calculateMath(text);
		// "what does X mean" and friends: looked up once nothing earlier has claimed the message.
		// His own knowledge ("what is history") answers first; only an exact match counts, so "earthquake" still gets looked up.
		const askedTerm = crisis ? null : parseLookup(text);
		const lookupTerm = askedTerm && !isBuiltInTopic(askedTerm) ? askedTerm : null;

		// Learn the user's own words (names, in-jokes, jargon). Not from a crisis message, and not from a
		// word question, whose term goes to the dictionary (a misspelled one must never become "theirs").
		if (!guest && !crisis && !askedTerm) {
			const changed = learnFromMessage(text, vocabulary, view.slang);
			if (Object.keys(changed).length > 0) {
				setVocabulary((current) => ({ ...current, ...changed }));
				if (canSaveRef.current) void saveVocabulary(changed);
			}
		}

		// Which of today's replies this message gets, worked out with no side effects.
		const unknownTopic = findUnknownTopic(text, view.memory);
		const { branch, pendingTopic } = pickBranch({
			learning,
			correctedName,
			answeredName,
			foundName,
			lookedBack: asksOwnName && wantsNameFromChat(text),
			recall: !crisis && wantsRecall(text),
			turnReply: turn?.reply ?? null,
			guest,
			taughtSlang: taughtSlang !== null,
			learnedFact: learnedFact !== null,
			mathResult,
			lookupTerm,
			unknownTopic,
		});
		// Today's reply for a branch the model may write, also with no side effects. A lookup's is known only once it ends.
		const ruleReply = ((): string | null => {
			switch (branch) {
				case "recall":
					return recallReply(view.history);
				case "turn":
					return turn?.reply ?? null;
				case "math":
					return `That comes to ${mathResult}.`;
				case "unknownTopic":
					return unknownTopic === null ? null : formatDefinition({ kind: "missing", term: unknownTopic }, guest);
				case "memory":
					// His self-description follows whether the AI is on, not a pause after a crisis this visit.
					return answerFromMemory(text, view.memory, guest ? messages.length : view.history.length, guest, aiEnabledRef.current);
				default:
					return null;
			}
		})();
		const writer = writerFor({
			branch,
			aiOn: aiOn(),
			guest,
			preparedReply: prepared?.reply ?? null,
			ruleReply,
			textLength: text.length,
		});

		// Today's reply for the branch, with what it saves or asks. Used when code writes the reply, and when the model can't.
		const codeReply = (): string => {
			if (branch === "learning" && learning) {
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
				return `Understood. "${learning}" means ${explanation}.`;
			}
			if (branch === "correctedName" && correctedName) {
				rememberName(correctedName);
				return `My apologies, ${correctedName}. I have corrected that.`;
			}
			if (branch === "answeredName" && answeredName) {
				rememberName(answeredName);
				return `Good to meet you, ${answeredName}.`;
			}
			if (branch === "foundName" && foundName) {
				rememberName(foundName);
				return `You are ${foundName}. My apologies, I should have caught that.`;
			}
			if (branch === "lookedBack") return "I looked back but could not find it. What is your name?";
			// Nothing a guest says is kept, so Osmo says so rather than pretending to note it.
			if (branch === "guestNotes") return GUEST_NO_NOTES;
			if (branch === "slang" && taughtSlang) {
				const slangFact = { key: `slang:${taughtSlang.word}`, value: taughtSlang.meaning };
				setMemory((current) => [...current.filter((fact) => fact.key !== slangFact.key), slangFact]);
				void saveFact(slangFact);
				return `Understood. When you say "${taughtSlang.word}", I will read it as "${taughtSlang.meaning}".`;
			}
			if (branch === "fact" && learnedFact) {
				setMemory((current) => [
					...current.filter((fact) => fact.key !== learnedFact.key),
					learnedFact,
				]);
				void saveFact(learnedFact);
				return `Understood. Your ${learnedFact.key} is ${learnedFact.value}.`;
			}
			// A topic he doesn't know: he asks Gur to explain it, and saves the answer next turn.
			if (pendingTopic) setPendingLearning(pendingTopic);
			// Recall, processTurn's reply, arithmetic, an unknown topic or his memory; "" for a lookup, filled in when it ends.
			return ruleReply ?? "";
		};

		// A guest's turn is for its reply only: his mood, bond and session stay exactly as they were.
		const applyTurn = (kept: TurnResult | null, felt: { detection?: unknown; crisis?: boolean } = {}) => {
			if (!kept || guest) return;
			// His feelings step once per kept turn, from the model's reading of Gur or the rules' (feelTurn also records Gur's last tone).
			const next = feelTurn(kept, text, felt.detection ?? null, { now, lastAt: ctx.lastAt, guest, crisis: crisis || felt.crisis === true });
			setAgent(next.state);
			setSession(next.session);
			if (canSaveRef.current) {
				// Serialize saves so a verdict never runs before its dilemma row exists.
				persistQueueRef.current = persistQueueRef.current.then(() =>
					persistTurn(next.state, next.effects),
				);
			}
		};

		// A guest's line and Osmo's reply to it are marked, so they never feed Gur's context later.
		const mark = guest ? ({ speaker: "guest" } as const) : {};
		const userMessage: ChatMessage = { role: "user", text, ...mark };
		// Set once this turn's reply is delivered, so the wait's catch-all never adds a second one.
		let replied = false;
		// Every reply ends here: typed out by the circle, and handed to the voice.
		// The user's message sits at messages.length, so the reply is at messages.length + 1: the composer
		// is locked while Osmo waits, and a crisis message taken meanwhile makes this reply a quiet one.
		// A quiet reply is only shown and saved: it doesn't move the heart, start the typing or reach the
		// voice, where a typed reply would cut off the crisis reply being spoken. lineSaved: takeCrisis already saved
		// his line, ahead of the crisis pair, so only the reply is saved here.
		const deliver = (reply: string, how: { quiet: boolean; lineSaved?: boolean } = { quiet: false }) => {
			replied = true;
			const agentMessage: ChatMessage = { role: "agent", text: greetGuest(reply, guest && (options.greet ?? false), crisis), ...mark };
			if (!how.quiet) {
				// Cut off any reply still being spoken, then speak the new one (or show it at once).
				heart.rest();
				setSpeaking(reduceMotionRef.current ? null : { index: messages.length + 1, chars: 0 });
			}
			setMessages((current) => [...current, agentMessage]);
			void saveMessages(how.lineSaved ? [agentMessage] : [userMessage, agentMessage]);
			// Handed over once sendText has returned, so the voice always knows its message was taken
			// before the reply arrives, even when the reply is ready at once.
			if (!how.quiet) queueMicrotask(() => onReplyRef.current?.(agentMessage.text, via));
		};
		// A turn a crisis message quieted keeps its state step, but teaches nothing and starts nothing. It says
		// only what quietEffects allows: nothing after a model request, and a lookup's reply that asks nothing.
		const endQuietly = (plan: QuietPlan, result: Lookup | null) => {
			if (plan.reply === "noExplain" && result) deliver(formatDefinition(result, true), { quiet: true });
		};
		// A word question waits for the dictionary, inside the turn's one wait.
		const lookUp = async (term: string, wait: Waiting) => {
			wait.on = "lookup";
			const result = await lookupWord(term, {
				fetch: (url, init) => fetch(url, init),
				taught: taughtMeanings(view.memory),
				cacheGet: canSaveRef.current ? getCachedLookup : undefined,
				cachePut: canSaveRef.current && !guest ? putCachedLookup : undefined,
			}).catch((): Lookup => ({ kind: "missing", term }));
			if (wait.quiet) {
				endQuietly(quietEffects("lookup"), result);
				return;
			}
			if (result.kind === "missing" && !guest) setPendingLearning(result.term);
			deliver(formatDefinition(result, guest));
		};
		// One wait per turn: thinking and the waiting turn are set once when it starts waiting, and cleared once
		// when its reply is out (after a lookup, if there is one), on every path, so the room can't stay locked.
		const startWait = (on: Waiting["on"], controller: AbortController | null, work: (wait: Waiting) => Promise<void>) => {
			const wait: Waiting = { id: messages.length, on, controller, quiet: false, line: userMessage };
			waitingRef.current = wait;
			setThinking(true);
			void (async () => {
				try {
					await work(wait);
				} catch {
					// Anything unexpected still ends in one reply, so a spoken turn never leaves the voice waiting.
					if (!replied && !wait.quiet) deliver(ruleReply ?? "I am not sure I follow. Could you rephrase that?");
				} finally {
					if (waitingRef.current === wait) waitingRef.current = null;
					setThinking(false);
				}
			})();
		};

		// A bare yes or no, while an action waits for it, answers that action and nothing else (spec 4.3, 9.1): code
		// matches the words, the server completes or cancels it, and its line is the reply. Never a guest's, never
		// in a crisis. His heart doesn't step for it.
		const decision = decisionFor({ guest, crisis, waiting: confirmWaitingRef.current !== null, text });
		if (decision) {
			// The row his yes or no is for, read now: only a crisis changes the flag before it is posted, and then nothing is.
			const pendingId = confirmWaitingRef.current?.pendingId ?? null;
			if (via === "typed") setInput("");
			setMessages((current) => [...current, userMessage]);
			startWait("model", null, async (wait) => {
				// The same limit on reading the session as a model turn, so the composer never stays locked on it.
				const signedIn = await Promise.race([
					ensureSession().catch(() => null),
					new Promise<null>((resolve) => setTimeout(() => resolve(null), SESSION_TIMEOUT_MS)),
				]);
				// A crisis message taken while the session was read has already cut this turn short: nothing is posted. No
				// session means the decision never reached the server.
				const answer = signedIn && !wait.quiet ? await sendDecision(fetch, signedIn.access_token, decision, via, undefined, pendingId) : UNREACHED;
				// After a crisis taken while it was posted, the flag stays down and what the server did is still shown and saved,
				// quietly, so a deletion that ran stays on record. One no answer came back for never says nothing waits, and the
				// flag stays as it was (decisionEnd).
				const end = decisionEnd({ quiet: wait.quiet, was: confirmWaitingRef.current, answer });
				confirmWaitingRef.current = end.waiting;
				if (end.line !== null) deliver(end.line, { quiet: end.quiet, lineSaved: end.lineSaved });
			});
			return true;
		}
		// Any other turn of Gur's moves past the question, so a later bare yes is the conversation's again (a model answer
		// below may say one waits anew); a guest's turn leaves it waiting for him.
		confirmWaitingRef.current = waitingAfter(confirmWaitingRef.current, { on: guest ? "guest" : "turn" });

		if (writer === "model" && turn && prepared) {
			// A spoken message leaves a half-typed draft alone.
			if (via === "typed") setInput("");
			setMessages((current) => [...current, userMessage]);
			const controller = new AbortController();
			startWait("model", controller, async (wait) => {
				// Reading the session can refresh the token over the network, with no limit of its own. A slow one falls back
				// to his own words fast, so the composer never waits the session's limit and then the model's on top.
				const signedIn = await Promise.race([
					ensureSession().catch(() => null),
					new Promise<null>((resolve) => setTimeout(() => resolve(null), SESSION_TIMEOUT_MS)),
				]);
				const body = signedIn
					? chatBody({ text, messages, memory: view.memory, facts: prepared.facts, state: prepared.state, math: branch === "math" ? mathResult : null })
					: null;
				// A crisis message taken while the session was read has already cut this turn short: nothing is posted.
				const answer = signedIn && body && !wait.quiet ? await askForReply(fetch, signedIn.access_token, body, controller.signal) : null;
				if (answer) {
					setAiUsage((current) => nextUsage(current, answer));
					// Only a model answer that says an action waits makes the next bare yes or no go to /api/act.
					confirmWaitingRef.current = waitingAfter(confirmWaitingRef.current, { on: "model", answer });
					// A crisis flag, a 403 or "off": nothing more is posted this visit.
					if (answer.kind === "crisis" || (answer.kind === "fallback" && answer.stop)) aiStoppedRef.current = true;
					// A 403 or "off" means it's really off; a crisis only pauses it for this visit.
					if (answer.kind === "fallback" && answer.stop) aiEnabledRef.current = false;
				}
				if (wait.quiet) {
					// Aborted by a crisis message: processTurn's step of his state, no pendingTopic, no lookup, no reply.
					applyTurn(keptTurn<TurnResult>("code", prepared, turn), { crisis: true });
					endQuietly(quietEffects("model"), null);
					return;
				}
				// His state is applied only now that it's known whose reply is used.
				applyTurn(keptTurn<TurnResult>(answer?.kind === "model" ? "model" : "code", prepared, turn), { detection: detectionOf(answer), crisis: answer?.kind === "crisis" });
				if (answer?.kind === "model") {
					deliver(answer.reply);
				} else if (answer?.kind === "crisis") {
					// The model saw talk of self-harm that the code missed: the reply is code's.
					deliver(CRISIS_REPLY);
				} else {
					// Any other answer (a fallback, a failed request, no session): today's reply for the branch.
					const response = codeReply();
					if (branch === "lookup" && lookupTerm) await lookUp(lookupTerm, wait);
					else deliver(response);
				}
			});
			return true;
		}

		const response = codeReply();
		applyTurn(turn);
		// A spoken message leaves a half-typed draft alone.
		if (via === "typed") setInput("");
		setMessages((current) => [...current, userMessage]);
		if (branch === "lookup" && lookupTerm) {
			startWait("lookup", null, (wait) => lookUp(lookupTerm, wait));
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
		// Written only while a thing builds (at most 30 times a second: the controller coalesces); 1 once it has rendered.
		...(build.view?.phase === "building" ? { "--build-progress": build.view.progress.toFixed(3) } : build.view?.phase === "ready" && build.built ? { "--build-progress": "1" } : {}),
	} as CSSProperties;

	return (
		<div ref={stageRef} className={`${styles.stage} ${font.className}`} style={stageStyle}
			data-tone={theme.tone}
			data-speaking={speaking ? "" : undefined}
			data-panel={openPanel ?? undefined}
			data-shell={SHELL2 ? "" : undefined}
			data-world={WORLD ? "" : undefined}
			data-building={build.view?.phase === "building" ? "" : undefined}
			data-built={build.built ? "" : undefined}
			data-listening={voice.mode === "awake" || voice.mode === "followup" ? "" : undefined}
			data-chat={voiceOnly ? undefined : ""}
			data-fade={voice.fadeSaid ? "" : undefined}
		>
			{WORLD ? (
				ready && (
					<WorldStage
						agent={agent}
						colorA={theme.colorA}
						colorB={theme.colorB}
						said={said}
						heard={heard}
						controlRef={worldRef}
						signals={{
							lines: messages.length,
							inTalk: voice.mode === "awake" || voice.mode === "thinking" || voice.mode === "speaking" || voice.mode === "followup",
							speaking: speaking !== null,
							thinking,
						}}
					/>
				)
			) : (
				<div className={styles.aura} aria-hidden="true">
					<span className={`${styles.orb} ${styles.orbA}`} />
					<span className={`${styles.orb} ${styles.orbB}`} />
					<Figure className={styles.figure} said={said} heard={heard} />
				</div>
			)}

			{SHELL2 && <Rail items={shell.items} fill={70} onNavigate={shell.navigate} linkRef={shell.linkRef} />}

			<main className={styles.column}>
				<header className={styles.head}>
					{!SHELL2 && <span className={styles.heart} aria-hidden="true" />}
					<div>
						<h1 className={styles.name}>Osmo</h1>
						<p className={styles.mood} role="status">
							Feeling {feelingPhrase(agent.activations, baseline)}
						</p>
					</div>
					{!SHELL2 && <PanelLinks panel={panels.panel} toggle={panels.toggle} linkRef={panels.linkRef} />}
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

				<ThingPanel build={build} aura={{ a: theme.colorA, b: theme.colorB, bg: theme.base, ink: "#f3efe8" }} hidden={openPanel !== null} />

				<form onSubmit={sendMessage} className={styles.composer}>
					<input
						className={styles.field}
						value={voice.liveText ?? input}
						onFocus={() => worldRef.current?.attend()}
						onChange={(event) => {
							setInput(event.target.value);
							worldRef.current?.attend();
						}}
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

			{SHELL2 && (
				<ShellPanels
					shell={shell}
					memory={memory}
					onMemoryChange={setMemory}
					agent={agent}
					voice={voice}
					aiUsage={aiUsage}
					onOpenThing={(id, title, source) => { build.show(id, title, source); shell.close(); }}
				/>
			)}
			{!SHELL2 && panels.panel && (
				<Panel id={panels.panel} onClose={panels.close}>
					{panels.panel === "memory" && <MemoryPanel memory={memory} onChange={setMemory} />}
					{panels.panel === "insights" && <InsightsPanel agent={agent} onOpenThing={(id, title, source) => { build.show(id, title, source); panels.close(); }} onThingDeleted={(id) => { if (build.view?.phase === "ready" && build.view.id === id) build.close(); }} />}
					{panels.panel === "settings" && <SettingsPanel voice={voice} aiUsage={aiUsage} />}
				</Panel>
			)}
		</div>
	);
}
