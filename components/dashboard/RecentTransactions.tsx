"use client";

import type { TransactionRow } from "@/types/analytics";
import { shortAddress } from "@/lib/utils/addresses";
import { formatDisplayDateTime, formatRelativeTime } from "@/lib/utils/dates";
import { formatSignedUsdt } from "@/lib/utils/format";
import { explorerTxUrl } from "@/lib/utils/explorer";
import { EmptyState } from "./EmptyState";
import { LoadingSkeleton } from "./LoadingSkeleton";

interface RecentTransactionsProps {
  data: TransactionRow[];
  loading: boolean;
}

export function RecentTransactions({
  data,
  loading,
}: RecentTransactionsProps) {
  if (loading && data.length === 0) {
    return <LoadingSkeleton variant="cards" />;
  }

  return (
    <article className="tn-card p-4 sm:p-5">
      <h2 className="text-lg font-bold text-[var(--tn-navy)]">
        Recent Transactions
      </h2>
      <p className="mt-1 text-sm text-[var(--tn-muted)]">
        Latest indexed USDT transfers · updates automatically
      </p>

      {data.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No transactions found." />
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="mt-4 grid gap-3 md:hidden">
            {data.map((tx) => (
              <div
                key={`${tx.txHash}-${tx.logIndex}-${tx.walletAddress}`}
                className="rounded-xl border border-[var(--tn-border)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <TypeBadge type={tx.walletType} />
                  <span
                    className={`text-sm font-bold ${
                      tx.walletType === "deposit"
                        ? "text-[var(--tn-deposit)]"
                        : "text-[var(--tn-withdraw)]"
                    }`}
                  >
                    {formatSignedUsdt(tx.amountUsdt, tx.walletType === "deposit")}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--tn-muted)]">
                  {shortAddress(tx.fromAddress)} → {shortAddress(tx.toAddress)}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--tn-muted)]">
                  <span title={formatDisplayDateTime(tx.timestamp)}>
                    {formatRelativeTime(tx.timestamp)}
                  </span>
                  <a
                    href={explorerTxUrl(tx.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[var(--tn-info)]"
                  >
                    {shortAddress(tx.txHash, 4)}
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="mt-4 hidden table-scroll rounded-xl border border-[var(--tn-border)] md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--tn-muted)]">
                <tr>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">From / To</th>
                  <th className="px-3 py-3">Time</th>
                  <th className="px-3 py-3">Hash</th>
                </tr>
              </thead>
              <tbody>
                {data.map((tx) => (
                  <tr
                    key={`${tx.txHash}-${tx.logIndex}-${tx.walletAddress}`}
                    className="border-t border-[var(--tn-border)]"
                  >
                    <td className="px-3 py-3">
                      <TypeBadge type={tx.walletType} />
                    </td>
                    <td
                      className={`px-3 py-3 font-semibold ${
                        tx.walletType === "deposit"
                          ? "text-[var(--tn-deposit)]"
                          : "text-[var(--tn-withdraw)]"
                      }`}
                    >
                      {formatSignedUsdt(
                        tx.amountUsdt,
                        tx.walletType === "deposit",
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {shortAddress(tx.fromAddress)} → {shortAddress(tx.toAddress)}
                    </td>
                    <td
                      className="px-3 py-3 text-[var(--tn-muted)]"
                      title={formatDisplayDateTime(tx.timestamp)}
                    >
                      {formatRelativeTime(tx.timestamp)}
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={explorerTxUrl(tx.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-[var(--tn-info)] hover:underline"
                      >
                        {shortAddress(tx.txHash, 6)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </article>
  );
}

function TypeBadge({ type }: { type: "deposit" | "withdraw" }) {
  const deposit = type === "deposit";
  return (
    <span
      className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${
        deposit
          ? "bg-[var(--tn-deposit-bg)] text-[var(--tn-deposit)]"
          : "bg-[var(--tn-withdraw-bg)] text-[var(--tn-withdraw)]"
      }`}
    >
      {deposit ? "Deposit" : "Withdrawal"}
    </span>
  );
}
