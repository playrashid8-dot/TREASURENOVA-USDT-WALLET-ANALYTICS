"use client";

import { useMemo, useState } from "react";
import type { DailyStatRow } from "@/types/analytics";
import { formatDisplayDate } from "@/lib/utils/dates";
import { formatUsdt } from "@/lib/utils/format";
import { EmptyState } from "./EmptyState";
import { LoadingSkeleton } from "./LoadingSkeleton";

interface DailyStatsTableProps {
  data: DailyStatRow[];
  loading: boolean;
  queryBase: string;
}

const PAGE_SIZE = 10;

export function DailyStatsTable({
  data,
  loading,
  queryBase,
}: DailyStatsTableProps) {
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () => [...data].sort((a, b) => b.date.localeCompare(a.date)),
    [data],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageData = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading && data.length === 0) {
    return <LoadingSkeleton variant="table" />;
  }

  return (
    <article className="tn-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--tn-navy)]">
            Daily USDT Summary
          </h2>
          <p className="text-sm text-[var(--tn-muted)]">
            Newest first · UTC daily grouping · completed days are final · today
            stays LIVE until the day ends
          </p>
        </div>
        <a
          href={`/api/export?${queryBase}`}
          className="inline-flex min-h-11 items-center rounded-xl border border-[var(--tn-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--tn-navy)] hover:bg-slate-50"
        >
          Export CSV
        </a>
      </div>

      {sorted.length === 0 ? (
        <EmptyState message="No USDT transactions found for this date range." />
      ) : (
        <>
          <div className="table-scroll rounded-xl border border-[var(--tn-border)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-[var(--tn-muted)]">
                <tr>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Deposits</th>
                  <th className="px-3 py-3">Withdrawals</th>
                  <th className="px-3 py-3">Net Cash Flow</th>
                  <th className="px-3 py-3">Deposit Txns</th>
                  <th className="px-3 py-3">Withdrawal Txns</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((row) => (
                  <tr
                    key={row.date}
                    className="border-t border-[var(--tn-border)] hover:bg-slate-50/80"
                  >
                    <td className="px-3 py-3 font-medium">
                      {formatDisplayDate(row.date)}
                    </td>
                    <td className="px-3 py-3">
                      {row.isLive ? (
                        <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                          Live
                        </span>
                      ) : row.isCompleted ? (
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                          Completed
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--tn-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[var(--tn-deposit)]">
                      {formatUsdt(row.depositAmount)} USDT
                    </td>
                    <td className="px-3 py-3 text-[var(--tn-withdraw)]">
                      {formatUsdt(row.withdrawalAmount)} USDT
                    </td>
                    <td className="px-3 py-3 font-semibold text-[var(--tn-navy)]">
                      {formatUsdt(row.netCashFlow)} USDT
                    </td>
                    <td className="px-3 py-3">{row.depositCount}</td>
                    <td className="px-3 py-3">{row.withdrawalCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--tn-muted)]">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-10 rounded-xl border border-[var(--tn-border)] px-3 text-sm font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-10 rounded-xl border border-[var(--tn-border)] px-3 text-sm font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
