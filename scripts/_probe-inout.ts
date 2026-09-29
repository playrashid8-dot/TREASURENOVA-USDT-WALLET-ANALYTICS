import { config } from "dotenv";
config({ path: ".env.local" });

import { JsonRpcProvider, id, getAddress } from "ethers";

async function main() {
  const rpc = process.env.BSC_RPC_URL || "https://rpc-bsc.blockmachine.io";
  const usdt = process.env.USDT_CONTRACT_ADDRESS!;
  const deposit = getAddress(process.env.DEPOSIT_WALLET!);
  const withdraw = getAddress(process.env.WITHDRAW_WALLET!);
  const reserve = getAddress(process.env.RESERVE_FUND_WALLET!);
  const provider = new JsonRpcProvider(rpc, 56);
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - 20_000);
  const topic0 = id("Transfer(address,address,uint256)");
  const pad = (a: string) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");
  const minRaw = 10_000n * 10n ** 18n;

  async function count(label: string, topics: (string | null)[]) {
    try {
      const logs = await provider.getLogs({
        address: usdt,
        fromBlock,
        toBlock: latest,
        topics,
      });
      let ge = 0;
      for (const log of logs) {
        if (BigInt(log.data) >= minRaw) ge++;
      }
      console.log(label, {
        logs: logs.length,
        ge10k: ge,
        window: `${fromBlock}-${latest}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(label, "ERR", msg.slice(0, 160));
    }
  }

  console.log("latest", latest);
  await count("Deposit OUT", [topic0, pad(deposit), null]);
  await count("Deposit IN", [topic0, null, pad(deposit)]);
  await count("Withdraw OUT", [topic0, pad(withdraw), null]);
  await count("Withdraw IN", [topic0, null, pad(withdraw)]);
  await count("Reserve OUT", [topic0, pad(reserve), null]);
  await count("Reserve IN", [topic0, null, pad(reserve)]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
