"use client";

interface HeaderProps {
  chainId: number;
}

export function Header({ chainId }: HeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <CrystalLogo />
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-[0.04em] text-white sm:text-[1.75rem]">
            TREASURENOVA
          </h1>
          <p className="mt-0.5 text-xs font-semibold tracking-[0.14em] text-[var(--tn-info)] sm:text-sm">
            USDT WALLET ANALYTICS
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--tn-border)] bg-[var(--tn-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--tn-text)]">
          <BnbIcon />
          BNB Smart Chain
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300">
          <span
            className="tn-live-dot h-2 w-2 rounded-full bg-[var(--tn-live)]"
            aria-hidden
          />
          LIVE
        </span>
        <span className="rounded-full border border-[var(--tn-border)] bg-[var(--tn-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--tn-muted)]">
          Chain ID: {chainId}
        </span>
      </div>
    </header>
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
      className="shrink-0 drop-shadow-[0_0_12px_rgba(59,158,255,0.55)]"
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
