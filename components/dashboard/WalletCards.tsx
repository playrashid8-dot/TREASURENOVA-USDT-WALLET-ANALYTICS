"use client";

import type { WalletCardData, WalletCardType } from "@/types/analytics";
import { formatUsdtExact } from "@/lib/utils/format";
import { shortAddress } from "@/lib/utils/addresses";
import { explorerAddressUrl } from "@/lib/config";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { CopyButton, CopyIconButton } from "./CopyButton";

/** Full locale amount for cards (never abbreviate to M/B). */
function formatBalance(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
interface WalletCardsProps {
  wallets: WalletCardData[];
  loading: boolean;
}

const THEME: Record<
  WalletCardType,
  {
    card: string;
    iconBg: string;
    amount: string;
    chart: string;
    glow: string;
  }
> = {
  deposit: {
    card: "tn-card-deposit",
    iconBg: "bg-[var(--tn-deposit-bg)] text-[var(--tn-deposit)]",
    amount:
      "text-[var(--tn-deposit)] drop-shadow-[0_0_18px_rgba(46,230,166,0.35)]",
    chart: "stroke-[var(--tn-deposit)]",
    glow: "from-[rgba(46,230,166,0.12)]",
  },
  withdraw: {
    card: "tn-card-withdraw",
    iconBg: "bg-[var(--tn-withdraw-bg)] text-[var(--tn-withdraw)]",
    amount:
      "text-[var(--tn-withdraw)] drop-shadow-[0_0_18px_rgba(255,107,138,0.35)]",
    chart: "stroke-[var(--tn-withdraw)]",
    glow: "from-[rgba(255,107,138,0.12)]",
  },
  reserve: {
    card: "tn-card-reserve",
    iconBg: "bg-[var(--tn-reserve-bg)] text-[var(--tn-reserve)]",
    amount:
      "text-[var(--tn-reserve)] drop-shadow-[0_0_18px_rgba(240,193,75,0.35)]",
    chart: "stroke-[var(--tn-reserve)]",
    glow: "from-[rgba(240,193,75,0.12)]",
  },
};

export function WalletCards({ wallets, loading }: WalletCardsProps) {
  if (loading && wallets.length === 0) {
    return <LoadingSkeleton />;
  }

  const ordered: WalletCardType[] = ["deposit", "withdraw", "reserve"];

  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3 md:gap-4">
      {ordered.map((type) => {
        const wallet = wallets.find((w) => w.walletType === type);
        if (!wallet) {
          return <EmptyWalletCard key={type} type={type} />;
        }
        return <WalletCard key={type} wallet={wallet} />;
      })}
    </div>
  );
}

function WalletCard({ wallet }: { wallet: WalletCardData }) {
  const theme = THEME[wallet.walletType];
  const title =
    wallet.walletType === "deposit"
      ? "Deposit Wallet"
      : wallet.walletType === "withdraw"
        ? "Withdraw Wallet"
        : "TREASURENOVA RESERVE FUND";
  const balanceCaption =
    wallet.walletType === "reserve"
      ? "Live USDT Reserve Balance"
      : "Current Balance";
  const explorerUrl = explorerAddressUrl(wallet.address);

  let balanceLabel: string;
  if (wallet.balance != null) {
    balanceLabel = formatBalance(wallet.balance);
  } else if (wallet.balanceError) {
    balanceLabel = "Unavailable";
  } else {
    balanceLabel = "—";
  }

  return (
    <article
      className={`tn-card relative overflow-hidden p-3.5 sm:p-5 ${theme.card}`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t ${theme.glow} to-transparent opacity-80`}
        aria-hidden
      />
      <WaveChart className={theme.chart} />

      <div className="relative flex items-start gap-2.5 sm:gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${theme.iconBg}`}
        >
          {wallet.walletType === "reserve" ? <ShieldIcon /> : <WalletIcon />}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className={`text-[15px] font-bold leading-tight text-white sm:text-base ${
              wallet.walletType === "reserve" ? "uppercase tracking-wide" : ""
            }`}
          >
            {title}
          </h2>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            <p
              className="min-w-0 truncate font-mono text-[11px] text-[var(--tn-muted)] sm:text-xs"
              title={wallet.address}
            >
              {shortAddress(wallet.address, 4)}
            </p>
            <CopyIconButton value={wallet.address} label="Copy address" />
          </div>
        </div>
      </div>

      <div className="relative mt-4 sm:mt-5">
        <p className="text-[12px] font-medium tracking-wide text-[var(--tn-muted)]">
          {balanceCaption}
        </p>
        <p
          className={`mt-1 text-[1.85rem] font-extrabold leading-none tracking-tight sm:text-[2rem] ${
            wallet.balance != null ? theme.amount : "text-[var(--tn-muted)]"
          }`}
          title={
            wallet.balance != null
              ? `${formatUsdtExact(wallet.balance)} USDT`
              : undefined
          }
        >
          {balanceLabel}
        </p>
        <p
          className={`mt-1 text-sm font-semibold ${
            wallet.balance != null ? theme.amount : "text-[var(--tn-muted)]"
          }`}
        >
          USDT
        </p>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--tn-border)] bg-[var(--tn-surface-2)]/80 px-3 text-xs font-semibold text-[var(--tn-text)] transition hover:brightness-110 sm:flex-none sm:px-4"
        >
          View Wallet
        </a>
        <CopyButton
          value={wallet.address}
          label="Copy"
          className="min-h-10 min-w-10 px-3 text-xs"
        />
      </div>
    </article>
  );
}

function EmptyWalletCard({ type }: { type: WalletCardType }) {
  const theme = THEME[type];
  const title =
    type === "deposit"
      ? "Deposit Wallet"
      : type === "withdraw"
        ? "Withdraw Wallet"
        : "TREASURENOVA RESERVE FUND";

  return (
    <article className={`tn-card p-3.5 sm:p-5 ${theme.card}`}>
      <h2 className="text-base font-bold text-white">{title}</h2>
      <p className="mt-4 text-sm text-[var(--tn-muted)]">
        Unable to load live data
      </p>
    </article>
  );
}

function WaveChart({ className }: { className: string }) {
  return (
    <svg
      className={`pointer-events-none absolute bottom-14 right-0 h-16 w-[70%] opacity-40 sm:bottom-16 ${className}`}
      viewBox="0 0 200 60"
      fill="none"
      aria-hidden
    >
      <path
        d="M0 40 C20 30, 40 50, 60 35 S100 15, 120 28 S160 50, 200 22"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M0 48 C25 38, 45 55, 70 42 S110 28, 140 38 S175 52, 200 34"
        strokeWidth="1.2"
        opacity="0.45"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.5 8.5A2.5 2.5 0 0 1 6 6h12.5A1.5 1.5 0 0 1 20 7.5V9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="2.5"
        y="8.5"
        width="19"
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="16.5" cy="14" r="1.4" fill="currentColor" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 5.5 6v5.2c0 4.4 2.9 7.6 6.5 8.8 3.6-1.2 6.5-4.4 6.5-8.8V6L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 12.1 11 13.9l3.8-3.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
