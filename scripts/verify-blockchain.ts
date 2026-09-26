import { config } from "dotenv";
import { resolve } from "path";

// Load env BEFORE importing app modules (static imports are hoisted otherwise).
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const {
    CHAIN_ID,
    DEPOSIT_WALLET,
    USDT_CONTRACT_ADDRESS,
    WITHDRAW_WALLET,
    BSC_RPC_URL,
  } = await import("../lib/config");
  const { checkRpcHealth, getLatestBlockNumber } = await import(
    "../lib/blockchain/rpc"
  );
  const { getTokenInfo } = await import("../lib/blockchain/token");
  const { getTokenBalance } = await import("../lib/blockchain/balance");
  const { isValidAddress } = await import("../lib/utils/addresses");

  function ok(msg: string) {
    console.log(`✓ ${msg}`);
  }

  function fail(msg: string) {
    console.error(`✗ ${msg}`);
  }

  let failed = false;

  console.log("\nTreasureNOVA — Blockchain Verification\n");
  console.log(`RPC: ${BSC_RPC_URL}`);
  console.log(`Expected Chain ID: ${CHAIN_ID}\n`);

  const health = await checkRpcHealth();
  if (health.rpcConnected) {
    ok("RPC connected");
  } else {
    fail(`RPC connected — ${health.error}`);
    failed = true;
  }

  if (health.chainId === CHAIN_ID) {
    ok(`Chain ID: ${health.chainId}`);
  } else {
    fail(`Chain ID: expected ${CHAIN_ID}, got ${health.chainId}`);
    failed = true;
  }

  if (isValidAddress(DEPOSIT_WALLET)) {
    ok(`Deposit wallet valid: ${DEPOSIT_WALLET}`);
  } else {
    fail("Deposit wallet invalid");
    failed = true;
  }

  if (isValidAddress(WITHDRAW_WALLET)) {
    ok(`Withdraw wallet valid: ${WITHDRAW_WALLET}`);
  } else {
    fail("Withdraw wallet invalid");
    failed = true;
  }

  if (!USDT_CONTRACT_ADDRESS) {
    fail("Token contract not configured (USDT_CONTRACT_ADDRESS)");
    failed = true;
  } else {
    try {
      const token = await getTokenInfo(USDT_CONTRACT_ADDRESS);
      ok(`Token contract valid: ${token.address}`);
      ok(`Token symbol: ${token.symbol}`);
      ok(`Token decimals: ${token.decimals}`);
      if (token.name) ok(`Token name: ${token.name}`);
    } catch (err) {
      fail(
        err instanceof Error
          ? err.message
          : "Configured USDT contract could not be verified on BNB Smart Chain.",
      );
      failed = true;
    }
  }

  try {
    const latest = health.latestBlock ?? (await getLatestBlockNumber());
    ok(`Latest block: ${latest}`);
  } catch (err) {
    fail(
      `Latest block unavailable — ${err instanceof Error ? err.message : err}`,
    );
    failed = true;
  }

  if (USDT_CONTRACT_ADDRESS && isValidAddress(DEPOSIT_WALLET)) {
    try {
      const bal = await getTokenBalance(DEPOSIT_WALLET);
      ok(`Deposit wallet balance: ${bal.balance} ${bal.symbol}`);
    } catch (err) {
      fail(`Deposit balance — ${err instanceof Error ? err.message : err}`);
      failed = true;
    }
  }

  if (USDT_CONTRACT_ADDRESS && isValidAddress(WITHDRAW_WALLET)) {
    try {
      const bal = await getTokenBalance(WITHDRAW_WALLET);
      ok(`Withdraw wallet balance: ${bal.balance} ${bal.symbol}`);
    } catch (err) {
      fail(`Withdraw balance — ${err instanceof Error ? err.message : err}`);
      failed = true;
    }
  }

  console.log("");
  if (failed) {
    console.error("Verification finished with errors.\n");
    process.exit(1);
  }
  console.log("Verification passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
