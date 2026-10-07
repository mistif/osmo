"use client";

import { useEffect, useState } from "react";
import { ensureSession, supabase } from "@/lib/supabase";
import { deviceRow } from "@/lib/shell/devices";
import { geocode, levelDescription, loadProfileRow, roundCoord, saveProfile, type Level, type Place, type ProfilePatch, type ProfileRow } from "@/lib/shell/profile-client";
import { enablePush, INSTALL_HINT, pushState, type PushState } from "@/lib/shell/push-client";
import styles from "./panels.module.css";

const UNREACHABLE = "I can't reach my memory right now. Try again in a moment.";
const SAVE_FAILED = "Couldn't save that. Try again.";
const CONNECTORS = [
	{ id: "reminders", name: "Reminders" },
	{ id: "notes", name: "Notes" },
	{ id: "weather", name: "Weather" },
];
const LEVELS: { id: Level; name: string }[] = [
	{ id: "off", name: "Off" },
	{ id: "read", name: "Read" },
	{ id: "ask", name: "Ask" },
	{ id: "act", name: "Act" },
];

type Device = { id: string; label: string | null; created_at: string; last_ok_at: string | null };

function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange(on: boolean): void; disabled?: boolean }) {
	return (
		<button type="button" role="switch" aria-checked={on} className={styles.switch} onClick={() => onChange(!on)} disabled={disabled}>
			<span className={styles.switchTrack} aria-hidden="true">
				<span className={styles.switchThumb} />
			</span>
			{label}
		</button>
	);
}

// The browser facts that decide what the notifications button can do.
function readPushEnvironment(): { state: PushState; blocked: boolean } {
	const ua = navigator.userAgent;
	const ios = /iPhone|iPad|iPod/.test(ua);
	const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
	const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
	return { state: pushState({ ios, standalone, supported }), blocked: "Notification" in window && Notification.permission === "denied" };
}

