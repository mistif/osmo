import { closeness, mentioned, recordTurn, stageOf, type MilestoneId, type Stage } from "./bond/bond";
import { closenessReply, isAskCloseness, isAskMet, metReply, milestoneLine } from "./bond/lines";
import { applyFeedback, decide, explain, parseVerdict, type Decision } from "./brain";
import { applyCues, applyGap, bondBaseline, missYou } from "./cues";
import { CRISIS_CAUSE } from "./crisis-cause";
import { detectFromText, NEGATIVE_TONES, type GurRead } from "./detection";
import { DILEMMAS, findDilemma, nextDilemma } from "./dilemmas";
import {
	applyEvent,
	argueOutlook,
	classifyUserEvents,
	describeEvent,
	detectArgument,
	kindFor,
	leaning,
	pickEvent,
	type StoryEvent,
} from "./events";
import { dominantEmotions, moodLabel, stepHeart } from "./heart";
import { withBaseFeelings } from "./lexicon/feelings";
import { moodTheme, type MoodTheme } from "./mood-theme";
import { CHARACTER, isAskNewOsmo, NEW_OSMO_REPLY, type Character } from "./character";
import { flavorTurn, heavyTurn, milestoneDue } from "./personality/flavor";
import type { AgentState } from "./state";
import { CRISIS_REPLY, isCrisis } from "./safety";
import { vary } from "./lexicon/variety";
import { causeFor, moodWords, relaxMood } from "./slow-mood";
import { causeOf, combineReplies, feelingWords, normalize, respond, understand } from "./talk";
import { GUEST_DILEMMA, GUEST_PRIVATE } from "../voice/guest";

type Pending = { logId: string; dilemmaId: string; decision: Decision };
export type Session = {
	pending: Pending | null;
	last: Pending | null;
	dilemmasSeen: string[];
	// Why it feels the way it does, as a clause that follows "because".
	cause: string | null;
	turns: number;
	// Gur's last message read, if under 30 minutes old.
	gur: { read: GurRead; at: number } | null;
	// The `turns` value of the last reply that mentioned his own mood (spec 7), so he does it once every 8 replies at most.
	lastOwnMention: number | null;
};

export type Effect =
	| { type: "event"; event: StoryEvent }
	| { type: "dilemma"; logId: string; dilemmaId: string; option: string }
	| { type: "verdict"; logId: string; agreed: boolean };

export type TurnContext = {
	now: number;
	lastAt: number | null;
	uuid: () => string;
	userName?: string | null;
	// Words the user taught it, e.g. { fam: "friend" }.
	slang?: Record<string, string>;
	// Words from the last few messages, so a typo can be read in context ("piza" after talking about pizza).
	recent?: string[];
	// The user's own words and how often they've used them, so they are never taken for typos.
	vocabulary?: Record<string, number>;
	// A voice that isn't Gur's: nothing of his is shared and the bond is left alone. The room discards the result's state
	// and session; prepareTurn hands back the ones it was given.
	guest?: boolean;
};
export type TurnResult = {
	state: AgentState;
	session: Session;
	reply: string | null;
	effects: Effect[];
};

export const newSession = (): Session => ({
	pending: null,
	last: null,
	dilemmasSeen: [],
	cause: null,
	turns: 0,
	gur: null,
	lastOwnMention: null,
});

const STORY_TRIGGER = /\b(tell me a story|give me an experience|feed me an event|experience something)\b/i;
const DILEMMA_TRIGGER =
	/^\s*(?:give me|another|one more|hit me with)\s+(?:a\s+|another\s+)?(?:new\s+)?(?:moral\s+)?dilemma\b|^\s*dilemma\W*$/i;
const WHAT_WOULD_YOU_DO = /^\s*what would you do if\b/i;

// Demo switch: every message counts as a new day, so the bond's stages show within about 30 messages.
const DEMO = process.env.NEXT_PUBLIC_OSMO_DEMO === "1";

function acknowledge(event: StoryEvent): string {
	return event.valence === "happy"
		? "That is wonderful news. I am genuinely glad for you."
		: "I am so sorry. That is a heavy thing to carry, and I am here.";
}

// A guest's news is acknowledged, but Osmo doesn't promise to remember it.
function acknowledgeGuest(event: StoryEvent): string {
	return event.valence === "happy" ? "That is wonderful news. I am glad for you." : "I am so sorry. That is a heavy thing to carry.";
}

