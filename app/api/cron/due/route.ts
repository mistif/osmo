// Called once a minute by the timer in Supabase when a reminder is due (spec 7.3). All the logic is in
// lib/actions/due.ts, where the tests can reach it (vitest only collects lib/**).
import { dueDeps, handleDue } from "@/lib/actions/due";

export const maxDuration = 30;

export const POST = (request: Request): Promise<Response> => handleDue(request, dueDeps());
