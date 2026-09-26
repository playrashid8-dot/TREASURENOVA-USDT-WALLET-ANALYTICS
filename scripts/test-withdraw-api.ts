import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { GET } = await import("../app/api/transactions/route");
  const { WITHDRAW_WALLET, MIN_DISPLAY_USDT_AMOUNT } = await import(
    "../lib/config"
  );
  const { getSupabaseAdmin } = await import("../lib/supabase/server");
  const { normalizeAddress } = await import("../lib/utils/addresses");
  const { applyTransactionHistoryTypeFilter, applyMinDisplayAmountFilter } =
    await import("../lib/analytics/filters");

  const w = normalizeAddress(WITHDRAW_WALLET);
  const sb = getSupabaseAdmin();

  // Pick a real OUT receiver
  const { data: sample } = await sb
    .from("transactions")
    .select("to_address, tx_hash, amount_usdt, from_address")
    .eq("from_address", w)
    .gte("amount_usdt", MIN_DISPLAY_USDT_AMOUNT)
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log("SAMPLE", sample);
  if (!sample) {
    console.log("No sample OUT found");
    return;
  }

  const receiver = sample.to_address as string;

  // Direct supabase query mimicking API
  let q = sb
    .from("transactions")
    .select("*", { count: "exact" })
    .eq("status", "success")
    .order("timestamp", { ascending: false });
  q = applyMinDisplayAmountFilter(q);
  q = applyTransactionHistoryTypeFilter(q, "withdraw");
  q = q.eq("to_address", normalizeAddress(receiver));
  const { data, error, count } = await q.range(0, 19);
  console.log("DIRECT_QUERY count=", count, "error=", error?.message);
  console.log(
    "DIRECT_ROWS",
    (data ?? []).map((r) => ({
      tx: r.tx_hash,
      from: r.from_address,
      to: r.to_address,
      amt: r.amount_usdt,
    })),
  );

  // Call API handler
  const urls = [
    "http://localhost/api/transactions?preset=all&type=withdraw&page=1&limit=10",
    `http://localhost/api/transactions?preset=all&type=withdraw&page=1&limit=10&search=${receiver}`,
    `http://localhost/api/transactions?preset=all&type=withdraw&page=1&limit=10&search=${receiver.slice(0, 10)}`,
    `http://localhost/api/transactions?preset=all&type=withdraw&page=1&limit=10&search=${receiver.toUpperCase()}`,
  ];

  for (const url of urls) {
    const req = new Request(url);
    const res = await GET(req);
    const body = await res.json();
    console.log("\nAPI", url.replace("http://localhost", ""));
    console.log(
      "status",
      res.status,
      "total",
      body.total,
      "rows",
      body.data?.length,
      "first",
      body.data?.[0]
        ? {
            to: body.data[0].toAddress,
            from: body.data[0].fromAddress,
            amt: body.data[0].amountUsdt,
            tx: body.data[0].txHash,
          }
        : null,
      "error",
      body.error,
      "configError",
      body.configError,
    );
  }

  // Search for 0xEcE4 partial
  const { data: ece4 } = await sb
    .from("transactions")
    .select("to_address, tx_hash, amount_usdt, from_address")
    .eq("from_address", w)
    .ilike("to_address", "%ece4%")
    .gte("amount_usdt", 50)
    .limit(5);
  console.log("\nECE4_MATCHES", ece4);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
