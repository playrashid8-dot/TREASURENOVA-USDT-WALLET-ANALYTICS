import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);
const deposit = (process.env.DEPOSIT_WALLET || "").toLowerCase();
const withdraw = (process.env.WITHDRAW_WALLET || "").toLowerCase();
const reserve = (process.env.RESERVE_FUND_WALLET || "").toLowerCase();
const min = 10000;

const { data: resOut } = await sb
  .from("transactions")
  .select("amount_usdt, from_address, to_address, tx_hash, block_number, timestamp")
  .eq("status", "success")
  .eq("from_address", reserve)
  .gte("amount_usdt", min)
  .order("block_number", { ascending: false })
  .limit(20);

console.log("Reserve OUT >=10k destinations:");
for (const r of resOut || []) {
  const to = r.to_address;
  const dest =
    to === withdraw ? "WITHDRAW" : to === deposit ? "DEPOSIT" : to === reserve ? "SELF" : "EXTERNAL";
  console.log({
    amt: Number(r.amount_usdt),
    dest,
    to: to.slice(0, 12),
    block: r.block_number,
    ts: r.timestamp,
  });
}

const { data: wdIn } = await sb
  .from("transactions")
  .select("amount_usdt, from_address, to_address, block_number")
  .eq("status", "success")
  .eq("to_address", withdraw)
  .gte("amount_usdt", min)
  .order("block_number", { ascending: false })
  .limit(20);

console.log("\nWithdraw IN >=10k sources:");
for (const r of wdIn || []) {
  const from = r.from_address;
  const src =
    from === reserve ? "RESERVE" : from === deposit ? "DEPOSIT" : from === withdraw ? "SELF" : "EXTERNAL";
  console.log({
    amt: Number(r.amount_usdt),
    src,
    from: from.slice(0, 12),
    block: r.block_number,
  });
}

// Check on-chain: are there Deposit OUT / Reserve IN at all via needing backfill?
console.log("\nDeposit OUT indexed:", 0, "(need indexer)");
console.log("Reserve IN indexed: 0 (need indexer)");
