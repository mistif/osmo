// The public VAPID key, for the signed-in owner only. The logic is in lib/actions/push-api.ts.
import { pushDeps, pushKey } from "@/lib/actions/push-api";

export const GET = (request: Request): Promise<Response> => pushKey(request, pushDeps());
