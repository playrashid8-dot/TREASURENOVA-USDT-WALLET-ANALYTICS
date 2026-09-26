import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { getSupabaseAdmin } = await import("../lib/supabase/server");
  const { WITHDRAW_WALLET, DEPOSIT_WALLET } = await import("../lib/config");
  const { normalizeAddress } = await import("../lib/utils/addresses");
  const sb = getSupabaseAdmin();
  const w = normalizeAddress(WITHDRAW_WALLET);
  const d = normalizeAddress(DEPOSIT_WALLET);

  for (const [label, col, addr] of [
    ["all", null, null],
    ["dep_in", "to_address", d],
    ["wit_in", "to_address", w],
    ["wit_out", "from_address", w],
  ] as const) {
    let q = sb
      .from("transactions")
      .select("block_number, timestamp")
      .order("block_number", { ascending: true })
      .limit(1);
    if (col && addr) q = q.eq(col, addr);
    const { data: min } = await q;

    let q2 = sb
      .from("transactions")
      .select("block_number, timestamp")
      .order("block_number", { ascending: false })
      .limit(1);
    if (col && addr) q2 = q2.eq(col, addr);
    const { data: max } = await q2;
    console.log(label, "min", min?.[0], "max", max?.[0]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
