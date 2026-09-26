"use client";

import { useEffect } from "react";
import type { TransactionRow } from "@/types/analytics";
import { formatDisplayDateTime } from "@/lib/utils/dates";
import { formatUsdtExact } from "@/lib/utils/format";
import {
  explorerAddressUrl,
  explorerTokenUrl,
  explorerTxUrl,
} from "@/lib/utils/explorer";
import { CopyButton } from "./CopyButton";

interface TransactionDetailsProps {
  tx: TransactionRow;
  onClose: () => void;
}

export function TransactionDetails({ tx, onClose }: TransactionDetailsProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-details-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--tn-border)] bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3
              id="tx-details-title"
              className="text-lg font-bold text-[var(--tn-navy)]"
            >
              Transaction Details
            </h3>
            <p className="text-sm text-[var(--tn-muted)]">
              {tx.walletType === "deposit" ? "Deposit" : "Withdrawal"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--tn-border)] px-3 py-1.5 text-sm font-semibold"
            aria-label="Close details"
          >
            Close
          </button>
        </div>

        <dl className="space-y-3 text-sm">
          <Row label="Transaction Hash" value={tx.txHash} mono copy />
          <Row label="Status" value={tx.status} />
          <Row label="Block Number" value={String(tx.blockNumber)} />
          <Row label="Timestamp" value={formatDisplayDateTime(tx.timestamp)} />
          <Row label="Token Contract" value={tx.tokenContract} mono copy />
          <Row label="Token Symbol" value={tx.tokenSymbol} />
          <Row
            label="Amount"
            value={`${formatUsdtExact(tx.amountUsdt)} ${tx.tokenSymbol}`}
          />
          <Row label="From" value={tx.fromAddress} mono copy />
          <Row label="To" value={tx.toAddress} mono copy />
          <Row
            label="Wallet Category"
            value={tx.walletType === "deposit" ? "Deposit Wallet" : "Withdraw Wallet"}
          />
          <Row label="Log Index" value={String(tx.logIndex)} />
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={explorerTxUrl(tx.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl bg-[var(--tn-navy)] px-4 text-sm font-semibold text-white"
          >
            View on BscScan
          </a>
          <a
            href={explorerAddressUrl(tx.fromAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--tn-border)] px-4 text-sm font-semibold"
          >
            From Address
          </a>
          <a
            href={explorerTokenUrl(tx.tokenContract)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--tn-border)] px-4 text-sm font-semibold"
          >
            Token
          </a>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--tn-border)] p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--tn-muted)]">
        {label}
      </dt>
      <dd
        className={`mt-1 break-all ${mono ? "font-mono text-xs" : "font-medium"}`}
      >
        {value}
      </dd>
      {copy && (
        <div className="mt-2">
          <CopyButton value={value} label="Copy" className="min-h-9 px-3 py-1.5" />
        </div>
      )}
    </div>
  );
}