// Where a turn stands when only everyday conversation (step 6) is left to answer it.
type OpenTurn = {
	s: AgentState;
	sess: Session;
	p: Character;
	awayMs: number;
	guest: boolean;
	trimmed: string;
	// What the message says, read once (with the spell context) and shared by everything that follows.
	parts: ReturnType<typeof understand>;
	// Messages before this one in the session.
	turn: number;
	effects: Effect[];
};

// Everything before everyday conversation, all decided by code: the heart step, the crisis check, the bond, verdicts,
// how close you are, when you met (steps 0-1), then life events, arguments, stories and
// dilemmas (steps 2-5). Returns the finished turn when one of those answers.
function startTurn(state: AgentState, session: Session, text: string, ctx: TurnContext): { decided: TurnResult } | { open: OpenTurn } {
	const trimmed = text.trim();
	const effects: Effect[] = [];
	const p = CHARACTER;

	// Heart: gap and cues first, then one coupling/decay step.
	const close = closeness(state.bond);
	const awayMs = ctx.lastAt !== null ? ctx.now - ctx.lastAt : 0;
	let activations = state.activations;
	if (ctx.lastAt !== null) activations = missYou(applyGap(activations, awayMs), awayMs, close);
	activations = applyCues(activations, withBaseFeelings(trimmed), p.reactivity);
	let s: AgentState = { ...state, activations: stepHeart(activations, state.coupling, bondBaseline(p.baseline, close)) };
	// Any message that is not a verdict clears the pending question.
	const sess: Session = { ...session, pending: null, turns: session.turns + 1 };

	// 0. Talk of suicide or self-harm always comes first, whatever else is going on.
	if (isCrisis(trimmed)) {
		return {
			decided: {
				state: s,
				session: { ...sess, last: null, cause: CRISIS_CAUSE },
				reply: CRISIS_REPLY,
				effects,
			},
		};
	}

	// Bond: every non-crisis message from Gur counts. Sharing a feeling, a life event, or a name deepens it.
	// A guest's never does.
	const guest = ctx.guest === true;
	const hypothetical = WHAT_WOULD_YOU_DO.test(trimmed);
	const told = hypothetical ? [] : classifyUserEvents(trimmed);
	// A message can say several things ("im good and i made you"), so it is read once, into parts, with the spell context
	// (what was said lately, his own words, his name for a non-guest), and every later step reuses them.
	const parts = understand(trimmed, ctx.slang, {
		recent: ctx.recent,
		protect: ctx.userName && !guest ? new Set([ctx.userName.toLowerCase()]) : undefined,
		personal: ctx.vocabulary ? new Map(Object.entries(ctx.vocabulary)) : undefined,
	});
	const feeling = parts.some((part) => part.intent.type === "userFeeling");
	if (!guest) {
		s = {
			...s,
			bond: recordTurn(s.bond, { now: ctx.now, feeling, event: told.length > 0, nameKnown: !!ctx.userName, demo: DEMO }),
		};
	}

	// 1. Verdict on a decision. Bare yes/no only counts while a question is pending.
	const verdict = parseVerdict(trimmed);
	// Only Gur answers his own dilemmas.
	const target = guest ? null : (session.pending ?? (verdict?.explicit ? session.last : null));
	const targetDilemma = target ? DILEMMAS.find((d) => d.id === target.dilemmaId) : undefined;
	if (verdict && target && targetDilemma) {
		s = { ...s, weights: applyFeedback(s.weights, targetDilemma, target.decision, verdict.agreed) };
		effects.push({ type: "verdict", logId: target.logId, agreed: verdict.agreed });
		return {
			decided: {
				state: s,
				session: { ...sess, last: null },
				reply: verdict.agreed
					? "Understood. I will trust that reasoning a little more."
					: "Understood. I will give the other side more weight next time.",
				effects,
			},
		};
	}

	// The old "roll a new osmo" commands: one line for everybody, no state, no confirm step.
	if (isAskNewOsmo(trimmed)) return { decided: { state: s, session: sess, reply: NEW_OSMO_REPLY, effects } };
	// The bond is private to Gur.
	if (guest && (isAskCloseness(trimmed) || isAskMet(trimmed))) {
		return { decided: { state: s, session: sess, reply: GUEST_PRIVATE, effects } };
	}
	if (isAskCloseness(trimmed)) {
		return { decided: { state: s, session: sess, reply: closenessReply(s.bond), effects } };
	}
	if (isAskMet(trimmed)) {
		return { decided: { state: s, session: sess, reply: metReply(s.bond, ctx.now), effects } };
	}

	// 2. Life events the user tells it about.
	// A hypothetical ("what would you do if someone died") is not a real event.
	if (told.length > 0) {
		if (guest) return { decided: { state: s, session: sess, reply: told.map(acknowledgeGuest).join(" "), effects } };
		for (const event of told) {
			s = applyEvent(s, event, p.reactivity);
			effects.push({ type: "event", event });
		}
		let reply = told.map(acknowledge).join(" ");
		// The first-event thanks only fits this turn. After sad news the acknowledgement already
		// promises to remember, so it is cleared without being said.
		if (s.bond.toMention.includes("firstEvent")) {
			if (told.every((event) => event.valence === "happy")) reply += ` ${milestoneLine("firstEvent")}`;
			s = { ...s, bond: mentioned(s.bond, "firstEvent") };
		}
		return {
			decided: {
				state: s,
				session: { ...sess, cause: "of what you shared with me" },
				reply,
				effects,
			},
		};
	}

	// 3. Attempts to argue its outlook one way or the other.
	const direction = detectArgument(trimmed);
	if (direction !== 0) {
		s = argueOutlook(s, direction);
		return {
			decided: {
				state: s,
				session: sess,
				reply: "I hear you. I will weigh that against what I have been through, but I make up my own mind.",
				effects,
			},
		};
	}

	// 4. Feed it an experience from the library, alternating happy and tragic.
	if (STORY_TRIGGER.test(trimmed)) {
		const event = pickEvent(s.history);
		s = applyEvent(s, event, p.reactivity);
		effects.push({ type: "event", event });
		let reply = `${describeEvent(event)} I feel ${moodLabel(s.activations, p.baseline)}.`;
		const [prev, last] = s.history.slice(-2);
		if (prev && last && prev.valence !== last.valence) {
			const happy = prev.valence === "happy" ? prev : last;
			const tragic = prev.valence === "happy" ? last : prev;
			reply += ` ${leaning(s.outlook, kindFor(happy), kindFor(tragic))}`;
		}
		return {
			decided: {
				state: s,
				session: { ...sess, cause: `the story about ${event.kind} stayed with me` },
				reply,
				effects,
			},
		};
	}

	// 5. Moral dilemmas.
	const asked = WHAT_WOULD_YOU_DO.test(trimmed);
	if (asked || DILEMMA_TRIGGER.test(trimmed)) {
		if (guest) return { decided: { state: s, session: sess, reply: GUEST_DILEMMA, effects } };
		const found = asked ? findDilemma(trimmed) : null;
		if (asked && !found) {
			return {
				decided: {
					state: s,
					session: sess,
					reply: 'I don\'t have a scenario like that yet. Say "give me a dilemma" and I\'ll take one of mine.',
					effects,
				},
			};
		}
		const dilemma = found ?? nextDilemma(sess.dilemmasSeen);
		const decision = decide(dilemma, s, p.baseline);
		const logId = ctx.uuid();
		effects.push({
			type: "dilemma",
			logId,
			dilemmaId: dilemma.id,
			option: dilemma.options[decision.chosen].label,
		});
		const pending: Pending = { logId, dilemmaId: dilemma.id, decision };
		return {
			decided: {
				state: s,
				session: { ...sess, pending, last: pending, dilemmasSeen: [...sess.dilemmasSeen, dilemma.id] },
				reply: `${dilemma.prompt} ${explain(dilemma, decision)} Do you agree?`,
				effects,
			},
		};
	}

	return { open: { s, sess, p, awayMs, guest, trimmed, parts, turn: session.turns, effects } };
}

