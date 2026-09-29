import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("missing supabase", !!url, !!key);
  process.exit(1);
}

const sb = createClient(url, key);
const deposit = (process.env.DEPOSIT_WALLET || "").toLowerCase();
const withdraw = (process.env.WITHDRAW_WALLET || "").toLowerCase();
const reserve = (process.env.RESERVE_FUND_WALLET || "").toLowerCase();
const min = Number(process.env.LARGE_TX_MIN_USDT || 10000);
console.log({ deposit, withdraw, reserve, min });

async function count(label, filter) {
  let q = sb
    .from("transactions")
    .select("id, amount_usdt, from_address, to_address, wallet_type", {
      count: "exact",
    })
    .eq("status", "success");
  q = filter(q);
  const { data, count, error } = await q
    .order("amount_usdt", { ascending: false })
    .limit(3);
  if (error) {
    console.log(label, "ERR", error.message);
    return;
  }
  let q2 = sb
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("status", "success")
    .gte("amount_usdt", min);
  q2 = filter(q2);
  const { count: geCount, error: e2 } = await q2;
  if (e2) console.log(label, "geERR", e2.message);
  console.log(label, {
    total: count,
    ge10k: geCount,
    top: (data || []).map((r) => Number(r.amount_usdt)),
  });
}

await count("Deposit IN", (q) => q.eq("to_address", deposit));
await count("Deposit OUT", (q) =>
  q.eq("from_address", deposit).neq("to_address", deposit),
);
await count("Withdraw IN", (q) => q.eq("to_address", withdraw));
await count("Withdraw OUT", (q) =>
  q.eq("from_address", withdraw).neq("to_address", withdraw),
);
await count("Reserve IN", (q) => q.eq("to_address", reserve));
await count("Reserve OUT", (q) =>
  q.eq("from_address", reserve).neq("to_address", reserve),
);

const { data: sync } = await sb
  .from("sync_state")
  .select("*")
  .eq("sync_key", "usdt_wallet_transfers")
  .maybeSingle();
console.log("sync_state", sync);
