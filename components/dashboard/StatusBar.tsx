"use client";

import type { SyncStatusResponse } from "@/types/analytics";

interface StatusBarProps {
  syncStatus: SyncStatusResponse | null;
  loading: boolean;
}

export function StatusBar({ syncStatus, loading }: StatusBarProps) {
  if (loading && !syncStatus) {
    return (
      <div className="my-4 h-10 tn-skeleton" aria-hidden />
    );
  }

  if (!syncStatus) return null;

  return (
    <div className="my-4 flex flex-wrap items-center gap-2 text-xs">
      <Badge
        label="Blockchain"
        value={syncStatus.blockchain}
        tone={
          syncStatus.blockchain === "CONNECTED"
            ? "green"
            : syncStatus.blockchain === "DEGRADED"
              ? "amber"
              : "red"
        }
      />
      <Badge
        label="Indexer"
        value={syncStatus.indexer}
        tone={
          syncStatus.indexer === "SYNCED"
            ? "green"
            : syncStatus.indexer === "SYNCING"
              ? "amber"
              : syncStatus.indexer === "ERROR"
                ? "red"
                : "blue"
        }
      />
      <Badge
        label="Database"
        value={syncStatus.database}
        tone={syncStatus.database === "CONNECTED" ? "green" : "red"}
      />
      {syncStatus.isHistoricalSyncing && (
        <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 font-medium text-amber-900">
          Historical blockchain data is being synchronized...
        </span>
      )}
    </div>
  );
}

function Badge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
    red: "bg-red-50 text-red-800 border-red-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-medium ${tones[tone]}`}
    >
      <span className="text-[var(--tn-muted)]">{label}:</span> {value}
    </span>
  );
}
