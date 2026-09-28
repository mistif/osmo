// A soft two-note chime when he wakes, made with Web Audio so there's no sound file to load.

let context: AudioContext | null = null;

export function chime(): void {
	try {
		context ??= new AudioContext();
		const ctx = context;
		if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
		const start = ctx.currentTime;
		[660, 880].forEach((hz, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const at = start + i * 0.12;
			osc.type = "sine";
			osc.frequency.value = hz;
			gain.gain.setValueAtTime(0, at);
			gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
			osc.connect(gain).connect(ctx.destination);
			osc.start(at);
			osc.stop(at + 0.4);
		});
	} catch {
		// A missing chime never stops him listening.
	}
}