// 6. Everyday conversation: greetings, feelings, small talk, answered by code. A message can say several things, so
// each part is answered.
function answerOpen(open: OpenTurn, ctx: TurnContext): TurnResult {
	const { s, sess, p, awayMs, guest, trimmed, parts, turn } = open;
	// Its own copy, so this answer never shares an array with another result made from the same open turn.
	const effects = [...open.effects];
	// A guest hears how he feels, but never why (that's Gur's history), never Gur's name, and never a welcome back.
	const spoken = parts
		.map((parsed) =>
			respond(parsed, {
				state: s,
				cause: guest ? null : sess.cause,
				turn: guest ? 0 : turn,
				userName: guest ? null : ctx.userName,
				baseline: p.baseline,
				mood: guest ? "" : moodWords(relaxMood(s.mood, ctx.now)),
			}),
		)
		.filter((r): r is string => r !== null);
	if (spoken.length > 0) {
		const cause = parts.map((x) => causeOf(x.intent)).find((c) => c !== null) ?? null;
		const sensitive = parts.some(({ intent }) =>
			intent.type === "insult" ||
			intent.type === "rudeFeedback" ||
			intent.type === "sexual" ||
			intent.type === "slashCommand" ||
			intent.type === "askFeeling" ||
			intent.type === "askWhyFeeling" ||
			((intent.type === "userFeeling" || intent.type === "feelingFromOsmo") && !intent.positive),
		);
		// Vary his own words, but never a word the user just used.
		const flavored = flavorTurn(vary(combineReplies(spoken), turn, new Set(normalize(trimmed).split(" "))), {
			intent: parts[0].intent.type,
			personality: p,
			turn,
			tone: moodTheme(s.activations, p.baseline).tone,
			sensitive,
			// A guest is a stranger: no milestones, shared memories or welcome-backs.
			bond: guest ? undefined : s.bond,
			userName: guest ? null : (ctx.userName ?? null),
			awayMs: guest ? 0 : awayMs,
		});
		const said = flavored.mentioned ? mentioned(s.bond, flavored.mentioned) : s.bond;
		// A first feeling not thanked for this turn (a sad one, say) is not brought up later.
		const bond = mentioned(said, "firstFeeling");
		return {
			state: guest ? s : { ...s, bond },
			session: cause ? { ...sess, cause } : sess,
			reply: flavored.text,
			effects,
		};
	}

	return { state: s, session: sess, reply: null, effects };
}

