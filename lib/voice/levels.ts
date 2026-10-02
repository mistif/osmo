// How much of a recording is speech, from its loudness in 20 ms steps. Samples are 16 kHz on the -1..1 scale.

const RATE = 16000;
const STEP = 320; // 20 ms
// Below this, a step is silence whatever else is going on.
const QUIET_RMS = 0.01;
// 100 ms of quiet kept on each side when trimming.
const PAD_STEPS = 5;

const MIN_READING_SECONDS = 2;
const READING_END_SILENCE_MS = 1200;
const READING_MAX_MS = 10_000;

function stepLevels(samples: Float32Array): number[] {
	const levels: number[] = [];
	for (let at = 0; at + STEP <= samples.length; at += STEP) {
		let sum = 0;
		for (let i = at; i < at + STEP; i++) sum += samples[i] * samples[i];
		levels.push(Math.sqrt(sum / STEP));
	}
	return levels;
}

// Loud enough to count as speech: well above silence, and within 20 dB of the loudest step.
function speechFloor(levels: number[]): number {
	return Math.max(QUIET_RMS * 1.5, levels.reduce((max, l) => Math.max(max, l), 0) * 0.1);
}

export function speechSeconds(samples: Float32Array): number {
	const levels = stepLevels(samples);
	const floor = speechFloor(levels);
	return (levels.filter((l) => l >= floor).length * STEP) / RATE;
}

export type ReadingProblem = "quiet" | "short" | null;

export function readingProblem(samples: Float32Array): ReadingProblem {
	const peak = stepLevels(samples).reduce((max, l) => Math.max(max, l), 0);
	if (peak < QUIET_RMS * 2) return "quiet";
	return speechSeconds(samples) < MIN_READING_SECONDS ? "short" : null;
}

export function trailingSilenceMs(samples: Float32Array): number {
	const levels = stepLevels(samples);
	const floor = speechFloor(levels);
	let quiet = 0;
	for (let i = levels.length - 1; i >= 0 && levels[i] < floor; i--) quiet++;
	return (quiet * STEP * 1000) / RATE;
}

// A reading ends after some speech followed by 1.2 s of quiet, or at the time limit.
export function readingDone(samples: Float32Array): boolean {
	if ((samples.length * 1000) / RATE >= READING_MAX_MS) return true;
	return speechSeconds(samples) >= 0.5 && trailingSilenceMs(samples) >= READING_END_SILENCE_MS;
}

// The recording from its first to its last step of speech, with 100 ms kept on each side.
export function trimSilence(samples: Float32Array): Float32Array {
	const levels = stepLevels(samples);
	const floor = speechFloor(levels);
	const first = levels.findIndex((l) => l >= floor);
	if (first === -1) return new Float32Array(0);
	let last = levels.length - 1;
	while (levels[last] < floor) last--;
	return samples.slice(Math.max(0, (first - PAD_STEPS) * STEP), Math.min(samples.length, (last + 1 + PAD_STEPS) * STEP));
}
