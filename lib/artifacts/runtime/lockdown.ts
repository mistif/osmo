const REMOVED = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "open", "eval"];
export function lockdown(win: object): void {
	for (const name of REMOVED) {
		try {
			Object.defineProperty(win, name, { value: undefined, writable: false, configurable: false });
		} catch {
			// a property the browser will not let us redefine stays; the policy and the sandbox are the wall
		}
	}
}
export const requireOnly = (react: unknown) => (name: string) => {
	if (name === "react") return react;
	throw new Error("Only react can be imported.");
};
