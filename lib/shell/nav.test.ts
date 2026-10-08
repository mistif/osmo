import { describe, expect, it } from "vitest";
import { createNav, type NavWindow } from "./nav";

// A tiny history: entries with state and hash, a cursor, and back().
function fake(startHash = "") {
	const entries: { hash: string; state: unknown }[] = [{ hash: startHash, state: null }];
	let at = 0;
	const win: NavWindow = {
		location: {
			pathname: "/",
			search: "?x=1",
			get hash() {
				return entries[at].hash;
			},
		} as NavWindow["location"],
		history: {
			get state() {
				return entries[at].state;
			},
			pushState(state, _t, url) {
				entries.splice(at + 1);
				entries.push({ hash: url.slice(url.indexOf("#") < 0 ? url.length : url.indexOf("#")), state });
				at++;
			},
			replaceState(state, _t, url) {
				entries[at] = { hash: url.slice(url.indexOf("#") < 0 ? url.length : url.indexOf("#")), state };
			},
			back() {
				if (at > 0) at--;
			},
		},
	};
	let notified = 0;
	const nav = createNav(win, () => void notified++);
	return { win, nav, entries, notified: () => notified, at: () => at };
}

describe("createNav", () => {
	it("pushes from Talk, replaces rail to rail, and notifies each time", () => {
		const f = fake();
		f.nav.navigate("library");
		expect(f.entries.map((e) => e.hash)).toEqual(["", "#library"]);
		expect(f.entries[1].state).toEqual({ osmoPush: true });
		f.nav.navigate("feed");
		expect(f.entries.map((e) => e.hash)).toEqual(["", "#feed"]);
		expect(f.entries[1].state).toEqual({ osmoPush: true });
		expect(f.notified()).toBe(2);
	});
	it("keeps the path and the query when it writes the hash", () => {
		const f = fake();
		const pushed: string[] = [];
		const orig = f.win.history.pushState.bind(f.win.history);
		f.win.history.pushState = (s, t, u) => { pushed.push(u); orig(s, t, u); };
		f.nav.open("settings", "voice");
		expect(pushed).toEqual(["/?x=1#settings/voice"]);
	});
	it("closes on Talk or on the active item with no page, and reports the panel it left", () => {
		const f = fake();
		expect(f.nav.navigate("library")).toBe(false);
		expect(f.nav.navigate("library")).toBe(true);
		expect(f.entries[f.at()].hash).toBe("");
		f.nav.navigate("settings");
		expect(f.nav.close()).toBe("settings");
		expect(f.nav.close()).toBe(null);
	});
	it("goes to the panel root when a page is open and its rail item is chosen", () => {
		const f = fake("#settings/voice");
		expect(f.nav.navigate("settings")).toBe(false);
		expect(f.entries[f.at()].hash).toBe("#settings");
	});
	it("pushes into a page, and Back steps back through history", () => {
		const f = fake();
		f.nav.navigate("settings");
		f.nav.open("settings", "voice");
		expect(f.entries.map((e) => e.hash)).toEqual(["", "#settings", "#settings/voice"]);
		f.nav.back();
		expect(f.entries[f.at()].hash).toBe("#settings");
	});
	it("Back on a deep link goes up one level and never leaves the app", () => {
		const f = fake("#settings/voice");
		f.nav.back();
		expect(f.entries).toHaveLength(1);
		expect(f.entries[0].hash).toBe("#settings");
		f.nav.back();
		expect(f.entries[0].hash).toBe("");
		expect(f.at()).toBe(0);
		const g = fake("#library/notes/abc");
		g.nav.back();
		expect(g.entries[0].hash).toBe("#library/notes");
	});
	it("treats a malformed hash as Talk without throwing", () => {
		const f = fake("#library/%E0%A4%A");
		expect(() => f.nav.back()).not.toThrow();
		const g = fake("#search/apple");
		expect(() => g.nav.navigate("library")).not.toThrow();
		expect(g.entries[g.at()].hash).toBe("#library");
	});
	it("keeps the pushed mark when a replace changes the entry", () => {
		const f = fake();
		f.nav.open("library");
		f.nav.open("library", "notes");
		expect(f.entries[f.at()].state).toEqual({ osmoPush: true });
		expect(f.entries[f.at()].hash).toBe("#library/notes");
	});
});
