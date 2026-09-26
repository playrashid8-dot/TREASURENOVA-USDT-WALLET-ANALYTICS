"use client";

import type { WalletCardData } from "@/types/analytics";
import { formatUsdt, formatUsdtExact } from "@/lib/utils/format";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { CopyIconButton } from "./CopyButton";

interface WalletCardsProps {
  wallets: WalletCardData[];
  loading: boolean;
}

export function WalletCards({ wallets, loading }: WalletCardsProps) {
  if (loading && wallets.length === 0) {
    return <LoadingSkeleton variant="wallets" />;
  }

  const deposit = wallets.find((w) => w.walletType === "deposit");
  const withdraw = wallets.find((w) => w.walletType === "withdraw");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
      {deposit ? (
        <WalletCard wallet={deposit} />
      ) : (
        <EmptyWalletCard type="deposit" />
      )}
      {withdraw ? (
        <WalletCard wallet={withdraw} />
      ) : (
        <EmptyWalletCard type="withdraw" />
      )}
    </div>
  );
}

function WalletCard({ wallet }: { wallet: WalletCardData }) {
  const isDeposit = wallet.walletType === "deposit";

  return (
    <article
      className={`tn-card p-5 sm:p-6 ${
        isDeposit ? "tn-card-deposit" : "tn-card-withdraw"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            isDeposit
              ? "bg-[var(--tn-deposit-bg)] text-[var(--tn-deposit)]"
              : "bg-[var(--tn-withdraw-bg)] text-[var(--tn-withdraw)]"
          }`}
        >
          <WalletIcon />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-white sm:text-lg">
            {isDeposit ? "Deposit Wallet" : "Withdraw Wallet"}
          </h2>
          <div className="mt-1.5 flex items-center gap-1.5">
            <p
              className="truncate font-mono text-[11px] text-[var(--tn-muted)] sm:text-xs"
              title={wallet.address}
            >
              {wallet.address}
            </p>
            <CopyIconButton value={wallet.address} label="Copy address" />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium tracking-wide text-[var(--tn-muted)]">
          Current Balance
        </p>
        <p
          className={`mt-1.5 text-2xl font-extrabold tracking-tight sm:text-3xl ${
            isDeposit
              ? "text-[var(--tn-deposit)] drop-shadow-[0_0_18px_rgba(46,230,166,0.35)]"
              : "text-[var(--tn-withdraw)] drop-shadow-[0_0_18px_rgba(255,107,138,0.35)]"
          }`}
          title={
            wallet.balance != null
              ? `${formatUsdtExact(wallet.balance)} USDT`
              : undefined
          }
        >
          {wallet.balance != null
            ? `${formatUsdt(wallet.balance)} USDT`
            : wallet.balanceError
              ? "Unavailable"
              : "—"}
        </p>
      </div>
    </article>
  );
}

function EmptyWalletCard({ type }: { type: "deposit" | "withdraw" }) {
  const isDeposit = type === "deposit";
  return (
    <article
      className={`tn-card p-5 sm:p-6 ${
        isDeposit ? "tn-card-deposit" : "tn-card-withdraw"
      }`}
    >
      <h2 className="text-base font-bold text-white">
        {isDeposit ? "Deposit Wallet" : "Withdraw Wallet"}
      </h2>
      <p className="mt-6 text-sm text-[var(--tn-muted)]">Balance unavailable</p>
    </article>
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
