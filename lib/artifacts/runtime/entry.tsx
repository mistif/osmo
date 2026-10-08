import * as React from "react";
import { createRoot } from "react-dom/client";
import { lockdown, requireOnly } from "./lockdown";

const nonce = (document.currentScript as HTMLScriptElement | null)?.nonce ?? "";
const parent = window.parent;
const send = parent.postMessage.bind(parent); // captured before lockdown
const post = (t: string, v?: string | number) => send(v === undefined ? { osmo: 1, n: nonce, t } : { osmo: 1, n: nonce, t, v }, "*");
const fail = (e: unknown) => post("error", String((e as Error)?.message ?? e).slice(0, 200));
lockdown(window);
document.addEventListener("click", (e) => { if ((e.target as Element | null)?.closest?.("a")) e.preventDefault(); }, true);
window.addEventListener("error", (e) => fail(e.message));
window.addEventListener("unhandledrejection", (e) => fail(e.reason));

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() { return { failed: true }; }
	componentDidCatch(e: unknown) { fail(e); }
	render() { return this.state.failed ? null : this.props.children; }
}

(window as unknown as { __osmoDefine: (f: (...a: unknown[]) => void) => void }).__osmoDefine = (factory) => {
	try {
		const mod = { exports: {} as { default?: unknown } };
		factory(requireOnly(React), mod.exports, mod, React);
		const Thing = mod.exports.default as React.ComponentType;
		if (typeof Thing !== "function") throw new Error("There is no default component.");
		if ((Thing as unknown as { length: number }).length > 0) throw new Error("The component must take no props.");
		createRoot(document.getElementById("root")!).render(<Boundary><Thing /></Boundary>);
		new ResizeObserver(() => post("height", Math.ceil(document.documentElement.scrollHeight))).observe(document.documentElement);
		post("ready");
		if (document.title) post("title", document.title.slice(0, 60));
	} catch (e) {
		fail(e);
	}
};
