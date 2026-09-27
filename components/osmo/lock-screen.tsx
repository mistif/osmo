"use client";

import { Bricolage_Grotesque } from "next/font/google";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
	DEVICE_SAVE_FAILED,
	passkeysSupported,
	rememberThisDevice,
	unlockWithPasskey,
	unlockWithPassword,
} from "@/lib/shell/passkeys";
import { unlockMessage } from "@/lib/shell/unlock-errors";
import styles from "./lock.module.css";

const font = Bricolage_Grotesque({ subsets: ["latin"], display: "swap" });

type Step = "locked" | "password" | "remember" | "opening";

export function LockScreen() {
	const router = useRouter();
	const [step, setStep] = useState<Step>("locked");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [canPasskey, setCanPasskey] = useState(true);

	useEffect(() => {
		// Async work lives in a nested function: an effect callback can't be async itself.
		async function checkDevice() {
			const supported = passkeysSupported();
			setCanPasskey(supported);
			if (!supported) setStep("password");
			// Already unlocked on this device: go straight in.
			const { data } = await supabase.auth.getSession();
			if (data.session) router.replace("/");
		}
		checkDevice();
	}, [router]);

	function open() {
		// No error line stays visible through the bloom.
		setError(null);
		setStep("opening");
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		window.setTimeout(() => router.replace("/"), reduce ? 200 : 700);
	}

	async function withPasskey() {
		setBusy(true);
		setError(null);
		const failed = await unlockWithPasskey();
		setBusy(false);
		if (failed) setError(unlockMessage(failed, "passkey"));
		else open();
	}

	async function withPassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		const failed = await unlockWithPassword(email.trim(), password);
		setBusy(false);
		if (failed) {
			setError(unlockMessage(failed, "password"));
			return;
		}
		setPassword("");
		if (canPasskey) setStep("remember");
		else open();
	}

	async function remember() {
		setBusy(true);
		setError(null);
		const failed = await rememberThisDevice();
		setBusy(false);
		if (failed) setError(DEVICE_SAVE_FAILED);
		else open();
	}

	return (
		<main className={`${styles.lock} ${font.className} ${step === "opening" ? styles.opening : ""}`}>
			<div className={styles.inner}>
				<div className={styles.circle} aria-hidden="true" />
				<h1 className={styles.name}>Osmo</h1>

				{step === "locked" && (
					<>
						<button type="button" className={styles.primary} onClick={withPasskey} disabled={busy}>
							Unlock with fingerprint or face
						</button>
						<button type="button" className={styles.quiet} onClick={() => { setError(null); setStep("password"); }}>
							This device doesn&apos;t have my passkey
						</button>
					</>
				)}

				{step === "password" && (
					<form className={styles.form} onSubmit={withPassword}>
						<p className={styles.hint}>This device doesn&apos;t know you yet.</p>
						<input className={styles.field} type="email" autoComplete="email" placeholder="Email" aria-label="Email"
							value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
						<input className={styles.field} type="password" autoComplete="current-password" placeholder="Password" aria-label="Password"
							value={password} onChange={(e) => setPassword(e.target.value)} required />
						<button type="submit" className={styles.primary} disabled={busy}>Unlock</button>
						{canPasskey && (
							<button type="button" className={styles.quiet} onClick={() => { setError(null); setStep("locked"); }}>
								Use fingerprint or face instead
							</button>
						)}
					</form>
				)}

				{step === "remember" && (
					<>
						<p className={styles.hint}>Remember this device? Next time you can unlock with your fingerprint or face.</p>
						{error ? (
							// Distinct keys make Continue a new button, so autoFocus moves focus to it after an error.
							<button key="continue" type="button" className={styles.primary} onClick={open} autoFocus>Continue</button>
						) : (
							<button key="remember" type="button" className={styles.primary} onClick={remember} disabled={busy} autoFocus>Remember</button>
						)}
						{!error && (
							<button type="button" className={styles.quiet} onClick={open} disabled={busy}>Not now</button>
						)}
					</>
				)}

				{error && (
					<p className={styles.error} role="alert">{error}</p>
				)}
			</div>
		</main>
	);
}
