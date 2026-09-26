import {
  DEPOSIT_WALLET,
  SYNC_KEY,
  USDT_CONTRACT_ADDRESS,
  WITHDRAW_WALLET,
  getPrimaryConfigError,
} from "@/lib/config";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { addressesEqual, normalizeAddress } from "@/lib/utils/addresses";
import { dateKeyUtc } from "@/lib/utils/dates";
import { getEtherscanLatestBlock } from "./etherscan";
import {
  resolveScanStartBlock,
  scanUsdtTransfersToWallets,
} from "./logs";
import { checkRpcHealth, getLatestBlockNumber } from "./rpc";
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
  const rows = [
    {
      address: normalizeAddress(DEPOSIT_WALLET),
      wallet_type: "deposit",
      label: "Deposit Wallet",
      chain_id: chainId,
      token_contract: normalizeAddress(tokenContract),
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    {
      address: normalizeAddress(WITHDRAW_WALLET),
      wallet_type: "withdraw",
      label: "Withdraw Wallet",
      chain_id: chainId,
      token_contract: normalizeAddress(tokenContract),
      is_active: true,
      updated_at: new Date().toISOString(),
    },
  ];

  const { error } = await supabase.from("wallets").upsert(rows, {
    onConflict: "address",
  });
  if (error) {
    console.warn("[sync] Wallet seed warning:", error.message);
  }
}

function toDbRow(t: ValidatedTransfer) {
  return {
    tx_hash: t.txHash,
    log_index: t.logIndex,
    wallet_address: t.walletAddress,
    wallet_type: t.walletType,
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
    const rows = chunk.map(toDbRow);

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

    const { error } = await supabase.from("transactions").upsert(rows, {
      onConflict: "tx_hash,log_index,wallet_address",
      ignoreDuplicates: false,
    });

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
 * Incremental / historical sync of USDT transfers for monitored wallets
 * via BSC RPC eth_getLogs (chunked, resumable).
 *
 * Optional startBlock/endBlock runs a targeted backfill for that inclusive
 * range without lowering sync_state when the tip is already ahead.
 */
export async function runSync(options?: {
  fullHistory?: boolean;
  startBlock?: number;
  endBlock?: number;
}): Promise<SyncResult> {
  console.log("[sync] Sync started");

  const emptyErrors: string[] = [];

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

  try {
    await upsertSyncState({ status: "syncing", last_error: null });

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

    let latestBlock: number | null = null;
    try {
      latestBlock = await getLatestBlockNumber();
    } catch {
      try {
        latestBlock = await getEtherscanLatestBlock();
      } catch (err) {
        console.warn("[sync] Could not resolve latest block:", err);
      }
    }

    if (latestBlock == null) {
      throw new Error("Could not resolve latest BSC block number via RPC.");
    }

    const state = await getSyncState();
    const storedLastIndexed: number = state?.last_indexed_block ?? 0;
    const targetedBackfill =
      options?.startBlock != null &&
      Number.isFinite(options.startBlock) &&
      options.startBlock > 0;

    const lastIndexed = options?.fullHistory ? 0 : storedLastIndexed;
    let startBlock = options?.fullHistory
      ? resolveScanStartBlock(0)
      : resolveScanStartBlock(lastIndexed);
    let endBlock = latestBlock;

    // First-time / full history: start within SYNC_LOOKBACK_BLOCKS of tip.
    // SQD Portal indexes the full range; eth_getLogs earliest-search is optional
    // (many public RPCs refuse archive getLogs). Set SYNC_LOOKBACK_BLOCKS=0 for
    // SYNC_START_BLOCK → tip. Incremental runs resume from sync_state.
    if (!targetedBackfill && (lastIndexed === 0 || options?.fullHistory)) {
      const lookbackRaw = process.env.SYNC_LOOKBACK_BLOCKS;
      const lookback =
        lookbackRaw === undefined || lookbackRaw === ""
          ? 500_000
          : Number.parseInt(lookbackRaw, 10);
      if (Number.isFinite(lookback) && lookback > 0) {
        startBlock = Math.max(SYNC_START_BLOCK, latestBlock - lookback);
        console.log(
          `[sync] First-time/full window: last ${lookback} blocks → start ${startBlock}`,
        );
      } else {
        startBlock = resolveScanStartBlock(0);
        console.log(
          `[sync] Full history from SYNC_START_BLOCK ${startBlock}`,
        );
      }
    }

    if (targetedBackfill) {
      startBlock = Math.max(SYNC_START_BLOCK, Math.floor(options!.startBlock!));
      if (options?.endBlock != null && Number.isFinite(options.endBlock)) {
        endBlock = Math.min(latestBlock, Math.floor(options.endBlock));
      }
      console.log(
        `[sync] Targeted backfill ${startBlock}→${endBlock} (stored last_indexed=${storedLastIndexed})`,
      );
    }

    console.log(
      `[sync] Scanning USDT Transfer logs blocks ${startBlock}→${endBlock} (SQD/RPC, resume from ${lastIndexed})`,
    );

    let inserted = 0;
    let duplicatesSkipped = 0;
    let processed = 0;
    let withdrawOutFound = 0;
    let withdrawOutInserted = 0;
    let withdrawOutDuplicatesSkipped = 0;
    const scanErrors: string[] = [...emptyErrors];
    let checkpointBlock = Math.max(0, startBlock - 1);

    const scan = await scanUsdtTransfersToWallets({
      startBlock,
      endBlock,
      tokenDecimals: token.decimals,
      tokenSymbol: token.symbol,
      onProgress: ({ fromBlock, toBlock, logsFound, chunkSize }) => {
        if (logsFound > 0 || toBlock % (chunkSize * 25) < chunkSize) {
          console.log(
            `[sync] blocks ${fromBlock}–${toBlock}: ${logsFound} log(s) (chunk=${chunkSize})`,
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

          // Pre-check OUT identities so insert vs duplicate counts stay accurate.
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

        checkpointBlock = toBlock;
        // Never lower the stored tip during a historical backfill window.
        const checkpoint = Math.max(toBlock, storedLastIndexed);
        await upsertSyncState({
          status: "syncing",
          last_indexed_block: checkpoint,
          last_error: null,
        });
      },
    });

    scanErrors.push(...scan.errors);

    // Always rebuild daily_stats from all indexed txs (paginated).
    // Prevents stale/partial day totals after chunked sync or a prior
    // unpaginated reconcile that truncated at Supabase's 1000-row cap.
    await reconcileDailyStats();

    const indexedBlock = Math.max(
      checkpointBlock,
      scan.lastScannedBlock,
      storedLastIndexed,
      targetedBackfill ? storedLastIndexed : endBlock,
    );

    await upsertSyncState({
      status: "synced",
      last_indexed_block: indexedBlock,
      last_successful_sync: new Date().toISOString(),
      last_error: scanErrors.length > 0 ? scanErrors.slice(0, 5).join("; ") : null,
    });

    console.log(
      `[sync] Sync completed: processed=${processed} inserted=${inserted} duplicatesSkipped=${duplicatesSkipped} withdrawOutFound=${withdrawOutFound} withdrawOutInserted=${withdrawOutInserted} lastIndexedBlock=${indexedBlock} latestBlock=${latestBlock} errors=${scanErrors.length}`,
    );

    return {
      ok: true,
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
      errors: scanErrors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[sync] Sync failed:", message);
    try {
      await upsertSyncState({ status: "error", last_error: message });
    } catch {
      /* ignore */
    }
    return emptySyncResult({
      ok: false,
      error: message,
      errors: [message],
    });
  }
}
