"use client";

import { useState } from "react";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: CopyButtonProps) {
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
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--tn-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--tn-navy)] transition hover:bg-slate-50 ${className}`}
      aria-label={`${label}: ${value}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
