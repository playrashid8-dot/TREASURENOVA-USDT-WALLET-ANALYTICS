import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const label = process.argv[2] || "snapshot";
  const { getSupabaseAdmin } = await import("../lib/supabase/server");
  const { addUtcDays, utcTodayKey } = await import("../lib/utils/dates");

  const sb = getSupabaseAdmin();
  const today = utcTodayKey();
  const from = addUtcDays(today, -8);
  const to = addUtcDays(today, -1);

  const { data, error } = await sb
    .from("daily_stats")
    .select(
      "date, deposit_amount, withdrawal_amount, deposit_count, withdrawal_count, net_cash_flow",
    )
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });

  if (error) throw error;

  const rows = data ?? [];
  const totals = rows.reduce(
    (acc, row) => {
      acc.deposit_amount += Number(row.deposit_amount) || 0;
      acc.deposit_count += Number(row.deposit_count) || 0;
      acc.withdrawal_amount += Number(row.withdrawal_amount) || 0;
      acc.withdrawal_count += Number(row.withdrawal_count) || 0;
      return acc;
    },
    {
      deposit_amount: 0,
      deposit_count: 0,
      withdrawal_amount: 0,
      withdrawal_count: 0,
    },
  );

  const payload = { label, from, to, totals, rows };
  const path = resolve(process.cwd(), `scripts/last8-${label}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  console.log("Wrote", path);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
