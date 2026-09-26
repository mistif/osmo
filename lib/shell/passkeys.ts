// Every passkey call in one place, so a change to Supabase's passkey API is a small edit here.
import { supabase } from "../supabase";
import type { DeviceSource } from "./devices";

export const DEVICE_SAVE_FAILED = "This device couldn't save a passkey. You can try again from Settings.";

export function passkeysSupported(): boolean {
	return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

export async function unlockWithPasskey(): Promise<unknown | null> {
	try {
		const { error } = await supabase.auth.signInWithPasskey();
		return error;
	} catch (error) {
		return error;
	}
}

export async function unlockWithPassword(email: string, password: string): Promise<unknown | null> {
	try {
		const { error } = await supabase.auth.signInWithPassword({ email, password });
		return error;
	} catch (error) {
		return error;
	}
}

export async function rememberThisDevice(): Promise<unknown | null> {
	try {
		const { error } = await supabase.auth.registerPasskey();
		return error;
	} catch (error) {
		return error;
	}
}

export async function listDevices(): Promise<{ devices: DeviceSource[]; error: unknown | null }> {
	try {
		const { data, error } = await supabase.auth.passkey.list();
		return { devices: data ?? [], error };
	} catch (error) {
		return { devices: [], error };
	}
}

export async function renameDevice(id: string, name: string): Promise<unknown | null> {
	try {
		const { error } = await supabase.auth.passkey.update({ passkeyId: id, friendlyName: name.slice(0, 120) });
		return error;
	} catch (error) {
		return error;
	}
}

export async function removeDevice(id: string): Promise<unknown | null> {
	try {
		const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
		return error;
	} catch (error) {
		return error;
	}
}

export async function lockOsmo(): Promise<void> {
	await supabase.auth.signOut({ scope: "local" });
}
