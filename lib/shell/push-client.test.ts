/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { deviceLabel, enablePush, INSTALL_HINT, pushState, urlBase64ToUint8Array } from "./push-client";

describe("urlBase64ToUint8Array", () => {
	it("decodes url-safe base64", () => {
		expect(Array.from(urlBase64ToUint8Array("AQAB"))).toEqual([1, 0, 1]);
		expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
	});
});

describe("deviceLabel", () => {
	it("names the device from the user agent", () => {
		expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe("iPhone");
		expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Windows Edge");
		expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe("Windows Chrome");
		expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/130.0")).toBe("This device");
		expect(deviceLabel("")).toBe("This device");
	});
});

describe("pushState", () => {
	it("asks an iPhone outside the installed app to install first", () => {
		expect(pushState({ ios: true, standalone: false, supported: false })).toBe("install_first");
		expect(pushState({ ios: true, standalone: false, supported: true })).toBe("install_first");
		expect(INSTALL_HINT).toBe("Add Osmo to your home screen first (Share, then Add to Home Screen), then open it from there.");
	});
	it("is unsupported without PushManager, otherwise ready", () => {
		expect(pushState({ ios: false, standalone: false, supported: false })).toBe("unsupported");
		expect(pushState({ ios: true, standalone: true, supported: false })).toBe("unsupported");
		expect(pushState({ ios: true, standalone: true, supported: true })).toBe("ready");
		expect(pushState({ ios: false, standalone: false, supported: true })).toBe("ready");
	});
});

describe("enablePush", () => {
	function setup(over: Record<string, any> = {}) {
		const subscribe = vi.fn<(o: unknown) => Promise<{ toJSON(): unknown }>>(async () => ({ toJSON: () => ({ endpoint: "https://p.example/1", keys: { p256dh: "pp", auth: "aa" } }) }));
		const registration = { pushManager: { subscribe } };
		const serviceWorker = { register: vi.fn<(u: string, o: unknown) => Promise<unknown>>(async () => registration), ready: Promise.resolve(registration) };
		const fetchFn = vi.fn<(url: string, init?: any) => Promise<Response>>(async (url: string) =>
			url === "/api/push/key" ? new Response(JSON.stringify({ key: "AQAB" }), { status: 200 }) : new Response("{}", { status: 200 }),
		);
		const deps: any = { serviceWorker, requestPermission: vi.fn(async () => "granted"), fetch: fetchFn, token: "tok", userAgent: "Mozilla/5.0 (iPhone)", ...over };
		return { deps, subscribe, serviceWorker, fetchFn };
	}

	it("registers the worker, asks permission, fetches the key with the bearer, subscribes and posts", async () => {
		const { deps, subscribe, serviceWorker, fetchFn } = setup();
		expect(await enablePush(deps)).toEqual({ ok: true });
		expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
		expect(deps.requestPermission).toHaveBeenCalledTimes(1);
		const keyCall = fetchFn.mock.calls.find((c) => c[0] === "/api/push/key") as any;
		expect(keyCall[1].headers.authorization).toBe("Bearer tok");
		const opts = subscribe.mock.calls[0][0] as any;
		expect(opts.userVisibleOnly).toBe(true);
		expect(Array.from(opts.applicationServerKey as Uint8Array)).toEqual([1, 0, 1]);
		const post = fetchFn.mock.calls.find((c) => c[0] === "/api/push/subscribe") as any;
		expect(post[1].method).toBe("POST");
		expect(post[1].headers.authorization).toBe("Bearer tok");
		expect(JSON.parse(post[1].body)).toEqual({ endpoint: "https://p.example/1", keys: { p256dh: "pp", auth: "aa" }, label: "iPhone" });
	});

	it("stops with denied when permission is not granted, and never subscribes", async () => {
		const { deps, subscribe } = setup({ requestPermission: vi.fn(async () => "denied") });
		expect(await enablePush(deps)).toEqual({ ok: false, reason: "denied" });
		expect(subscribe).not.toHaveBeenCalled();
	});

	it("says no_key when the server has no key", async () => {
		const { deps } = setup({ fetch: vi.fn(async () => new Response("{}", { status: 404 })) });
		expect(await enablePush(deps)).toEqual({ ok: false, reason: "no_key" });
	});

	it("says failed, and never throws, when subscribing or saving breaks", async () => {
		const a = setup();
		a.subscribe.mockRejectedValueOnce(new Error("boom"));
		expect(await enablePush(a.deps)).toEqual({ ok: false, reason: "failed" });
		const b = setup({ fetch: vi.fn(async (u: string) => (u === "/api/push/key" ? new Response(JSON.stringify({ key: "AQAB" })) : new Response("{}", { status: 400 }))) });
		expect(await enablePush(b.deps)).toEqual({ ok: false, reason: "failed" });
		const c = setup({
			serviceWorker: {
				register: vi.fn(async () => {
					throw new Error("no");
				}),
				ready: new Promise(() => {}),
			},
		});
		expect(await enablePush(c.deps)).toEqual({ ok: false, reason: "failed" });
	});
});
