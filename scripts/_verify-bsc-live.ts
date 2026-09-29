/**
 * Independent BSC verification: live USDT balanceOf for 3 wallets +
 * sample Transfer receipts for recent indexed txs (when DB available).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Contract, JsonRpcProvider, formatUnits } from "ethers";

const USDT = (
  process.env.USDT_CONTRACT_ADDRESS ||
  "0x55d398326f99059fF775485246999027B3197955"
).toLowerCase();
const RPC = process.env.BSC_RPC_URL || "https://bsc.publicnode.com";
const DEPOSIT = (
  process.env.DEPOSIT_WALLET ||
  "0xc051a1b111085ddD6Bc2FF8346Ad0f4E7dF26935"
).toLowerCase();
const WITHDRAW = (
  process.env.WITHDRAW_WALLET ||
  "0x48A909049FB00581CA83beA39BB824eBb90132FA"
).toLowerCase();
const RESERVE = (
  process.env.RESERVE_FUND_WALLET ||
  "0xe1ce23017882f3630e2B5dC4f2Fb3f33947E5904"
).toLowerCase();

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function verifyBalances(provider: JsonRpcProvider) {
  const network = await provider.getNetwork();
  console.log("\n=== Chain ===");
  console.log({ chainId: Number(network.chainId), rpc: RPC });

  const token = new Contract(USDT, ERC20_ABI, provider);
  const [decimals, symbol] = await Promise.all([
    token.decimals() as Promise<number>,
    token.symbol() as Promise<string>,
  ]);
  console.log("\n=== USDT Contract ===");
  console.log({ address: USDT, symbol, decimals: Number(decimals) });

  console.log("\n=== Live balanceOf (USDT) ===");
  const wallets = [
    { label: "Deposit", address: DEPOSIT },
    { label: "Withdraw", address: WITHDRAW },
    { label: "Reserve", address: RESERVE },
  ];
  const results: Array<{ label: string; address: string; balance: string }> =
    [];
  for (const w of wallets) {
    const raw = (await token.balanceOf(w.address)) as bigint;
    const balance = formatUnits(raw, decimals);
    results.push({ label: w.label, address: w.address, balance });
    console.log(`${w.label}: ${Number(balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT (${w.address})`);
  }
  return { decimals: Number(decimals), symbol, results };
}

async function verifyTxHash(
  provider: JsonRpcProvider,
  txHash: string,
  decimals: number,
) {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    return { txHash, ok: false, reason: "receipt not found" };
  }
  const block = await provider.getBlock(receipt.blockNumber);
  const log = receipt.logs.find(
    (l) =>
      l.address.toLowerCase() === USDT &&
      l.topics[0]?.toLowerCase() === TRANSFER_TOPIC,
  );
  if (!log || !log.topics[1] || !log.topics[2]) {
    return {
      txHash,
      ok: false,
      reason: "no USDT Transfer log",
      status: receipt.status,
      blockNumber: receipt.blockNumber,
    };
  }
  const from = ("0x" + log.topics[1].slice(26)).toLowerCase();
  const to = ("0x" + log.topics[2].slice(26)).toLowerCase();
  const amount = formatUnits(BigInt(log.data), decimals);
  const timestamp = block
    ? new Date(block.timestamp * 1000).toISOString()
    : null;
  return {
    txHash,
    ok: receipt.status === 1,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    from,
    to,
    amountUsdt: amount,
    timestamp,
    token: log.address.toLowerCase(),
  };
}

async function main() {
  const provider = new JsonRpcProvider(RPC, 56);
  const { decimals, results } = await verifyBalances(provider);

  // Optional: verify a few known recent hashes from argv or skip
  const hashes = process.argv.slice(2).filter((a) => a.startsWith("0x"));
  if (hashes.length === 0) {
    console.log(
      "\n(No tx hashes passed — balance verification only. Pass hashes as argv to verify transfers.)",
    );
  } else {
    console.log("\n=== Transaction verification ===");
    for (const hash of hashes.slice(0, 5)) {
      const v = await verifyTxHash(provider, hash, decimals);
      console.log(JSON.stringify(v, null, 2));
    }
  }

  console.log("\n=== Summary ===");
  console.log(
    JSON.stringify(
      {
        chainId: 56,
        usdt: USDT,
        balances: results,
        txVerified: hashes.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
