import { SYNC_SECRET } from "@/lib/config";
import { runSync } from "@/lib/blockchain/sync";
import { runReconciliationCheck } from "@/lib/analytics/aggregation";
import { recentTxCacheHeaders } from "@/lib/analytics/recent-refresh";
import {
  enforceRateLimit,
  jsonError,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 300;

function unauthorized() {
  return jsonError("Unauthorized", 401);
}

function authorize(request: Request): boolean {
  if (!SYNC_SECRET && !process.env.CRON_SECRET) return false;
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const headerSecret = request.headers.get("x-sync-secret") || "";
  const provided = bearer || headerSecret;
  if (!provided) return false;
  if (SYNC_SECRET && provided === SYNC_SECRET) return true;
  const cronSecret = process.env.CRON_SECRET || "";
  return Boolean(cronSecret) && provided === cronSecret;
}

/**
 * Scheduled incremental sync (Vercel Cron sends GET with Bearer CRON_SECRET).
 * Hobby plans only allow a once-daily cron, so the dashboard poll is the
 * near-real-time path. This job indexes the chain tip, then a bounded
 * contiguous chunk. It does not run a full historical scan in one invocation.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "sync", 12, 60_000);
  if (!limited.ok) return limited.response;
  if (!SYNC_SECRET && !process.env.CRON_SECRET) {
    return jsonError(
      "SYNC_SECRET is not configured. Sync is disabled over HTTP.",
      503,
    );
  }
  if (!authorize(request)) return unauthorized();

  try {
    const tip = await runSync({ mode: "tip" });
    const incremental = await runSync({
      mode: "incremental",
      maxBlocksPerRun: 2_000,
    });
    const response = withRateLimitHeaders(
      jsonOk({ tip, incremental }),
      limited.result,
    );
    for (const [key, value] of Object.entries(recentTxCacheHeaders())) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("[api/sync]", err);
    return jsonError(err instanceof Error ? err.message : "Sync failed", 500);
  }
}

/**
 * Protected sync endpoint.
 * Requires header: Authorization: Bearer <SYNC_SECRET>
 * or x-sync-secret: <SYNC_SECRET>
 * Body { fullHistory: true } runs historical sync. Default is incremental.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "sync", 12, 60_000);
  if (!limited.ok) return limited.response;

  if (!SYNC_SECRET) {
    return jsonError(
      "SYNC_SECRET is not configured. Sync is disabled over HTTP.",
      503,
    );
  }

  if (!authorize(request)) return unauthorized();

  try {
    let body: { fullHistory?: boolean; reconcile?: boolean } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }

    const result = body.fullHistory
      ? await runSync({
          fullHistory: true,
          maxBlocksPerRun: 20_000,
        })
      : await runSync({ mode: "incremental", maxBlocksPerRun: 2_000 });

    if (body.reconcile) {
      try {
        await runReconciliationCheck();
      } catch (err) {
        console.error("[api/sync] reconciliation failed", err);
      }
    }

    const response = withRateLimitHeaders(jsonOk(result), limited.result);
    for (const [key, value] of Object.entries(recentTxCacheHeaders())) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("[api/sync]", err);
    return jsonError(
      err instanceof Error ? err.message : "Sync failed",
      500,
    );
  }
}
