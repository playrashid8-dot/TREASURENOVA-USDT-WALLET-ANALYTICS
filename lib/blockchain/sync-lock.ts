import { SYNC_KEY } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { SYNC_LEASE_TTL_SECONDS } from "./sync-plan";

export interface SyncLease {
  acquired: boolean;
  lastIndexedBlock: number;
}

/**
 * Compare-and-update lease on sync_state.
 * Prefers the Postgres function (row lock) and falls back to a single
 * conditional UPDATE, which is atomic under Read Committed.
 * In-memory flags are not used — serverless isolates do not share them.
 */
export async function acquireSyncLease(
  ttlSeconds = SYNC_LEASE_TTL_SECONDS,
): Promise<SyncLease> {
  const supabase = getSupabaseAdmin();

  const rpc = await supabase.rpc("acquire_sync_lease", {
    p_sync_key: SYNC_KEY,
    p_ttl_seconds: ttlSeconds,
  });

  if (!rpc.error && rpc.data && typeof rpc.data === "object") {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    if (row && typeof row.acquired === "boolean") {
      return {
        acquired: row.acquired,
        lastIndexedBlock: Number(row.last_indexed_block) || 0,
      };
    }
  }

  if (rpc.error && !isMissingRpc(rpc.error.message)) {
    console.warn("[sync] acquire_sync_lease rpc failed, using compare-and-update:", rpc.error.message);
  }

  return acquireViaCompareAndUpdate(ttlSeconds);
}

function isMissingRpc(message: string): boolean {
  return /PGRST202|could not find the function|schema cache|404/i.test(message);
}

async function acquireViaCompareAndUpdate(ttlSeconds: number): Promise<SyncLease> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - ttlSeconds * 1000).toISOString();

  const { data: existing, error: readError } = await supabase
    .from("sync_state")
    .select("last_indexed_block, status")
    .eq("sync_key", SYNC_KEY)
    .maybeSingle();

  if (readError) {
    throw new Error(`Failed to read sync_state: ${readError.message}`);
  }

  if (!existing) {
    const { error: insertError } = await supabase.from("sync_state").insert({
      sync_key: SYNC_KEY,
      last_indexed_block: 0,
      status: "syncing",
      last_error: null,
      updated_at: nowIso,
    });
    if (!insertError) {
      return { acquired: true, lastIndexedBlock: 0 };
    }
  }

  const { data, error } = await supabase
    .from("sync_state")
    .update({
      status: "syncing",
      last_error: null,
      updated_at: nowIso,
    })
    .eq("sync_key", SYNC_KEY)
    .or(`status.neq.syncing,updated_at.lt."${staleIso}"`)
    .select("last_indexed_block");

  if (error) {
    throw new Error(`Failed to acquire sync lease: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    return {
      acquired: false,
      lastIndexedBlock: Number(existing?.last_indexed_block) || 0,
    };
  }

  return {
    acquired: true,
    lastIndexedBlock: Number(row.last_indexed_block) || 0,
  };
}