// A guest's turn records nothing: no events, dilemmas or verdicts.
const forWho = (result: TurnResult, ctx: TurnContext): TurnResult => (ctx.guest ? { ...result, effects: [] } : result);

export function processTurn(state: AgentState, session: Session, text: string, ctx: TurnContext): TurnResult {
	const start = startTurn(state, session, text, ctx);
	return forWho("decided" in start ? start.decided : answerOpen(start.open, ctx), ctx);
}

// What a prompt may know about him this turn. For a guest, only how he feels: never why, never the bond, never Gur's name.
// The cause a crisis leaves behind. prepareTurn never hands it to a model; the route can check for it too.
export { CRISIS_CAUSE } from "./crisis-cause";

export const GUR_FRESH_MS = 30 * 60 * 1000;

export type TurnFacts = {
	// How he feels, in words ("calm", "a little lonely").
	feeling: string;
	tone: MoodTheme["tone"];
	// Why he feels that way, as a clause that follows "because".
	cause: string | null;
	stage: Stage;
	// A milestone he hasn't mentioned yet.
	milestone: MilestoneId | null;
	// A heavy mood or a sensitive message: the same rule that stops flavorTurn adding extras.
	heavy: boolean;
	// Time since the previous message.
	awayMs: number;
	userName: string | null;
	// Messages before this one in the session.
	turn: number;
	// Gur's last message, if under 30 minutes old.
	gur?: GurRead | null;
	// His top feeling in words, only when he may mention it this turn (spec 7). Absent means null: prepareTurn leaves it out
	// when there is none, and it is optional like `gur` so a stale tab's facts still type-check.
	own?: string | null;
	// How the last day has felt, in words ("a little low"); absent means "" (at rest, and for a guest).
	mood?: string;
};
export type PreparedTurn = TurnResult & {
	facts: TurnFacts;
	// Exactly what processTurn returns for the same inputs, from this same pass over the turn: the rule-based answer, for
	// a room that shows it when no model answers. The heart, bond, crisis and verdict steps ran once, not twice.
	processed: TurnResult;
};

// Same rule as step 6: these turns get no extras (and a guest's words never fill Gur's).
function sensitiveTurn(parts: ReturnType<typeof understand>): boolean {
	return parts.some(({ intent }) =>
		intent.type === "insult" ||
		intent.type === "rudeFeedback" ||
		intent.type === "sexual" ||
		intent.type === "slashCommand" ||
		intent.type === "askFeeling" ||
		intent.type === "askWhyFeeling" ||
		((intent.type === "userFeeling" || intent.type === "feelingFromOsmo") && !intent.positive),
	);
}

