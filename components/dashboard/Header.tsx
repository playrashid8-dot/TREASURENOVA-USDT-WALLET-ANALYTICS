"use client";

import type { ReactNode } from "react";
import type { SyncStatusResponse } from "@/types/analytics";

interface HeaderProps {
  chainId: number;
  liveStatus?: SyncStatusResponse["indexer"] | "LIVE" | "SYNCING" | "STALE" | "ERROR";
}

export function Header({ chainId, liveStatus = "LIVE" }: HeaderProps) {
  const status = normalizeHeaderStatus(liveStatus);

  return (
    <header className="tn-header relative overflow-hidden rounded-2xl border border-[var(--tn-border)] bg-gradient-to-br from-[#0c1a32]/95 via-[#0a1528]/90 to-[#07101f]/95 p-3.5 sm:p-5">
      <div
        className="pointer-events-none absolute -right-8 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(56,132,255,0.35)_0%,transparent_70%)] opacity-80 sm:h-56 sm:w-56"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-4 top-2 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(59,158,255,0.2)_0%,transparent_65%)] blur-sm sm:h-32 sm:w-32"
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <CrystalLogo />
          <div className="min-w-0">
            <h1 className="font-[family-name:var(--font-display)] text-xl font-extrabold tracking-[0.04em] text-white sm:text-[1.75rem]">
              TREASURENOVA
            </h1>
            <p className="mt-0.5 text-[11px] font-semibold tracking-[0.12em] text-[var(--tn-info)] sm:text-sm sm:tracking-[0.14em]">
              USDT WALLET ANALYTICS
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <IconButton label="Notifications">
            <BellIcon />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#0a1528]" />
          </IconButton>
          <IconButton label="Settings">
            <GearIcon />
          </IconButton>
        </div>
      </div>

      <div className="relative mt-3.5 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--tn-border)] bg-[var(--tn-surface-2)]/90 px-2.5 py-1 text-[11px] font-semibold text-[var(--tn-text)] sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
          <BnbIcon />
          BNB Smart Chain
        </span>
        <StatusBadge status={status} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--tn-border)] bg-[var(--tn-surface-2)]/90 px-2.5 py-1 text-[11px] font-medium text-[var(--tn-muted)] sm:px-3 sm:py-1.5 sm:text-xs">
          <CubeIcon />
          Chain ID: {chainId}
        </span>
      </div>
    </header>
  );
}

function normalizeHeaderStatus(
  liveStatus: HeaderProps["liveStatus"],
): "LIVE" | "SYNCING" | "STALE" | "ERROR" {
  if (
    liveStatus === "LIVE" ||
    liveStatus === "SYNCING" ||
    liveStatus === "STALE" ||
    liveStatus === "ERROR"
  ) {
    return liveStatus;
  }
  if (liveStatus === "SYNCED") return "LIVE";
  if (liveStatus === "IDLE") return "STALE";
  return "STALE";
}

function StatusBadge({
  status,
}: {
  status: "LIVE" | "SYNCING" | "STALE" | "ERROR";
}) {
  const styles =
    status === "LIVE"
      ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
      : status === "SYNCING"
        ? "border-amber-500/35 bg-amber-500/15 text-amber-200"
        : status === "STALE"
          ? "border-orange-500/35 bg-orange-500/15 text-orange-200"
          : "border-red-500/35 bg-red-500/15 text-red-300";

  const dot =
    status === "LIVE"
      ? "bg-[var(--tn-live)] tn-live-dot"
      : status === "SYNCING"
        ? "bg-amber-400"
        : status === "STALE"
          ? "bg-orange-400"
          : "bg-red-400";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs ${styles}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${dot}`} aria-hidden />
      {status}
    </span>
  );
}

function IconButton({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--tn-border)] bg-[var(--tn-surface-2)]/80 text-[var(--tn-muted)] transition hover:border-[var(--tn-border-strong)] hover:text-[var(--tn-info)] sm:h-10 sm:w-10"
    >
      {children}
    </button>
  );
}

function CrystalLogo() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden
      className="h-9 w-9 shrink-0 drop-shadow-[0_0_12px_rgba(59,158,255,0.55)] sm:h-11 sm:w-11"
    >
      <defs>
        <linearGradient id="crystal" x1="8" y1="4" x2="36" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7dd3fc" />
          <stop offset="0.45" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <path
        d="M22 3.5L38 14.5V29.5L22 40.5L6 29.5V14.5L22 3.5Z"
        fill="url(#crystal)"
        opacity="0.95"
      />
      <path d="M22 3.5L38 14.5L22 22L6 14.5L22 3.5Z" fill="#bfdbfe" opacity="0.55" />
      <path d="M22 22L38 14.5V29.5L22 40.5V22Z" fill="#1e3a8a" opacity="0.35" />
      <path d="M22 22L6 14.5V29.5L22 40.5V22Z" fill="#2563eb" opacity="0.45" />
    </svg>
  );
}

function BnbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2L15.5 5.5L12 9L8.5 5.5L12 2ZM5.5 8.5L9 12L5.5 15.5L2 12L5.5 8.5ZM18.5 8.5L22 12L18.5 15.5L15 12L18.5 8.5ZM12 15L15.5 18.5L12 22L8.5 18.5L12 15ZM12 9.8L14.2 12L12 14.2L9.8 12L12 9.8Z"
        fill="#F3BA2F"
      />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 12 20 8M12 12v8.5M12 12 4 8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 18.5a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
