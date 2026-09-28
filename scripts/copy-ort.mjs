// Copies the ONNX runtime out of node_modules into public/ort, so Osmo's own site serves it (nothing third-party).
// Runs before `dev` and `build`; public/ort is git-ignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const from = join(process.cwd(), "node_modules", "onnxruntime-web", "dist");
const to = join(process.cwd(), "public", "ort");
mkdirSync(to, { recursive: true });
for (const file of ["ort.wasm.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
	copyFileSync(join(from, file), join(to, file));
}
