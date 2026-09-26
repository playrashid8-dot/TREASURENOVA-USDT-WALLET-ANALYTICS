import type { DailyStatRow } from "@/types/analytics";

export function computeNetCashFlow(
  deposits: number,
  withdrawals: number,
): number {
  return deposits - withdrawals;
}

export function sumDailyStats(rows: DailyStatRow[]): {
  totalDeposits: number;
  totalWithdrawals: number;
  netCashFlow: number;
  depositCount: number;
  withdrawalCount: number;
  transactionCount: number;
} {
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let depositCount = 0;
  let withdrawalCount = 0;

  for (const row of rows) {
    totalDeposits += row.depositAmount;
    totalWithdrawals += row.withdrawalAmount;
    depositCount += row.depositCount;
    withdrawalCount += row.withdrawalCount;
  }

  return {
    totalDeposits,
    totalWithdrawals,
    netCashFlow: computeNetCashFlow(totalDeposits, totalWithdrawals),
    depositCount,
    withdrawalCount,
    transactionCount: depositCount + withdrawalCount,
  };
}

export function paginate<T>(
  items: T[],
  page: number,
  limit: number,
): { data: T[]; total: number; totalPages: number; page: number; limit: number } {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const start = (safePage - 1) * safeLimit;
  return {
    data: items.slice(start, start + safeLimit),
    total,
    totalPages,
    page: safePage,
    limit: safeLimit,
  };
}
