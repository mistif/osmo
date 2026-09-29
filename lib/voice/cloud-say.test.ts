import { describe, expect, it, vi } from "vitest";
import { createCloudSay, type Clip, type CloudSayDeps, FIRST_SOUND_GUARD_MS } from "./cloud-say";
import type { SayHooks, Spoken } from "./engine";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type FakeClip = Clip & { finish(): void; at(seconds: number): void; stopped: boolean };

function harness(options: { failAt?: number; playFailsAt?: number } = {}) {
	const asked: string[] = [];
	const clips: FakeClip[] = [];
	const words: [number, number][] = [];
	const timers: { run: () => void; ms: number; live: boolean }[] = [];
	let frame: (() => void) | null = null;
	let ends = 0;
	let fellBack: string | null = null;
	const fallbackSpoken: Spoken = { cancel: vi.fn() };

	const makeClip = (): FakeClip => {
		let settle: () => void = () => {};
		const ended = new Promise<void>((resolve) => {
			settle = resolve;
		});
		let time = 0;
		const clip: FakeClip = {
			duration: () => 10,
			currentTime: () => time,
			stop: () => {
				clip.stopped = true;
				settle();
			},
			ended,
			stopped: false,
			finish: () => settle(),
			at: (seconds) => {
				time = seconds;
			},
		};
		return clip;
	};

	const deps: CloudSayDeps = {
		clip: async (text) => {
			asked.push(text);
			if (options.failAt === asked.length - 1) throw new Error("no audio");
			return new Blob(["audio"]);
		},
		play: async () => {
			if (options.playFailsAt === clips.length) throw new Error("blocked");
			const clip = makeClip();
			clips.push(clip);
			return clip;
		},
		later: (run, ms) => {
			const timer = { run, ms, live: true };
			timers.push(timer);
			return () => {
				timer.live = false;
			};
		},
		frames: (run) => {
			frame = run;
			return () => {
				frame = null;
			};
		},
		tone: () => "composed",
		fallback: (text) => {
			fellBack = text;
			return fallbackSpoken;
		},
	};

	const hooks: SayHooks = {
		onWord: (start, end) => words.push([start, end]),
		onEnd: () => {
			ends += 1;
		},
	};

	return {
		say: createCloudSay(deps),
		hooks,
		asked,
		clips,
		words,
		fallbackSpoken,
		get ends() {
			return ends;
		},
		get fellBack() {
			return fellBack;
		},
		tick: () => frame?.(),
		hasFrame: () => frame !== null,
		fire: (ms: number) => {
			for (const timer of timers.filter((t) => t.live && t.ms === ms)) {
				timer.live = false;
				timer.run();
			}
		},
		waiting: (ms: number) => timers.some((t) => t.live && t.ms === ms),
	};
}

const REPLY = "I'm doing well, thank you. How are you?";

