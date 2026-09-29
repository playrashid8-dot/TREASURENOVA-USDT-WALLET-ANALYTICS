"use client";

import { useEffect, useState } from "react";
import type {
  LargeTxWalletSection,
  LargeTransactionsResponse,
  TransactionRow,
  WalletCardType,
} from "@/types/analytics";
import { shortAddress } from "@/lib/utils/addresses";
import { formatDisplayDateTime, formatRelativeTime } from "@/lib/utils/dates";
import { formatUsdt, formatUsdtExact } from "@/lib/utils/format";
import { explorerTxUrl } from "@/lib/config";
import { CopyIconButton, CopyButton } from "./CopyButton";
import { EmptyState } from "./EmptyState";

interface RecentLargeTransactionsProps {
  data: LargeTransactionsResponse | null;
  loading: boolean;
}

const THEME: Record<
  WalletCardType,
  {
    card: string;
    accent: string;
    amount: string;
    badge: string;
  }
> = {
  deposit: {
    card: "tn-card-deposit",
    accent: "text-[var(--tn-deposit)]",
    amount: "text-[var(--tn-deposit)]",
    badge: "border-[var(--tn-deposit-border)] bg-[var(--tn-deposit-bg)] text-[var(--tn-deposit)]",
  },
  withdraw: {
    card: "tn-card-withdraw",
    accent: "text-[var(--tn-withdraw)]",
    amount: "text-[var(--tn-withdraw)]",
    badge: "border-[var(--tn-withdraw-border)] bg-[var(--tn-withdraw-bg)] text-[var(--tn-withdraw)]",
  },
  reserve: {
    card: "tn-card-reserve",
    accent: "text-[var(--tn-reserve)]",
    amount: "text-[var(--tn-reserve)]",
    badge: "border-[var(--tn-reserve-border)] bg-[var(--tn-reserve-bg)] text-[var(--tn-reserve)]",
  },
};

export function RecentLargeTransactions({
  data,
  loading,
}: RecentLargeTransactionsProps) {
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);

  useEffect(() => {
    if (!data?.lastUpdated) {
      setSecondsAgo(null);
      return;
    }
    const tick = () => {
      const d = new Date(data.lastUpdated!);
      if (Number.isNaN(d.getTime())) {
        setSecondsAgo(null);
        return;
      }
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data?.lastUpdated]);

  const minLabel = (data?.minAmountUsdt ?? 10_000).toLocaleString("en-US");
  const days = data?.completedDays ?? 5;

  return (
    <article className="tn-card w-full max-w-full overflow-hidden p-3.5 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tn-info-bg)] text-[var(--tn-info)]">
            <ListIcon />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">
              Recent Large Transactions
            </h2>
            <p className="mt-0.5 text-sm text-[var(--tn-muted)]">
              Last {days} Days • ≥ {minLabel} USDT (BEP-20)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-xs text-[var(--tn-muted)] sm:pl-0 sm:justify-end">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--tn-live)]">
            <span
              className="tn-live-dot inline-block h-2 w-2 rounded-full bg-[var(--tn-live)]"
              aria-hidden
            />
            LIVE
          </span>
          <span>
            Last updated:{" "}
            {secondsAgo != null
              ? secondsAgo === 0
                ? "just now"
                : `${secondsAgo} second${secondsAgo === 1 ? "" : "s"} ago`
              : data?.lastUpdated
                ? formatRelativeTime(data.lastUpdated)
                : "—"}
          </span>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4" aria-busy>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-[var(--tn-border)] p-3.5">
              <div className="tn-skeleton h-5 w-40" />
              <div className="tn-skeleton mt-2 h-4 w-56 max-w-full" />
              <div className="tn-skeleton mt-4 h-16 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {(data?.wallets ?? []).map((section) => (
            <WalletTxSection key={section.walletType} section={section} />
          ))}
        </div>
      )}
    </article>
  );
}

