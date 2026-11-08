// Osmo's will (spec docs/superpowers/specs/2026-10-11-osmo-free-will-design.md section 5). All the logic is in
// lib/chat/will.ts, where the tests reach it. Every answer carries cache-control: no-store.
import { chatDeps } from "@/lib/chat/handler";
import { handleWill } from "@/lib/chat/will";

// One model call of up to 10 seconds and a few quick ledger reads and writes.
export const maxDuration = 20;

export async function POST(request: Request): Promise<Response> {
	return handleWill(request, chatDeps());
}
