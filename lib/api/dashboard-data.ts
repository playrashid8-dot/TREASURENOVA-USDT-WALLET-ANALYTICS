import { SYNC_KEY, getPrimaryConfigError } from "@/lib/config";
import { getWalletBalances } from "@/lib/blockchain/balance";
import { checkRpcHealth } from "@/lib/blockchain/rpc";
import {
  checkDatabaseConnection,
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { dateRangeFromSearchParams } from "@/lib/analytics/filters";
import {
  computeNetCashFlow,
  emptyDayFlow,
  splitCompletedAndLive,
} from "@/lib/analytics/calculations";
import { DEPOSIT_WALLET, WITHDRAW_WALLET } from "@/lib/config";
import { normalizeAddress } from "@/lib/utils/addresses";
import { utcTodayKey } from "@/lib/utils/dates";
import type { KpiSummary } from "@/types/analytics";

function emptyKpi(
  range: KpiSummary["dateRange"],
  configError: string | null,
): KpiSummary {
  const empty = emptyDayFlow();
  return {
    totalDeposits: 0,
    totalWithdrawals: 0,
    netCashFlow: 0,
    depositCount: 0,
    withdrawalCount: 0,
    transactionCount: 0,
    completedDeposits: empty.depositAmount,
    completedWithdrawals: empty.withdrawalAmount,
    completedNetCashFlow: empty.netCashFlow,
    completedDepositCount: empty.depositCount,
    completedWithdrawalCount: empty.withdrawalCount,
    liveDeposits: empty.depositAmount,
    liveWithdrawals: empty.withdrawalAmount,
    liveNetCashFlow: empty.netCashFlow,
    liveDepositCount: empty.depositCount,
    liveWithdrawalCount: empty.withdrawalCount,
    liveInRange: false,
    todayDate: utcTodayKey(),
    depositBalance: null,
    withdrawBalance: null,
    lastUpdated: null,
    syncStatus: "unconfigured",
    dateRange: range,
    balanceError: null,
    configError,
  };
}

export async function buildDashboardPayload(
  searchParams: URLSearchParams,
): Promise<KpiSummary> {
  const configError = getPrimaryConfigError();
  const range = dateRangeFromSearchParams(searchParams);
  const empty = emptyKpi(range, configError);

  if (!isSupabaseConfigured()) {
    return {
      ...empty,
      configError:
        configError ||
        "Database not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    let statsQuery = supabase
      .from("daily_stats")
      .select(
        "date, deposit_amount, withdrawal_amount, deposit_count, withdrawal_count",
      );

    if (range.from) {
      statsQuery = statsQuery.gte("date", range.from.slice(0, 10));
    }
    if (range.to) {
      statsQuery = statsQuery.lte("date", range.to.slice(0, 10));
    }

    const { data: stats, error: statsError } = await statsQuery;
    if (statsError) {
      throw new Error(statsError.message);
    }

    const rows = (stats ?? []).map((row) => ({
      date: String(row.date),
      depositAmount: Number(row.deposit_amount) || 0,
      withdrawalAmount: Number(row.withdrawal_amount) || 0,
      depositCount: Number(row.deposit_count) || 0,
      withdrawalCount: Number(row.withdrawal_count) || 0,
    }));

    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let depositCount = 0;
    let withdrawalCount = 0;

    for (const row of rows) {
      totalDeposits += row.depositAmount;
      totalWithdrawals += row.withdrawalAmount;
      depositCount += row.depositCount;
      withdrawalCount += row.withdrawalCount;
    }

    const { completed, live, liveInRange, todayDate } =
      splitCompletedAndLive(rows);

    const { data: sync } = await supabase
      .from("sync_state")
      .select("last_successful_sync, status")
      .eq("sync_key", SYNC_KEY)
      .maybeSingle();

    let depositBalance: number | null = null;
    let withdrawBalance: number | null = null;
    let balanceError: string | null = null;

    if (!configError) {
      try {
        const balances = await getWalletBalances([
          DEPOSIT_WALLET,
          WITHDRAW_WALLET,
        ]);
        const dep = balances.get(normalizeAddress(DEPOSIT_WALLET));
        const wit = balances.get(normalizeAddress(WITHDRAW_WALLET));
        if (dep && "balance" in dep) depositBalance = dep.balance;
        else if (dep && "error" in dep) balanceError = dep.error;
        if (wit && "balance" in wit) withdrawBalance = wit.balance;
        else if (wit && "error" in wit)
          balanceError = balanceError || wit.error;
      } catch {
        balanceError = "Live balance temporarily unavailable.";
      }
    }

    return {
      totalDeposits,
      totalWithdrawals,
      netCashFlow: computeNetCashFlow(totalDeposits, totalWithdrawals),
      depositCount,
      withdrawalCount,
      transactionCount: depositCount + withdrawalCount,
      completedDeposits: completed.depositAmount,
      completedWithdrawals: completed.withdrawalAmount,
      completedNetCashFlow: completed.netCashFlow,
      completedDepositCount: completed.depositCount,
      completedWithdrawalCount: completed.withdrawalCount,
      liveDeposits: live.depositAmount,
      liveWithdrawals: live.withdrawalAmount,
      liveNetCashFlow: live.netCashFlow,
      liveDepositCount: live.depositCount,
      liveWithdrawalCount: live.withdrawalCount,
      liveInRange,
      todayDate,
      depositBalance,
      withdrawBalance,
      lastUpdated: sync?.last_successful_sync ?? null,
      syncStatus: sync?.status ?? "idle",
      dateRange: range,
      balanceError,
      configError,
    };
  } catch (err) {
    return {
      ...empty,
      configError:
        configError ||
        (err instanceof Error
          ? err.message
          : "Blockchain data temporarily unavailable."),
    };
  }
}

export async function buildSyncStatusPayload() {
  const configError = getPrimaryConfigError();
  const db = await checkDatabaseConnection();
  const health = await checkRpcHealth();

  let indexedBlock: number | null = null;
  let lastSuccessfulSync: string | null = null;
  let lastError: string | null = null;
  let status = "idle";

  if (db.ok) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("sync_state")
        .select("*")
        .eq("sync_key", SYNC_KEY)
        .maybeSingle();
      if (data) {
        indexedBlock = Number(data.last_indexed_block) || 0;
        lastSuccessfulSync = data.last_successful_sync;
        lastError = data.last_error;
        status = data.status;
      }
    } catch {
      /* ignore */
    }
  }

  let blockchain: "CONNECTED" | "DEGRADED" | "OFFLINE" = "OFFLINE";
  if (health.rpcConnected && !health.error) blockchain = "CONNECTED";
  else if (health.rpcConnected) blockchain = "DEGRADED";

  let indexer: "SYNCED" | "SYNCING" | "ERROR" | "IDLE" = "IDLE";
  if (status === "syncing") indexer = "SYNCING";
  else if (status === "error") indexer = "ERROR";
  else if (status === "synced") indexer = "SYNCED";

  const latestBlock = health.latestBlock;
  let syncPercentage: number | null = null;
  if (
    latestBlock !== null &&
    indexedBlock !== null &&
    latestBlock > 0 &&
    indexedBlock >= 0
  ) {
    syncPercentage = Math.min(100, (indexedBlock / latestBlock) * 100);
  }

  const isHistoricalSyncing =
    indexer === "SYNCING" ||
    (latestBlock !== null &&
      indexedBlock !== null &&
      indexedBlock > 0 &&
      latestBlock - indexedBlock > 1000);

  return {
    blockchain,
    indexer,
    database: db.ok ? ("CONNECTED" as const) : ("ERROR" as const),
    latestBlock,
    indexedBlock,
    syncPercentage,
    lastSuccessfulSync,
    lastError: lastError || db.error || health.error || null,
    status,
    isHistoricalSyncing,
    configError,
  };
}
