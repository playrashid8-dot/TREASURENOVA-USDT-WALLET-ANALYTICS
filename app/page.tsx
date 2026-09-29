"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { WalletCards } from "@/components/dashboard/WalletCards";
import { RecentTxHistory } from "@/components/dashboard/RecentTxHistory";
import { ConfigBanner } from "@/components/dashboard/ConfigBanner";
import type {
  RecentTransactionsResponse,
  WalletCardData,
} from "@/types/analytics";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { CHAIN_ID, SYNC_INTERVAL_SECONDS } from "@/lib/config";

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

const POLL_MS = Math.max(5, SYNC_INTERVAL_SECONDS) * 1000;

export default function HomePage() {
  const [wallets, setWallets] = useState<WalletCardData[]>([]);
  const [recentTx, setRecentTx] = useState<RecentTransactionsResponse | null>(
    null,
  );
  const [configError, setConfigError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const loadCore = useCallback(async () => {
    try {
      setError(null);
      const walletRes = await fetchJson<{
        wallets: WalletCardData[];
        configError?: string | null;
      }>("/api/wallets");

      setWallets(walletRes.wallets);
      setConfigError(walletRes.configError || null);
      setFetchedAt(Date.now());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load live data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecentTx = useCallback(async () => {
    try {
      const res = await fetchJson<RecentTransactionsResponse>(
        "/api/recent-transactions",
      );
      setRecentTx(res);
      if (res.configError) setConfigError(res.configError);
    } catch {
      /* keep previous indexed list on transient failure */
    } finally {
      setTxLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    void loadCore();
    void loadRecentTx();
  }, [loadCore, loadRecentTx]);

  useEffect(() => {
    void loadCore();
    void loadRecentTx();
  }, [loadCore, loadRecentTx]);

  useEffect(() => {
    const id = setInterval(refreshAll, POLL_MS);
    return () => clearInterval(id);
  }, [refreshAll]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshAll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshAll]);

  useEffect(() => {
    const client = getSupabaseBrowser();
    if (!client) return;

    const channel = client
      .channel("tn-recent-tx-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          refreshAll();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [refreshAll]);

  const liveStatus = recentTx?.liveStatus ?? (error ? "ERROR" : "STALE");

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden px-3 py-4 pb-8 sm:px-6 sm:py-6 lg:px-8">
      <div className="tn-shell mx-auto w-full max-w-6xl p-3.5 sm:p-6 lg:p-8">
        <Header chainId={CHAIN_ID} liveStatus={liveStatus} />

        <main className="mt-4 space-y-4 sm:mt-6 sm:space-y-6">
          {configError && <ConfigBanner message={configError} />}
          {loading && wallets.length === 0 && (
            <p className="text-sm text-[var(--tn-muted)]" role="status">
              Loading live blockchain data...
            </p>
          )}
          {error && (
            <div
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
              role="alert"
            >
              {error}
            </div>
          )}
          {liveStatus === "STALE" && !error && fetchedAt != null && (
            <p className="text-xs text-orange-200/80" role="status">
              Data may be delayed
            </p>
          )}

          <section aria-label="Wallet balances">
            <WalletCards wallets={wallets} loading={loading} />
          </section>

          <section aria-label="Recent transaction history">
            <RecentTxHistory
              data={recentTx}
              loading={txLoading}
              onRefresh={() => void loadRecentTx()}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
