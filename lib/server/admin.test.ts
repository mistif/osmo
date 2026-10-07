/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { ownerDb } from "./admin";

const ENV = { OSMO_OWNER_ID: "OWNER-1", NEXT_PUBLIC_SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" };

function fake() {
	const calls: string[] = [];
	const t: any = {
		select: () => t,
		update: () => t,
		delete: () => t,
		insert: (r: unknown) => (calls.push("insert " + JSON.stringify(r)), t),
		upsert: (r: unknown, o: unknown) => (calls.push("upsert " + JSON.stringify(r) + " " + JSON.stringify(o)), t),
		eq: (c: string, v: string) => (calls.push(`eq ${c}=${v}`), t),
	};
	return { calls, make: vi.fn(() => ({ from: () => t })) as never };
}

describe("ownerDb", () => {
	it.each([
		["select", (d: any) => d.from("a").select("*")],
		["update", (d: any) => d.from("a").update({})],
		["delete", (d: any) => d.from("a").delete()],
	])("filters %s by the owner", (_n, go) => {
		const f = fake();
		go(ownerDb(ENV, f.make));
		expect(f.calls).toContain("eq user_id=owner-1");
	});

	it("stamps the owner on inserts, one row or many", () => {
		const f = fake();
		const d = ownerDb(ENV, f.make);
		d.from("a").insert({ x: 1, user_id: "someone-else" });
		d.from("a").insert([{ x: 2 }]);
		expect(f.calls[0]).toContain('"user_id":"owner-1"');
		expect(f.calls[0]).not.toContain("someone-else");
		expect(f.calls[1]).toContain('"user_id":"owner-1"');
	});

	it("stamps the owner on upserts and passes the conflict column", () => {
		const f = fake();
		ownerDb(ENV, f.make).from("a").upsert({ x: 1, user_id: "someone-else" }, "user_id,x");
		expect(f.calls[0]).toContain('"user_id":"owner-1"');
		expect(f.calls[0]).toContain('"onConflict":"user_id,x"');
	});

	it("exposes the owner and creates the client without a session", () => {
		const f = fake();
		const d = ownerDb(ENV, f.make);
		expect(d.owner).toBe("owner-1");
		expect((f.make as any).mock.calls[0][2]).toMatchObject({ auth: { persistSession: false, autoRefreshToken: false } });
	});

	it.each(["OSMO_OWNER_ID", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])("throws without %s", (k) => {
		expect(() => ownerDb({ ...ENV, [k]: undefined }, fake().make)).toThrow("admin_unconfigured");
	});
});
