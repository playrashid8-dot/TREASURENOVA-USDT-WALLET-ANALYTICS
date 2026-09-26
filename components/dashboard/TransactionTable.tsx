"use client";

import { useState } from "react";
import type { TransactionRow } from "@/types/analytics";
import { shortAddress } from "@/lib/utils/addresses";
import { formatDisplayDateTime } from "@/lib/utils/dates";
import { formatSignedUsdt, formatUsdtExact } from "@/lib/utils/format";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/utils/explorer";
import { EmptyState } from "./EmptyState";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { TransactionDetails } from "./TransactionDetails";

interface TransactionTableProps {
  data: TransactionRow[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  search: string;
  type: "all" | "deposit" | "withdraw";
  onSearchChange: (value: string) => void;
  onTypeChange: (value: "all" | "deposit" | "withdraw") => void;
  onPageChange: (page: number) => void;
  queryBase: string;
}

export function TransactionTable({
  data,
  loading,
  page,
  totalPages,
  total,
  search,
  type,
  onSearchChange,
  onTypeChange,
  onPageChange,
  queryBase,
}: TransactionTableProps) {
  const [selected, setSelected] = useState<TransactionRow | null>(null);
  const [draftSearch, setDraftSearch] = useState(search);

  return (
    <article className="tn-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--tn-navy)]">
            Transaction History
          </h2>
          <p className="text-sm text-[var(--tn-muted)]">
            {total.toLocaleString("en-US")} matching transactions
          </p>
        </div>
        <a
          href={`/api/export?${queryBase}&type=${type === "all" ? "" : type}`}
          className="inline-flex min-h-11 items-center rounded-xl border border-[var(--tn-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--tn-navy)] hover:bg-slate-50"
        >
          Export CSV
        </a>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchChange(draftSearch.trim());
          }}
        >
          <label className="sr-only" htmlFor="tx-search">
            Search transactions
          </label>
          <input
            id="tx-search"
            type="search"
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            placeholder="Search hash or address"
            className="min-h-11 w-full rounded-xl border border-[var(--tn-border)] px-3 text-sm"
          />
          <button
            type="submit"
            className="min-h-11 shrink-0 rounded-xl bg-[var(--tn-navy)] px-4 text-sm font-semibold text-white"
          >
            Search
          </button>
        </form>
        <label className="sr-only" htmlFor="tx-type">
          Transaction type
        </label>
        <select
          id="tx-type"
          value={type}
          onChange={(e) =>
            onTypeChange(e.target.value as "all" | "deposit" | "withdraw")
          }
          className="min-h-11 rounded-xl border border-[var(--tn-border)] px-3 text-sm"
        >
          <option value="all">All types</option>
          <option value="deposit">Deposits</option>
          <option value="withdraw">Withdrawals</option>
        </select>
      </div>

      {loading && data.length === 0 ? (
        <LoadingSkeleton variant="table" />
      ) : data.length === 0 ? (
        <EmptyState message="No transactions found." />
      ) : (
        <>
          <div className="table-scroll rounded-xl border border-[var(--tn-border)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-[var(--tn-muted)]">
                <tr>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">From</th>
                  <th className="px-3 py-3">To</th>
                  <th className="px-3 py-3">Date/Time</th>
                  <th className="px-3 py-3">Block</th>
                  <th className="px-3 py-3">Transaction Hash</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((tx) => (
                  <tr
                    key={`${tx.txHash}-${tx.logIndex}-${tx.walletAddress}`}
                    className="cursor-pointer border-t border-[var(--tn-border)] hover:bg-slate-50"
                    onClick={() => setSelected(tx)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(tx);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`View details for ${tx.txHash}`}
                  >
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${
                          tx.walletType === "deposit"
                            ? "bg-[var(--tn-deposit-bg)] text-[var(--tn-deposit)]"
                            : "bg-[var(--tn-withdraw-bg)] text-[var(--tn-withdraw)]"
                        }`}
                      >
                        {tx.walletType === "deposit" ? "Deposit" : "Withdrawal"}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-3 font-semibold ${
                        tx.walletType === "deposit"
                          ? "text-[var(--tn-deposit)]"
                          : "text-[var(--tn-withdraw)]"
                      }`}
                      title={`${formatUsdtExact(tx.amountUsdt)} USDT`}
                    >
                      {formatSignedUsdt(
                        tx.amountUsdt,
                        tx.walletType === "deposit",
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={explorerAddressUrl(tx.fromAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-[var(--tn-info)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        title={tx.fromAddress}
                      >
                        {shortAddress(tx.fromAddress)}
                      </a>
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={explorerAddressUrl(tx.toAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-[var(--tn-info)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        title={tx.toAddress}
                      >
                        {shortAddress(tx.toAddress)}
                      </a>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--tn-muted)]">
                      {formatDisplayDateTime(tx.timestamp)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {tx.blockNumber.toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={explorerTxUrl(tx.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-[var(--tn-info)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        title={tx.txHash}
                      >
                        {shortAddress(tx.txHash, 6)}
                      </a>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--tn-muted)]">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
                className="min-h-10 rounded-xl border border-[var(--tn-border)] px-3 text-sm font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                className="min-h-10 rounded-xl border border-[var(--tn-border)] px-3 text-sm font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <TransactionDetails
          tx={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </article>
  );
}
