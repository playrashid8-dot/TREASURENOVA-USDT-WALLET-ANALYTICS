import { MAX_TRANSACTION_PAGE_SIZE } from "@/lib/config";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  applyMinDisplayAmountFilter,
  applyTransactionHistoryTypeFilter,
  dateRangeFromSearchParams,
} from "@/lib/analytics/filters";
import {
  enforceRateLimit,
  jsonError,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";
import type { TransactionRow } from "@/types/analytics";
import { getPrimaryConfigError } from "@/lib/config";
import { normalizeAddress } from "@/lib/utils/addresses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "transactions", 45, 60_000);
  if (!limited.ok) return limited.response;

  const { searchParams } = new URL(request.url);
  const range = dateRangeFromSearchParams(searchParams);
  const typeParam = searchParams.get("type") || "deposit";
  const type = typeParam === "withdraw" ? "withdraw" : "deposit";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    MAX_TRANSACTION_PAGE_SIZE,
    Math.max(1, Number.parseInt(searchParams.get("limit") || "20", 10) || 20),
  );
  const search = (searchParams.get("search") || "").trim();
  const configError = getPrimaryConfigError();

  if (!isSupabaseConfigured()) {
    return withRateLimitHeaders(
      jsonOk({
        data: [],
        page,
        limit,
        total: 0,
        totalPages: 1,
        dateRange: range,
        configError: configError || "Database not configured.",
      }),
      limited.result,
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("status", "success")
      .order("timestamp", { ascending: false });

    // amount >= 50 USDT BEFORE pagination
    query = applyMinDisplayAmountFilter(query);

    if (range.from) query = query.gte("timestamp", range.from);
    if (range.to) query = query.lte("timestamp", range.to);

    // Deposit = IN to deposit wallet; Withdrawal = OUT from withdraw wallet
    query = applyTransactionHistoryTypeFilter(query, type);

    // Address search: Deposit History → sender (from); Withdrawal History → receiver (to)
    if (search) {
      const s = search.toLowerCase();
      const field = type === "deposit" ? "from_address" : "to_address";
      if (s.startsWith("0x") && s.length === 42) {
        query = query.eq(field, normalizeAddress(s));
      } else {
        query = query.ilike(field, `%${search}%`);
      }
    }

    // Paginate after amount/date/type/search filters so every page is >= min display USDT.
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) {
      console.error("[api/transactions]", error.message);
      return jsonError("Historical indexer is syncing or unavailable.", 503);
    }

    const rows: TransactionRow[] = (data ?? []).map((r) => ({
      id: r.id,
      txHash: r.tx_hash,
      logIndex: r.log_index,
      walletAddress: r.wallet_address,
      // Label by history tab semantics, not raw wallet_type from analytics IN rows
      walletType: type,
      tokenContract: r.token_contract,
      fromAddress: r.from_address,
      toAddress: r.to_address,
      amountRaw: r.amount_raw,
      amountUsdt: Number(r.amount_usdt) || 0,
      blockNumber: Number(r.block_number),
      blockHash: r.block_hash,
      timestamp: r.timestamp,
      status: r.status,
      tokenSymbol: r.token_symbol,
      tokenDecimals: r.token_decimals,
    }));

    const total = count ?? 0;
    return withRateLimitHeaders(
      jsonOk({
        data: rows,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        dateRange: range,
        configError,
      }),
      limited.result,
    );
  } catch (err) {
    console.error("[api/transactions]", err);
    return jsonError("Blockchain data temporarily unavailable.", 503);
  }
}
