// Osmo's AI conversation. All the logic is in lib/chat/handler.ts, where the tests can reach it
// (vitest only collects lib/**). Every answer carries cache-control: no-store.

import { chatDeps, handleChat } from "@/lib/chat/handler";

// OpenAI gets 10 seconds; the rest is a few quick ledger reads and writes.
export const maxDuration = 20;

export async function GET(request: Request): Promise<Response> {
	return handleChat(request, chatDeps());
}

export async function POST(request: Request): Promise<Response> {
	return handleChat(request, chatDeps());
}
