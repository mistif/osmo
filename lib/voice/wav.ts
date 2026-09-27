// Reading the 16-bit mono WAV clips the voice check uses.

export function readWav(bytes: Uint8Array): { rate: number; samples: Int16Array } {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
	if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file");
	let at = 12;
	let rate = 0;
	let bits = 0;
	let channels = 0;
	let samples: Int16Array | null = null;
	while (at + 8 <= bytes.length) {
		const id = tag(at);
		const size = view.getUint32(at + 4, true);
		if (id === "fmt ") {
			channels = view.getUint16(at + 10, true);
			rate = view.getUint32(at + 12, true);
			bits = view.getUint16(at + 22, true);
		}
		if (id === "data") {
			const copy = bytes.slice(at + 8, at + 8 + size);
			samples = new Int16Array(copy.buffer, 0, Math.floor(copy.byteLength / 2));
		}
		at += 8 + size + (size % 2);
	}
	if (!samples || bits !== 16 || channels !== 1) throw new Error("Expected 16-bit mono PCM");
	return { rate, samples };
}