function WalletTxSection({ section }: { section: LargeTxWalletSection }) {
  const theme = THEME[section.walletType];

  return (
    <section
      className={`rounded-xl border p-3 sm:p-4 ${theme.card}`}
      style={{ borderColor: "inherit" }}
      aria-label={`${section.label} large transactions`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className={`text-base font-bold ${theme.accent}`}>
            {section.label}
          </h3>
          <p
            className="mt-0.5 font-mono text-[11px] text-[var(--tn-muted)] sm:text-xs"
            title={section.address}
          >
            {shortAddress(section.address, 6)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] sm:justify-end sm:text-xs">
          <span
            className={`inline-flex rounded-lg border px-2 py-1 font-semibold ${theme.badge}`}
          >
            Last 5 days
          </span>
          <span
            className={`inline-flex rounded-lg border px-2 py-1 font-semibold ${theme.badge}`}
          >
            ≥ 10,000 USDT
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <p className="text-[var(--tn-muted)]">
          <span className="font-semibold text-white">
            {section.transactionCount.toLocaleString("en-US")}
          </span>{" "}
          qualifying tx
          {section.transactionCount === 1 ? "" : "s"}
        </p>
        <p className="text-[var(--tn-muted)]">
          Total{" "}
          <span
            className={`font-bold ${theme.amount}`}
            title={`${formatUsdtExact(section.totalUsdt)} USDT`}
          >
            {formatUsdt(section.totalUsdt)} USDT
          </span>
        </p>
      </div>

      <div className="mt-3 space-y-2.5">
        {section.transactions.length === 0 ? (
          <EmptyState
            message={`No ${section.label} transfers ≥ 10,000 USDT in the last 5 completed UTC days.`}
          />
        ) : (
          section.transactions.map((tx) => (
            <TxCard
              key={`${tx.txHash}-${tx.logIndex}-${section.walletType}`}
              tx={tx}
              walletType={section.walletType}
            />
          ))
        )}
      </div>
    </section>
  );
}

function TxCard({
  tx,
  walletType,
}: {
  tx: TransactionRow;
  walletType: WalletCardType;
}) {
  const theme = THEME[walletType];

  return (
    <div className="w-full max-w-full rounded-xl border border-[var(--tn-border)] bg-[var(--tn-surface-2)]/70 p-3 sm:p-3.5">
      <p
        className={`text-lg font-extrabold tracking-tight ${theme.amount}`}
        title={`${formatUsdtExact(tx.amountUsdt)} USDT`}
      >
        {formatUsdt(tx.amountUsdt)} USDT
      </p>
      <p className="mt-0.5 text-xs text-[var(--tn-muted)]">
        {formatDisplayDateTime(tx.timestamp)}
      </p>

      <dl className="mt-3 space-y-1.5 text-xs sm:text-sm">
        <AddrRow label="From" address={tx.fromAddress} />
        <AddrRow label="To" address={tx.toAddress} />
        <div className="flex min-w-0 items-center gap-1.5">
          <dt className="shrink-0 text-[var(--tn-muted)]">TX:</dt>
          <dd className="min-w-0 font-mono text-[var(--tn-info)]">
            {shortAddress(tx.txHash, 4)}
          </dd>
          <CopyIconButton value={tx.txHash} label="Copy transaction hash" />
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="shrink-0 text-[var(--tn-muted)]">Block:</dt>
          <dd className="font-mono text-[var(--tn-text)]">
            {tx.blockNumber.toLocaleString("en-US")}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={tx.txHash} label="Copy" className="min-h-10 px-3 text-xs" />
        <a
          href={explorerTxUrl(tx.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--tn-info)]/40 bg-[var(--tn-info-bg)] px-3 text-xs font-semibold text-[var(--tn-info)] transition hover:brightness-110"
        >
          View on BscScan
          <ExternalIcon />
        </a>
      </div>
    </div>
  );
}

function AddrRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <dt className="shrink-0 text-[var(--tn-muted)]">{label}:</dt>
      <dd className="min-w-0 truncate font-mono text-[var(--tn-text)]" title={address}>
        {shortAddress(address, 4)}
      </dd>
      <CopyIconButton value={address} label={`Copy ${label.toLowerCase()} address`} />
    </div>
  );
}

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 5h5v5M19 5l-9 9M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
