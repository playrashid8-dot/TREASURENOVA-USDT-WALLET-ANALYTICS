import { SYNC_SECRET } from "@/lib/config";
import { runSync } from "@/lib/blockchain/sync";
import { runReconciliationCheck } from "@/lib/analytics/aggregation";
import {
  enforceRateLimit,
  jsonError,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Protected incremental sync endpoint.
 * Requires header: Authorization: Bearer <SYNC_SECRET>
 * or x-sync-secret: <SYNC_SECRET>
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "sync", 6, 60_000);
  if (!limited.ok) return limited.response;

  if (!SYNC_SECRET) {
    return jsonError(
      "SYNC_SECRET is not configured. Sync is disabled over HTTP.",
      503,
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const headerSecret = request.headers.get("x-sync-secret") || "";
  const provided = bearer || headerSecret;

  if (!provided || provided !== SYNC_SECRET) {
    return jsonError("Unauthorized", 401);
  }

  try {
    let body: { fullHistory?: boolean; reconcile?: boolean } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }

    const result = await runSync({ fullHistory: Boolean(body.fullHistory) });

    if (body.reconcile) {
      try {
        await runReconciliationCheck();
      } catch (err) {
        console.error("[api/sync] reconciliation failed", err);
      }
    }

    return withRateLimitHeaders(jsonOk(result), limited.result);
  } catch (err) {
    console.error("[api/sync]", err);
    return jsonError(
      err instanceof Error ? err.message : "Sync failed",
      500,
    );
  }
}
