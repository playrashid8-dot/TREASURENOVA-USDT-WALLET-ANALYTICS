"use client";

import type { DailyStatRow } from "@/types/analytics";
import { formatDisplayDate } from "@/lib/utils/dates";
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
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tn-info-bg)] text-[var(--tn-info)]">
          <CalendarIcon />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Last 8 Days</h2>
          <p className="mt-0.5 text-sm text-[var(--tn-muted)]">
            Date-wise Total USDT (Completed UTC Days Only)
          </p>
        </div>
      </div>

      <div className="table-scroll overflow-hidden rounded-xl border border-[var(--tn-border)]">
        <table className="w-full border-collapse text-left text-sm">
          <thead
            className="text-xs font-semibold uppercase tracking-wide text-[var(--tn-muted)]"
            style={{ background: "var(--tn-table-head)" }}
          >
            <tr>
              <th className="px-4 py-3.5">Date (UTC)</th>
              <th className="px-4 py-3.5">
                <span className="inline-flex items-center gap-1.5">
                  <ArrowDownIcon className="text-[var(--tn-deposit)]" />
                  Deposit USDT
                </span>
              </th>
              <th className="px-4 py-3.5">
                <span className="inline-flex items-center gap-1.5">
                  <ArrowUpIcon className="text-[var(--tn-withdraw)]" />
                  Withdrawal USDT
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={row.date}
                className="border-t border-[var(--tn-border)]"
                style={
                  i % 2 === 1
                    ? { background: "var(--tn-row-alt)" }
                    : undefined
                }
              >
                <td className="px-4 py-3.5 font-medium text-white">
                  {formatDisplayDate(row.date)}
                </td>
                <td className="px-4 py-3.5 font-semibold text-[var(--tn-deposit)]">
                  {formatUsdt(row.depositAmount)} USDT
                </td>
                <td className="px-4 py-3.5 font-semibold text-[var(--tn-withdraw)]">
                  {formatUsdt(row.withdrawalAmount)} USDT
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-10 text-center text-sm text-[var(--tn-muted)]"
                >
                  No completed-day totals available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M3 10h18M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M12 4v14M12 18l-5-5M12 18l5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowUpIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M12 20V6M12 6l-5 5M12 6l5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
