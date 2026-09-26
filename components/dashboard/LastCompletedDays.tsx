"use client";

import type { DailyStatRow } from "@/types/analytics";
import { formatShortUtcDate } from "@/lib/utils/dates";
import { formatUsdt } from "@/lib/utils/format";
import { LoadingSkeleton } from "./LoadingSkeleton";

interface LastCompletedDaysProps {
  data: DailyStatRow[];
  loading: boolean;
}

export function LastCompletedDays({ data, loading }: LastCompletedDaysProps) {
  if (loading && data.length === 0) {
    return <LoadingSkeleton variant="table" />;
  }

  return (
    <article className="tn-card p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-[var(--tn-navy)]">
          Last 4 Completed Days
        </h2>
        <p className="text-sm text-[var(--tn-muted)]">
          Finalized UTC calendar days only · excludes today · Deposit Wallet IN
          and Withdraw Wallet IN from indexed USDT transfers
        </p>
      </div>

      <div className="table-scroll rounded-xl border border-[var(--tn-border)]">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-[var(--tn-muted)]">
            <tr>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Deposit</th>
              <th className="px-3 py-3">Deposit Txns</th>
              <th className="px-3 py-3">Withdrawal</th>
              <th className="px-3 py-3">Withdrawal Txns</th>
              <th className="px-3 py-3">Net Cash Flow</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.date}
                className="border-t border-[var(--tn-border)] hover:bg-slate-50/80"
              >
                <td className="px-3 py-3 font-medium">
                  {formatShortUtcDate(row.date)}
                </td>
                <td className="px-3 py-3 text-[var(--tn-deposit)]">
                  {formatUsdt(row.depositAmount)} USDT
                </td>
                <td className="px-3 py-3">{row.depositCount}</td>
                <td className="px-3 py-3 text-[var(--tn-withdraw)]">
                  {formatUsdt(row.withdrawalAmount)} USDT
                </td>
                <td className="px-3 py-3">{row.withdrawalCount}</td>
                <td className="px-3 py-3 font-semibold text-[var(--tn-navy)]">
                  {formatUsdt(row.netCashFlow)} USDT
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
