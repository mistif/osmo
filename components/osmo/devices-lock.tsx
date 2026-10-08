"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deviceRow } from "@/lib/shell/devices";
import {
	listDevices,
	lockOsmo,
	passkeysSupported,
	rememberThisDevice,
	removeDevice,
	renameDevice,
} from "@/lib/shell/passkeys";
import type { DeviceSource } from "@/lib/shell/devices";
import type { ChatStatus } from "@/lib/chat/types";
import styles from "./panels.module.css";

const UNREACHABLE = "I cannot reach my memory right now. Try again in a moment.";
const SAVE_FAILED = "I could not save that. Try again.";
// Gur is already in Settings, so this skips the lock screen's "try again from Settings".
const PASSKEY_FAILED_HERE = "This device could not save a passkey. Try again.";

export function DevicesBlock() {
	const [devices, setDevices] = useState<DeviceSource[] | null>(null);
	// Captured when the list loads rather than read live at render, so render stays pure (no Date.now() there).
	const [now, setNow] = useState(0);
	// Kept separate from the lock error: a device-list failure must never read as a locking failure.
	const [deviceError, setDeviceError] = useState<string | null>(null);
	const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);
	// True while the passkey ceremony runs, so a double click can't start a second one.
	const [adding, setAdding] = useState(false);

	async function refresh() {
		const { devices: list, error: failed } = await listDevices();
		if (failed) setDeviceError(UNREACHABLE);
		setDevices(list);
		setNow(Date.now());
	}

	useEffect(() => {
		// Nested so the compiler sees this effect's own setup, not a shared helper, doing the setting.
		async function load() {
			await refresh();
		}
		void load();
	}, []);

	async function saveName() {
		if (!editing) return;
		const name = editing.name.trim();
		setEditing(null);
		if (!name) return;
		const failed = await renameDevice(editing.id, name);
		setDeviceError(failed ? SAVE_FAILED : null);
		await refresh();
	}

	async function remove(id: string) {
		setConfirming(null);
		const failed = await removeDevice(id);
		setDeviceError(failed ? SAVE_FAILED : null);
		await refresh();
	}

	async function addThisDevice() {
		setAdding(true);
		const failed = await rememberThisDevice();
		setAdding(false);
		setDeviceError(failed ? PASSKEY_FAILED_HERE : null);
		await refresh();
	}

	return (
		<section className={styles.section}>
			<h3 className={styles.sectionTitle}>Devices</h3>
			{devices === null && <p className={styles.note}>Checking your devices&hellip;</p>}
			{devices?.length === 0 && !deviceError && (
				<p className={styles.empty}>No device remembers you yet. Remember this one to unlock with your fingerprint or face.</p>
			)}
			{devices?.map((device) => {
				const row = deviceRow(device, now);
				return (
					<div key={row.id} className={styles.line}>
						<div>
							{editing?.id === row.id ? (
								<input
									className={styles.input}
									aria-label="Device name"
									value={editing.name}
									autoFocus
									onChange={(e) => setEditing({ id: row.id, name: e.target.value })}
									onKeyDown={(e) => {
										if (e.key === "Enter") void saveName();
										if (e.key === "Escape") {
											e.preventDefault();
											e.stopPropagation();
											setEditing(null);
										}
									}}
									onBlur={() => void saveName()}
								/>
							) : (
								<button type="button" className={styles.lineText} onClick={() => setEditing({ id: row.id, name: row.name })}>
									{row.name}
								</button>
							)}
							<p className={styles.note}>{row.lastUsed}</p>
						</div>
						<div className={styles.actions}>
							{confirming === row.id ? (
								<>
									<button type="button" className={styles.action} onClick={() => void remove(row.id)}>
										Remove {row.name}
									</button>
									<button type="button" className={styles.action} onClick={() => setConfirming(null)}>
										Keep
									</button>
								</>
							) : (
								<button type="button" className={styles.action} onClick={() => setConfirming(row.id)}>
									Remove
								</button>
							)}
						</div>
					</div>
				);
			})}
			{confirming && <p className={styles.note}>That device will need your email and password next time.</p>}
			{passkeysSupported() && (
				<button type="button" className={styles.action} onClick={() => void addThisDevice()} disabled={adding}>
					Remember this device
				</button>
			)}
			{deviceError && <p className={styles.error} role="alert">{deviceError}</p>}
		</section>
	);
}

export function AiLine({ aiUsage }: { aiUsage?: ChatStatus | null }) {
	return aiUsage?.enabled ? (
		<p className={styles.note}>
			AI conversation: on
			{aiUsage.usedToday !== null && aiUsage.usable !== null
				? `, ${aiUsage.usedToday.toLocaleString("en-US")} of ${aiUsage.usable.toLocaleString("en-US")} tokens used today.`
				: "."}
		</p>
	) : (
		<p className={styles.note}>AI conversation: off.</p>
	);
}

export function LockBlock() {
	const router = useRouter();
	const [lockError, setLockError] = useState<string | null>(null);

	async function lock() {
		const failed = await lockOsmo();
		if (failed) {
			setLockError("I could not lock this device. Check your connection and try again.");
			return;
		}
		router.replace("/lock");
	}

	return (
		<section className={styles.section}>
			<h3 className={styles.sectionTitle}>Lock Osmo</h3>
			<p className={styles.note}>Signs this device out. You will unlock again with your fingerprint or face.</p>
			<button type="button" className={styles.action} onClick={() => void lock()}>
				Lock Osmo
			</button>
			{lockError && <p className={styles.error} role="alert">{lockError}</p>}
		</section>
	);
}
