// Small deterministic random numbers, so a given Osmo always behaves the same way.

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function hashString(s: string): number {
	let h = 2166136261;
	for (const c of s) {
		h ^= c.charCodeAt(0);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

// A stable number in [0,1) for (seed, turn, salt): the same inputs always give the same roll.
export function roll(seed: number, turn: number, salt: string): number {
	return mulberry32((seed ^ Math.imul(turn + 1, 2654435761) ^ hashString(salt)) >>> 0)();
}
