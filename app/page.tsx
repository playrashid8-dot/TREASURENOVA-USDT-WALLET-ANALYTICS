"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { StatusBar } from "@/components/dashboard/StatusBar";
import { DateFilters } from "@/components/dashboard/DateFilters";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { WalletCards } from "@/components/dashboard/WalletCards";
import { FlowChart } from "@/components/dashboard/FlowChart";
import { DailyStatsTable } from "@/components/dashboard/DailyStatsTable";
import { LastCompletedDays } from "@/components/dashboard/LastCompletedDays";
import { TransactionTable } from "@/components/dashboard/TransactionTable";
import { SyncStatus } from "@/components/dashboard/SyncStatus";
import { Footer } from "@/components/dashboard/Footer";
import { MobileNav } from "@/components/dashboard/MobileNav";
import { ConfigBanner } from "@/components/dashboard/ConfigBanner";
import type { DateRangePreset, KpiSummary, DailyStatRow, TransactionRow, WalletCardData, SyncStatusResponse } from "@/types/analytics";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { buildLastCompletedDaysSummary } from "@/lib/analytics/calculations";
import { addUtcDays, utcTodayKey } from "@/lib/utils/dates";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function buildQuery(preset: DateRangePreset, from: string, to: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ preset });
  if (preset === "custom") {
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  return params.toString();
}

export default function HomePage() {
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [txType, setTxType] = useState<"deposit" | "withdraw">("deposit");
  const [page, setPage] = useState(1);

  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [daily, setDaily] = useState<DailyStatRow[]>([]);
  const [lastFourDays, setLastFourDays] = useState<DailyStatRow[]>([]);
  const [wallets, setWallets] = useState<WalletCardData[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);

  const queryBase = useMemo(
    () => buildQuery(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const loadCore = useCallback(async () => {
    try {
      setError(null);
      const today = utcTodayKey();
      const lastFourFrom = addUtcDays(today, -4);
      const lastFourTo = addUtcDays(today, -1);
      const lastFourQuery = buildQuery("custom", lastFourFrom, lastFourTo);

      const [dash, stats, lastFourStats, walletRes, sync] = await Promise.all([
        fetchJson<KpiSummary>(`/api/dashboard?${queryBase}`),
        fetchJson<{ data: DailyStatRow[]; configError?: string | null }>(
          `/api/daily-stats?${queryBase}`,
        ),
        fetchJson<{ data: DailyStatRow[]; configError?: string | null }>(
          `/api/daily-stats?${lastFourQuery}`,
        ),
        fetchJson<{ wallets: WalletCardData[]; configError?: string | null }>(
          "/api/wallets",
        ),
        fetchJson<SyncStatusResponse>("/api/sync-status"),
      ]);

      setKpi(dash);
      setDaily(stats.data);
      setLastFourDays(buildLastCompletedDaysSummary(lastFourStats.data, 4));
      setWallets(walletRes.wallets);
      setSyncStatus(sync);
      setLastFetchAt(new Date().toISOString());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Blockchain data temporarily unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [queryBase]);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const q = buildQuery(preset, customFrom, customTo, {
        type: txType,
        page: String(page),
        limit: "20",
        search,
      });
      const res = await fetchJson<{
        data: TransactionRow[];
        total: number;
        totalPages: number;
      }>(`/api/transactions?${q}`);
      setTransactions(res.data);
      setTxTotal(res.total);
      setTxTotalPages(res.totalPages);
    } catch {
      /* keep previous */
    } finally {
      setTxLoading(false);
    }
  }, [preset, customFrom, customTo, txType, page, search]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  // Poll for live updates every 20s
  useEffect(() => {
    const id = setInterval(() => {
      void loadCore();
      void loadTransactions();
    }, 20_000);
    return () => clearInterval(id);
  }, [loadCore, loadTransactions]);

  // Optional Supabase realtime
  useEffect(() => {
    const client = getSupabaseBrowser();
    if (!client) return;

    const channel = client
      .channel("tn-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          void loadCore();
          void loadTransactions();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [loadCore, loadTransactions]);

  const onPresetChange = (p: DateRangePreset) => {
    setPreset(p);
    setPage(1);
    setLoading(true);
  };

  const configError =
    kpi?.configError ||
    syncStatus?.configError ||
    null;

  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <Header
        lastUpdated={kpi?.lastUpdated || lastFetchAt}
        chainId={56}
      />
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <StatusBar syncStatus={syncStatus} loading={loading} />
        {configError && <ConfigBanner message={configError} />}
        {error && (
          <div
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            {error}
            {kpi?.lastUpdated && (
              <span className="mt-1 block text-amber-800">
                Last successful update:{" "}
                {new Date(kpi.lastUpdated).toLocaleString()} UTC context
              </span>
            )}
          </div>
        )}

        <DateFilters
          preset={preset}
          customFrom={customFrom}
          customTo={customTo}
          onPresetChange={onPresetChange}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />

        <section id="dashboard" className="scroll-mt-24">
          <KpiCards data={kpi} loading={loading} />
        </section>

        <section className="mt-6">
          <LastCompletedDays data={lastFourDays} loading={loading} />
        </section>

        <section className="mt-6">
          <WalletCards wallets={wallets} loading={loading} />
        </section>

        <section id="analytics" className="mt-6 scroll-mt-24">
          <FlowChart data={daily} loading={loading} />
        </section>

        <section className="mt-6">
          <DailyStatsTable
            data={daily}
            loading={loading}
            queryBase={queryBase}
          />
        </section>

        <section id="transactions" className="mt-6 scroll-mt-24">
          <TransactionTable
            data={transactions}
            loading={txLoading}
            page={page}
            totalPages={txTotalPages}
            total={txTotal}
            search={search}
            type={txType}
            onSearchChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            onTypeChange={(v) => {
              setTxType(v);
              setPage(1);
            }}
            onPageChange={setPage}
            queryBase={queryBase}
          />
        </section>

        <section id="system" className="mt-6 scroll-mt-24">
          <SyncStatus data={syncStatus} loading={loading} />
        </section>
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
