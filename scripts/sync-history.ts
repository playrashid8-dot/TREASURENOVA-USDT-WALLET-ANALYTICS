import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { runSync } = await import("../lib/blockchain/sync");
  const { runReconciliationCheck } = await import(
    "../lib/analytics/aggregation"
  );

  console.log("\nTreasureNOVA — Historical Sync\n");

  // Default: resume from sync_state. Pass --full to re-scan from SYNC_START_BLOCK.
  const fullHistory = process.argv.includes("--full");
  const result = await runSync({ fullHistory });

  console.log("\nResult:");
  console.log(JSON.stringify(result, null, 2));

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
