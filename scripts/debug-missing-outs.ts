import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const {
    WITHDRAW_WALLET,
    USDT_CONTRACT_ADDRESS,
    TRANSFER_EVENT_TOPIC,
  } = await import("../lib/config");
  const { normalizeAddress } = await import("../lib/utils/addresses");
  const { getSupabaseAdmin } = await import("../lib/supabase/server");
  const { classifyIndexedTransferRoles } = await import(
    "../lib/blockchain/validation"
  );
  const { Interface } = await import("ethers");

  const sb = getSupabaseAdmin();
  const w = normalizeAddress(WITHDRAW_WALLET);
  const topicAddr =
    "0x" + w.replace(/^0x/, "").padStart(64, "0");

  // Fetch a small SQD window known to have OUTs
  const fromBlock = 124073680;
  const toBlock = 124074400;
  const body = {
    type: "evm",
    fromBlock,
    toBlock,
    fields: {
      block: { number: true, timestamp: true, hash: true },
      log: {
        address: true,
        topics: true,
        data: true,
        transactionHash: true,
        logIndex: true,
      },
      transaction: { status: true, hash: true },
    },
    logs: [
      {
        address: [normalizeAddress(USDT_CONTRACT_ADDRESS!)],
        topic0: [TRANSFER_EVENT_TOPIC],
        topic2: [topicAddr],
      },
      {
        address: [normalizeAddress(USDT_CONTRACT_ADDRESS!)],
        topic0: [TRANSFER_EVENT_TOPIC],
        topic1: [topicAddr],
      },
    ],
  };

  const res = await fetch(
    "https://portal.sqd.dev/datasets/binance-mainnet/stream",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  const lines = text.trim() ? text.trim().split("\n").filter(Boolean) : [];
  console.log("SQD blocks", lines.length, "status", res.status);

  const iface = new Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ]);

  let outFound = 0;
  let inFound = 0;
  for (const line of lines) {
    const b = JSON.parse(line);
    for (const log of b.logs ?? []) {
      const parsed = iface.parseLog({
        topics: log.topics,
        data: log.data,
      });
      if (!parsed) continue;
      const from = String(parsed.args.from).toLowerCase();
      const to = String(parsed.args.to).toLowerCase();
      const roles = classifyIndexedTransferRoles(from, to);
      const isOut = from === w && to !== w;
      const isIn = to === w;
      if (isOut) outFound += 1;
      if (isIn) inFound += 1;

      if (isOut) {
        const { data: existing } = await sb
          .from("transactions")
          .select("tx_hash, from_address, to_address, wallet_type, amount_usdt")
          .eq("tx_hash", log.transactionHash.toLowerCase())
          .eq("log_index", log.logIndex);
        console.log({
          block: b.header.number,
          tx: log.transactionHash,
          logIndex: log.logIndex,
          from,
          to,
          roles,
          inDb: existing,
        });
      }
    }
  }
  console.log({ outFound, inFound });

  // Check if IN for same window are in DB
  const { count: inDb } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("to_address", w)
    .gte("block_number", fromBlock)
    .lte("block_number", toBlock);
  const { count: outDb } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("from_address", w)
    .gte("block_number", fromBlock)
    .lte("block_number", toBlock);
  console.log({ inDb, outDb, window: `${fromBlock}-${toBlock}` });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
