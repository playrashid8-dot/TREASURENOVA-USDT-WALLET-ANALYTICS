"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { WalletCards } from "@/components/dashboard/WalletCards";
import { LastCompletedDays } from "@/components/dashboard/LastCompletedDays";
import { TransactionTable } from "@/components/dashboard/TransactionTable";
import { ConfigBanner } from "@/components/dashboard/ConfigBanner";
import type {
  DailyStatRow,
  TransactionRow,
  WalletCardData,
} from "@/types/analytics";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { buildLastCompletedDaysSummary } from "@/lib/analytics/calculations";
import { addUtcDays, utcTodayKey } from "@/lib/utils/dates";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error || `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

function buildQuery(extra?: Record<string, string>) {
  const params = new URLSearchParams({ preset: "all" });
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  return params.toString();
}

const LAST_COMPLETED_DAYS = 8;

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [txType, setTxType] = useState<"deposit" | "withdraw">("deposit");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [lastEightDays, setLastEightDays] = useState<DailyStatRow[]>([]);
  const [wallets, setWallets] = useState<WalletCardData[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [configError, setConfigError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCore = useCallback(async () => {
    try {
      setError(null);
      const today = utcTodayKey();
      const lastFrom = addUtcDays(today, -LAST_COMPLETED_DAYS);
      const lastTo = addUtcDays(today, -1);
      const lastQuery = new URLSearchParams({
        preset: "custom",
        from: lastFrom,
        to: lastTo,
      }).toString();

      const [lastStats, walletRes] = await Promise.all([
        fetchJson<{ data: DailyStatRow[]; configError?: string | null }>(
          `/api/daily-stats?${lastQuery}`,
        ),
        fetchJson<{ wallets: WalletCardData[]; configError?: string | null }>(
          "/api/wallets",
        ),
      ]);

      setLastEightDays(
        buildLastCompletedDaysSummary(lastStats.data, LAST_COMPLETED_DAYS),
      );
      setWallets(walletRes.wallets);
      setConfigError(
        lastStats.configError || walletRes.configError || null,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Blockchain data temporarily unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const q = buildQuery({
        type: txType,
        page: String(page),
        limit: String(pageSize),
        search,
      });
      const res = await fetchJson<{
        data: TransactionRow[];
        total: number;
        totalPages: number;
        configError?: string | null;
      }>(`/api/transactions?${q}`);
      setTransactions(res.data);
      setTxTotal(res.total);
      setTxTotalPages(res.totalPages);
      if (res.configError) setConfigError(res.configError);
    } catch {
      /* keep previous */
    } finally {
      setTxLoading(false);
    }
  }, [txType, page, pageSize, search]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const id = setInterval(() => {
      void loadCore();
      void loadTransactions();
    }, 20_000);
    return () => clearInterval(id);
  }, [loadCore, loadTransactions]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadCore();
        void loadTransactions();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loadCore, loadTransactions]);

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

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="tn-shell mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
        <Header chainId={56} />

        <main className="mt-6 space-y-6 sm:mt-8 sm:space-y-7">
          {configError && <ConfigBanner message={configError} />}
          {error && (
            <div
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
              role="alert"
            >
              {error}
            </div>
          )}

          <section aria-label="Wallet balances">
            <WalletCards wallets={wallets} loading={loading} />
          </section>

          <section aria-label="Last 8 completed UTC days">
            <LastCompletedDays data={lastEightDays} loading={loading} />
          </section>

          <section aria-label="Transaction history">
            <TransactionTable
              data={transactions}
              loading={txLoading}
              page={page}
              pageSize={pageSize}
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
                setSearch("");
                setPage(1);
              }}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
