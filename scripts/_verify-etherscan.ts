import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const hash =
    "0x9dfc5be7ba91a09bb4e9d7eb4a1948dfa25391e89320bd70fcf402c8cf3985cd";
  const key = process.env.ETHERSCAN_API_KEY || "";
  const url = `https://api.etherscan.io/v2/api?chainid=56&module=proxy&action=eth_getTransactionReceipt&txhash=${hash}&apikey=${key}`;
  const res = await fetch(url);
  const json = (await res.json()) as {
    result?:
      | {
          status: string;
          blockNumber: string;
          logs: Array<{ address: string; topics: string[]; data: string }>;
        }
      | string;
    message?: string;
  };
  const r = json.result;
  if (!r || typeof r === "string") {
    console.log("etherscan fail", json);
    if (typeof r === "string") console.log("result string", r.slice(0, 200));
    process.exit(1);
  }
  const blockHex = r.blockNumber;
  const blockNum = Number.parseInt(blockHex, 16);
  const usdt = (process.env.USDT_CONTRACT_ADDRESS || "").toLowerCase();
  const topic =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  console.log("keys", Object.keys(r));
  console.log("status", r.status, "block", r.blockNumber, "rawType", typeof json.result);
  console.log("message", json.message);
  console.log(
    "sample addresses",
    (r.logs || []).slice(0, 5).map((l) => ({
      address: l.address,
      topic0: l.topics[0],
    })),
  );
  const log = (r.logs || []).find(
    (l) => l.address.toLowerCase() === usdt && l.topics[0]?.toLowerCase() === topic,
  );
  if (!log) {
    console.log("no usdt transfer log");
    process.exit(1);
  }
  const from = "0x" + log.topics[1].slice(26);
  const to = "0x" + log.topics[2].slice(26);
  const amt = Number(BigInt(log.data)) / 1e18;
  const blockUrl = `https://api.etherscan.io/v2/api?chainid=56&module=proxy&action=eth_getBlockByNumber&tag=${blockHex}&boolean=false&apikey=${key}`;
  const b = (await (await fetch(blockUrl)).json()) as {
    result?: { timestamp: string };
  };
  const ts = Number.parseInt(b.result?.timestamp || "0", 16);
  console.log(
    JSON.stringify(
      {
        blockNumber: blockNum,
        status: r.status,
        from,
        to,
        amountUsdt: amt,
        iso: new Date(ts * 1000).toISOString(),
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
