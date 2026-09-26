import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { getSupabaseAdmin } = await import("../lib/supabase/server");
  const {
    WITHDRAW_WALLET,
    DEPOSIT_WALLET,
    MIN_DISPLAY_USDT_AMOUNT,
    SYNC_KEY,
  } = await import("../lib/config");
  const { normalizeAddress } = await import("../lib/utils/addresses");

  const sb = getSupabaseAdmin();
  const w = normalizeAddress(WITHDRAW_WALLET);
  const d = normalizeAddress(DEPOSIT_WALLET);

  const { data: sync, error: syncErr } = await sb
    .from("sync_state")
    .select("*")
    .eq("sync_key", SYNC_KEY)
    .maybeSingle();
  console.log("SYNC_STATE", syncErr?.message || JSON.stringify(sync, null, 2));

  const { count: total } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true });
  console.log("TOTAL_TX", total);

  const { count: outCount } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("from_address", w)
    .eq("status", "success");
  console.log("WITHDRAW_OUT_TOTAL", outCount);

  const { count: outGe50 } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("from_address", w)
    .eq("status", "success")
    .gte("amount_usdt", MIN_DISPLAY_USDT_AMOUNT);
  console.log("WITHDRAW_OUT_GE50", outGe50);

  const { count: inCount } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("to_address", w)
    .eq("status", "success");
  console.log("WITHDRAW_IN_TOTAL", inCount);

  const { count: depIn } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("to_address", d)
    .eq("status", "success");
  console.log("DEPOSIT_IN_TOTAL", depIn);

  const { data: sampleOut } = await sb
    .from("transactions")
    .select(
      "tx_hash, from_address, to_address, amount_usdt, block_number, timestamp, wallet_type",
    )
    .eq("from_address", w)
    .gte("amount_usdt", MIN_DISPLAY_USDT_AMOUNT)
    .order("timestamp", { ascending: false })
    .limit(5);
  console.log("SAMPLE_OUT_GE50", JSON.stringify(sampleOut, null, 2));

  const { data: sampleAnyOut } = await sb
    .from("transactions")
    .select(
      "tx_hash, from_address, to_address, amount_usdt, block_number, timestamp",
    )
    .eq("from_address", w)
    .order("timestamp", { ascending: false })
    .limit(5);
  console.log("SAMPLE_ANY_OUT", JSON.stringify(sampleAnyOut, null, 2));

  // Also check mixed-case from_address (would break eq with normalized filter)
  const { data: anyWithdrawType } = await sb
    .from("transactions")
    .select("from_address, to_address, amount_usdt, wallet_type, tx_hash")
    .eq("wallet_type", "withdraw")
    .order("timestamp", { ascending: false })
    .limit(10);
  console.log(
    "SAMPLE_WALLET_TYPE_WITHDRAW",
    JSON.stringify(anyWithdrawType, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
