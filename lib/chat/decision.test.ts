import { describe, expect, it, vi } from "vitest";
import { sendDecision } from "./decision";

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// A fake fetch that gives every request the same answer and remembers what it was asked.
function answering(answer: () => Response | Promise<Response>) {
	const fetcher = vi.fn(async () => answer());
	return { fetcher, fetchFn: fetcher as unknown as typeof fetch };
}

// Like the browser's fetch: it rejects when its signal fires, and never answers otherwise.
const honouring = ((_url: string, init: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
	})) as unknown as typeof fetch;

const NONE = { handled: false, reply: null, waiting: false };

describe("sendDecision", () => {
	it("posts the decision and how it came to /api/act with Gur's token", async () => {
		const { fetcher, fetchFn } = answering(() => json({ handled: true, reply: "Cancelled." }));
		await sendDecision(fetchFn, "token-abc", "no", "voice");
		expect(fetcher).toHaveBeenCalledTimes(1);
		const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("/api/act");
		expect(init.method).toBe("POST");
		const headers = new Headers(init.headers);
		expect(headers.get("authorization")).toBe("Bearer token-abc");
		expect(headers.get("content-type")).toBe("application/json");
		expect(JSON.parse(String(init.body))).toEqual({ decision: "no", via: "voice" });
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it("passes a handled answer and its reply line through", async () => {
		const { fetchFn } = answering(() => json({ handled: true, reply: "Cancelled." }));
		expect(await sendDecision(fetchFn, "t", "no", "typed")).toEqual({ handled: true, reply: "Cancelled.", waiting: false });
	});

	it("keeps a handled answer without a reply line as handled, with no line", async () => {
		const { fetchFn } = answering(() => json({ handled: true, reply: 42 }));
		expect(await sendDecision(fetchFn, "t", "yes", "typed")).toEqual({ handled: true, reply: null, waiting: false });
	});

	it("passes on that the row still waits, as when a spoken yes must be typed, and reads anything but true as not waiting", async () => {
		const typed = answering(() => json({ handled: true, reply: "For that one I need you to type yes.", waiting: true }));
		expect(await sendDecision(typed.fetchFn, "t", "yes", "voice")).toEqual({ handled: true, reply: "For that one I need you to type yes.", waiting: true });
		for (const waiting of [undefined, false, "yes", 1]) {
			const { fetchFn } = answering(() => json({ handled: true, reply: "Done.", waiting }));
			expect((await sendDecision(fetchFn, "t", "yes", "typed")).waiting, String(waiting)).toBe(false);
		}
		const unhandled = answering(() => json({ handled: false, waiting: true }));
		expect(await sendDecision(unhandled.fetchFn, "t", "yes", "typed")).toEqual(NONE);
	});

	it("reads nothing waiting as not handled", async () => {
		const { fetchFn } = answering(() => json({ handled: false }));
		expect(await sendDecision(fetchFn, "t", "yes", "typed")).toEqual(NONE);
	});

	it("reads a 401 and a 500 as not handled, even with a handled body", async () => {
		for (const status of [401, 500]) {
			const { fetchFn } = answering(() => json({ handled: true, reply: "Done." }, status));
			expect(await sendDecision(fetchFn, "t", "yes", "typed")).toEqual(NONE);
		}
	});

	it("reads a body that is not JSON as not handled", async () => {
		const { fetchFn } = answering(() => new Response("<html>oops</html>", { status: 200 }));
		expect(await sendDecision(fetchFn, "t", "yes", "typed")).toEqual(NONE);
	});

	it("reads a failed request as not handled, never throwing", async () => {
		const fetchFn = vi.fn(async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		expect(await sendDecision(fetchFn, "t", "crisis", "typed")).toEqual(NONE);
	});

	it("gives up after its time limit, as not handled", async () => {
		expect(await sendDecision(honouring, "t", "yes", "typed", 20)).toEqual(NONE);
	});
});
