"use client";

import { useEffect, useState } from "react";
import type { WalletCardData } from "@/types/analytics";
import { formatUsdt, formatUsdtExact } from "@/lib/utils/format";
import { shortAddress } from "@/lib/utils/addresses";
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
  const reserve = wallets.find((w) => w.walletType === "reserve");

  return (
    <div className="space-y-4 md:space-y-5">
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
      {reserve ? (
        <ReserveFundCard wallet={reserve} loading={loading} />
      ) : (
        <EmptyReserveFundCard />
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

function ReserveFundCard({
  wallet,
  loading,
}: {
  wallet: WalletCardData;
  loading: boolean;
}) {
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);

  useEffect(() => {
    if (wallet.balance == null && !wallet.balanceError) {
      setSecondsAgo(null);
      return;
    }
    const fetchedAt = Date.now();
    setSecondsAgo(0);
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - fetchedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [wallet.balance, wallet.balanceError]);

  let balanceLabel: string;
  if (wallet.balance != null) {
    balanceLabel = `${formatUsdt(wallet.balance)} USDT`;
  } else if (loading && !wallet.balanceError) {
    balanceLabel = "Loading...";
  } else {
    balanceLabel = "Unable to load reserve balance";
  }

  return (
    <article className="tn-card tn-card-reserve p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--tn-reserve-bg)] text-[var(--tn-reserve)]">
          <ShieldIcon />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold uppercase tracking-wide text-white sm:text-lg">
            TreasureNOVA Reserve Fund
          </h2>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            <p
              className="min-w-0 truncate font-mono text-[11px] text-[var(--tn-muted)] sm:text-xs"
              title={wallet.address}
            >
              {shortAddress(wallet.address, 10)}
            </p>
            <CopyIconButton value={wallet.address} label="Copy address" />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium tracking-wide text-[var(--tn-muted)]">
          Live USDT Reserve Balance
        </p>
        <p
          className={`mt-1.5 break-words text-2xl font-extrabold tracking-tight sm:text-3xl ${
            wallet.balance != null
              ? "text-[var(--tn-reserve)] drop-shadow-[0_0_18px_rgba(240,193,75,0.35)]"
              : "text-[var(--tn-muted)]"
          }`}
          title={
            wallet.balance != null
              ? `${formatUsdtExact(wallet.balance)} USDT`
              : undefined
          }
        >
          {balanceLabel}
        </p>
        {wallet.balance != null && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--tn-muted)]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--tn-live)]">
              <span
                className="tn-live-dot inline-block h-2 w-2 rounded-full bg-[var(--tn-live)]"
                aria-hidden
              />
              LIVE
            </span>
            {secondsAgo != null && (
              <span>
                Updated {secondsAgo === 0 ? "just now" : `${secondsAgo} sec ago`}
              </span>
            )}
          </div>
        )}
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

function EmptyReserveFundCard() {
  return (
    <article className="tn-card tn-card-reserve p-5 sm:p-6">
      <h2 className="text-base font-bold uppercase tracking-wide text-white">
        TreasureNOVA Reserve Fund
      </h2>
      <p className="mt-2 text-xs text-[var(--tn-muted)]">
        Live USDT Reserve Balance
      </p>
      <p className="mt-6 text-sm text-[var(--tn-muted)]">
        Unable to load reserve balance
      </p>
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
