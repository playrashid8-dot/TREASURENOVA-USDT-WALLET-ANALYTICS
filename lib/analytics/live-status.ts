import type { RecentTransactionsResponse } from "@/types/analytics";

type LiveStatus = RecentTransactionsResponse["liveStatus"];

const STALE_SYNC_MS = 5 * 60_000;
/** Block lag above this is treated as SYNCING (historical catch-up). */
const SYNCING_LAG_BLOCKS = 1_000;
/** Block lag above this (with a recent sync timestamp) is STALE. */
const STALE_LAG_BLOCKS = 100;

/**
 * Derive dashboard LIVE / SYNCING / STALE / ERROR from indexer + RPC health.
 * Never claims LIVE when the indexer is behind or last sync is old.
 */
export function deriveLiveStatus(input: {
  indexer: "SYNCED" | "SYNCING" | "ERROR" | "IDLE";
  database: "CONNECTED" | "ERROR";
  blockchain: "CONNECTED" | "DEGRADED" | "OFFLINE";
  latestBlock: number | null;
  indexedBlock: number | null;
  lastSuccessfulSync: string | null;
  isHistoricalSyncing: boolean;
  configError?: string | null;
}): LiveStatus {
  if (input.configError || input.database === "ERROR") {
    return "ERROR";
  }
  if (input.indexer === "ERROR" || input.blockchain === "OFFLINE") {
    return "ERROR";
  }
  if (input.indexer === "SYNCING" || input.isHistoricalSyncing) {
    return "SYNCING";
  }

  const lag =
    input.latestBlock != null && input.indexedBlock != null
      ? Math.max(0, input.latestBlock - input.indexedBlock)
      : null;

  if (lag != null && lag > SYNCING_LAG_BLOCKS) {
    return "SYNCING";
  }

  const syncAgeMs = input.lastSuccessfulSync
    ? Date.now() - new Date(input.lastSuccessfulSync).getTime()
    : null;

  if (
    syncAgeMs == null ||
    Number.isNaN(syncAgeMs) ||
    syncAgeMs > STALE_SYNC_MS ||
    (lag != null && lag > STALE_LAG_BLOCKS)
  ) {
    return "STALE";
  }

  if (input.blockchain === "DEGRADED") {
    return "STALE";
  }

  return "LIVE";
}

export function blockLag(
  latestBlock: number | null,
  indexedBlock: number | null,
): number | null {
  if (latestBlock == null || indexedBlock == null) return null;
  return Math.max(0, latestBlock - indexedBlock);
}
