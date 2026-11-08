import { describe, expect, it, vi } from "vitest";
import { NOTHING_WAITING_LINE, sendDecision, UNREACHED_LINE } from "./decision";

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

// The server answered and nothing waits; and the request that never reached it, which says nothing about the row.
const NONE = { handled: false, reply: null, waiting: false, reached: true };
const UNREACHED = { handled: false, reply: null, waiting: false, reached: false };

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

	it("names the row his yes or no is for, when the room knows it, so a row held from another tab is never answered", async () => {
		const id = "7c0e5a2b-3d41-4f8e-9b6a-1e2d3c4b5a69";
		const { fetcher, fetchFn } = answering(() => json({ handled: true, reply: "Deleted the note." }));
		await sendDecision(fetchFn, "t", "yes", "typed", undefined, id);
		expect(JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ decision: "yes", via: "typed", pendingId: id });
	});

	it("sends no row id when it has none, as from an older server, so /api/act answers whichever row waits", async () => {
		for (const pendingId of [undefined, null]) {
			const { fetcher, fetchFn } = answering(() => json({ handled: true, reply: "Cancelled." }));
			await sendDecision(fetchFn, "t", "no", "voice", undefined, pendingId);
			const sent = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as Record<string, unknown>;
			expect(sent, String(pendingId)).toEqual({ decision: "no", via: "voice" });
			expect("pendingId" in sent, String(pendingId)).toBe(false);
		}
	});

	it("passes a handled answer and its reply line through", async () => {
		const { fetchFn } = answering(() => json({ handled: true, reply: "Cancelled." }));
		expect(await sendDecision(fetchFn, "t", "no", "typed")).toEqual({ handled: true, reply: "Cancelled.", waiting: false, reached: true });
	});

	it("keeps a handled answer without a reply line as handled, with no line", async () => {
		const { fetchFn } = answering(() => json({ handled: true, reply: 42 }));
		expect(await sendDecision(fetchFn, "t", "yes", "typed")).toEqual({ handled: true, reply: null, waiting: false, reached: true });
	});

	it("passes on that the row still waits, as when a spoken yes must be typed, and reads anything but true as not waiting", async () => {
		const typed = answering(() => json({ handled: true, reply: "For that one I need you to type yes.", waiting: true }));
		expect(await sendDecision(typed.fetchFn, "t", "yes", "voice")).toEqual({ handled: true, reply: "For that one I need you to type yes.", waiting: true, reached: true });
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

	it("reads a 401 and a 500 as not handled and never reached, even with a handled body", async () => {
		for (const status of [401, 500]) {
			const { fetchFn } = answering(() => json({ handled: true, reply: "Done." }, status));
			expect(await sendDecision(fetchFn, "t", "yes", "typed")).toEqual(UNREACHED);
		}
	});

	it("reads a body that is not JSON as not handled and never reached", async () => {
		const { fetchFn } = answering(() => new Response("<html>oops</html>", { status: 200 }));
		expect(await sendDecision(fetchFn, "t", "yes", "typed")).toEqual(UNREACHED);
	});

	it("reads a failed request as not handled and never reached, never throwing", async () => {
		const fetchFn = vi.fn(async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		expect(await sendDecision(fetchFn, "t", "crisis", "typed")).toEqual(UNREACHED);
	});

	it("gives up after its time limit, as not handled and never reached", async () => {
		expect(await sendDecision(honouring, "t", "yes", "typed", 20)).toEqual(UNREACHED);
	});

	it("has a line for a decision no answer came back for, which Osmo can say", () => {
		expect(UNREACHED_LINE).toMatch(/^[A-Za-z ,.]+$/);
		expect(UNREACHED_LINE).not.toContain("Nothing is waiting");
		expect(NOTHING_WAITING_LINE).toMatch(/^[A-Za-z ,.]+$/);
	});

	it("never says the answer did not get through, since a timeout or a lost answer can follow an action that ran", () => {
		expect(UNREACHED_LINE).not.toMatch(/could not|couldn't|did not get|didn't get|never/i);
		expect(UNREACHED_LINE).toMatch(/did not hear back/i);
	});
});
