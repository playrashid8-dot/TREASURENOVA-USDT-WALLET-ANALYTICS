import { config } from "dotenv";
import { resolve } from "path";
import { zeroPadValue, getAddress } from "ethers";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const {
    WITHDRAW_WALLET,
    USDT_CONTRACT_ADDRESS,
    TRANSFER_EVENT_TOPIC,
    SYNC_START_BLOCK,
  } = await import("../lib/config");
  const { normalizeAddress } = await import("../lib/utils/addresses");
  const { getLatestBlockNumber, getRpcProvider } = await import(
    "../lib/blockchain/rpc"
  );
  const { getTokenInfo } = await import("../lib/blockchain/token");
  const { getSupabaseAdmin } = await import("../lib/supabase/server");

  console.log("WITHDRAW", WITHDRAW_WALLET);
  console.log("USDT", USDT_CONTRACT_ADDRESS);
  console.log("SYNC_START", SYNC_START_BLOCK);

  try {
    const token = await getTokenInfo(USDT_CONTRACT_ADDRESS);
    console.log("TOKEN_OK", token);
  } catch (e) {
    console.log("TOKEN_FAIL", e instanceof Error ? e.message : e);
  }

  const latest = await getLatestBlockNumber();
  console.log("LATEST_BLOCK", latest);

  const sb = getSupabaseAdmin();
  const w = normalizeAddress(WITHDRAW_WALLET);

  const { data: outMin } = await sb
    .from("transactions")
    .select("block_number, timestamp, tx_hash, to_address, amount_usdt")
    .eq("from_address", w)
    .order("block_number", { ascending: true })
    .limit(1);
  const { data: outMax } = await sb
    .from("transactions")
    .select("block_number, timestamp, tx_hash, to_address, amount_usdt")
    .eq("from_address", w)
    .order("block_number", { ascending: false })
    .limit(1);
  console.log("DB_OUT_MIN", outMin?.[0]);
  console.log("DB_OUT_MAX", outMax?.[0]);

  const { data: inMax } = await sb
    .from("transactions")
    .select("block_number, timestamp")
    .eq("to_address", w)
    .order("block_number", { ascending: false })
    .limit(1);
  console.log("DB_IN_MAX", inMax?.[0]);

  // Recent RPC OUT scan (last 100k blocks in 10k chunks)
  const provider = getRpcProvider();
  const topicFrom = zeroPadValue(getAddress(WITHDRAW_WALLET), 32);
  let rpcOut = 0;
  const samples: Array<{ tx: string; block: number; to: string }> = [];
  const scanStart = Math.max(SYNC_START_BLOCK, latest - 100_000);
  for (let from = scanStart; from <= latest; from += 10_000) {
    const to = Math.min(from + 9_999, latest);
    try {
      const logs = await provider.getLogs({
        address: USDT_CONTRACT_ADDRESS!,
        fromBlock: from,
        toBlock: to,
        topics: [TRANSFER_EVENT_TOPIC, topicFrom, null],
      });
      rpcOut += logs.length;
      for (const log of logs) {
        if (samples.length < 3) {
          const toTopic = log.topics[2];
          const toAddr = toTopic
            ? "0x" + toTopic.slice(26).toLowerCase()
            : "?";
          samples.push({
            tx: log.transactionHash,
            block: Number(log.blockNumber),
            to: toAddr,
          });
        }
      }
      process.stdout.write(`.`);
    } catch (err) {
      console.log(
        `\nRPC_CHUNK_FAIL ${from}-${to}`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  console.log("\nRPC_OUT_LAST_100K", rpcOut, "samples", samples);

  // SQD sample for last 50k
  const topicAddr =
    "0x" +
    normalizeAddress(WITHDRAW_WALLET).replace(/^0x/, "").padStart(64, "0");
  const sqdFrom = latest - 50_000;
  const body = {
    type: "evm",
    fromBlock: sqdFrom,
    toBlock: latest,
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
  console.log("SQD_STATUS", res.status);
  const text = await res.text();
  if (res.status === 200 || res.status === 204) {
    const lines = text.trim() ? text.trim().split("\n").filter(Boolean) : [];
    let logCount = 0;
    const sqdSamples: string[] = [];
    for (const line of lines) {
      const b = JSON.parse(line);
      for (const log of b.logs ?? []) {
        logCount += 1;
        if (sqdSamples.length < 5) {
          sqdSamples.push(
            `${b.header.number} ${log.transactionHash} idx=${log.logIndex}`,
          );
        }
      }
    }
    console.log("SQD_OUT_LAST_50K_BLOCKS", lines.length, "logs", logCount);
    console.log("SQD_SAMPLES", sqdSamples);
  } else {
    console.log("SQD_ERR", text.slice(0, 300));
  }

  // Compare: how many OUT in DB in last 100k blocks
  const { count: dbRecentOut } = await sb
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("from_address", w)
    .gte("block_number", scanStart);
  console.log("DB_OUT_LAST_100K_BLOCKS", dbRecentOut);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
