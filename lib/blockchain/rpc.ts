import { JsonRpcProvider, Network } from "ethers";
import { BSC_RPC_URL, CHAIN_ID } from "@/lib/config";
import type { BlockchainHealth } from "@/types/blockchain";

/** Fallback endpoints when the primary RPC rate-limits or rejects a method. */
const RPC_FALLBACKS: string[] = [
  BSC_RPC_URL,
  "https://bsc.publicnode.com",
  "https://rpc-bsc.blockmachine.io",
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.binance.org",
].filter((url, index, arr) => url && arr.indexOf(url) === index);

let provider: JsonRpcProvider | null = null;
let providerUrl: string = RPC_FALLBACKS[0];

function createProvider(url: string): JsonRpcProvider {
  const network = Network.from(CHAIN_ID);
  return new JsonRpcProvider(url, network, {
    staticNetwork: network,
    batchMaxCount: 1,
  });
}

export function getRpcProvider(): JsonRpcProvider {
  if (!provider) {
    providerUrl = RPC_FALLBACKS[0];
    provider = createProvider(providerUrl);
  }
  return provider;
}

export function getRpcProviderUrl(): string {
  getRpcProvider();
  return providerUrl;
}

function rotateProvider(reason: string): JsonRpcProvider {
  const idx = RPC_FALLBACKS.indexOf(providerUrl);
  const next = RPC_FALLBACKS[(idx + 1) % RPC_FALLBACKS.length] || RPC_FALLBACKS[0];
  console.warn(`[rpc] Rotating RPC after error (${reason}) → ${next}`);
  providerUrl = next;
  provider = createProvider(next);
  return provider;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate limit|-32029|retry_after|overloaded|exceeded maximum retry/i.test(
    msg,
  );
}

/**
 * Run an RPC operation with retry/backoff and endpoint rotation on rate limits.
 */
export async function withRpcRetry<T>(
  label: string,
  fn: (p: JsonRpcProvider) => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(getRpcProvider());
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryAfter = String(lastError.message).match(
        /retry_after_ms["\s:]*(\d+)/i,
      );
      const wait = retryAfter
        ? Number(retryAfter[1]) + 250
        : Math.min(2000 * 2 ** i, 20_000);

      if (isRateLimited(err) || i < attempts - 1) {
        if (isRateLimited(err) && i >= 1) {
          rotateProvider(label);
        }
        await sleep(wait);
        continue;
      }
    }
  }
  throw lastError ?? new Error(`RPC ${label} failed`);
}

export async function getLatestBlockNumber(): Promise<number> {
  return withRpcRetry("getBlockNumber", (p) => p.getBlockNumber());
}

export async function getChainId(): Promise<number> {
  return withRpcRetry("getNetwork", async (p) => {
    const network = await p.getNetwork();
    return Number(network.chainId);
  });
}

export async function getBlockTimestamp(blockNumber: number): Promise<number> {
  return withRpcRetry(`getBlock(${blockNumber})`, async (p) => {
    const block = await p.getBlock(blockNumber);
    if (!block) {
      throw new Error(`Block ${blockNumber} not found`);
    }
    return block.timestamp;
  });
}

export async function checkRpcHealth(): Promise<BlockchainHealth> {
  try {
    const result = await withRpcRetry("health", async (p) => {
      const [network, latestBlock] = await Promise.all([
        p.getNetwork(),
        p.getBlockNumber(),
      ]);
      return {
        chainId: Number(network.chainId),
        latestBlock,
      };
    });

    if (result.chainId !== CHAIN_ID) {
      return {
        rpcConnected: true,
        chainId: result.chainId,
        latestBlock: result.latestBlock,
        error: `Unexpected chain ID ${result.chainId}; expected ${CHAIN_ID}`,
      };
    }
    return {
      rpcConnected: true,
      chainId: result.chainId,
      latestBlock: result.latestBlock,
    };
  } catch (err) {
    return {
      rpcConnected: false,
      chainId: null,
      latestBlock: null,
      error: err instanceof Error ? err.message : "RPC unavailable",
    };
  }
}

export async function getTransactionReceipt(txHash: string) {
  return withRpcRetry(`getTransactionReceipt(${txHash})`, (p) =>
    p.getTransactionReceipt(txHash),
  );
}
