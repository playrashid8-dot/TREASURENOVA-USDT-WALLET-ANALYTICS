import { runSync } from "@/lib/blockchain/sync";
import { SYNC_KEY } from "@/lib/config";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { getLatestBlockNumber } from "@/lib/blockchain/rpc";
import {
  FAST_INCREMENTAL_MAX_LAG,
  REQUEST_BACKFILL_BLOCKS,
} from "@/lib/blockchain/sync-plan";

/**
 * Bring Recent TX in line with the BSC head.
 * Small gaps are scanned contiguously and checkpointed before the API reads.
 * Large gaps refresh the chain tip (no checkpoint jump) and also walk a
 * bounded contiguous chunk so last_indexed_block actually advances.
 * A daily cron cannot close a multi-hundred-thousand block gap by itself.
 */
export async function ensureFreshIncrementalSync(
  reason = "api",
): Promise<{ ran: boolean; lag: number | null; mode: "none" | "incremental" | "tip" }> {
  if (!isSupabaseConfigured()) {
    return { ran: false, lag: null, mode: "none" };
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: state } = await supabase
      .from("sync_state")
      .select("last_indexed_block, updated_at, status")
      .eq("sync_key", SYNC_KEY)
      .maybeSingle();

    let latest: number | null = null;
    try {
      latest = await getLatestBlockNumber();
    } catch (err) {
      console.warn(
        "[catch-up] latest block unavailable:",
        err instanceof Error ? err.message : err,
      );
      return { ran: false, lag: null, mode: "none" };
    }

    const indexed = Number(state?.last_indexed_block ?? 0);
    const lag = Math.max(0, latest - indexed);
    if (lag <= 0) {
      return { ran: false, lag, mode: "none" };
    }

    if (lag <= FAST_INCREMENTAL_MAX_LAG) {
      console.info(
        `[catch-up] incremental sync (${reason}) lag=${lag} indexed=${indexed} head=${latest}`,
      );
      const result = await runSync({
        mode: "incremental",
        maxBlocksPerRun: FAST_INCREMENTAL_MAX_LAG,
      });
      console.info(
        `[catch-up] incremental done ok=${result.ok} busy=${Boolean(result.busy)} inserted=${result.inserted} checkpoint=${result.lastIndexedBlock}`,
      );
      return { ran: true, lag, mode: "incremental" };
    }

    console.info(
      `[catch-up] tip plus backfill (${reason}) lag=${lag} indexed=${indexed} head=${latest}`,
    );
    const tip = await runSync({ mode: "tip" });
    console.info(
      `[catch-up] tip done ok=${tip.ok} busy=${Boolean(tip.busy)} inserted=${tip.inserted} checkpoint=${tip.lastIndexedBlock}`,
    );
    if (tip.busy) {
      return { ran: false, lag, mode: "tip" };
    }
    const backfill = await runSync({
      mode: "incremental",
      maxBlocksPerRun: REQUEST_BACKFILL_BLOCKS,
    });
    console.info(
      `[catch-up] backfill done ok=${backfill.ok} busy=${Boolean(backfill.busy)} inserted=${backfill.inserted} checkpoint=${backfill.lastIndexedBlock}`,
    );
    return { ran: true, lag, mode: "tip" };
  } catch (err) {
    console.error(
      "[catch-up] failed:",
      err instanceof Error ? err.message : err,
    );
    return { ran: false, lag: null, mode: "none" };
  }
}

/**
 * @deprecated Fire-and-forget catch-up skipped lags under 500 blocks and did
 * not finish before the API responded. Use ensureFreshIncrementalSync.
 */
export function maybeCatchUpSync(reason = "api"): void {
  void ensureFreshIncrementalSync(reason);
}
