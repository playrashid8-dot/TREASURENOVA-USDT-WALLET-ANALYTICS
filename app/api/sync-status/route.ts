import { buildSyncStatusPayload } from "@/lib/api/dashboard-data";
import {
  enforceRateLimit,
  jsonError,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "sync-status", 60, 60_000);
  if (!limited.ok) return limited.response;

  try {
    const data = await buildSyncStatusPayload();
    return withRateLimitHeaders(jsonOk(data), limited.result);
  } catch (err) {
    console.error("[api/sync-status]", err);
    return jsonError("Blockchain data temporarily unavailable.", 503);
  }
}
