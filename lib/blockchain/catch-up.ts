import { runSync } from "@/lib/blockchain/sync";
import { SYNC_KEY } from "@/lib/config";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { getLatestBlockNumber } from "@/lib/blockchain/rpc";

/** Catch up when lag or sync age exceeds these thresholds. */
const LAG_TRIGGER_BLOCKS = 500;
const STALE_TRIGGER_MS = 5 * 60_000;
/** Do not start overlapping catch-up runs. */
const MIN_CATCHUP_GAP_MS = 30_000;

let catchUpInFlight: Promise<void> | null = null;
let lastCatchUpAttemptMs = 0;

/**
 * Fire-and-forget incremental sync when the indexer has fallen behind.
 * Safe to call from read APIs — never blocks the response path for long.
 * Does not fabricate transactions; only indexes real on-chain Transfers.
 */
export function maybeCatchUpSync(reason = "api"): void {
  if (!isSupabaseConfigured()) return;

  const now = Date.now();
  if (catchUpInFlight) return;
  if (now - lastCatchUpAttemptMs < MIN_CATCHUP_GAP_MS) return;

  lastCatchUpAttemptMs = now;
  catchUpInFlight = (async () => {
    try {
      const supabase = getSupabaseAdmin();
      const { data: state } = await supabase
        .from("sync_state")
        .select("last_indexed_block, last_successful_sync, status")
        .eq("sync_key", SYNC_KEY)
        .maybeSingle();

      if (state?.status === "syncing") return;

      let latest: number | null = null;
      try {
        latest = await getLatestBlockNumber();
      } catch {
        return;
      }

      const indexed = Number(state?.last_indexed_block ?? 0);
      const lag = latest != null ? Math.max(0, latest - indexed) : 0;
      const syncAgeMs = state?.last_successful_sync
        ? now - new Date(state.last_successful_sync).getTime()
        : Number.POSITIVE_INFINITY;

      if (lag < LAG_TRIGGER_BLOCKS && syncAgeMs < STALE_TRIGGER_MS) {
        return;
      }

      console.info(
        `[catch-up] starting incremental sync (${reason}) lag=${lag} syncAgeMs=${Math.round(syncAgeMs)}`,
      );
      const result = await runSync();
      console.info(
        `[catch-up] done ok=${result.ok} inserted=${result.inserted} lastIndexed=${result.lastIndexedBlock}`,
      );
    } catch (err) {
      console.error(
        "[catch-up] failed:",
        err instanceof Error ? err.message : err,
      );
    } finally {
      catchUpInFlight = null;
    }
  })();
}
