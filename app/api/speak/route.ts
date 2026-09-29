// Osmo's cloud voice. All the logic is in lib/server/speak.ts, where the tests can reach it
// (vitest only collects lib/**). POST is never cached by Next, which is what we want here.

import { handleSpeak, speakDeps } from "@/lib/server/speak";

export async function POST(request: Request): Promise<Response> {
	return handleSpeak(request, speakDeps());
}
