"use client";

import type { SyncStatusResponse } from "@/types/analytics";
import { formatBlockNumber, formatPercent } from "@/lib/utils/format";
import { formatDisplayDateTime, formatRelativeTime } from "@/lib/utils/dates";
import { LoadingSkeleton } from "./LoadingSkeleton";

interface SyncStatusProps {
  data: SyncStatusResponse | null;
  loading: boolean;
}

export function SyncStatus({ data, loading }: SyncStatusProps) {
  if (loading && !data) {
    return <LoadingSkeleton variant="status" />;
  }

  if (!data) return null;

  return (
    <article className="tn-card p-4 sm:p-5">
      <h2 className="text-lg font-bold text-[var(--tn-navy)]">
        System Sync Status
      </h2>
      <p className="mt-1 text-sm text-[var(--tn-muted)]">
        Blockchain · Indexer · Database health
      </p>

      {data.isHistoricalSyncing && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Historical blockchain data is being synchronized...
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Blockchain Status" value={data.blockchain} />
        <Stat label="Indexer Status" value={data.indexer} />
        <Stat label="Database" value={data.database} />
        <Stat
          label="Latest Block"
          value={formatBlockNumber(data.latestBlock)}
        />
        <Stat
          label="Indexed Block"
          value={formatBlockNumber(data.indexedBlock)}
        />
        <Stat
          label="Sync Progress"
          value={formatPercent(data.syncPercentage)}
        />
        <Stat
          label="Last Sync"
          value={
            data.lastSuccessfulSync
              ? formatRelativeTime(data.lastSuccessfulSync)
              : "Never"
          }
          title={
            data.lastSuccessfulSync
              ? formatDisplayDateTime(data.lastSuccessfulSync)
              : undefined
          }
        />
        <Stat label="Status" value={data.status} />
        {data.lastError && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Stat label="Last Error" value={data.lastError} />
          </div>
        )}
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--tn-border)] bg-slate-50/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tn-muted)]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-[var(--tn-navy)]" title={title}>
        {value}
      </p>
    </div>
  );
}
