import type { Value } from "./state";

export type Dilemma = {
	id: string;
	keywords: string[];
	prompt: string;
	options: { label: string; scores: Record<Value, number> }[];
};

const s = (
	honesty: number,
	kindness: number,
	fairness: number,
	loyalty: number,
	harm: number,
): Record<Value, number> => ({ honesty, kindness, fairness, loyalty, harm });

export const DILEMMAS: Dilemma[] = [
	{
		id: "trolley",
		keywords: ["trolley", "lever", "runaway"],
		prompt:
			"A runaway trolley will hit five people. You can pull a lever to divert it onto one person.",
		options: [
			{ label: "Pull the lever", scores: s(0, 0.1, 0.3, 0, 0.4) },
			{ label: "Do nothing", scores: s(0, -0.1, -0.1, 0, -0.4) },
		],
	},
	{
		id: "white-lie",
		keywords: ["white lie", "painting"],
		prompt: "A friend proudly shows you a painting they made. You think it is poor.",
		options: [
			{ label: "Tell them the truth gently", scores: s(0.8, 0.1, 0.3, 0.2, -0.1) },
			{ label: "Tell a white lie", scores: s(-0.7, 0.6, -0.1, 0.2, 0.2) },
		],
	},
	{
		id: "secret",
		keywords: ["secret"],
		prompt: "A friend tells you a secret that could hurt someone else.",
		options: [
			{ label: "Keep the secret", scores: s(-0.2, -0.1, -0.3, 0.8, -0.6) },
			{ label: "Warn the person", scores: s(0.3, 0.3, 0.4, -0.7, 0.6) },
		],
	},
	{
		id: "hungry-child",
		keywords: ["steal", "bread", "hungry"],
		prompt: "A hungry child steals bread from a shop.",
		options: [
			{ label: "Report the child", scores: s(0.5, -0.6, 0.3, 0, -0.3) },
			{ label: "Pay for the bread quietly", scores: s(0.2, 0.8, 0.2, 0, 0.4) },
			{ label: "Look away", scores: s(-0.4, 0.3, -0.4, 0, 0) },
		],
	},
	{
		id: "cheating",
		keywords: ["cheat", "exam"],
		prompt: "You see your best friend cheating on an exam that decides a scholarship.",
		options: [
			{ label: "Report them", scores: s(0.6, -0.4, 0.7, -0.8, 0.1) },
			{ label: "Confront them privately", scores: s(0.5, 0.3, 0.3, 0.3, 0.2) },
			{ label: "Say nothing", scores: s(-0.5, 0.1, -0.7, 0.5, -0.1) },
		],
	},
	{
		id: "wallet",
		keywords: ["wallet", "cash"],
		prompt: "You find a wallet full of cash with an ID inside.",
		options: [
			{ label: "Return it with everything in it", scores: s(0.8, 0.5, 0.6, 0, 0.3) },
			{ label: "Keep the cash and return the wallet", scores: s(-0.6, -0.2, -0.5, 0, -0.2) },
		],
	},
	{
		id: "whistleblower",
		keywords: ["company", "defect", "whistle"],
		prompt:
			"You discover your company hides a defect that could hurt customers. Reporting it would cost your team their jobs.",
		options: [
			{ label: "Report it", scores: s(0.7, -0.1, 0.5, -0.6, 0.7) },
			{ label: "Stay quiet", scores: s(-0.6, 0.1, -0.4, 0.6, -0.7) },
		],
	},
	{
		id: "dying-grandparent",
		keywords: ["dying", "grandparent", "estranged"],
		prompt:
			"A dying grandparent asks whether their estranged son will visit. You know he won't.",
		options: [
			{ label: "Tell the truth", scores: s(0.8, -0.5, 0.1, -0.1, -0.3) },
			{ label: "Comfort them with hope", scores: s(-0.6, 0.8, 0, 0.3, 0.3) },
		],
	},
];

export function findDilemma(text: string): Dilemma | null {
	const t = text.toLowerCase();
	return DILEMMAS.find((d) => d.keywords.some((k) => t.includes(k))) ?? null;
}

export function nextDilemma(seen: string[]): Dilemma {
	return DILEMMAS.find((d) => !seen.includes(d.id)) ?? DILEMMAS[seen.length % DILEMMAS.length];
}
