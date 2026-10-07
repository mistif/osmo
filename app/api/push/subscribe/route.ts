// Saves this device's push subscription. The logic is in lib/actions/push-api.ts.
import { pushDeps, pushSubscribe } from "@/lib/actions/push-api";

export const POST = (request: Request): Promise<Response> => pushSubscribe(request, pushDeps());
