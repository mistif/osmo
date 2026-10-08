export type FrameMessage = { type: "ready" } | { type: "title"; text: string } | { type: "height"; px: number } | { type: "error"; text: string };
const KEYS = (t: string) => (t === "ready" ? ["n", "osmo", "t"] : ["n", "osmo", "t", "v"]);
export function acceptMessage(ev: { source: unknown; data: unknown }, frame: unknown, nonce: string): FrameMessage | null {
	if (frame == null || ev.source !== frame) return null;
	const d = ev.data;
	if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
	const o = d as Record<string, unknown>;
	if (o.osmo !== 1 || o.n !== nonce || typeof o.t !== "string") return null;
	if (Object.keys(o).sort().join() !== KEYS(o.t).sort().join()) return null;
	if (o.t === "ready") return { type: "ready" };
	if ((o.t === "title" || o.t === "error") && typeof o.v === "string" && o.v.length <= (o.t === "title" ? 60 : 200)) return { type: o.t, text: o.v };
	if (o.t === "height" && typeof o.v === "number" && Number.isFinite(o.v)) return { type: "height", px: o.v };
	return null;
}
export const clampHeight = (px: number, viewportH: number) => Math.round(Math.min(Math.max(px, 160), Math.min(viewportH * 0.7, 560)));
