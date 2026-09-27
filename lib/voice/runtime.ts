// The small part of the ONNX runtime these modules use, so the same code runs on onnxruntime-web in the browser,
// on its node build in the voice check, and on fakes in tests.

export type OrtLike = {
	Tensor: new (type: "float32", data: Float32Array, dims: readonly number[]) => unknown;
};

export type SessionLike = {
	readonly inputNames: readonly string[];
	readonly outputNames: readonly string[];
	run(feeds: Record<string, unknown>): Promise<Record<string, { readonly data: unknown }>>;
};
