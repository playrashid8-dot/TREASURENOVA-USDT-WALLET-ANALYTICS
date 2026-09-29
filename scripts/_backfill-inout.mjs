/**
 * Targeted historical backfill for newly monitored directions:
 * Deposit OUT + Reserve IN (and full IN/OUT for all wallets).
 * Uses runSync({ fullHistory: true }) which respects SYNC_LOOKBACK_BLOCKS.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { runSync } = await import("../lib/blockchain/sync.ts");
  console.log("[backfill] Starting fullHistory lookback sync…");
  const result = await runSync({ fullHistory: true });
  console.log("[backfill] Done:", JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
