/** Recent TX poll interval. Faster than the 20s wallet refresh so new BSC blocks show up quickly. */
export const RECENT_TX_POLL_MS = 8_000;

/**
 * Polling is mandatory. Supabase Realtime is an additional signal when the
 * publishable key is configured and the table is in the publication.
 * The dashboard must keep updating when Realtime is disabled.
 */
export function recentTxRefreshStrategy(realtimeConfigured: boolean): {
  poll: true;
  pollMs: number;
  realtime: boolean;
} {
  return {
    poll: true,
    pollMs: RECENT_TX_POLL_MS,
    realtime: realtimeConfigured,
  };
}

export function recentTxCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}
