/**
 * Pure sync planning and checkpoint rules.
 * Incremental sync must follow the chain head without skipping unscanned blocks.
 */

export const REORG_OVERLAP_BLOCKS = 5;

/** Lag at or below this is awaited on the Recent TX request (one small eth_getLogs). */
export const FAST_INCREMENTAL_MAX_LAG = 300;

/** When the contiguous checkpoint is far behind, index only this many head blocks for display. */
export const TIP_SCAN_BLOCKS = 48;

/** Contiguous catch-up budget per invocation so a killed worker can resume. */
export const DEFAULT_BLOCKS_PER_RUN = 2_000;

/**
 * Blocks the Recent TX request walks forward from the checkpoint when the
 * gap is larger than a fast incremental sync. The tip is scanned separately
 * so new transfers are not stuck behind this backfill.
 */
export const REQUEST_BACKFILL_BLOCKS = 2_000;

/** Lease expires so a crashed serverless invocation cannot block sync forever. */
export const SYNC_LEASE_TTL_SECONDS = 120;

export type SyncMode = "incremental" | "tip" | "full";

export interface SyncWindowPlan {
  shouldRun: boolean;
  startBlock: number;
  endBlock: number;
  /**
   * When false (gapped tip refresh), inserts are allowed but last_indexed_block
   * must stay put so the contiguous cursor is not jumped forward.
   */
  checkpointAllowed: boolean;
  reason: string;
}

export function planSyncWindow(input: {
  lastIndexedBlock: number;
  latestBlock: number;
  mode: SyncMode;
  overlap?: number;
  maxBlocksPerRun?: number;
  lookbackBlocks?: number;
  syncStartBlock?: number;
}): SyncWindowPlan {
  const overlap = input.overlap ?? REORG_OVERLAP_BLOCKS;
  const latest = Math.floor(input.latestBlock);
  const stored = Math.max(0, Math.floor(input.lastIndexedBlock));
  const syncStart = Math.max(0, Math.floor(input.syncStartBlock ?? 0));
  const budget = input.maxBlocksPerRun ?? DEFAULT_BLOCKS_PER_RUN;

  if (!Number.isFinite(latest) || latest <= 0) {
    return {
      shouldRun: false,
      startBlock: 0,
      endBlock: 0,
      checkpointAllowed: false,
      reason: "latest-block-unavailable",
    };
  }

  if (input.mode === "tip" && stored > 0 && latest - stored > FAST_INCREMENTAL_MAX_LAG) {
    const startBlock = Math.max(syncStart, latest - TIP_SCAN_BLOCKS + 1);
    return {
      shouldRun: startBlock <= latest,
      startBlock,
      endBlock: latest,
      checkpointAllowed: false,
      reason: "tip-refresh-without-advancing-checkpoint",
    };
  }

  let startBlock: number;
  if (stored <= 0 || input.mode === "full") {
    const lookback = input.lookbackBlocks ?? 0;
    if (Number.isFinite(lookback) && lookback > 0) {
      startBlock = Math.max(syncStart, latest - lookback);
    } else {
      startBlock = Math.max(syncStart, 0);
    }
  } else if (stored > latest) {
    // Head moved backwards (reorg / RPC lag). Re-scan the tip; do not lower the cursor.
    startBlock = Math.max(0, latest - overlap);
  } else {
    startBlock = Math.max(0, stored - overlap);
  }

  if (startBlock > latest) {
    return {
      shouldRun: false,
      startBlock,
      endBlock: latest,
      checkpointAllowed: true,
      reason: "caught-up",
    };
  }

  // Already at head: nothing new to index. Overlap re-scan runs only when head moves.
  if (input.mode !== "full" && stored > 0 && stored >= latest && stored <= latest) {
    return {
      shouldRun: false,
      startBlock,
      endBlock: latest,
      checkpointAllowed: true,
      reason: "caught-up",
    };
  }

  let endBlock = latest;
  // Full history scans through to the head unless the caller sets a budget.
  // Incremental runs are always capped so a killed invocation can resume.
  const cap =
    input.mode === "full" ? input.maxBlocksPerRun : budget;
  if (
    input.mode !== "tip" &&
    cap != null &&
    Number.isFinite(cap) &&
    cap > 0
  ) {
    endBlock = Math.min(latest, startBlock + Math.floor(cap) - 1);
  }

  const lag = Math.max(0, latest - stored);
  return {
    shouldRun: startBlock <= endBlock,
    startBlock,
    endBlock,
    checkpointAllowed: true,
    reason: lag > 0 ? `incremental-lag-${lag}` : "scan",
  };
}

/**
 * Checkpoint advances only through blocks that were actually scanned.
 * A failed or partial range never jumps last_indexed_block to the chain head.
 */
export function resolveNextCheckpoint(input: {
  stored: number;
  startBlock: number;
  endBlock: number;
  lastSuccessfulChunk: number | null;
  scanComplete: boolean;
  checkpointAllowed: boolean;
}): number {
  const stored = Math.max(0, Math.floor(input.stored));
  if (!input.checkpointAllowed) {
    return stored;
  }
  if (!input.scanComplete) {
    if (
      input.lastSuccessfulChunk == null ||
      input.lastSuccessfulChunk < input.startBlock
    ) {
      return stored;
    }
    return Math.max(stored, Math.floor(input.lastSuccessfulChunk));
  }
  return Math.max(stored, Math.floor(input.endBlock));
}

/**
 * External indexers (SQD and similar): HTTP 204, an empty body, or a
 * non-200 response does NOT prove the block range contains no USDT logs.
 * Canonical confirmation is BSC RPC eth_getLogs.
 * An empty eth_getLogs response (after a successful RPC call) does confirm
 * the range — that case is not handled here.
 */
export function externalPageConfirmsRange(
  httpStatus: number,
  blockCount: number,
): boolean {
  if (httpStatus !== 200) return false;
  if (!Number.isFinite(blockCount) || blockCount <= 0) return false;
  return true;
}

export function redactRpcUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "rpc";
  }
}
