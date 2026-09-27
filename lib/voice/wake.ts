// When a run of detector scores counts as hearing "Osmo". Strict to start with: raise `threshold` if he still wakes too often.

export const WAKE = {
	// A frame this sure or more counts.
	threshold: 0.7,
	// This many counting frames in a row wake him (2 × 80 ms).
	frames: 2,
	// No second wake-up within this long.
	cooldownMs: 2000,
	// After waking, he goes back to sleep if no speech starts within this long.
	noSpeechMs: 4000,
} as const;

export class WakeGate {
	private run = 0;
	private lastWake = Number.NEGATIVE_INFINITY;

	feed(score: number, now: number): boolean {
		this.run = score >= WAKE.threshold ? this.run + 1 : 0;
		if (this.run >= WAKE.frames && now - this.lastWake >= WAKE.cooldownMs) {
			this.lastWake = now;
			this.run = 0;
			return true;
		}
		return false;
	}

	reset(): void {
		this.run = 0;
	}
}
