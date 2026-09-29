import type { DayFlowSummary } from "@/types/analytics";
import {
  isCompletedUtcDate,
  isLiveUtcDate,
  utcTodayKey,
} from "@/lib/utils/dates";

export function computeNetCashFlow(
  deposits: number,
  withdrawals: number,
): number {
  return deposits - withdrawals;
}

export function emptyDayFlow(): DayFlowSummary {
  return {
    depositAmount: 0,
    withdrawalAmount: 0,
    netCashFlow: 0,
    depositCount: 0,
    withdrawalCount: 0,
  };
}

export function sumDailyStats(
  rows: Array<{
    depositAmount: number;
    withdrawalAmount: number;
    depositCount: number;
    withdrawalCount: number;
  }>,
): {
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

/**
 * Split daily rows into finalized UTC days vs today's live/running totals.
 * Today's date is never included in completed (final) aggregates.
 */
export function splitCompletedAndLive(
  rows: Array<{
    date: string;
    depositAmount: number;
    withdrawalAmount: number;
    depositCount: number;
    withdrawalCount: number;
  }>,
  now: Date = new Date(),
): {
  completed: DayFlowSummary;
  live: DayFlowSummary;
  liveInRange: boolean;
  todayDate: string;
} {
  const todayDate = utcTodayKey(now);
  const completed = emptyDayFlow();
  const live = emptyDayFlow();
  let liveInRange = false;

  for (const row of rows) {
    if (isLiveUtcDate(row.date, now)) {
      liveInRange = true;
      live.depositAmount += row.depositAmount;
      live.withdrawalAmount += row.withdrawalAmount;
      live.depositCount += row.depositCount;
      live.withdrawalCount += row.withdrawalCount;
    } else if (isCompletedUtcDate(row.date, now)) {
      completed.depositAmount += row.depositAmount;
      completed.withdrawalAmount += row.withdrawalAmount;
      completed.depositCount += row.depositCount;
      completed.withdrawalCount += row.withdrawalCount;
    }
  }

  completed.netCashFlow = computeNetCashFlow(
    completed.depositAmount,
    completed.withdrawalAmount,
  );
  live.netCashFlow = computeNetCashFlow(
    live.depositAmount,
    live.withdrawalAmount,
  );

  return { completed, live, liveInRange, todayDate };
}
