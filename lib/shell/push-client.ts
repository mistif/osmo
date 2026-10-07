// The browser's side of Web Push (spec 7.1, 7.2). Pure helpers plus enablePush, whose browser parts are injected
// so a test can run it. No NEXT_PUBLIC_ key: the public key is fetched from /api/push/key with the bearer.

export const INSTALL_HINT = "Add Osmo to your home screen first (Share, then Add to Home Screen), then open it from there.";

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
	const out = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

// A short name for the devices list. Edge also says Chrome, so it is checked first.
export function deviceLabel(userAgent: string): string {
	if (/iPhone/i.test(userAgent)) return "iPhone";
	if (/Windows/i.test(userAgent) && /Edg\//.test(userAgent)) return "Windows Edge";
	if (/Windows/i.test(userAgent) && /Chrome\//.test(userAgent)) return "Windows Chrome";
	return "This device";
}

export type PushState = "install_first" | "unsupported" | "ready";

export function pushState(env: { ios: boolean; standalone: boolean; supported: boolean }): PushState {
	if (env.ios && !env.standalone) return "install_first";
	return env.supported ? "ready" : "unsupported";
}

type Registration = { pushManager: { subscribe(options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array<ArrayBuffer> }): Promise<{ toJSON(): unknown }> } };
export type PushDeps = {
	serviceWorker: { register(url: string, options: { scope: string; updateViaCache: "none" }): Promise<unknown>; ready: Promise<Registration> };
	requestPermission(): Promise<string>;
	fetch: typeof fetch;
	token: string;
	userAgent: string;
};
export type EnableResult = { ok: true } | { ok: false; reason: "denied" | "no_key" | "failed" };

// Must run from a tap: iOS and the browsers both want that for the permission prompt. Never throws.
export async function enablePush(deps: PushDeps): Promise<EnableResult> {
	try {
		await deps.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
		const permission = await deps.requestPermission();
		if (permission !== "granted") return { ok: false, reason: "denied" };
		const headers = { authorization: `Bearer ${deps.token}` };
		const keyRes = await deps.fetch("/api/push/key", { headers });
		if (!keyRes.ok) return { ok: false, reason: "no_key" };
		const body = (await keyRes.json()) as { key?: unknown };
		if (typeof body.key !== "string" || body.key === "") return { ok: false, reason: "no_key" };
		const registration = await deps.serviceWorker.ready;
		const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(body.key) });
		const saved = await deps.fetch("/api/push/subscribe", {
			method: "POST",
			headers: { ...headers, "content-type": "application/json" },
			body: JSON.stringify({ ...(subscription.toJSON() as object), label: deviceLabel(deps.userAgent) }),
		});
		return saved.ok ? { ok: true } : { ok: false, reason: "failed" };
	} catch {
		return { ok: false, reason: "failed" };
	}
}
