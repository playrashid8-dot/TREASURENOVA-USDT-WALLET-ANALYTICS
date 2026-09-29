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
  applyLargeTxMinAmountFilter,
  selectLatestCombinedTransactions,
} from "@/lib/analytics/filters";
import { blockLag, deriveLiveStatus } from "@/lib/analytics/live-status";
import { buildSyncStatusPayload } from "@/lib/api/dashboard-data";
import {
  enforceRateLimit,
  jsonError,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/utils/addresses";
import type {
  RecentTransactionsResponse,
  TransactionRow,
} from "@/types/analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Extra rows fetched so OR-overlap / dual-role logs can be trimmed to 10. */
const FETCH_BUFFER = 80;

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

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("transactions")
      .select(
        "id, tx_hash, log_index, wallet_address, wallet_type, token_contract, from_address, to_address, amount_raw, amount_usdt, block_number, block_hash, timestamp, status, token_symbol, token_decimals",
      )
      .eq("status", "success")
      .order("block_number", { ascending: false })
      .order("log_index", { ascending: false })
      .limit(FETCH_BUFFER);

    // Global display floor: only USDT transfers >= LARGE_TX_MIN_USDT (10,000).
    query = applyLargeTxMinAmountFilter(query);

    if (token) {
      query = query.eq("token_contract", token);
    }

    // Involving any configured wallet (from or to)
    query = query.or(
      [
        `from_address.in.(${deposit},${withdraw},${reserve})`,
        `to_address.in.(${deposit},${withdraw},${reserve})`,
      ].join(","),
    );

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const mapped = ((data ?? []) as DbTxRow[]).map(mapDbRow);
    const selected = selectLatestCombinedTransactions(mapped, RECENT_TX_LIMIT);

    const transactions: TransactionRow[] = selected.map((row) => ({
      ...row,
      walletAddress:
        row.walletType === "deposit"
          ? deposit
          : row.walletType === "withdraw"
            ? withdraw
            : reserve,
    }));

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

    return withRateLimitHeaders(jsonOk(payload), limited.result);
  } catch (err) {
    console.error("[api/recent-transactions]", err);
    return jsonError("Unable to load live data", 503);
  }
}