// An open turn left the way step 6 leaves it once it has answered: the new cause, the milestone that's due marked as
// said (the model is asked to say it), and a first feeling not thanked for this turn not brought up later.
function leaveForModel(open: OpenTurn): { result: TurnResult; milestone: MilestoneId | null; heavy: boolean } {
	const { s, sess, p, awayMs, parts } = open;
	const effects = [...open.effects];
	const cause = parts.map((x) => causeOf(x.intent)).find((c) => c !== null) ?? null;
	const tone = moodTheme(s.activations, p.baseline).tone;
	const sensitive = sensitiveTurn(parts);
	const milestone = milestoneDue({
		intent: parts[0]?.intent.type ?? "",
		tone,
		sensitive,
		bond: s.bond,
		awayMs,
	});
	const said = milestone ? mentioned(s.bond, milestone) : s.bond;
	return {
		result: { state: { ...s, bond: mentioned(said, "firstFeeling") }, session: cause ? { ...sess, cause } : sess, reply: null, effects },
		milestone,
		heavy: heavyTurn(tone, sensitive),
	};
}

// For a route where a language model writes the everyday conversation (step 6). Everything code decides runs first,
// with the guest gates. When code answers (a crisis, a verdict, the bond, a life event, a story, a dilemma),
// `reply` is set and the result is processTurn's. Otherwise `reply` is null, the state and session are already what
// step 6 would leave, and the model answers from `facts` (saying `facts.milestone`'s line if there is one).
// A guest's turn changes nothing of his: the state and session come back exactly as passed in, and effects are empty,
// so saving the result is always safe.
export function prepareTurn(state: AgentState, session: Session, text: string, ctx: TurnContext): PreparedTurn {
	const guest = ctx.guest === true;
	const start = startTurn(state, session, text, ctx);
	const processed = forWho("decided" in start ? start.decided : answerOpen(start.open, ctx), ctx);
	const open = !("decided" in start) && !guest ? leaveForModel(start.open) : null;
	const result: TurnResult =
		"decided" in start
			? start.decided
			: (open?.result ?? { state: start.open.s, session: start.open.sess, reply: null, effects: [] });
	const baseline = CHARACTER.baseline;
	const tone = moodTheme(result.state.activations, baseline).tone;
	const age = ctx.now - (result.session.gur?.at ?? Number.NEGATIVE_INFINITY);
	const gur = !guest && result.session.gur !== null && age >= 0 && age < GUR_FRESH_MS ? result.session.gur.read : null;
	const upset = gur !== null && gur.intensity === 3 && gur.tones.some((t) => NEGATIVE_TONES.includes(t));
	const heavy = (open ? open.heavy : heavyTurn(tone, false)) || upset;
	// His own mood (spec 7): only on an open, model-written turn, and only when it is clearly there, not mentioned lately,
	// and Gur is not himself down right now.
	const relaxed = guest ? null : relaxMood(result.state.mood, ctx.now);
	const top = dominantEmotions(result.state.activations, 1, baseline)[0];
	const read = detectFromText(text) ?? gur;
	const gurDown = read !== null && read.intensity >= 2 && read.tones.some((t) => NEGATIVE_TONES.includes(t));
	const last = result.session.lastOwnMention;
	const due = last === null || result.session.turns - last >= 8;
	const own = open && top && !heavy && due && !gurDown && result.state.activations[top] - baseline[top] >= 0.15 ? feelingWords(top) : null;
	const words = relaxed ? moodWords(relaxed) : "";
	const facts: TurnFacts = {
		feeling: moodLabel(result.state.activations, baseline),
		tone,
		// What a crisis left behind stays between him and Gur.
		cause: guest || result.session.cause === CRISIS_CAUSE ? null : ((top ? causeFor(result.state.mood, top, ctx.now) : null) ?? result.session.cause),
		stage: guest ? "stranger" : stageOf(result.state.bond),
		milestone: open?.milestone ?? null,
		heavy,
		awayMs: guest || ctx.lastAt === null ? 0 : ctx.now - ctx.lastAt,
		userName: guest ? null : (ctx.userName ?? null),
		turn: guest ? 0 : session.turns,
		gur,
		// Left out when there is nothing to say, so a facts object reads the same as before these fields to code that does not know them yet.
		...(own !== null ? { own } : {}),
		...(words !== "" ? { mood: words } : {}),
	};
	if (guest) return { state, session, reply: result.reply, effects: [], facts, processed };
	return { ...result, session: own ? { ...result.session, lastOwnMention: result.session.turns } : result.session, facts, processed };
}
