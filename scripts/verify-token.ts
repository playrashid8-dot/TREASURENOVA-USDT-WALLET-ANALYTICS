import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { USDT_CONTRACT_ADDRESS, CHAIN_ID } = await import("../lib/config");
  const { verifyTokenContract } = await import("../lib/blockchain/token");

  console.log("\nTreasureNOVA — Token Contract Verification\n");

  if (!USDT_CONTRACT_ADDRESS) {
    console.error(
      "✗ USDT_CONTRACT_ADDRESS is not set.\n  Set it in .env.local before continuing.\n",
    );
    process.exit(1);
  }

  console.log(`Contract: ${USDT_CONTRACT_ADDRESS}`);
  console.log(`Expected chain: ${CHAIN_ID}\n`);

  const result = await verifyTokenContract(USDT_CONTRACT_ADDRESS);

  if (!result.ok || !result.token) {
    console.error(
      `✗ ${result.error || "Configured USDT contract could not be verified on BNB Smart Chain."}\n`,
    );
    process.exit(1);
  }

  console.log("✓ Token contract verified on BNB Smart Chain");
  console.log(`✓ Chain ID: ${result.chainId}`);
  console.log(`✓ Address: ${result.token.address}`);
  console.log(`✓ Name: ${result.token.name}`);
  console.log(`✓ Symbol: ${result.token.symbol}`);
  console.log(`✓ Decimals: ${result.token.decimals}`);
  console.log("✓ Transfer event signature validated\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
