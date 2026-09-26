"use client";

import { formatRelativeTime } from "@/lib/utils/dates";

interface HeaderProps {
  lastUpdated: string | null;
  chainId: number;
}

export function Header({ lastUpdated, chainId }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--tn-border)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--tn-muted)]">
            BEP-20 / BNB SMART CHAIN
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[var(--tn-navy)] sm:text-3xl">
            TREASURENOVA
          </h1>
          <p className="text-sm font-medium text-[var(--tn-navy-soft)]">
            USDT WALLET ANALYTICS
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--tn-border)] bg-[var(--tn-info-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--tn-info)]">
            <span className="h-2 w-2 rounded-full bg-[var(--tn-info)]" aria-hidden />
            BNB Smart Chain
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--tn-live)]" aria-hidden />
            LIVE
          </span>
          <span className="rounded-full border border-[var(--tn-border)] bg-white px-3 py-1.5 text-xs text-[var(--tn-muted)]">
            Chain ID: {chainId}
          </span>
          <span
            className="rounded-full border border-[var(--tn-border)] bg-white px-3 py-1.5 text-xs text-[var(--tn-muted)]"
            title={lastUpdated || undefined}
          >
            Last updated {formatRelativeTime(lastUpdated)}
          </span>
        </div>
      </div>
      <div className="border-t border-[var(--tn-border)] bg-[var(--tn-navy)] px-4 py-1.5 text-center text-[11px] font-medium tracking-wide text-white/90">
        LIVE BLOCKCHAIN DATA · Read-only analytics · No wallet connection
      </div>
    </header>
  );
}
