"use client";

import type { KpiSummary } from "@/types/analytics";
import { formatUsdt, formatUsdtExact } from "@/lib/utils/format";
import { formatDisplayDate } from "@/lib/utils/dates";
import { LoadingSkeleton } from "./LoadingSkeleton";

interface KpiCardsProps {
  data: KpiSummary | null;
  loading: boolean;
}

type CardTone = "deposit" | "withdraw" | "neutral" | "info";

interface KpiCard {
  label: string;
  value: string;
  exact?: string;
  tone: CardTone;
  hint?: string;
}

export function KpiCards({ data, loading }: KpiCardsProps) {
  if (loading && !data) {
    return <LoadingSkeleton variant="kpi" />;
  }

  const completedCards: KpiCard[] = [
    {
      label: "Completed Daily Deposit",
      value: data ? `${formatUsdt(data.completedDeposits)} USDT` : "—",
      exact: data ? formatUsdtExact(data.completedDeposits) : undefined,
      tone: "deposit",
      hint: "Finalized UTC days in range · IN to Deposit Wallet only",
    },
    {
      label: "Completed Daily Withdrawal",
      value: data ? `${formatUsdt(data.completedWithdrawals)} USDT` : "—",
      exact: data ? formatUsdtExact(data.completedWithdrawals) : undefined,
      tone: "withdraw",
      hint: "Finalized UTC days in range · IN to Withdraw Wallet only",
    },
    {
      label: "Completed Net Cash Flow",
      value: data ? `${formatUsdt(data.completedNetCashFlow)} USDT` : "—",
      exact: data ? formatUsdtExact(data.completedNetCashFlow) : undefined,
      tone: "neutral",
      hint: "Deposit − Withdrawal (completed days only)",
    },
    {
      label: "Completed Deposit Txns",
      value: data
        ? data.completedDepositCount.toLocaleString("en-US")
        : "—",
      tone: "info",
    },
    {
      label: "Completed Withdrawal Txns",
      value: data
        ? data.completedWithdrawalCount.toLocaleString("en-US")
        : "—",
      tone: "info",
    },
  ];

  const liveCards: KpiCard[] = [
    {
      label: "Today's Live Deposit",
      value: data ? `${formatUsdt(data.liveDeposits)} USDT` : "—",
      exact: data ? formatUsdtExact(data.liveDeposits) : undefined,
      tone: "deposit",
      hint: data
        ? `Running UTC day ${formatDisplayDate(data.todayDate)} · not final`
        : undefined,
    },
    {
      label: "Today's Live Withdrawal",
      value: data ? `${formatUsdt(data.liveWithdrawals)} USDT` : "—",
      exact: data ? formatUsdtExact(data.liveWithdrawals) : undefined,
      tone: "withdraw",
      hint: data
        ? `Running UTC day ${formatDisplayDate(data.todayDate)} · not final`
        : undefined,
    },
    {
      label: "Today's Live Net Cash Flow",
      value: data ? `${formatUsdt(data.liveNetCashFlow)} USDT` : "—",
      exact: data ? formatUsdtExact(data.liveNetCashFlow) : undefined,
      tone: "neutral",
      hint: "Deposit − Withdrawal (live today · not final)",
    },
    {
      label: "Today's Live Deposit Txns",
      value: data ? data.liveDepositCount.toLocaleString("en-US") : "—",
      tone: "info",
    },
    {
      label: "Today's Live Withdrawal Txns",
      value: data ? data.liveWithdrawalCount.toLocaleString("en-US") : "—",
      tone: "info",
    },
  ];

  const balanceCards: KpiCard[] = [
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
      tone: "deposit",
      hint: "USDT balanceOf(Deposit Wallet)",
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
      tone: "withdraw",
      hint: "USDT balanceOf(Withdraw Wallet)",
    },
    {
      label: "Range Net Cash Flow",
      value: data ? `${formatUsdt(data.netCashFlow)} USDT` : "—",
      exact: data ? formatUsdtExact(data.netCashFlow) : undefined,
      tone: "neutral",
      hint: "Completed + live in selected range · Deposit − Withdrawal",
    },
  ];

  return (
    <div className="space-y-6">
      <KpiSection
        title="Completed Daily Totals"
        subtitle="Finalized UTC calendar days only · today's running totals are excluded"
        cards={completedCards}
      />
      <KpiSection
        title="Today's Live Totals"
        subtitle={
          data?.liveInRange === false
            ? "Today is outside the selected date range"
            : "LIVE / RUNNING until the UTC day ends · not a final daily total"
        }
        cards={liveCards}
        live
      />
      <KpiSection
        title="Balances & Range"
        subtitle="Live balances from USDT balanceOf() · range Net Cash Flow includes live today when in range"
        cards={balanceCards}
      />
    </div>
  );
}

function KpiSection({
  title,
  subtitle,
  cards,
  live = false,
}: {
  title: string;
  subtitle: string;
  cards: KpiCard[];
  live?: boolean;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-[var(--tn-navy)]">{title}</h2>
            {live && (
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                Live
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--tn-muted)]">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.label}
            className="tn-card p-4 transition hover:border-slate-300"
            title={
              [card.exact ? `${card.exact} USDT` : null, card.hint]
                .filter(Boolean)
                .join(" · ") || undefined
            }
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
            {card.hint && (
              <p className="mt-1 text-[11px] leading-snug text-[var(--tn-muted)]">
                {card.hint}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