export function ConnectorsSettings() {
	// null while loading, "error" when the profile cannot be read.
	const [row, setRow] = useState<ProfileRow | "error" | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [city, setCity] = useState("");
	const [candidate, setCandidate] = useState<Place | null>(null);
	const [placeNote, setPlaceNote] = useState<string | null>(null);
	const [finding, setFinding] = useState(false);
	const [push, setPush] = useState<{ state: PushState; blocked: boolean } | null>(null);
	const [pushNote, setPushNote] = useState<string | null>(null);
	const [pushBusy, setPushBusy] = useState(false);
	const [devices, setDevices] = useState<Device[] | null>(null);
	const [devicesError, setDevicesError] = useState<string | null>(null);
	// Captured when the list loads, so render stays pure (no Date.now() there).
	const [now, setNow] = useState(0);

	async function refreshDevices() {
		const { data, error } = await supabase.from("push_subscriptions").select("id,label,created_at,last_ok_at").order("created_at");
		if (error) {
			setDevicesError(UNREACHABLE);
			setDevices([]);
		} else {
			setDevicesError(null);
			setDevices((data ?? []) as Device[]);
		}
		setNow(Date.now());
	}

	useEffect(() => {
		// Nested so the compiler sees this effect's own setup, not a shared helper, doing the setting.
		async function load() {
			setPush(readPushEnvironment());
			setRow(await loadProfileRow(supabase));
			await refreshDevices();
		}
		void load();
	}, []);

	// Saves a patch with Gur's own session; `apply` shows it on screen only once it is saved.
	async function save(patch: ProfilePatch, apply: (r: ProfileRow) => ProfileRow): Promise<boolean> {
		const session = await ensureSession().catch(() => null);
		const ok = session ? await saveProfile(supabase, session.user.id, patch) : false;
		setSaveError(ok ? null : SAVE_FAILED);
		if (ok) setRow((current) => (current === null || current === "error" ? current : apply(current)));
		return ok;
	}

	async function findCity() {
		setFinding(true);
		setPlaceNote(null);
		setCandidate(null);
		const found = await geocode(city, fetch);
		setFinding(false);
		if (found) setCandidate(found);
		else setPlaceNote("I could not find that place. Try the name of a town or city.");
	}

	function useMyLocation() {
		setPlaceNote(null);
		setCandidate(null);
		if (!("geolocation" in navigator)) {
			setPlaceNote("This browser cannot share a location. Type a city instead.");
			return;
		}
		// The browser asks Gur itself, and only because he tapped.
		navigator.geolocation.getCurrentPosition(
			(pos) => setCandidate({ label: "My location", lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude) }),
			() => setPlaceNote("I could not get your location. Type a city instead."),
			{ timeout: 10_000, maximumAge: 600_000 },
		);
	}

	async function savePlace() {
		if (!candidate) return;
		const chosen = candidate;
		if (await save({ place: chosen.label, lat: chosen.lat, lon: chosen.lon }, (r) => ({ ...r, place: chosen.label, lat: chosen.lat, lon: chosen.lon }))) {
			setCandidate(null);
			setCity("");
			setPlaceNote(null);
		}
	}

	async function turnOnNotifications() {
		setPushBusy(true);
		setPushNote(null);
		const session = await ensureSession().catch(() => null);
		if (!session) {
			setPushBusy(false);
			setPushNote("I could not check that you are signed in. Try again.");
			return;
		}
		const out = await enablePush({
			serviceWorker: navigator.serviceWorker,
			requestPermission: () => Notification.requestPermission(),
			fetch: (...args) => fetch(...args),
			token: session.access_token,
			userAgent: navigator.userAgent,
		});
		setPushBusy(false);
		setPush(readPushEnvironment());
		if (out.ok) {
			setPushNote("Notifications are on for this device.");
			await refreshDevices();
		} else if (out.reason === "denied") setPushNote("Notifications are blocked for Osmo. Allow them in this browser's site settings, then try again.");
		else if (out.reason === "no_key") setPushNote("Notifications are not set up on my side yet.");
		else setPushNote("I could not turn notifications on. Try again.");
	}

	async function sendTest() {
		setPushBusy(true);
		setPushNote(null);
		const session = await ensureSession().catch(() => null);
		try {
			if (!session) throw new Error("no session");
			const res = await fetch("/api/push/test", { method: "POST", headers: { authorization: `Bearer ${session.access_token}` } });
			if (res.status === 503 || res.status === 404) setPushNote("Notifications are not set up on my side yet.");
			else if (!res.ok) setPushNote("I could not send a test. Try again.");
			else {
				const body = (await res.json()) as { sent?: number; failed?: number };
				if ((body.sent ?? 0) > 0) setPushNote("Sent. It should arrive in a moment.");
				else if ((body.failed ?? 0) > 0) setPushNote("The test did not get through to any device.");
				else setPushNote("No device is set up yet. Turn notifications on first.");
			}
		} catch {
			setPushNote("I could not send a test. Try again.");
		}
		setPushBusy(false);
		await refreshDevices();
	}

	async function removeDevice(id: string) {
		const { error } = await supabase.from("push_subscriptions").delete().eq("id", id);
		setDevicesError(error ? SAVE_FAILED : null);
		await refreshDevices();
	}

	if (row === null) {
		return (
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>What I may do</h3>
				<p className={styles.note}>Checking your settings...</p>
			</section>
		);
	}
	if (row === "error") {
		return (
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>What I may do</h3>
				<p className={styles.error} role="alert">{UNREACHABLE}</p>
			</section>
		);
	}

	return (
		<>
			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>What I may do</h3>
				<Switch label="Pause everything Osmo can do" on={row.paused} onChange={(paused) => void save({ paused }, (r) => ({ ...r, paused }))} />
				<p className={styles.note}>
					{row.paused ? "I am paused. I will not act on anything, and no reminder will be sent, until you turn this off." : "While this is on, I do nothing but talk, and no reminder is sent."}
				</p>
				{CONNECTORS.map((c) => {
					const level: Level = row.levels[c.id] ?? "off";
					return (
						<div key={c.id}>
							<div className={styles.line}>
								<label htmlFor={`level-${c.id}`}>{c.name}</label>
								<select
									id={`level-${c.id}`}
									className={styles.select}
									value={level}
									onChange={(e) => {
										const next = e.target.value as Level;
										void save({ levels: { ...row.levels, [c.id]: next } }, (r) => ({ ...r, levels: { ...r.levels, [c.id]: next } }));
									}}
								>
									{LEVELS.map((l) => (
										<option key={l.id} value={l.id}>
											{l.name}
										</option>
									))}
								</select>
							</div>
							<p className={styles.note}>{levelDescription(c.id, level)}</p>
						</div>
					);
				})}
				<p className={styles.note}>When you use a connector, what it returns may be sent to OpenAI to write my answer.</p>
				{saveError && <p className={styles.error} role="alert">{saveError}</p>}
			</section>

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>My place</h3>
				<p className={styles.note}>{row.place ? `Saved: ${row.place}.` : "No place saved yet. I use it for the weather."}</p>
				<div className={styles.row}>
					<input
						className={styles.input}
						aria-label="City"
						placeholder="A town or city"
						value={city}
						onChange={(e) => setCity(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && city.trim() !== "" && !finding) void findCity();
						}}
					/>
					<button type="button" className={styles.action} onClick={() => void findCity()} disabled={finding || city.trim() === ""}>
						Find
					</button>
				</div>
				<div className={styles.row}>
					<button type="button" className={styles.action} onClick={useMyLocation}>
						Use my location
					</button>
					{row.place && (
						<button type="button" className={styles.action} onClick={() => void save({ place: null, lat: null, lon: null }, (r) => ({ ...r, place: null, lat: null, lon: null }))}>
							Forget my place
						</button>
					)}
				</div>
				{candidate && (
					<div className={styles.row}>
						<span>
							{candidate.label} ({candidate.lat}, {candidate.lon})
						</span>
						<button type="button" className={styles.action} onClick={() => void savePlace()}>
							Save as my place
						</button>
						<button type="button" className={styles.action} onClick={() => setCandidate(null)}>
							Cancel
						</button>
					</div>
				)}
				{placeNote && <p className={styles.note}>{placeNote}</p>}
				<p className={styles.note}>Only these coordinates go to Open-Meteo, nothing else. They are rounded to about a kilometre.</p>
			</section>

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Notifications on this device</h3>
				{push?.state === "install_first" && <p className={styles.note}>{INSTALL_HINT}</p>}
				{push?.state === "unsupported" && <p className={styles.note}>This browser cannot show notifications from me.</p>}
				{push?.state === "ready" && (
					<>
						{push.blocked && <p className={styles.note}>Notifications are blocked for Osmo in this browser. Allow them in the site settings first.</p>}
						<div className={styles.row}>
							<button type="button" className={styles.action} onClick={() => void turnOnNotifications()} disabled={pushBusy}>
								Turn on
							</button>
							<button type="button" className={styles.action} onClick={() => void sendTest()} disabled={pushBusy}>
								Send me a test
							</button>
						</div>
					</>
				)}
				{pushNote && <p className={styles.note} role="status">{pushNote}</p>}
				{devices?.length === 0 && !devicesError && <p className={styles.note}>No device gets my notifications yet.</p>}
				{devices?.map((d) => {
					const r = deviceRow({ id: d.id, friendly_name: d.label ?? undefined, created_at: d.created_at, last_used_at: d.last_ok_at ?? undefined }, now);
					return (
						<div key={r.id} className={styles.line}>
							<div>
								{r.name}
								<p className={styles.note}>{r.lastUsed}</p>
							</div>
							<div className={styles.actions}>
								<button type="button" className={styles.action} onClick={() => void removeDevice(r.id)}>
									Remove
								</button>
							</div>
						</div>
					);
				})}
				{devicesError && <p className={styles.error} role="alert">{devicesError}</p>}
				<Switch label="Hide reminder text on the lock screen" on={row.hideReminderText} onChange={(on) => void save({ hide_reminder_text: on }, (r) => ({ ...r, hideReminderText: on }))} />
				<p className={styles.note}>{row.hideReminderText ? "A reminder will only say that it is from Osmo." : "A reminder shows what it is about."}</p>
			</section>
		</>
	);
}
