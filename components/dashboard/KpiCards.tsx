"use client";

import type { KpiSummary } from "@/types/analytics";
import { formatUsdt, formatUsdtExact } from "@/lib/utils/format";
import { LoadingSkeleton } from "./LoadingSkeleton";

interface KpiCardsProps {
  data: KpiSummary | null;
  loading: boolean;
}

export function KpiCards({ data, loading }: KpiCardsProps) {
  if (loading && !data) {
    return <LoadingSkeleton variant="kpi" />;
  }

  const cards = [
    {
      label: "Total Deposits",
      value: data ? `${formatUsdt(data.totalDeposits)} USDT` : "—",
      exact: data ? formatUsdtExact(data.totalDeposits) : undefined,
      tone: "deposit" as const,
    },
    {
      label: "Total Withdrawals",
      value: data ? `${formatUsdt(data.totalWithdrawals)} USDT` : "—",
      exact: data ? formatUsdtExact(data.totalWithdrawals) : undefined,
      tone: "withdraw" as const,
    },
    {
      label: "Net Cash Flow",
      value: data ? `${formatUsdt(data.netCashFlow)} USDT` : "—",
      exact: data ? formatUsdtExact(data.netCashFlow) : undefined,
      tone: "neutral" as const,
    },
    {
      label: "Current Deposit Balance",
      value:
        data?.depositBalance !== null && data?.depositBalance !== undefined
          ? `${formatUsdt(data.depositBalance)} USDT`
          : data?.balanceError
            ? "Unavailable"
            : "—",
      exact:
        data?.depositBalance != null
          ? formatUsdtExact(data.depositBalance)
          : undefined,
      tone: "deposit" as const,
    },
    {
      label: "Current Withdraw Balance",
      value:
        data?.withdrawBalance !== null && data?.withdrawBalance !== undefined
          ? `${formatUsdt(data.withdrawBalance)} USDT`
          : data?.balanceError
            ? "Unavailable"
            : "—",
      exact:
        data?.withdrawBalance != null
          ? formatUsdtExact(data.withdrawBalance)
          : undefined,
      tone: "withdraw" as const,
    },
    {
      label: "Total Transactions",
      value: data ? data.transactionCount.toLocaleString("en-US") : "—",
      tone: "info" as const,
    },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-[var(--tn-navy)]">Overview</h2>
          <p className="text-sm text-[var(--tn-muted)]">
            Selected range · Net Cash Flow = Deposits − Withdrawals
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.label}
            className="tn-card p-4 transition hover:border-slate-300"
            title={card.exact ? `${card.exact} USDT` : undefined}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tn-muted)]">
              {card.label}
            </p>
            <p
              className={`mt-2 text-xl font-bold sm:text-2xl ${
                card.tone === "deposit"
                  ? "text-[var(--tn-deposit)]"
                  : card.tone === "withdraw"
                    ? "text-[var(--tn-withdraw)]"
                    : card.tone === "info"
                      ? "text-[var(--tn-info)]"
                      : "text-[var(--tn-navy)]"
              }`}
            >
              {card.value}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
