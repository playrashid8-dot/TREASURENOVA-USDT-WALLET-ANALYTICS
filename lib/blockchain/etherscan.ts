import {
  CHAIN_ID,
  ETHERSCAN_API_KEY,
  HISTORICAL_BATCH_SIZE,
  USDT_CONTRACT_ADDRESS,
} from "@/lib/config";
import type { EtherscanTokenTransfer } from "@/types/blockchain";
import { normalizeAddress } from "@/lib/utils/addresses";

const ETHERSCAN_V2_URL = "https://api.etherscan.io/v2/api";

interface EtherscanResponse<T> {
  status: string;
  message: string;
  result: T;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  attempts = 4,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      clearTimeout(timeout);

      if (res.status === 429 || res.status >= 500) {
        const backoff = Math.min(1000 * 2 ** i, 12_000);
        await sleep(backoff);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const backoff = Math.min(1000 * 2 ** i, 12_000);
      await sleep(backoff);
    }
  }
  throw lastError ?? new Error("Etherscan request failed");
}

function buildUrl(params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  search.set("chainid", String(CHAIN_ID));
  for (const [k, v] of Object.entries(params)) {
    search.set(k, String(v));
  }
  if (ETHERSCAN_API_KEY) {
    search.set("apikey", ETHERSCAN_API_KEY);
  }
  return `${ETHERSCAN_V2_URL}?${search.toString()}`;
}

export async function getEtherscanLatestBlock(): Promise<number> {
  const url = buildUrl({
    module: "proxy",
    action: "eth_blockNumber",
  });
  const res = await fetchWithRetry(url);
  const json = (await res.json()) as { result?: string; message?: string };
  if (!json.result) {
    throw new Error(json.message || "Failed to fetch latest block from Etherscan");
  }
  return Number.parseInt(json.result, 16);
}

/**
 * Fetch ERC-20 token transfers for an address via Etherscan V2 (chainid=56).
 * Optional helper — primary historical sync uses BSC RPC eth_getLogs.
 * Paginates until exhausted or maxPages reached.
 */
export async function fetchTokenTransfers(options: {
  address: string;
  contractAddress?: string;
  startBlock?: number;
  endBlock?: number;
  page?: number;
  offset?: number;
  sort?: "asc" | "desc";
}): Promise<EtherscanTokenTransfer[]> {
  if (!ETHERSCAN_API_KEY) {
    throw new Error(
      "ETHERSCAN_API_KEY is required for historical token transfer indexing.",
    );
  }

  const contractAddress =
    options.contractAddress || USDT_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("USDT_CONTRACT_ADDRESS is not configured.");
  }

  const url = buildUrl({
    module: "account",
    action: "tokentx",
    address: options.address,
    contractaddress: contractAddress,
    startblock: options.startBlock ?? 0,
    endblock: options.endBlock ?? 999999999,
    page: options.page ?? 1,
    offset: options.offset ?? HISTORICAL_BATCH_SIZE,
    sort: options.sort ?? "asc",
  });

  const res = await fetchWithRetry(url);
  const json = (await res.json()) as EtherscanResponse<
    EtherscanTokenTransfer[] | string
  >;

  if (json.status === "0") {
    const msg = String(json.message || "").toLowerCase();
    const resultStr = typeof json.result === "string" ? json.result : "";
    if (
      msg.includes("no transactions found") ||
      resultStr.toLowerCase().includes("no transactions found") ||
      (Array.isArray(json.result) && json.result.length === 0)
    ) {
      return [];
    }
    // Rate limit / soft errors
    if (
      resultStr.toLowerCase().includes("max rate limit") ||
      msg.includes("rate limit")
    ) {
      throw new Error("Etherscan rate limit exceeded. Retry shortly.");
    }
    throw new Error(
      typeof json.result === "string"
        ? json.result
        : json.message || "Etherscan API error",
    );
  }

  if (!Array.isArray(json.result)) {
    return [];
  }

  return json.result.filter(
    (tx) =>
      normalizeAddress(tx.contractAddress) ===
      normalizeAddress(contractAddress),
  );
}

/**
 * Paginate through all token transfers for an address.
 */
export async function fetchAllTokenTransfers(options: {
  address: string;
  contractAddress?: string;
  startBlock?: number;
  endBlock?: number;
  onPage?: (page: number, count: number) => void;
}): Promise<EtherscanTokenTransfer[]> {
  const all: EtherscanTokenTransfer[] = [];
  let page = 1;
  const offset = HISTORICAL_BATCH_SIZE;

  for (;;) {
    const batch = await fetchTokenTransfers({
      ...options,
      page,
      offset,
      sort: "asc",
    });

    options.onPage?.(page, batch.length);
    all.push(...batch);

    if (batch.length < offset) {
      break;
    }

    page += 1;
    // Be gentle with the API
    await sleep(250);

    // Safety cap
    if (page > 500) {
      console.warn(
        `[etherscan] Stopped pagination at page ${page} for ${options.address}`,
      );
      break;
    }
  }

  return all;
}
