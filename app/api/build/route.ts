// Streams a component Osmo builds, as lines of JSON. All the logic is in lib/chat/build-handler.ts, where the tests can
// reach it (vitest only collects lib/**). Dark: 404 until OSMO_BUILD is on.

import { buildDeps, handleBuild } from "@/lib/chat/build-handler";

// A build streams for up to 60 seconds. Unverified: that Gur's plan allows 60 seconds and does not buffer small chunks
// (artifacts spec 15.5); check on the first deploy.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
	return handleBuild(request, buildDeps());
}
