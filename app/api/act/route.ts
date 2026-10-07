// Answers a waiting confirmation from the room. All the logic is in lib/actions/act.ts, where the tests
// can reach it (vitest only collects lib/**). Every answer carries cache-control: no-store.

import { actDeps, handleAct } from "@/lib/actions/act";

// A confirmed action runs inside this request: a quick db write or one outside call.
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
	return handleAct(request, actDeps());
}
