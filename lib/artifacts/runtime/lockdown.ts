// WebRTC and WebTransport are not governed by connect-src, so they go too. The names are joined from pieces on purpose:
// runtime.test.ts asserts the shipped bundle never spells them, so a bundle that does is a bundle that uses them.
const WEBRTC = [["RTC", "PeerConnection"], ["webkitRTC", "PeerConnection"], ["RTC", "DataChannel"], ["RTC", "RtpSender"], ["Web", "Transport"]].map((p) => p.join(""));
const REMOVED = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "open", "eval", ...WEBRTC];
const gone = { value: undefined, writable: false, configurable: false };
export function lockdown(win: object): void {
	for (const name of REMOVED) {
		try {
			Object.defineProperty(win, name, gone);
		} catch {
			// a property the browser will not let us redefine stays; the policy and the sandbox are the wall
		}
	}
	try {
		const nav = (win as { navigator?: object }).navigator;
		if (nav && "mediaDevices" in nav) Object.defineProperty(nav, "mediaDevices", gone);
	} catch {
		// same: best effort
	}
}
export const requireOnly = (react: unknown) => (name: string) => {
	if (name === "react") return react;
	throw new Error("Only react can be imported.");
};