describe("createCloudSay", () => {
	it("asks for each sentence and plays them in order", async () => {
		const h = harness();
		h.say(REPLY, h.hooks);
		await flush();
		expect(h.asked).toEqual(["I'm doing well, thank you.", "How are you?"]);
		expect(h.clips).toHaveLength(1);

		h.clips[0].finish();
		await flush();
		// A breath between the sentences, then the second one plays.
		expect(h.waiting(300)).toBe(true);
		h.fire(300);
		await flush();
		expect(h.clips).toHaveLength(2);
	});

	it("fetches the next sentence before the current one has finished", async () => {
		const h = harness();
		h.say(REPLY, h.hooks);
		await flush();
		// Still on the first clip, yet the second sentence is already asked for.
		expect(h.clips).toHaveLength(1);
		expect(h.asked).toHaveLength(2);
	});

	it("reports words as offsets into the whole reply, not the sentence", async () => {
		const h = harness();
		h.say(REPLY, h.hooks);
		await flush();
		h.clips[0].at(10);
		h.tick();
		expect(h.words).toEqual([
			[0, 3],
			[4, 9],
			[10, 15],
			[16, 21],
			[22, 26],
		]);
		h.clips[0].finish();
		await flush();
		h.fire(300);
		await flush();
		h.words.length = 0;
		h.clips[1].at(10);
		h.tick();
		// "How are you?" starts at character 27 of the reply.
		expect(h.words).toEqual([
			[27, 30],
			[31, 34],
			[35, 39],
		]);
		expect(REPLY.slice(27, 39)).toBe("How are you?");
	});

	it("says nothing about words while the clip's length is unknown", async () => {
		const h = harness();
		h.say(REPLY, h.hooks);
		await flush();
		const clip = h.clips[0];
		clip.duration = () => Number.NaN;
		h.tick();
		expect(h.words).toEqual([]);
	});

	it("ends once, after the last sentence", async () => {
		const h = harness();
		h.say(REPLY, h.hooks);
		await flush();
		h.clips[0].finish();
		await flush();
		h.fire(300);
		await flush();
		expect(h.ends).toBe(0);
		h.clips[1].finish();
		await flush();
		expect(h.ends).toBe(1);
		// No breath is waited after the last sentence.
		expect(h.waiting(380)).toBe(false);
	});

	it("stops at once when cancelled, and stops watching words", async () => {
		const h = harness();
		const spoken = h.say(REPLY, h.hooks);
		await flush();
		spoken.cancel();
		expect(h.clips[0].stopped).toBe(true);
		expect(h.ends).toBe(1);
		expect(h.hasFrame()).toBe(false);
		await flush();
		// It never moves on to the second sentence.
		expect(h.clips).toHaveLength(1);
	});

	it("uses the device's voice when the first sentence can't be fetched", async () => {
		const h = harness({ failAt: 0 });
		h.say(REPLY, h.hooks);
		await flush();
		expect(h.fellBack).toBe(REPLY);
		// The fallback owns the hooks now, so this must not report an end of its own.
		expect(h.ends).toBe(0);
	});

	it("uses the device's voice when the first sentence can't be played", async () => {
		const h = harness({ playFailsAt: 0 });
		h.say(REPLY, h.hooks);
		await flush();
		expect(h.fellBack).toBe(REPLY);
		expect(h.ends).toBe(0);
	});

	it("does not start over when a later sentence fails, having already spoken", async () => {
		const h = harness({ failAt: 1 });
		h.say(REPLY, h.hooks);
		await flush();
		expect(h.clips).toHaveLength(1);
		h.clips[0].finish();
		await flush();
		h.fire(300);
		await flush();
		// He keeps the first sentence and simply stops, rather than repeating it in another voice.
		expect(h.fellBack).toBeNull();
		expect(h.ends).toBe(1);
	});

	it("gives up on the cloud voice if nothing is heard in time", async () => {
		const h = harness({ playFailsAt: 99 });
		h.say(REPLY, h.hooks);
		h.fire(FIRST_SOUND_GUARD_MS);
		expect(h.fellBack).toBe(REPLY);
		expect(h.ends).toBe(0);
	});

	it("leaves the guard alone once he is speaking", async () => {
		const h = harness();
		h.say(REPLY, h.hooks);
		await flush();
		h.fire(FIRST_SOUND_GUARD_MS);
		expect(h.fellBack).toBeNull();
	});

	it("passes a cancel on to the device's voice once it has taken over", async () => {
		const h = harness({ failAt: 0 });
		const spoken = h.say(REPLY, h.hooks);
		await flush();
		spoken.cancel();
		expect(h.fallbackSpoken.cancel).toHaveBeenCalledOnce();
		// The fallback reports its own end; this must not add one.
		expect(h.ends).toBe(0);
	});

	it("has nothing to say for blank text, and asks for nothing", async () => {
		const h = harness();
		h.say("   ", h.hooks);
		await flush();
		expect(h.asked).toEqual([]);
		expect(h.ends).toBe(1);
	});
});
