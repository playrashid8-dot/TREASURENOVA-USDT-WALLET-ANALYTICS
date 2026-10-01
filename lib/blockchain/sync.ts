import {
  DEPOSIT_WALLET,
  RESERVE_FUND_WALLET,
  SYNC_KEY,
  USDT_CONTRACT_ADDRESS,
  WITHDRAW_WALLET,
  getPrimaryConfigError,
} from "@/lib/config";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { addressesEqual, normalizeAddress } from "@/lib/utils/addresses";
import { dateKeyUtc } from "@/lib/utils/dates";
import {
  scanUsdtTransfersToWallets,
} from "./logs";
import { checkRpcHealth, getLatestBlockNumber } from "./rpc";
import { acquireSyncLease } from "./sync-lock";
import {
  planSyncWindow,
  resolveNextCheckpoint,
  type SyncMode,
} from "./sync-plan";
import { getTokenInfo } from "./token";
import type { ValidatedTransfer } from "@/types/blockchain";
import { reconcileDailyStats } from "@/lib/analytics/aggregation";
import { SYNC_START_BLOCK } from "@/lib/config";

export interface SyncResult {
  ok: boolean;
  inserted: number;
  duplicatesSkipped: number;
  processed: number;
  /** Withdraw Wallet OUT rows seen in this run (history indexing). */
  withdrawOutFound: number;
  /** Newly inserted Withdraw Wallet OUT rows (not already in DB). */
  withdrawOutInserted: number;
  /** Withdraw Wallet OUT rows skipped as duplicates. */
  withdrawOutDuplicatesSkipped: number;
  /** Another worker holds the sync lease. */
  busy?: boolean;
  scanStartBlock: number | null;
  scanEndBlock: number | null;
  lastIndexedBlock: number | null;
  latestBlock: number | null;
  error?: string;
  configError?: string;
  errors: string[];
}

function emptySyncResult(
  patch: Partial<SyncResult> & { ok: boolean; error?: string; errors: string[] },
): SyncResult {
  return {
    inserted: 0,
    duplicatesSkipped: 0,
    processed: 0,
    withdrawOutFound: 0,
    withdrawOutInserted: 0,
    withdrawOutDuplicatesSkipped: 0,
    scanStartBlock: null,
    scanEndBlock: null,
    lastIndexedBlock: null,
    latestBlock: null,
    ...patch,
  };
}

function isWithdrawOutTransfer(t: ValidatedTransfer): boolean {
  return (
    t.walletType === "withdraw" &&
    addressesEqual(t.fromAddress, WITHDRAW_WALLET) &&
    !addressesEqual(t.toAddress, WITHDRAW_WALLET)
  );
}

