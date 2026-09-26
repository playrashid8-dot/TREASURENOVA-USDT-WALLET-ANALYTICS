import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const { runSync } = await import("../lib/blockchain/sync");
  const { runReconciliationCheck } = await import(
    "../lib/analytics/aggregation"
  );
  const { getSupabaseAdmin } = await import("../lib/supabase/server");
  const { WITHDRAW_WALLET, MIN_DISPLAY_USDT_AMOUNT } = await import(
    "../lib/config"
  );
  const { normalizeAddress } = await import("../lib/utils/addresses");

  console.log("\nTreasureNOVA — Historical Sync\n");

  // Default: resume from sync_state.
  // --full → re-scan lookback / SYNC_START_BLOCK window
  // --start=N --end=N → targeted inclusive backfill (does not lower tip)
  const fullHistory = process.argv.includes("--full");
  const startRaw = readArg("start");
  const endRaw = readArg("end");
  const startBlock = startRaw ? Number.parseInt(startRaw, 10) : undefined;
  const endBlock = endRaw ? Number.parseInt(endRaw, 10) : undefined;

  const sb = getSupabaseAdmin();
  const w = normalizeAddress(WITHDRAW_WALLET);
  const { count: outBefore } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("from_address", w)
    .eq("status", "success");
  const { count: outGe50Before } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("from_address", w)
    .eq("status", "success")
    .gte("amount_usdt", MIN_DISPLAY_USDT_AMOUNT);

  console.log("Withdraw OUT before:", outBefore, `(≥50: ${outGe50Before})`);
  if (fullHistory) console.log("Mode: --full");
  if (startBlock != null) {
    console.log(
      `Mode: targeted backfill ${startBlock}→${endBlock ?? "tip"}`,
    );
  }

  const result = await runSync({
    fullHistory,
    startBlock:
      startBlock != null && Number.isFinite(startBlock)
        ? startBlock
        : undefined,
    endBlock:
      endBlock != null && Number.isFinite(endBlock) ? endBlock : undefined,
  });

  const { count: outAfter } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("from_address", w)
    .eq("status", "success");
  const { count: outGe50After } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("from_address", w)
    .eq("status", "success")
    .gte("amount_usdt", MIN_DISPLAY_USDT_AMOUNT);

  console.log("\nResult:");
  console.log(JSON.stringify(result, null, 2));
  console.log("\nWithdraw OUT after:", outAfter, `(≥50: ${outGe50After})`);
  console.log(
    "Withdraw OUT net new rows:",
    (outAfter ?? 0) - (outBefore ?? 0),
  );

  if (result.ok) {
    try {
      const recon = await runReconciliationCheck();
      console.log("\nReconciliation:");
      console.log(JSON.stringify(recon, null, 2));
    } catch (err) {
      console.warn(
        "Reconciliation skipped:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
