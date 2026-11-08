// Sends a test push to every saved device. The logic is in lib/actions/push-api.ts.
import { pushDeps, pushTest } from "@/lib/actions/push-api";

export const POST = (request: Request): Promise<Response> => pushTest(request, pushDeps());
