// Saves a thing Osmo built. All the logic is in lib/artifacts/save.ts, where the tests can reach it (vitest only collects lib/**).
// Dark: 404 until OSMO_BUILD and OSMO_ACTIONS are on.

import { handleArtifacts, saveDeps } from "@/lib/artifacts/save";

// One compile and two small writes.
export const maxDuration = 20;

export async function POST(request: Request): Promise<Response> {
	return handleArtifacts(request, saveDeps());
}
