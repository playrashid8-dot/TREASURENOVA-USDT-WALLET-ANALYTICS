"use client";

import { useState, type MouseEvent } from "react";

interface CopyIconButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyIconButton({
  value,
  label = "Copy",
  className = "",
}: CopyIconButtonProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => void onCopy(e)}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--tn-muted)] transition hover:bg-white/5 hover:text-[var(--tn-info)] ${className}`}
      aria-label={copied ? "Copied" : `${label}: ${value}`}
      title={copied ? "Copied" : label}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5 10 17.5 19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Legacy labeled copy button — kept for any remaining callers. */
export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--tn-border)] bg-[var(--tn-surface-2)] px-4 py-2 text-sm font-semibold text-[var(--tn-text)] transition hover:bg-white/5 ${className}`}
      aria-label={`${label}: ${value}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
