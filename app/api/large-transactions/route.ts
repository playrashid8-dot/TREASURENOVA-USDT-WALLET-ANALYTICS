import {
  DEPOSIT_WALLET,
  LARGE_TX_COMPLETED_DAYS,
  LARGE_TX_MIN_USDT,
  RESERVE_FUND_WALLET,
  SYNC_KEY,
  WITHDRAW_WALLET,
  getPrimaryConfigError,
} from "@/lib/config";
import {
  applyLargeTxMinAmountFilter,
  applyLargeTxWalletFilter,
  applyTimestampFilter,
} from "@/lib/analytics/filters";
import {
  enforceRateLimit,
  jsonError,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { lastCompletedUtcRange } from "@/lib/utils/dates";
import { normalizeAddress } from "@/lib/utils/addresses";
import type {
  LargeTxWalletSection,
  LargeTransactionsResponse,
  TransactionRow,
  WalletCardType,
} from "@/types/analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WALLET_SECTIONS: Array<{
  walletType: WalletCardType;
  label: string;
  address: string;
}> = [
  {
    walletType: "deposit",
    label: "Deposit Wallet",
    address: DEPOSIT_WALLET,
  },
  {
    walletType: "withdraw",
    label: "Withdraw Wallet",
    address: WITHDRAW_WALLET,
  },
  {
    walletType: "reserve",
    label: "TREASURENOVA Reserve Fund",
    address: RESERVE_FUND_WALLET,
  },
];

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

function mapRow(r: DbTxRow, sectionType: WalletCardType): TransactionRow {
  return {
    id: r.id,
    txHash: r.tx_hash,
    logIndex: r.log_index,
    walletAddress: r.wallet_address,
    walletType: sectionType,
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

/** Paginate past Supabase's default 1000-row cap. */
async function fetchWalletLargeTxs(
  walletType: WalletCardType,
  from: string,
  to: string,
): Promise<TransactionRow[]> {
  const supabase = getSupabaseAdmin();
  const pageSize = 1000;
  const all: TransactionRow[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("transactions")
      .select(
        "id, tx_hash, log_index, wallet_address, wallet_type, token_contract, from_address, to_address, amount_raw, amount_usdt, block_number, block_hash, timestamp, status, token_symbol, token_decimals",
      )
      .eq("status", "success")
      .order("block_number", { ascending: false })
      .order("timestamp", { ascending: false })
      .range(offset, offset + pageSize - 1);

    query = applyLargeTxMinAmountFilter(query);
    query = applyTimestampFilter(query, { from, to });
    query = applyLargeTxWalletFilter(query, walletType);

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as DbTxRow[];
    for (const r of rows) {
      all.push(mapRow(r, walletType));
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  // Deduplicate by tx_hash + log_index (withdraw OUT may share logs with other roles)
  const seen = new Set<string>();
  const unique: TransactionRow[] = [];
  for (const tx of all) {
    const key = `${tx.txHash}:${tx.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(tx);
  }

  unique.sort((a, b) => {
    if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
    return b.timestamp.localeCompare(a.timestamp);
  });

  return unique;
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "large-transactions", 45, 60_000);
  if (!limited.ok) return limited.response;

  const configError = getPrimaryConfigError();
  const range = lastCompletedUtcRange(LARGE_TX_COMPLETED_DAYS);

  const emptyWallets: LargeTxWalletSection[] = WALLET_SECTIONS.map((w) => ({
    walletType: w.walletType,
    label: w.label,
    address: normalizeAddress(w.address) || w.address,
    transactionCount: 0,
    totalUsdt: 0,
    transactions: [],
  }));

  const empty: LargeTransactionsResponse = {
    wallets: emptyWallets,
    minAmountUsdt: LARGE_TX_MIN_USDT,
    completedDays: LARGE_TX_COMPLETED_DAYS,
    dateKeys: range.dateKeys,
    dateRange: { from: range.from, to: range.to },
    lastUpdated: null,
    configError:
      configError ||
      (!isSupabaseConfigured()
        ? "Database not configured."
        : null),
  };

  if (!isSupabaseConfigured()) {
    return withRateLimitHeaders(jsonOk(empty), limited.result);
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: sync } = await supabase
      .from("sync_state")
      .select("last_successful_sync")
      .eq("sync_key", SYNC_KEY)
      .maybeSingle();

    const wallets: LargeTxWalletSection[] = [];
    for (const section of WALLET_SECTIONS) {
      const transactions = await fetchWalletLargeTxs(
        section.walletType,
        range.from,
        range.to,
      );
      const totalUsdt = transactions.reduce((sum, tx) => sum + tx.amountUsdt, 0);
      wallets.push({
        walletType: section.walletType,
        label: section.label,
        address: normalizeAddress(section.address) || section.address,
        transactionCount: transactions.length,
        totalUsdt,
        transactions,
      });
    }

    const payload: LargeTransactionsResponse = {
      wallets,
      minAmountUsdt: LARGE_TX_MIN_USDT,
      completedDays: LARGE_TX_COMPLETED_DAYS,
      dateKeys: range.dateKeys,
      dateRange: { from: range.from, to: range.to },
      lastUpdated: sync?.last_successful_sync ?? null,
      configError,
    };

    return withRateLimitHeaders(jsonOk(payload), limited.result);
  } catch (err) {
    console.error("[api/large-transactions]", err);
    return jsonError("Historical indexer is syncing or unavailable.", 503);
  }
}
