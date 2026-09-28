// The ONNX runtime, served from Osmo's own site (public/ort, copied by scripts/copy-ort.mjs) and loaded at run time,
// never bundled. One thread, so the page needs no cross-origin isolation.

import type * as Ort from "onnxruntime-web";

const RUNTIME_URL = "/ort/ort.wasm.min.mjs";
let runtime: Promise<typeof Ort> | null = null;

export function loadOrt(): Promise<typeof Ort> {
	if (!runtime) {
		runtime = (async () => {
			const ort = (await import(/* webpackIgnore: true */ RUNTIME_URL)) as typeof Ort;
			ort.env.wasm.wasmPaths = "/ort/";
			ort.env.wasm.numThreads = 1;
			return ort;
		})();
		runtime.catch(() => {
			runtime = null;
		});
	}
	return runtime;
}

export async function loadModel(url: string): Promise<{ ort: typeof Ort; session: Ort.InferenceSession }> {
	const ort = await loadOrt();
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Couldn't load ${url} (${response.status})`);
	const session = await ort.InferenceSession.create(new Uint8Array(await response.arrayBuffer()));
	return { ort, session };
}
