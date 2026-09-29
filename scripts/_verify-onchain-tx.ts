import { config } from "dotenv";
config({ path: ".env.local" });
import { JsonRpcProvider, Network, formatUnits } from "ethers";

async function main() {
  const hash =
    "0x9dfc5be7ba91a09bb4e9d7eb4a1948dfa25391e89320bd70fcf402c8cf3985cd";
  const usdt = (process.env.USDT_CONTRACT_ADDRESS || "").toLowerCase();
  const rpcs = [
    "https://rpc-bsc.blockmachine.io",
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc.drpc.org",
  ];
  const topic =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  for (const rpc of rpcs) {
    try {
      const provider = new JsonRpcProvider(rpc, Network.from(56), {
        staticNetwork: Network.from(56),
      });
      const receipt = await Promise.race([
        provider.getTransactionReceipt(hash),
        new Promise<null>((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), 15_000),
        ),
      ]);
      if (!receipt) {
        console.log(rpc, "NO_RECEIPT");
        continue;
      }
      const block = await provider.getBlock(receipt.blockNumber);
      let transfer: { from: string; to: string; amountUsdt: string } | null =
        null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== usdt) continue;
        if (log.topics[0] !== topic) continue;
        transfer = {
          from: "0x" + log.topics[1].slice(26),
          to: "0x" + log.topics[2].slice(26),
          amountUsdt: formatUnits(log.data, 18),
        };
        break;
      }
      console.log(
        JSON.stringify({
          rpc,
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          iso: block
            ? new Date(block.timestamp * 1000).toISOString()
            : null,
          transfer,
        }),
      );
      return;
    } catch (e) {
      console.log(rpc, "FAIL", e instanceof Error ? e.message : e);
    }
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
