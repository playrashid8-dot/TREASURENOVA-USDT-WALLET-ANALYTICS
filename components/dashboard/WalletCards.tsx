"use client";

import type { WalletCardData } from "@/types/analytics";
import { shortAddress } from "@/lib/utils/addresses";
import { formatUsdt, formatUsdtExact } from "@/lib/utils/format";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { CopyButton } from "./CopyButton";

interface WalletCardsProps {
  wallets: WalletCardData[];
  loading: boolean;
}

export function WalletCards({ wallets, loading }: WalletCardsProps) {
  if (loading && wallets.length === 0) {
    return <LoadingSkeleton variant="wallets" />;
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-bold text-[var(--tn-navy)]">Wallets</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {wallets.map((w) => (
          <WalletCard key={w.address} wallet={w} />
        ))}
      </div>
    </div>
  );
}

function WalletCard({ wallet }: { wallet: WalletCardData }) {
  const isDeposit = wallet.walletType === "deposit";
  const explorer =
    (wallet as WalletCardData & { explorerUrl?: string }).explorerUrl ||
    `https://bscscan.com/address/${wallet.address}`;

  return (
    <article className="tn-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span
            className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${
              isDeposit
                ? "bg-[var(--tn-deposit-bg)] text-[var(--tn-deposit)]"
                : "bg-[var(--tn-withdraw-bg)] text-[var(--tn-withdraw)]"
            }`}
          >
            {isDeposit ? "DEPOSIT WALLET" : "WITHDRAW WALLET"}
          </span>
          <p
            className="mt-3 font-mono text-sm font-semibold text-[var(--tn-navy)]"
            title={wallet.address}
          >
            {shortAddress(wallet.address, 6)}
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-[var(--tn-muted)]">
            {wallet.address}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-[var(--tn-muted)]">Current Balance</dt>
          <dd
            className="mt-1 text-lg font-bold text-[var(--tn-navy)]"
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
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--tn-muted)]">
            {isDeposit ? "Total Incoming" : "Total Incoming (Withdrawals)"}
          </dt>
          <dd className="mt-1 text-lg font-bold text-[var(--tn-navy)]">
            {formatUsdt(wallet.totalIncoming)} USDT
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--tn-muted)]">Transactions</dt>
          <dd className="mt-1 text-lg font-bold text-[var(--tn-navy)]">
            {wallet.transactionCount.toLocaleString("en-US")}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <CopyButton value={wallet.address} label="Copy Address" />
        <a
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--tn-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--tn-info)] transition hover:bg-slate-50"
        >
          View on BscScan
          <ExternalIcon />
        </a>
      </div>
    </article>
  );
}

function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
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
