import {
  buildDashboardPayload,
} from "@/lib/api/dashboard-data";
import {
  enforceRateLimit,
  jsonError,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "dashboard", 60, 60_000);
  if (!limited.ok) return limited.response;

  try {
    const { searchParams } = new URL(request.url);
    const data = await buildDashboardPayload(searchParams);
    return withRateLimitHeaders(jsonOk(data), limited.result);
  } catch (err) {
    console.error("[api/dashboard]", err);
    return jsonError("Blockchain data temporarily unavailable.", 503);
  }
}
