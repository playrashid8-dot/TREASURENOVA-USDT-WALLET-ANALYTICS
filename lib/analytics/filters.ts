import {
  DEPOSIT_WALLET,
  LARGE_TX_MIN_USDT,
  RESERVE_FUND_WALLET,
  WITHDRAW_WALLET,
} from "@/lib/config";
import { addressesEqual, normalizeAddress } from "@/lib/utils/addresses";
import { parsePreset, resolveDateRange } from "@/lib/utils/dates";
import { rawMeetsMinUsdt } from "@/lib/utils/format";
import type { DateRange, WalletCardType } from "@/types/analytics";

/** Max rows in the combined Recent TX History section. */
export const RECENT_TX_LIMIT = 10;

/** Alias for the Recent TX History floor (10,000 USDT). */
export const MIN_TRANSACTION_USDT = LARGE_TX_MIN_USDT;

/**
 * Display classification for Recent TX History (address-derived, not labels).
 *
 * Each configured wallet qualifies on IN or OUT:
 * - Deposit:  to == Deposit  OR from == Deposit
 * - Withdraw: to == Withdraw OR from == Withdraw
 * - Reserve:  to == Reserve  OR from == Reserve
 *
 * Self-transfers (from == to == same configured wallet) are excluded.
 *
 * When both ends are configured wallets (e.g. Reserve → Withdraw), prefer
 * Deposit > Withdraw > Reserve so Reserve cannot monopolize dual-role rows.
 * One badge per combined-list row (dedupe by txHash:logIndex).
 */
export function classifyRecentTxWallet(
  fromAddress: string,
  toAddress: string,
): WalletCardType | null {
  const fromDeposit = addressesEqual(fromAddress, DEPOSIT_WALLET);
  const toDeposit = addressesEqual(toAddress, DEPOSIT_WALLET);
  const fromWithdraw = addressesEqual(fromAddress, WITHDRAW_WALLET);
  const toWithdraw = addressesEqual(toAddress, WITHDRAW_WALLET);
  const fromReserve = addressesEqual(fromAddress, RESERVE_FUND_WALLET);
  const toReserve = addressesEqual(toAddress, RESERVE_FUND_WALLET);

  // Self-transfer on any monitored wallet → exclude from external history
  if (
    (fromDeposit && toDeposit) ||
    (fromWithdraw && toWithdraw) ||
    (fromReserve && toReserve)
  ) {
    return null;
  }

  if (fromDeposit || toDeposit) return "deposit";
  if (fromWithdraw || toWithdraw) return "withdraw";
  if (fromReserve || toReserve) return "reserve";
  return null;
}

/** IN when to == wallet; OUT when from == wallet (for the classified wallet type). */
export function classifyRecentTxDirection(
  fromAddress: string,
  toAddress: string,
  walletType: WalletCardType,
): "IN" | "OUT" | null {
  const wallet =
    walletType === "deposit"
      ? DEPOSIT_WALLET
      : walletType === "withdraw"
        ? WITHDRAW_WALLET
        : RESERVE_FUND_WALLET;
  if (!wallet) return null;
  if (addressesEqual(toAddress, wallet)) return "IN";
  if (addressesEqual(fromAddress, wallet)) return "OUT";
  return null;
}

/** True when a row qualifies for the combined Recent TX History feed. */
export function qualifiesForRecentTxHistory(
  fromAddress: string,
  toAddress: string,
  amountUsdt?: number,
  amountRaw?: string,
  tokenDecimals?: number,
): boolean {
  if (classifyRecentTxWallet(fromAddress, toAddress) == null) return false;
  if (amountUsdt === undefined && amountRaw === undefined) return true;
  return meetsLargeTxMinUsdt(amountUsdt ?? 0, LARGE_TX_MIN_USDT, {
    amountRaw,
    tokenDecimals,
  });
}

/**
 * Merge candidate rows into a single newest-first list (global LIMIT).
 * Processing order:
 *   wallet classification → amount >= MIN_TRANSACTION_USDT → combine →
 *   sort blockNumber DESC / logIndex DESC → slice(0, 10)
 * Dedupes by txHash:logIndex.
 */
export function selectLatestCombinedTransactions<
  T extends {
    txHash: string;
    logIndex: number;
    fromAddress: string;
    toAddress: string;
    blockNumber: number;
    timestamp: string;
    amountUsdt: number;
    amountRaw?: string;
    tokenDecimals?: number;
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
    if (
      !meetsLargeTxMinUsdt(row.amountUsdt, LARGE_TX_MIN_USDT, {
        amountRaw: row.amountRaw,
        tokenDecimals: row.tokenDecimals,
      })
    ) {
      continue;
    }
    const walletType = classifyRecentTxWallet(row.fromAddress, row.toAddress);
    if (!walletType) continue;
    seen.add(key);
    classified.push({ ...row, walletType });
  }

  classified.sort((a, b) => {
    if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
    if (b.logIndex !== a.logIndex) return b.logIndex - a.logIndex;
    return b.timestamp.localeCompare(a.timestamp);
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

/**
 * True when a transaction amount meets the large-tx display floor.
 * Prefer BigInt raw comparison when amountRaw + decimals are available.
 */
export function meetsLargeTxMinUsdt(
  amountUsdt: number,
  minAmount = LARGE_TX_MIN_USDT,
  opts?: { amountRaw?: string; tokenDecimals?: number },
): boolean {
  if (
    opts?.amountRaw &&
    opts.tokenDecimals !== undefined &&
    Number.isFinite(opts.tokenDecimals)
  ) {
    return rawMeetsMinUsdt(opts.amountRaw, opts.tokenDecimals, minAmount);
  }
  return Number.isFinite(amountUsdt) && amountUsdt >= minAmount;
}

export function applyLargeTxMinAmountFilter<
  T extends { gte: (col: string, val: number | string) => T },
>(query: T, column = "amount_usdt"): T {
  return query.gte(column, LARGE_TX_MIN_USDT);
}

/**
 * Recent TX / Large TX wallet filters — IN and OUT for every configured wallet:
 * - Deposit:  (to == Deposit  AND from != Deposit)  OR (from == Deposit  AND to != Deposit)
 * - Withdraw: (to == Withdraw AND from != Withdraw) OR (from == Withdraw AND to != Withdraw)
 * - Reserve:  (to == Reserve  AND from != Reserve)  OR (from == Reserve  AND to != Reserve)
 *
 * Self-transfers are excluded. Daily analytics remain IN-only elsewhere.
 */
export function applyLargeTxWalletFilter<
  T extends {
    eq: (col: string, val: string) => T;
    neq: (col: string, val: string) => T;
    or: (filters: string) => T;
  },
>(query: T, walletType: WalletCardType): T {
  const addr = normalizeAddress(
    walletType === "deposit"
      ? DEPOSIT_WALLET
      : walletType === "withdraw"
        ? WITHDRAW_WALLET
        : RESERVE_FUND_WALLET,
  );
  return query.or(
    `and(to_address.eq.${addr},from_address.neq.${addr}),and(from_address.eq.${addr},to_address.neq.${addr})`,
  );
}
