import { MAX_TRANSACTION_PAGE_SIZE } from "@/lib/config";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  applyMinDisplayAmountFilter,
  dateRangeFromSearchParams,
} from "@/lib/analytics/filters";
import {
  enforceRateLimit,
  jsonError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "export", 10, 60_000);
  if (!limited.ok) return limited.response;

  if (!isSupabaseConfigured()) {
    return jsonError("Database not configured.", 503);
  }

  try {
    const { searchParams } = new URL(request.url);
    const range = dateRangeFromSearchParams(searchParams);
    const type = searchParams.get("type") || "all";

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("transactions")
      .select(
        "timestamp, wallet_type, amount_usdt, from_address, to_address, tx_hash, block_number, status",
      )
      .eq("status", "success")
      .order("timestamp", { ascending: false });

    query = applyMinDisplayAmountFilter(query);

    if (range.from) query = query.gte("timestamp", range.from);
    if (range.to) query = query.lte("timestamp", range.to);
    if (type === "deposit" || type === "withdraw") {
      query = query.eq("wallet_type", type);
    }

    query = query.limit(Math.min(MAX_TRANSACTION_PAGE_SIZE * 50, 5000));

    const { data, error } = await query;
    if (error) {
      return jsonError("Export failed.", 503);
    }

    const header = [
      "date",
      "type",
      "amount",
      "from",
      "to",
      "tx_hash",
      "block_number",
      "timestamp",
      "status",
    ].join(",");

    const lines = (data ?? []).map((row) =>
      [
        escapeCsv(String(row.timestamp).slice(0, 10)),
        escapeCsv(row.wallet_type === "deposit" ? "Deposit" : "Withdrawal"),
        escapeCsv(Number(row.amount_usdt) || 0),
        escapeCsv(row.from_address),
        escapeCsv(row.to_address),
        escapeCsv(row.tx_hash),
        escapeCsv(row.block_number),
        escapeCsv(row.timestamp),
        escapeCsv(row.status),
      ].join(","),
    );

    const csv = [header, ...lines].join("\n");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="treasurenova-usdt-export.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/export]", err);
    return jsonError("Export failed.", 500);
  }
}
