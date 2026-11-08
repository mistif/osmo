// Osmo's AI conversation. All the logic is in lib/chat/handler.ts, where the tests can reach it
// (vitest only collects lib/**). Every answer carries cache-control: no-store.

import { chatDeps, handleChat } from "@/lib/chat/handler";

// A turn with a result makes two OpenAI calls of up to 10 seconds each; the rest is a few quick ledger reads and
// writes. Unverified for Gur's plan: see the connectors spec, 16.3.
export const maxDuration = 40;

export async function GET(request: Request): Promise<Response> {
	return handleChat(request, chatDeps());
}

export async function POST(request: Request): Promise<Response> {
	return handleChat(request, chatDeps());
}
