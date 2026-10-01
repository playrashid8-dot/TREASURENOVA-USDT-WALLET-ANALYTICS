import {
  DEPOSIT_WALLET,
  RESERVE_FUND_WALLET,
  SYNC_KEY,
  USDT_CONTRACT_ADDRESS,
  WITHDRAW_WALLET,
  getPrimaryConfigError,
} from "@/lib/config";
import {
  RECENT_TX_LIMIT,
  applyRecentTxQuery,
  recentTxAmountMeetsMinimum,
  selectRecentTxFeed,
} from "@/lib/analytics/filters";
import { recentTxCacheHeaders } from "@/lib/analytics/recent-refresh";
import { blockLag, deriveLiveStatus } from "@/lib/analytics/live-status";
import { buildSyncStatusPayload } from "@/lib/api/dashboard-data";
import {
  enforceRateLimit,
  jsonError,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";
import { ensureFreshIncrementalSync } from "@/lib/blockchain/catch-up";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/utils/addresses";
import type {
  RecentTransactionsResponse,
  TransactionRow,
  WalletCardType,
} from "@/types/analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/**
 * Per-wallet fetch cap after the DB amount floor.
 * Each wallet is queried independently so a busy Reserve Fund cannot crowd
 * Deposit/Withdraw out of a single shared LIMIT buffer.
 * Final global cap is still RECENT_TX_LIMIT (10) after merge/dedupe/sort.
 */
const PER_WALLET_FETCH = 40;

const DEBUG_RECENT_TX = process.env.RECENT_TX_DEBUG === "1";

type DbTxRow = {
  id: string;
  tx_hash: string;
  log_index: number;
  wallet_address: string;
  wallet_type: string;
  token_contract: string;
  from_address: string;
  to_address: string;
  amount_raw: string;
  amount_usdt: number | string;
  block_number: number | string;
  block_hash: string | null;
  timestamp: string;
  status: string;
  token_symbol: string;
  token_decimals: number;
};

function mapDbRow(r: DbTxRow): Omit<TransactionRow, "walletType"> & {
  walletType: TransactionRow["walletType"];
} {
  return {
    id: r.id,
    txHash: r.tx_hash,
    logIndex: r.log_index,
    walletAddress: r.wallet_address,
    walletType: r.wallet_type as TransactionRow["walletType"],
    tokenContract: r.token_contract,
    fromAddress: r.from_address,
    toAddress: r.to_address,
    amountRaw: r.amount_raw,
    amountUsdt: Number(r.amount_usdt) || 0,
    blockNumber: Number(r.block_number),
    blockHash: r.block_hash,
    timestamp: r.timestamp,
    status: r.status,
    tokenSymbol: r.token_symbol,
    tokenDecimals: r.token_decimals,
  };
}

/**
 * Fetch qualifying rows for one wallet independently (IN + OUT).
 * Filter order: success → USDT token → amount >= 10000 → wallet IN|OUT →
 * newest first → per-wallet buffer (never global LIMIT 10 here).
 * Final global cap is RECENT_TX_LIMIT after merge.
 */
async function fetchWalletRecentCandidates(
  walletType: WalletCardType,
  token: string,
): Promise<{ rows: ReturnType<typeof mapDbRow>[]; found: number; ge10k: number }> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("transactions")
    .select(
      "id, tx_hash, log_index, wallet_address, wallet_type, token_contract, from_address, to_address, amount_raw, amount_usdt, block_number, block_hash, timestamp, status, token_symbol, token_decimals",
      DEBUG_RECENT_TX ? { count: "exact" } : undefined,
    )
    .eq("status", "success")
    .order("block_number", { ascending: false })
    .order("log_index", { ascending: false })
    .limit(PER_WALLET_FETCH);

  if (token) {
    query = query.eq("token_contract", token);
  }

  query = applyRecentTxQuery(query, walletType);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`${walletType} recent-tx query failed: ${error.message}`);
  }

  const mapped = ((data ?? []) as DbTxRow[])
    .map(mapDbRow)
    .filter((row) => recentTxAmountMeetsMinimum(row.amountUsdt));

  return {
    rows: mapped,
    found: count ?? mapped.length,
    ge10k: mapped.length,
  };
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "recent-transactions", 45, 60_000);
  if (!limited.ok) return limited.response;

  const configError = getPrimaryConfigError();

  const empty: RecentTransactionsResponse = {
    transactions: [],
    limit: RECENT_TX_LIMIT,
    lastUpdated: null,
    liveStatus: configError ? "ERROR" : "STALE",
    latestBlock: null,
    indexedBlock: null,
    blockLag: null,
    configError:
      configError ||
      (!isSupabaseConfigured() ? "Database not configured." : null),
  };

  if (!isSupabaseConfigured()) {
    return withRateLimitHeaders(jsonOk(empty), limited.result);
  }

  try {
    // Index the tip, then a bounded contiguous chunk, before reading.
    // A large gap must not leave last_indexed_block frozen.
    await ensureFreshIncrementalSync("recent-transactions");

    const sync = await buildSyncStatusPayload();
    const liveStatus = deriveLiveStatus({
      indexer: sync.indexer,
      database: sync.database,
      blockchain: sync.blockchain,
      latestBlock: sync.latestBlock,
      indexedBlock: sync.indexedBlock,
      lastSuccessfulSync: sync.lastSuccessfulSync,
      isHistoricalSyncing: sync.isHistoricalSyncing,
      configError: configError || sync.configError,
    });

    const deposit = normalizeAddress(DEPOSIT_WALLET);
    const withdraw = normalizeAddress(WITHDRAW_WALLET);
    const reserve = normalizeAddress(RESERVE_FUND_WALLET);
    const token = normalizeAddress(USDT_CONTRACT_ADDRESS);

    // Independent queries — no shared LIMIT that Reserve can monopolize.
    const [depositResult, withdrawResult, reserveResult] = await Promise.all([
      fetchWalletRecentCandidates("deposit", token),
      fetchWalletRecentCandidates("withdraw", token),
      reserve
        ? fetchWalletRecentCandidates("reserve", token)
        : Promise.resolve({ rows: [], found: 0, ge10k: 0 }),
    ]);

    const combined = [
      ...depositResult.rows,
      ...withdrawResult.rows,
      ...reserveResult.rows,
    ];

    const selected = selectRecentTxFeed(combined, RECENT_TX_LIMIT);

    if (DEBUG_RECENT_TX) {
      console.info("[api/recent-transactions] diagnostics", {
        deposit: { found: depositResult.found, ge10k: depositResult.ge10k },
        withdraw: { found: withdrawResult.found, ge10k: withdrawResult.ge10k },
        reserve: { found: reserveResult.found, ge10k: reserveResult.ge10k },
        combined: combined.length,
        returned: selected.length,
      });
    }

    const transactions: TransactionRow[] = selected.map((row) => ({
      ...row,
      walletAddress:
        row.walletType === "deposit"
          ? deposit
          : row.walletType === "withdraw"
            ? withdraw
            : reserve,
    }));

    const supabase = getSupabaseAdmin();
    const { data: syncRow } = await supabase
      .from("sync_state")
      .select("last_successful_sync")
      .eq("sync_key", SYNC_KEY)
      .maybeSingle();

    const payload: RecentTransactionsResponse = {
      transactions,
      limit: RECENT_TX_LIMIT,
      lastUpdated:
        syncRow?.last_successful_sync ?? sync.lastSuccessfulSync ?? null,
      liveStatus,
      latestBlock: sync.latestBlock,
      indexedBlock: sync.indexedBlock,
      blockLag: blockLag(sync.latestBlock, sync.indexedBlock),
      configError: configError || sync.configError || null,
    };

    const response = withRateLimitHeaders(jsonOk(payload), limited.result);
    for (const [key, value] of Object.entries(recentTxCacheHeaders())) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err) {
    console.error("[api/recent-transactions]", err);
    return jsonError("Unable to load live data", 503);
  }
}
