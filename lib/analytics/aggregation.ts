import { DEPOSIT_WALLET, WITHDRAW_WALLET } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/utils/addresses";

/**
 * Rebuild daily_stats for a specific UTC date (or all dates if omitted).
 * Counts only indexed USDT Transfer INs (to == deposit/withdraw wallet).
 * Withdraw Wallet OUT rows may exist for Transaction History but are ignored here.
 * Idempotent — safe to call after upserts and for reconciliation repairs.
 */
export async function reconcileDailyStats(date?: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const depositAddr = normalizeAddress(DEPOSIT_WALLET);
  const withdrawAddr = normalizeAddress(WITHDRAW_WALLET);

  let query = supabase
    .from("transactions")
    .select("timestamp, wallet_type, amount_usdt, status, to_address");

  if (date) {
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;
    query = query.gte("timestamp", start).lte("timestamp", end);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[aggregation] Failed to load transactions:", error.message);
    throw new Error(error.message);
  }

  const byDate = new Map<
    string,
    {
      deposit_amount: number;
      withdrawal_amount: number;
      deposit_count: number;
      withdrawal_count: number;
    }
  >();

  for (const row of data ?? []) {
    if (row.status !== "success") continue;
    const d = String(row.timestamp).slice(0, 10);
    if (date && d !== date) continue;

    const bucket = byDate.get(d) ?? {
      deposit_amount: 0,
      withdrawal_amount: 0,
      deposit_count: 0,
      withdrawal_count: 0,
    };

    const amount = Number(row.amount_usdt) || 0;
    const to = normalizeAddress(String(row.to_address ?? ""));
    // Daily analytics: IN only (to == wallet). OUT rows are excluded.
    if (row.wallet_type === "deposit" && to === depositAddr) {
      bucket.deposit_amount += amount;
      bucket.deposit_count += 1;
    } else if (row.wallet_type === "withdraw" && to === withdrawAddr) {
      bucket.withdrawal_amount += amount;
      bucket.withdrawal_count += 1;
    }
    byDate.set(d, bucket);
  }

  if (date && !byDate.has(date)) {
    // Ensure zero row exists for explicit date reconcile when empty
    byDate.set(date, {
      deposit_amount: 0,
      withdrawal_amount: 0,
      deposit_count: 0,
      withdrawal_count: 0,
    });
  }

  const now = new Date().toISOString();
  const rows = Array.from(byDate.entries()).map(([d, b]) => ({
    date: d,
    deposit_amount: round6(b.deposit_amount),
    withdrawal_amount: round6(b.withdrawal_amount),
    net_cash_flow: round6(b.deposit_amount - b.withdrawal_amount),
    deposit_count: b.deposit_count,
    withdrawal_count: b.withdrawal_count,
    updated_at: now,
  }));

  if (rows.length === 0) return;

  const { error: upsertError } = await supabase.from("daily_stats").upsert(rows, {
    onConflict: "date",
  });

  if (upsertError) {
    console.error("[aggregation] Upsert failed:", upsertError.message);
    throw new Error(upsertError.message);
  }
}

/**
 * Compare SUM(transactions IN) vs SUM(daily_stats) and repair if mismatched.
 */
export async function runReconciliationCheck(): Promise<{
  ok: boolean;
  repaired: boolean;
  txDeposits: number;
  txWithdrawals: number;
  statsDeposits: number;
  statsWithdrawals: number;
}> {
  const supabase = getSupabaseAdmin();
  const depositAddr = normalizeAddress(DEPOSIT_WALLET);
  const withdrawAddr = normalizeAddress(WITHDRAW_WALLET);

  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("wallet_type, amount_usdt, status, to_address");

  if (txErr) {
    console.error("[reconciliation] TX query failed:", txErr.message);
    throw new Error(txErr.message);
  }

  let txDeposits = 0;
  let txWithdrawals = 0;
  for (const row of txs ?? []) {
    if (row.status !== "success") continue;
    const amt = Number(row.amount_usdt) || 0;
    const to = normalizeAddress(String(row.to_address ?? ""));
    if (row.wallet_type === "deposit" && to === depositAddr) txDeposits += amt;
    if (row.wallet_type === "withdraw" && to === withdrawAddr) {
      txWithdrawals += amt;
    }
  }

  const { data: stats, error: stErr } = await supabase
    .from("daily_stats")
    .select("deposit_amount, withdrawal_amount");

  if (stErr) {
    console.error("[reconciliation] Stats query failed:", stErr.message);
    throw new Error(stErr.message);
  }

  let statsDeposits = 0;
  let statsWithdrawals = 0;
  for (const row of stats ?? []) {
    statsDeposits += Number(row.deposit_amount) || 0;
    statsWithdrawals += Number(row.withdrawal_amount) || 0;
  }

  const mismatch =
    Math.abs(txDeposits - statsDeposits) > 0.0001 ||
    Math.abs(txWithdrawals - statsWithdrawals) > 0.0001;

  if (mismatch) {
    console.warn(
      `[reconciliation] Mismatch detected. TX deposits=${txDeposits} stats=${statsDeposits}; TX withdrawals=${txWithdrawals} stats=${statsWithdrawals}. Repairing...`,
    );
    await reconcileDailyStats();
    return {
      ok: true,
      repaired: true,
      txDeposits,
      txWithdrawals,
      statsDeposits,
      statsWithdrawals,
    };
  }

  return {
    ok: true,
    repaired: false,
    txDeposits,
    txWithdrawals,
    statsDeposits,
    statsWithdrawals,
  };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
