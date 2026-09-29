"use client";

import { useEffect, useState } from "react";
import type {
  RecentTransactionsResponse,
  TransactionRow,
  WalletCardType,
} from "@/types/analytics";
import { shortAddress } from "@/lib/utils/addresses";
import {
  formatDisplayDate,
  formatDisplayTimeUtc,
  formatRelativeTime,
} from "@/lib/utils/dates";
import { formatUsdtExact } from "@/lib/utils/format";
import { explorerTxUrl } from "@/lib/config";
import { CopyIconButton } from "./CopyButton";
import { EmptyState } from "./EmptyState";

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
interface RecentTxHistoryProps {
  data: RecentTransactionsResponse | null;
  loading: boolean;
  onRefresh?: () => void;
}

const THEME: Record<
  WalletCardType,
  {
    amount: string;
    badge: string;
    label: string;
  }
> = {
  deposit: {
    amount: "text-[var(--tn-deposit)]",
    badge:
      "border-[var(--tn-deposit-border)] bg-[var(--tn-deposit-bg)] text-[var(--tn-deposit)]",
    label: "Deposit",
  },
  withdraw: {
    amount: "text-[var(--tn-withdraw)]",
    badge:
      "border-[var(--tn-withdraw-border)] bg-[var(--tn-withdraw-bg)] text-[var(--tn-withdraw)]",
    label: "Withdraw",
  },
  reserve: {
    amount: "text-[var(--tn-reserve)]",
    badge:
      "border-[var(--tn-reserve-border)] bg-[var(--tn-reserve-bg)] text-[var(--tn-reserve)]",
    label: "Reserve",
  },
};

export function RecentTxHistory({
  data,
  loading,
  onRefresh,
}: RecentTxHistoryProps) {
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

  const liveStatus = data?.liveStatus ?? "STALE";
  const txs = data?.transactions ?? [];

  return (
    <article className="tn-card w-full max-w-full overflow-hidden p-3.5 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tn-info-bg)] text-[var(--tn-info)]">
            <ListIcon />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">Recent TX History</h2>
            <p className="mt-0.5 text-sm text-[var(--tn-muted)]">
              Latest 10 USDT Transactions (All Wallets Combined)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-xs text-[var(--tn-muted)] sm:justify-end sm:pl-0">
          <LiveStatusPill status={liveStatus} />
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
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--tn-border)] text-[var(--tn-muted)] transition hover:text-[var(--tn-info)]"
              aria-label="Refresh transactions"
            >
              <RefreshIcon />
            </button>
          )}
        </div>
      </div>

      {liveStatus === "STALE" && data && (
        <p className="mb-3 text-xs text-orange-200/90" role="status">
          Data may be delayed
        </p>
      )}
      {liveStatus === "SYNCING" && data && (
        <p className="mb-3 text-xs text-amber-200/90" role="status">
          Syncing...
        </p>
      )}

      {loading && !data ? (
        <div className="space-y-2.5" aria-busy>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--tn-border)] p-3"
            >
              <div className="tn-skeleton h-4 w-24" />
              <div className="tn-skeleton mt-2 h-5 w-32" />
              <div className="tn-skeleton mt-3 h-12 w-full" />
            </div>
          ))}
        </div>
      ) : txs.length === 0 ? (
        <EmptyState message="No indexed USDT transfers yet for the configured wallets." />
      ) : (
        <ol className="space-y-2.5">
          {txs.map((tx, index) => (
            <li key={`${tx.txHash}-${tx.logIndex}-${tx.walletType}`}>
              <TxCard tx={tx} index={index + 1} />
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function LiveStatusPill({
  status,
}: {
  status: RecentTransactionsResponse["liveStatus"];
}) {
  const styles =
    status === "LIVE"
      ? "text-[var(--tn-live)]"
      : status === "SYNCING"
        ? "text-amber-300"
        : status === "STALE"
          ? "text-orange-300"
          : "text-red-300";
  const dot =
    status === "LIVE"
      ? "bg-[var(--tn-live)] tn-live-dot"
      : status === "SYNCING"
        ? "bg-amber-400"
        : status === "STALE"
          ? "bg-orange-400"
          : "bg-red-400";

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${styles}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {status}
    </span>
  );
}

function TxCard({ tx, index }: { tx: TransactionRow; index: number }) {
  const theme = THEME[tx.walletType] ?? THEME.deposit;

  return (
    <div className="w-full max-w-full rounded-xl border border-[var(--tn-border)] bg-[var(--tn-surface-2)]/70 p-3 sm:p-3.5">
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white"
          aria-hidden
        >
          {index}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${theme.badge}`}
              >
                {tx.walletType === "reserve" ? (
                  <ShieldMini />
                ) : (
                  <WalletMini />
                )}
                {theme.label}
              </span>
              <p className="mt-1.5 text-xs leading-snug text-[var(--tn-muted)]">
                <span className="block text-[var(--tn-text)]">
                  {formatDisplayDate(tx.timestamp)}
                </span>
                <span className="block">{formatDisplayTimeUtc(tx.timestamp)}</span>
              </p>
            </div>

            <div className="text-right">
              <p
                className={`text-base font-extrabold tracking-tight sm:text-lg ${theme.amount}`}
                title={`${formatUsdtExact(tx.amountUsdt)} USDT`}
              >
                {formatAmount(tx.amountUsdt)}
              </p>
              <p className={`text-[11px] font-semibold ${theme.amount}`}>USDT</p>
            </div>
          </div>

          <dl className="mt-2.5 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2 sm:gap-x-4 sm:text-xs">
            <div className="min-w-0">
              <dt className="inline text-[var(--tn-muted)]">From: </dt>
              <dd
                className="inline font-mono text-[var(--tn-text)]"
                title={tx.fromAddress}
              >
                {shortAddress(tx.fromAddress, 4)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="inline text-[var(--tn-muted)]">To: </dt>
              <dd
                className="inline font-mono text-[var(--tn-text)]"
                title={tx.toAddress}
              >
                {shortAddress(tx.toAddress, 4)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="inline text-[var(--tn-muted)]">Block: </dt>
              <dd className="inline font-mono text-[var(--tn-text)]">
                {tx.blockNumber.toLocaleString("en-US")}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="inline text-[var(--tn-muted)]">TX: </dt>
              <dd
                className="inline font-mono text-[var(--tn-info)]"
                title={tx.txHash}
              >
                {shortAddress(tx.txHash, 4)}
              </dd>
            </div>
          </dl>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <CopyIconButton
              value={tx.txHash}
              label="Copy transaction hash"
              className="h-8 w-8 rounded-lg border border-[var(--tn-border)]"
            />
            <a
              href={explorerTxUrl(tx.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--tn-info)]/40 bg-[var(--tn-info-bg)] px-2.5 text-[11px] font-semibold text-[var(--tn-info)] transition hover:brightness-110"
              aria-label={`View ${tx.txHash} on BscScan`}
            >
              BscScan
              <ExternalIcon />
            </a>
          </div>
        </div>
      </div>
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

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 12a8 8 0 1 1-2.3-5.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 4v5h-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function WalletMini() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="8"
        width="18"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="16" cy="13.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function ShieldMini() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 5.5 6v5c0 4 2.8 7 6.5 8.5C15.7 18 18.5 15 18.5 11V6L12 3.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
