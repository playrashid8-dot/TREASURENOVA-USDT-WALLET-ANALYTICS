"use client";

import type { DateRangePreset } from "@/types/analytics";

const PRESETS: Array<{ id: DateRangePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "90d", label: "Last 90 Days" },
  { id: "all", label: "All Time" },
  { id: "custom", label: "Custom" },
];

interface DateFiltersProps {
  preset: DateRangePreset;
  customFrom: string;
  customTo: string;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
}

export function DateFilters({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}: DateFiltersProps) {
  return (
    <section
      className="sticky top-[116px] z-30 mb-4 rounded-2xl border border-[var(--tn-border)] bg-white/95 p-3 shadow-sm backdrop-blur sm:top-[108px]"
      aria-label="Date filters"
    >
      <div className="flex gap-2 overflow-x-auto pb-1">
        {PRESETS.map((p) => {
          const active = preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPresetChange(p.id)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-[var(--tn-navy)] text-white"
                  : "border border-[var(--tn-border)] bg-white text-[var(--tn-navy-soft)] hover:bg-slate-50"
              }`}
              aria-pressed={active}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {preset === "custom" && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-[var(--tn-muted)]">
            From Date
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--tn-border)] px-3 py-2.5 text-sm text-[var(--tn-text)]"
            />
          </label>
          <label className="block text-xs font-medium text-[var(--tn-muted)]">
            To Date
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--tn-border)] px-3 py-2.5 text-sm text-[var(--tn-text)]"
            />
          </label>
        </div>
      )}
    </section>
  );
}
