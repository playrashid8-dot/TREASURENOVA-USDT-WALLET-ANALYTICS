import {
  DEPOSIT_WALLET,
  LARGE_TX_MIN_USDT,
  RESERVE_FUND_WALLET,
  WITHDRAW_WALLET,
} from "@/lib/config";
import { addressesEqual, normalizeAddress } from "@/lib/utils/addresses";
import { parsePreset, resolveDateRange } from "@/lib/utils/dates";
import type { DateRange, WalletCardType } from "@/types/analytics";

/** Max rows in the combined Recent TX History section. */
export const RECENT_TX_LIMIT = 10;

/**
 * Display classification for Recent TX History (address-derived, not labels):
 * - Deposit: to == Deposit Wallet (IN)
 * - Withdraw: from == Withdraw Wallet AND to != Withdraw Wallet (OUT)
 * - Reserve: from == Reserve Fund AND to != Reserve Fund (OUT)
 *
 * Priority when multiple rules match (e.g. Reserve → Deposit): Deposit, then
 * Withdraw, then Reserve — one badge per combined-list row.
 */
export function classifyRecentTxWallet(
  fromAddress: string,
  toAddress: string,
): WalletCardType | null {
  if (addressesEqual(toAddress, DEPOSIT_WALLET)) {
    return "deposit";
  }
  if (
    addressesEqual(fromAddress, WITHDRAW_WALLET) &&
    !addressesEqual(toAddress, WITHDRAW_WALLET)
  ) {
    return "withdraw";
  }
  if (
    addressesEqual(fromAddress, RESERVE_FUND_WALLET) &&
    !addressesEqual(toAddress, RESERVE_FUND_WALLET)
  ) {
    return "reserve";
  }
  return null;
}

/** True when a row qualifies for the combined Recent TX History feed. */
export function qualifiesForRecentTxHistory(
  fromAddress: string,
  toAddress: string,
): boolean {
  return classifyRecentTxWallet(fromAddress, toAddress) != null;
}

/**
 * Merge candidate rows into a single newest-first list (global LIMIT).
 * Dedupes by txHash:logIndex, classifies from addresses, caps at `limit`.
 */
export function selectLatestCombinedTransactions<
  T extends {
    txHash: string;
    logIndex: number;
    fromAddress: string;
    toAddress: string;
    blockNumber: number;
    timestamp: string;
  },
>(
  rows: T[],
  limit = RECENT_TX_LIMIT,
): Array<T & { walletType: WalletCardType }> {
  const seen = new Set<string>();
  const classified: Array<T & { walletType: WalletCardType }> = [];

  for (const row of rows) {
    const key = `${row.txHash}:${row.logIndex}`;
    if (seen.has(key)) continue;
    const walletType = classifyRecentTxWallet(row.fromAddress, row.toAddress);
    if (!walletType) continue;
    seen.add(key);
    classified.push({ ...row, walletType });
  }

  classified.sort((a, b) => {
    if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
    const t = b.timestamp.localeCompare(a.timestamp);
    if (t !== 0) return t;
    return b.logIndex - a.logIndex;
  });

  return classified.slice(0, Math.max(0, limit));
}

export function dateRangeFromSearchParams(
  params: URLSearchParams,
): DateRange {
  const preset = parsePreset(params.get("preset"));
  return resolveDateRange(preset, params.get("from"), params.get("to"));
}

export function applyTimestampFilter<
  T extends {
    gte: (col: string, val: string) => T;
    lte: (col: string, val: string) => T;
  },
>(query: T, range: { from: string | null; to: string | null }, column = "timestamp"): T {
  let q = query;
  if (range.from) {
    q = q.gte(column, range.from);
  }
  if (range.to) {
    q = q.lte(column, range.to);
  }
  return q;
}

/** True when a transaction amount meets the large-tx display floor. */
export function meetsLargeTxMinUsdt(
  amountUsdt: number,
  minAmount = LARGE_TX_MIN_USDT,
): boolean {
  return Number.isFinite(amountUsdt) && amountUsdt >= minAmount;
}

export function applyLargeTxMinAmountFilter<
  T extends { gte: (col: string, val: number | string) => T },
>(query: T, column = "amount_usdt"): T {
  return query.gte(column, LARGE_TX_MIN_USDT);
}

/**
 * Recent Large Transactions wallet direction filters (indexed Transfer rows):
 * - Deposit: to == Deposit Wallet (IN)
 * - Withdraw: from == Withdraw Wallet AND to != Withdraw Wallet (OUT)
 * - Reserve: from == Reserve Fund Wallet AND to != Reserve Fund Wallet (OUT)
 *   — same outbound semantics as Withdraw; Reserve is not part of daily
 *   IN-only analytics, but indexed Transfer rows still record when the
 *   reserve address is the sender (e.g. funding the withdraw wallet).
 */
export function applyLargeTxWalletFilter<
  T extends {
    eq: (col: string, val: string) => T;
    neq: (col: string, val: string) => T;
  },
>(query: T, walletType: WalletCardType): T {
  if (walletType === "deposit") {
    return query.eq("to_address", normalizeAddress(DEPOSIT_WALLET));
  }
  if (walletType === "withdraw") {
    return query
      .eq("from_address", normalizeAddress(WITHDRAW_WALLET))
      .neq("to_address", normalizeAddress(WITHDRAW_WALLET));
  }
  return query
    .eq("from_address", normalizeAddress(RESERVE_FUND_WALLET))
    .neq("to_address", normalizeAddress(RESERVE_FUND_WALLET));
}
