import { dominantEmotions, moodPosition } from "./heart";
import { BASELINE, type Activations, type Emotion } from "./state";

// [hue, saturation %, lightness %]. Each emotion gets a color a person would guess.
type Hsl = [number, number, number];
const CALM: Hsl = [172, 38, 50];
const HUES: Record<Emotion, Hsl> = {
	joy: [42, 95, 58],
	sadness: [220, 45, 46],
	anger: [5, 80, 54],
	fear: [268, 60, 60],
	trust: [175, 45, 48],
	disgust: [92, 40, 44],
	surprise: [55, 95, 58],
	love: [335, 70, 62],
	hope: [22, 85, 64],
	guilt: [300, 25, 50],
	loneliness: [235, 40, 45],
	boredom: [60, 8, 48],
};

export type MoodTheme = {
	// The strongest emotion, or "calm" when nothing stands out. Drives the chat's shape and motion.
	tone: Emotion | "calm";
	colorA: string;
	colorB: string;
	// The page background: dark, tinted toward the mood, lighter when it feels good.
	base: string;
	// Seconds per heartbeat: slow when calm, fast when the mood is aroused.
	pulseSeconds: number;
	// 0.35..1: how strongly the room glows.
	strength: number;
	valence: number;
	arousal: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const hsl = ([h, s, l]: Hsl, lift = 0) => `hsl(${Math.round(h)} ${s}% ${Math.round(clamp(l + lift, 25, 78))}%)`;

export function moodTheme(a: Activations, baseline: Activations = BASELINE): MoodTheme {
	const [first, second] = dominantEmotions(a, 2, baseline);
	const [valence, arousal] = moodPosition(a);
	const lift = valence * 6;

	const main = first ? HUES[first] : CALM;
	// With only one strong feeling, the second color is a neighbouring hue so the aura still has depth.
	const other: Hsl = second ? HUES[second] : [(main[0] + 40) % 360, main[1], main[2]];
	const excess = first ? a[first] - baseline[first] : 0;

	return {
		tone: first ?? "calm",
		colorA: hsl(main, lift),
		colorB: hsl(other, lift),
		base: `hsl(${Math.round(main[0])} 30% ${Math.round(7 + (valence + 1) * 4)}%)`,
		pulseSeconds: clamp(6 - ((arousal + 1) / 2) * 4.8, 1.2, 6),
		strength: clamp(0.35 + excess * 1.2, 0.35, 1),
		valence,
		arousal,
	};
}