async function getSyncState() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("sync_state")
    .select("*")
    .eq("sync_key", SYNC_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read sync_state: ${error.message}`);
  }
  return data;
}

async function upsertSyncState(patch: {
  last_indexed_block?: number;
  last_successful_sync?: string;
  last_error?: string | null;
  status?: string;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("sync_state").upsert(
    {
      sync_key: SYNC_KEY,
      updated_at: new Date().toISOString(),
      ...patch,
    },
    { onConflict: "sync_key" },
  );
  if (error) {
    console.error("[sync] Failed to update sync_state:", error.message);
  }
}

async function ensureWalletsSeeded(tokenContract: string, chainId: number) {
  const supabase = getSupabaseAdmin();
  const baseRows = [
    {
      address: normalizeAddress(DEPOSIT_WALLET),
      wallet_type: "deposit" as const,
      label: "Deposit Wallet",
      chain_id: chainId,
      token_contract: normalizeAddress(tokenContract),
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    {
      address: normalizeAddress(WITHDRAW_WALLET),
      wallet_type: "withdraw" as const,
      label: "Withdraw Wallet",
      chain_id: chainId,
      token_contract: normalizeAddress(tokenContract),
      is_active: true,
      updated_at: new Date().toISOString(),
    },
  ];

  const { error } = await supabase.from("wallets").upsert(baseRows, {
    onConflict: "address",
  });
  if (error) {
    console.warn("[sync] Wallet seed warning:", error.message);
  }

  if (!RESERVE_FUND_WALLET) return;

  const { error: reserveError } = await supabase.from("wallets").upsert(
    {
      address: normalizeAddress(RESERVE_FUND_WALLET),
      wallet_type: "reserve",
      label: "TREASURENOVA Reserve Fund",
      chain_id: chainId,
      token_contract: normalizeAddress(tokenContract),
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "address" },
  );
  if (reserveError) {
    console.warn(
      "[sync] Reserve wallet seed skipped (apply migration allowing wallet_type=reserve):",
      reserveError.message,
    );
  }
}

function toDbRow(t: ValidatedTransfer, walletTypeOverride?: string) {
  return {
    tx_hash: t.txHash,
    log_index: t.logIndex,
    wallet_address: t.walletAddress,
    wallet_type: walletTypeOverride ?? t.walletType,
    token_contract: t.tokenContract,
    from_address: t.fromAddress,
    to_address: t.toAddress,
    amount_raw: t.amountRaw,
    amount_usdt: t.amountUsdt,
    block_number: t.blockNumber,
    block_hash: t.blockHash,
    timestamp: t.timestamp,
    status: t.status,
    token_symbol: t.tokenSymbol,
    token_decimals: t.tokenDecimals,
    updated_at: new Date().toISOString(),
  };
}

async function upsertTransfers(
  transfers: ValidatedTransfer[],
): Promise<{ inserted: number; duplicatesSkipped: number }> {
  if (transfers.length === 0) {
    return { inserted: 0, duplicatesSkipped: 0 };
  }

  const supabase = getSupabaseAdmin();
  let inserted = 0;
  let duplicatesSkipped = 0;

  const chunkSize = 100;
  for (let i = 0; i < transfers.length; i += chunkSize) {
    const chunk = transfers.slice(i, i + chunkSize);
    let rows = chunk.map((t) => toDbRow(t));

    const hashes = chunk.map((t) => t.txHash);
    const { data: existing } = await supabase
      .from("transactions")
      .select("tx_hash, log_index, wallet_address")
      .in("tx_hash", hashes);

    const existingKeys = new Set(
      (existing ?? []).map(
        (e) =>
          `${e.tx_hash}:${e.log_index}:${normalizeAddress(e.wallet_address)}`,
      ),
    );

    for (const t of chunk) {
      const key = `${t.txHash}:${t.logIndex}:${t.walletAddress}`;
      if (existingKeys.has(key)) {
        duplicatesSkipped += 1;
      } else {
        inserted += 1;
      }
    }

    let { error } = await supabase.from("transactions").upsert(rows, {
      onConflict: "tx_hash,log_index,wallet_address",
      ignoreDuplicates: false,
    });

    // Pre-migration DBs only allow deposit|withdraw — store Reserve OUT as
    // wallet_type=withdraw with wallet_address=reserve (display uses from/to).
    if (
      error &&
      /wallet_type|check constraint/i.test(error.message) &&
      rows.some((r) => r.wallet_type === "reserve")
    ) {
      rows = chunk.map((t) =>
        toDbRow(t, t.walletType === "reserve" ? "withdraw" : undefined),
      );
      const retry = await supabase.from("transactions").upsert(rows, {
        onConflict: "tx_hash,log_index,wallet_address",
        ignoreDuplicates: false,
      });
      error = retry.error;
      if (!error) {
        console.warn(
          "[sync] Stored Reserve OUT with wallet_type=withdraw fallback — apply migration 20260929120000_allow_reserve_wallet_type.sql",
        );
      }
    }

    // If a mixed chunk still fails, upsert non-reserve then reserve-fallback
    // separately so Deposit/Withdraw rows are never dropped with Reserve.
    if (error && chunk.some((t) => t.walletType === "reserve")) {
      const nonReserve = chunk.filter((t) => t.walletType !== "reserve");
      const reserveOnly = chunk.filter((t) => t.walletType === "reserve");
      if (nonReserve.length > 0) {
        const a = await supabase.from("transactions").upsert(
          nonReserve.map((t) => toDbRow(t)),
          {
            onConflict: "tx_hash,log_index,wallet_address",
            ignoreDuplicates: false,
          },
        );
        if (a.error) {
          throw new Error(`Failed to upsert transactions: ${a.error.message}`);
        }
      }
      if (reserveOnly.length > 0) {
        const b = await supabase.from("transactions").upsert(
          reserveOnly.map((t) => toDbRow(t, "withdraw")),
          {
            onConflict: "tx_hash,log_index,wallet_address",
            ignoreDuplicates: false,
          },
        );
        if (b.error) {
          throw new Error(
            `Failed to upsert reserve transactions: ${b.error.message}`,
          );
        }
        console.warn(
          "[sync] Split-upserted Reserve OUT with wallet_type=withdraw fallback",
        );
      }
      error = null;
    }

    if (error) {
      throw new Error(`Failed to upsert transactions: ${error.message}`);
    }
  }

  return { inserted, duplicatesSkipped };
}

async function bumpDailyStats(transfers: ValidatedTransfer[]) {
  const dates = Array.from(
    new Set(transfers.map((t) => dateKeyUtc(t.timestamp))),
  );
  for (const date of dates) {
    await reconcileDailyStats(date);
  }
}

/**
 * Incremental / historical sync of USDT transfers for monitored wallets.
 * Near-head scans use BSC RPC eth_getLogs. The checkpoint moves only after
 * a block range is actually scanned. Empty external-indexer responses do not
 * count as success (handled in the log scanner).
 */
export async function runSync(options?: {
  fullHistory?: boolean;
  startBlock?: number;
  endBlock?: number;
  mode?: SyncMode;
  maxBlocksPerRun?: number;
}): Promise<SyncResult> {
  const startedAt = Date.now();
  console.log("[sync] Sync started");

  const configError = getPrimaryConfigError();
  if (configError) {
    console.error("[sync] Configuration error:", configError);
    return emptySyncResult({
      ok: false,
      configError,
      error: configError,
      errors: [configError],
    });
  }

  if (!isSupabaseConfigured()) {
    const error = "Supabase is not configured.";
    return emptySyncResult({
      ok: false,
      error,
      errors: [error],
    });
  }

  const mode: SyncMode = options?.fullHistory
    ? "full"
    : (options?.mode ?? "incremental");
  let leaseHeld = false;

  try {
    const health = await checkRpcHealth();
    if (
      !health.rpcConnected ||
      health.chainId !== Number(process.env.NEXT_PUBLIC_CHAIN_ID || 56)
    ) {
      const msg = health.error || "RPC unavailable or unexpected chain ID";
      throw new Error(
        `BSC RPC is required for historical sync (eth_getLogs): ${msg}`,
      );
    }

    const token = await getTokenInfo(USDT_CONTRACT_ADDRESS);
    console.log(
      `[sync] Token verified: ${token.symbol} decimals=${token.decimals}`,
    );

    await ensureWalletsSeeded(
      token.address,
      Number(process.env.NEXT_PUBLIC_CHAIN_ID || 56),
    );

    const latestBlock = await getLatestBlockNumber();
    const state = await getSyncState();
    const storedLastIndexed: number = Number(state?.last_indexed_block ?? 0);
    const targetedBackfill =
      options?.startBlock != null &&
      Number.isFinite(options.startBlock) &&
      options.startBlock > 0;

    const lookbackRaw = process.env.SYNC_LOOKBACK_BLOCKS;
    const lookback =
      lookbackRaw === undefined || lookbackRaw === ""
        ? 500_000
        : Number.parseInt(lookbackRaw, 10);

    let plan = planSyncWindow({
      lastIndexedBlock: mode === "full" ? 0 : storedLastIndexed,
      latestBlock,
      mode,
      maxBlocksPerRun: options?.maxBlocksPerRun,
      lookbackBlocks: Number.isFinite(lookback) ? lookback : 0,
      syncStartBlock: SYNC_START_BLOCK,
    });

    if (targetedBackfill) {
      const startBlock = Math.max(
        SYNC_START_BLOCK,
        Math.floor(options!.startBlock!),
      );
      const endBlock =
        options?.endBlock != null && Number.isFinite(options.endBlock)
          ? Math.min(latestBlock, Math.floor(options.endBlock))
          : latestBlock;
      plan = {
        shouldRun: startBlock <= endBlock,
        startBlock,
        endBlock,
        checkpointAllowed: true,
        reason: "targeted-backfill",
      };
      console.log(
        `[sync] Targeted backfill ${startBlock}→${endBlock} (stored last_indexed=${storedLastIndexed})`,
      );
    }

    console.log(
      `[sync] head=${latestBlock} previousIndexed=${storedLastIndexed} mode=${mode} plan=${plan.reason} target=${plan.startBlock}→${plan.endBlock} checkpointAllowed=${plan.checkpointAllowed}`,
    );

    if (!plan.shouldRun) {
      return {
        ok: true,
        inserted: 0,
        duplicatesSkipped: 0,
        processed: 0,
        withdrawOutFound: 0,
        withdrawOutInserted: 0,
        withdrawOutDuplicatesSkipped: 0,
        scanStartBlock: plan.startBlock,
        scanEndBlock: plan.endBlock,
        lastIndexedBlock: storedLastIndexed,
        latestBlock,
        errors: [],
      };
    }

    {
      const lease = await acquireSyncLease();
      if (!lease.acquired) {
        console.log("[sync] Lease held by another worker; skipping");
        return {
          ok: true,
          busy: true,
          inserted: 0,
          duplicatesSkipped: 0,
          processed: 0,
          withdrawOutFound: 0,
          withdrawOutInserted: 0,
          withdrawOutDuplicatesSkipped: 0,
          scanStartBlock: plan.startBlock,
          scanEndBlock: plan.endBlock,
          lastIndexedBlock: lease.lastIndexedBlock || storedLastIndexed,
          latestBlock,
          errors: [],
        };
      }
      leaseHeld = true;
    }

    const startBlock = plan.startBlock;
    const endBlock = plan.endBlock;
    let inserted = 0;
    let duplicatesSkipped = 0;
    let processed = 0;
    let withdrawOutFound = 0;
    let withdrawOutInserted = 0;
    let withdrawOutDuplicatesSkipped = 0;
    let logsFound = 0;
    let lastSuccessfulChunk: number | null = null;

    const scan = await scanUsdtTransfersToWallets({
      startBlock,
      endBlock,
      tokenDecimals: token.decimals,
      tokenSymbol: token.symbol,
      // The chain tip must use BSC RPC. A far-behind backfill may use SQD
      // first, because the configured RPC (publicnode) rejects historical
      // eth_getLogs with 403. A 204/empty indexer page still does not advance
      // the checkpoint; the scanner falls back to RPC.
      forceRpc:
        mode === "tip" ||
        targetedBackfill ||
        latestBlock - endBlock < 500,
      onProgress: ({ fromBlock, toBlock, logsFound: chunkLogs, chunkSize }) => {
        logsFound += chunkLogs;
        if (chunkLogs > 0 || toBlock % (chunkSize * 25) < chunkSize) {
          console.log(
            `[sync] blocks ${fromBlock}–${toBlock}: ${chunkLogs} log(s) (chunk=${chunkSize})`,
          );
        }
      },
      onChunkComplete: async ({ toBlock, transfers }) => {
        if (transfers.length > 0) {
          const uniqueMap = new Map<string, ValidatedTransfer>();
          for (const t of transfers) {
            uniqueMap.set(`${t.txHash}:${t.logIndex}:${t.walletAddress}`, t);
          }
          const unique = Array.from(uniqueMap.values());
          const outs = unique.filter(isWithdrawOutTransfer);
          withdrawOutFound += outs.length;

          if (outs.length > 0) {
            const supabase = getSupabaseAdmin();
            const { data: existingOuts } = await supabase
              .from("transactions")
              .select("tx_hash, log_index, wallet_address")
              .in(
                "tx_hash",
                outs.map((t) => t.txHash),
              );
            const existingOutKeys = new Set(
              (existingOuts ?? []).map(
                (e) =>
                  `${e.tx_hash}:${e.log_index}:${normalizeAddress(e.wallet_address)}`,
              ),
            );
            for (const t of outs) {
              const key = `${t.txHash}:${t.logIndex}:${t.walletAddress}`;
              if (existingOutKeys.has(key)) {
                withdrawOutDuplicatesSkipped += 1;
              } else {
                withdrawOutInserted += 1;
              }
            }
          }

          const result = await upsertTransfers(unique);
          inserted += result.inserted;
          duplicatesSkipped += result.duplicatesSkipped;
          processed += unique.length;
          await bumpDailyStats(unique);
        }

        lastSuccessfulChunk = toBlock;
        if (!plan.checkpointAllowed) {
          return;
        }
        const checkpoint = Math.max(toBlock, storedLastIndexed);
        await upsertSyncState({
          status: "syncing",
          last_indexed_block: checkpoint,
          last_error: null,
        });
      },
    });

    const scanComplete =
      scan.errors.length === 0 && scan.lastScannedBlock >= endBlock;
    const indexedBlock = resolveNextCheckpoint({
      stored: storedLastIndexed,
      startBlock,
      endBlock,
      lastSuccessfulChunk,
      scanComplete,
      checkpointAllowed: plan.checkpointAllowed,
    });

    if (mode === "full" || targetedBackfill) {
      await reconcileDailyStats();
    }

    if (plan.checkpointAllowed) {
      await upsertSyncState({
        status: scanComplete ? "synced" : "error",
        last_indexed_block: indexedBlock,
        last_successful_sync: scanComplete ? new Date().toISOString() : undefined,
        last_error: scan.errors.length
          ? scan.errors.slice(0, 5).join("; ")
          : null,
      });
    } else if (leaseHeld) {
      // Tip refresh must not jump the contiguous cursor, but it must release
      // the lease and record that a scan actually finished. Otherwise the
      // dashboard keeps a multi-day last_successful_sync while the head moves.
      await upsertSyncState({
        status: "synced",
        last_successful_sync: scanComplete
          ? new Date().toISOString()
          : undefined,
        last_error: scan.errors.length
          ? scan.errors.slice(0, 5).join("; ")
          : null,
      });
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[sync] done head=${latestBlock} previousIndexed=${storedLastIndexed} target=${startBlock}→${endBlock} blocksScanned=${Math.max(0, scan.lastScannedBlock - startBlock + 1)} logsFound=${logsFound} inserted=${inserted} skippedDuplicates=${duplicatesSkipped} rpcErrors=${scan.errors.length} retries=${scan.retries} durationMs=${durationMs} finalCheckpoint=${indexedBlock} scanComplete=${scanComplete}`,
    );

    return {
      ok: scanComplete,
      inserted,
      duplicatesSkipped,
      processed,
      withdrawOutFound,
      withdrawOutInserted,
      withdrawOutDuplicatesSkipped,
      scanStartBlock: startBlock,
      scanEndBlock: endBlock,
      lastIndexedBlock: indexedBlock,
      latestBlock,
      errors: scan.errors,
      error: scanComplete
        ? undefined
        : scan.errors[0] || "Scan did not reach the target block",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[sync] Sync failed:", message);
    if (leaseHeld) {
      try {
        await upsertSyncState({ status: "error", last_error: message });
      } catch {
        /* ignore */
      }
    }
    return emptySyncResult({
      ok: false,
      error: message,
      errors: [message],
    });
  }
}
