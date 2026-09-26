"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { TransactionRow } from "@/types/analytics";
import { shortAddress } from "@/lib/utils/addresses";
import { formatDisplayDateTime } from "@/lib/utils/dates";
import { formatUsdt, formatUsdtExact } from "@/lib/utils/format";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/utils/explorer";
import { EmptyState } from "./EmptyState";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { CopyIconButton } from "./CopyButton";

interface TransactionTableProps {
  data: TransactionRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  search: string;
  type: "deposit" | "withdraw";
  onSearchChange: (value: string) => void;
  onTypeChange: (value: "deposit" | "withdraw") => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function TransactionTable({
  data,
  loading,
  page,
  pageSize,
  totalPages,
  total,
  search,
  type,
  onSearchChange,
  onTypeChange,
  onPageChange,
  onPageSizeChange,
}: TransactionTableProps) {
  const [draftSearch, setDraftSearch] = useState(search);

  useEffect(() => {
    setDraftSearch(search);
  }, [search]);

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  const pageItems = useMemo(
    () => buildPageItems(page, totalPages),
    [page, totalPages],
  );

  const amountClass =
    type === "deposit"
      ? "text-[var(--tn-deposit)]"
      : "text-[var(--tn-withdraw)]";

  return (
    <article className="tn-card p-4 sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tn-info-bg)] text-[var(--tn-info)]">
          <ListIcon />
        </div>
        <h2 className="text-lg font-bold text-white">Transaction History</h2>
      </div>

      <div
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        role="tablist"
        aria-label="Transaction history type"
      >
        <button
          type="button"
          role="tab"
          aria-selected={type === "deposit"}
          onClick={() => onTypeChange("deposit")}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition sm:flex-none ${
            type === "deposit"
              ? "bg-[var(--tn-deposit-dim)] text-white shadow-[0_0_20px_rgba(46,230,166,0.25)]"
              : "border border-[var(--tn-deposit-border)] bg-transparent text-[var(--tn-deposit)] hover:bg-[var(--tn-deposit-bg)]"
          }`}
        >
          <DepositTabIcon />
          Deposit History
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={type === "withdraw"}
          onClick={() => onTypeChange("withdraw")}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition sm:flex-none ${
            type === "withdraw"
              ? "bg-[var(--tn-withdraw-dim)] text-white shadow-[0_0_20px_rgba(255,107,138,0.25)]"
              : "border border-[var(--tn-withdraw-border)] bg-transparent text-[var(--tn-withdraw)] hover:bg-[var(--tn-withdraw-bg)]"
          }`}
        >
          <WithdrawTabIcon />
          Withdrawal History
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchChange(draftSearch.trim());
          }}
        >
          <label className="sr-only" htmlFor="tx-search">
            {type === "deposit"
              ? "Search sender address"
              : "Search receiver address"}
          </label>
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tn-info)]">
              <SearchIcon />
            </span>
            <input
              id="tx-search"
              type="search"
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              placeholder={
                type === "deposit"
                  ? "Search sender address (0x...)"
                  : "Search receiver address (0x...)"
              }
              className="min-h-11 w-full rounded-xl border border-[var(--tn-border-strong)] bg-[var(--tn-surface-2)] py-2 pl-10 pr-3 text-sm text-white placeholder:text-[var(--tn-muted)] focus:border-[var(--tn-info)]"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 shrink-0 rounded-xl bg-[var(--tn-info)] px-5 text-sm font-bold text-white shadow-[0_0_16px_rgba(59,158,255,0.35)] transition hover:brightness-110"
          >
            Search
          </button>
        </form>

        <label className="flex items-center gap-2 text-sm text-[var(--tn-muted)]">
          Show
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="min-h-10 rounded-lg border border-[var(--tn-border)] bg-[var(--tn-surface-2)] px-2 text-sm font-semibold text-white"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          entries
        </label>
      </div>

      {loading && data.length === 0 ? (
        <LoadingSkeleton variant="table" />
      ) : data.length === 0 ? (
        <EmptyState
          message={
            type === "deposit"
              ? "No Deposit transactions ≥ 50 USDT found."
              : "No Withdrawal transactions ≥ 50 USDT found."
          }
        />
      ) : (
        <>
          <div className="table-scroll overflow-hidden rounded-xl border border-[var(--tn-border)]">
            <table className="tn-tx-table w-full border-collapse text-left text-sm">
              <thead
                className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tn-muted)]"
                style={{ background: "var(--tn-table-head)" }}
              >
                <tr>
                  <SortableTh label="Date / Time (UTC)" />
                  <SortableTh label="From" />
                  <SortableTh label="To" />
                  <SortableTh label="Amount (USDT)" />
                  <SortableTh label="Transaction Hash" />
                  <SortableTh label="Block" />
                  <SortableTh label="Status" />
                </tr>
              </thead>
              <tbody>
                {data.map((tx, i) => (
                  <tr
                    key={`${tx.txHash}-${tx.logIndex}-${tx.walletAddress}-${type}`}
                    className="border-t border-[var(--tn-border)]"
                    style={
                      i % 2 === 1
                        ? { background: "var(--tn-row-alt)" }
                        : undefined
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--tn-muted)]">
                      {formatDisplayDateTime(tx.timestamp)}
                    </td>
                    <td className="px-3 py-3">
                      <AddressCell address={tx.fromAddress} />
                    </td>
                    <td className="px-3 py-3">
                      <AddressCell address={tx.toAddress} />
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-3 font-semibold ${amountClass}`}
                      title={`${formatUsdtExact(tx.amountUsdt)} USDT`}
                    >
                      {formatUsdt(tx.amountUsdt)} USDT
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <a
                          href={explorerTxUrl(tx.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs font-medium text-[var(--tn-info)] hover:underline"
                          title={tx.txHash}
                        >
                          {shortAddress(tx.txHash, 6)}
                        </a>
                        <CopyIconButton
                          value={tx.txHash}
                          label="Copy transaction hash"
                        />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--tn-text)]">
                      {tx.blockNumber.toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold capitalize text-emerald-300">
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--tn-muted)]">
              Showing {showingFrom.toLocaleString("en-US")} to{" "}
              {showingTo.toLocaleString("en-US")} of{" "}
              {total.toLocaleString("en-US")} entries
            </p>
            <nav
              className="flex flex-wrap items-center gap-1"
              aria-label="Pagination"
            >
              <PageBtn
                disabled={page <= 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
                ariaLabel="Previous page"
              >
                ‹
              </PageBtn>
              {pageItems.map((item, idx) =>
                item === "…" ? (
                  <span
                    key={`ellipsis-${idx}`}
                    className="px-2 text-sm text-[var(--tn-muted)]"
                  >
                    …
                  </span>
                ) : (
                  <PageBtn
                    key={item}
                    active={item === page}
                    onClick={() => onPageChange(item)}
                    ariaLabel={`Page ${item}`}
                  >
                    {item}
                  </PageBtn>
                ),
              )}
              <PageBtn
                disabled={page >= totalPages}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                ariaLabel="Next page"
              >
                ›
              </PageBtn>
            </nav>
          </div>
        </>
      )}
    </article>
  );
}

function AddressCell({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-1">
      <a
        href={explorerAddressUrl(address)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-[var(--tn-info)] hover:underline"
        title={address}
      >
        {shortAddress(address)}
      </a>
      <CopyIconButton value={address} label="Copy address" />
    </div>
  );
}

function SortableTh({ label }: { label: string }) {
  return (
    <th className="whitespace-nowrap px-3 py-3.5">
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col text-[9px] leading-none opacity-50" aria-hidden>
          <span>▲</span>
          <span>▼</span>
        </span>
      </span>
    </th>
  );
}

function PageBtn({
  children,
  onClick,
  disabled,
  active,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold transition disabled:opacity-35 ${
        active
          ? "bg-[var(--tn-info)] text-white shadow-[0_0_12px_rgba(59,158,255,0.4)]"
          : "border border-[var(--tn-border)] bg-[var(--tn-surface-2)] text-[var(--tn-text)] hover:border-[var(--tn-info)]"
      }`}
    >
      {children}
    </button>
  );
}

function buildPageItems(
  page: number,
  totalPages: number,
): Array<number | "…"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (page <= 3) {
    return [1, 2, 3, 4, 5, "…", totalPages];
  }

  if (page >= totalPages - 2) {
    return [
      1,
      "…",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [1, "…", page - 1, page, page + 1, "…", totalPages];
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

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path
        d="M20 20l-3.5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DepositTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12M12 15l-4-4M12 15l4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 19h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WithdrawTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21V9M12 9l-4 4M12 9l4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 5h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
