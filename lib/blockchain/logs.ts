/**
 * BSC USDT Transfer log scanner.
 *
 * Primary: SQD Portal (indexed, large ranges, no paid Etherscan).
 * Fallback: JSON-RPC eth_getLogs with adaptive chunking + retry/backoff.
 */
import { Interface, isAddress, zeroPadValue, getAddress } from "ethers";
import type { Log } from "ethers";
import {
  CHAIN_ID,
  DEPOSIT_WALLET,
  LOG_SCAN_CHUNK_SIZE,
  SYNC_START_BLOCK,
  TRANSFER_EVENT_TOPIC,
  USDT_CONTRACT_ADDRESS,
  WITHDRAW_WALLET,
} from "@/lib/config";
import type { ValidatedTransfer } from "@/types/blockchain";
import { normalizeAddress } from "@/lib/utils/addresses";
import { blockTimestampToIso } from "@/lib/utils/dates";
import { rawToUsdt } from "@/lib/utils/format";
import { classifyTransfer } from "./validation";
import {
  getBlockTimestamp,
  getChainId,
  getRpcProvider,
  getTransactionReceipt,
} from "./rpc";

const TRANSFER_IFACE = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const MIN_CHUNK_SIZE = 1;
const MAX_GETLOGS_ATTEMPTS = 8;
const OVERLAP_BLOCKS = 5;

/** SQD Portal dataset for BNB Smart Chain (chain id 56). */
const SQD_STREAM_URL =
  process.env.SQD_PORTAL_URL?.trim() ||
  "https://portal.sqd.dev/datasets/binance-mainnet/stream";

/** Preferred SQD window size (portal paginates within the window). */
const SQD_WINDOW_SIZE = parsePositiveInt(
  process.env.SQD_SCAN_WINDOW,
  50_000,
);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resume bound: re-scan a few blocks before the last checkpoint for overlap safety.
 * When nothing is indexed yet, use SYNC_START_BLOCK as the floor.
 */
export function resolveScanStartBlock(lastIndexedBlock: number): number {
  if (lastIndexedBlock <= 0) {
    return SYNC_START_BLOCK;
  }
  return Math.max(0, lastIndexedBlock - OVERLAP_BLOCKS);
}

function addressToTopic(address: string): string {
  return zeroPadValue(getAddress(address), 32);
}

function topicAddress(address: string): string {
  return (
    "0x" + normalizeAddress(address).replace(/^0x/, "").padStart(64, "0")
  );
}

function isRangeTooLargeError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("query returned more than") ||
    msg.includes("too many results") ||
    msg.includes("response size exceeded") ||
    msg.includes("block range is too large") ||
    msg.includes("exceed maximum block range") ||
    msg.includes("exceeded maximum") ||
    msg.includes("block range exceeds") ||
    msg.includes("limit exceeded") ||
    msg.includes("-32005") ||
    msg.includes("-32602")
  );
}

function extractRetryAfterMs(err: unknown): number | null {
  const raw =
    err instanceof Error
      ? `${err.message} ${JSON.stringify((err as { info?: unknown }).info ?? {})}`
      : String(err);
  const match = raw.match(/retry_after_ms["\s:]*(\d+)/i);
  if (match) return Number(match[1]);
  if (/429|rate limit|overloaded|-32029/i.test(raw)) return 15_000;
  return null;
}

function isArchiveGatedError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("archive requests require") ||
    msg.includes("personal token") ||
    msg.includes("unauthorized") ||
    (msg.includes("403") && msg.includes("archive"))
  );
}

function isRetryableRpcError(err: unknown): boolean {
  if (isArchiveGatedError(err)) return false;
  if (isRangeTooLargeError(err)) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("-32029") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("504") ||
    msg.includes("529") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("network") ||
    msg.includes("server error") ||
    msg.includes("-32000")
  );
}

async function getLogsWithRetry(filter: {
  address: string;
  fromBlock: number;
  toBlock: number;
  topics: (string | null)[];
}): Promise<Log[]> {
  const provider = getRpcProvider();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_GETLOGS_ATTEMPTS; attempt++) {
    try {
      return await provider.getLogs({
        address: filter.address,
        fromBlock: filter.fromBlock,
        toBlock: filter.toBlock,
        topics: filter.topics,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (isRangeTooLargeError(err)) {
        throw lastError;
      }
      if (!isRetryableRpcError(err) || attempt === MAX_GETLOGS_ATTEMPTS - 1) {
        throw lastError;
      }
      const retryAfter = extractRetryAfterMs(err);
      const backoff =
        retryAfter ?? Math.min(1000 * 2 ** attempt, 30_000);
      await sleep(backoff);
    }
  }

  throw lastError ?? new Error("eth_getLogs failed");
}

/**
 * Fetch Transfer logs where `to` matches any of the given addresses,
 * adapting the block range down when the RPC rejects the query size.
 */
async function fetchTransferLogsAdaptive(options: {
  contractAddress: string;
  toAddresses: string[];
  fromBlock: number;
  toBlock: number;
  preferredChunk: number;
}): Promise<{
  logs: Log[];
  scannedTo: number;
  usedChunk: number;
}> {
  const { contractAddress, toAddresses, fromBlock, toBlock } = options;
  let chunkEnd = Math.min(fromBlock + options.preferredChunk - 1, toBlock);
  let attemptChunk = chunkEnd - fromBlock + 1;

  for (;;) {
    try {
      const addresses = toAddresses.filter((to) => isAddress(to));
      const batches = await Promise.all(
        addresses.map((to) =>
          getLogsWithRetry({
            address: contractAddress,
            fromBlock,
            toBlock: chunkEnd,
            topics: [TRANSFER_EVENT_TOPIC, null, addressToTopic(to)],
          }),
        ),
      );
      return {
        logs: batches.flat(),
        scannedTo: chunkEnd,
        usedChunk: attemptChunk,
      };
    } catch (err) {
      if (!isRangeTooLargeError(err) || attemptChunk <= MIN_CHUNK_SIZE) {
        throw err;
      }
      attemptChunk = Math.max(MIN_CHUNK_SIZE, Math.floor(attemptChunk / 2));
      chunkEnd = Math.min(fromBlock + attemptChunk - 1, toBlock);
      await sleep(250);
    }
  }
}

interface SqdBlock {
  header: {
    number: number;
    timestamp: number;
    hash?: string;
  };
  logs?: Array<{
    address: string;
    topics: string[];
    data: string;
    transactionHash: string;
    logIndex: number;
    transactionIndex?: number;
  }>;
  transactions?: Array<{
    hash: string;
    status?: number | null;
  }>;
}

async function fetchSqdPage(
  fromBlock: number,
  toBlock: number,
): Promise<{ status: number; blocks: SqdBlock[] }> {
  const token = USDT_CONTRACT_ADDRESS;
  if (!token) {
    throw new Error("USDT_CONTRACT_ADDRESS is not configured.");
  }

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
        transactionIndex: true,
      },
      transaction: { status: true, hash: true },
    },
    logs: [
      {
        address: [normalizeAddress(token)],
        topic0: [TRANSFER_EVENT_TOPIC],
        topic2: [topicAddress(DEPOSIT_WALLET)],
      },
      {
        address: [normalizeAddress(token)],
        topic0: [TRANSFER_EVENT_TOPIC],
        topic2: [topicAddress(WITHDRAW_WALLET)],
      },
    ],
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(SQD_STREAM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);

      if (res.status === 204) {
        return { status: 204, blocks: [] };
      }

      const text = await res.text();
      if (res.status === 429 || res.status === 529 || res.status >= 500) {
        lastError = new Error(`SQD ${res.status}: ${text.slice(0, 200)}`);
        await sleep(Math.min(2000 * 2 ** attempt, 30_000));
        continue;
      }

      if (res.status !== 200) {
        throw new Error(`SQD ${res.status}: ${text.slice(0, 300)}`);
      }

      const blocks = text
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SqdBlock);
      return { status: 200, blocks };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryableRpcError(err) && attempt > 2) {
        throw lastError;
      }
      await sleep(Math.min(2000 * 2 ** attempt, 30_000));
    }
  }

  throw lastError ?? new Error("SQD request failed");
}

function decodeTransferLog(log: {
  topics: string[];
  data: string;
}): { from: string; to: string; value: bigint } | null {
  try {
    if (
      !log.topics[0] ||
      log.topics[0].toLowerCase() !== TRANSFER_EVENT_TOPIC.toLowerCase()
    ) {
      return null;
    }
    const parsed = TRANSFER_IFACE.parseLog({
      topics: log.topics as string[],
      data: log.data,
    });
    if (!parsed || parsed.name !== "Transfer") {
      return null;
    }
    const from = String(parsed.args.from);
    const to = String(parsed.args.to);
    const value = BigInt(parsed.args.value);
    if (!isAddress(from) || !isAddress(to)) {
      return null;
    }
    return { from, to, value };
  } catch {
    return null;
  }
}

function buildValidatedTransfer(options: {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string | null;
  timestampUnix: number;
  from: string;
  to: string;
  value: bigint;
  tokenDecimals: number;
  tokenSymbol: string;
  tokenContract: string;
  status: "success" | "failed";
}): ValidatedTransfer | null {
  if (options.status !== "success") {
    return null;
  }

  if (
    !USDT_CONTRACT_ADDRESS ||
    normalizeAddress(options.tokenContract) !==
      normalizeAddress(USDT_CONTRACT_ADDRESS)
  ) {
    return null;
  }

  const walletType = classifyTransfer(options.to);
  if (!walletType) {
    return null;
  }

  const txHash = options.txHash.toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    return null;
  }

  if (!Number.isFinite(options.blockNumber) || options.blockNumber <= 0) {
    return null;
  }

  if (!Number.isFinite(options.logIndex) || options.logIndex < 0) {
    return null;
  }

  const decimals = options.tokenDecimals;
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
    return null;
  }

  if (options.value <= 0n) {
    return null;
  }

  const amountRaw = options.value.toString();
  const amountUsdt = rawToUsdt(amountRaw, decimals);
  if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
    return null;
  }

  let timestamp: string;
  try {
    timestamp = blockTimestampToIso(options.timestampUnix);
  } catch {
    return null;
  }

  const walletAddress =
    walletType === "deposit"
      ? normalizeAddress(DEPOSIT_WALLET)
      : normalizeAddress(WITHDRAW_WALLET);

  return {
    txHash,
    logIndex: options.logIndex,
    walletAddress,
    walletType,
    tokenContract: normalizeAddress(options.tokenContract),
    fromAddress: normalizeAddress(options.from),
    toAddress: normalizeAddress(options.to),
    amountRaw,
    amountUsdt,
    blockNumber: options.blockNumber,
    blockHash: options.blockHash ? options.blockHash.toLowerCase() : null,
    timestamp,
    status: "success",
    tokenSymbol: options.tokenSymbol || "USDT",
    tokenDecimals: decimals,
  };
}

async function validateAndEnrichRpcLog(
  log: Log,
  options: {
    tokenDecimals: number;
    tokenSymbol: string;
    tokenContract: string;
    chainId: number;
    timestampCache: Map<number, number>;
    receiptCache: Map<string, number | null>;
  },
): Promise<ValidatedTransfer | null> {
  if (options.chainId !== CHAIN_ID) {
    return null;
  }

  if (
    !log.address ||
    normalizeAddress(log.address) !== normalizeAddress(options.tokenContract)
  ) {
    return null;
  }

  const decoded = decodeTransferLog({
    topics: log.topics as string[],
    data: log.data,
  });
  if (!decoded) {
    return null;
  }

  const txHash = log.transactionHash?.toLowerCase();
  if (!txHash) {
    return null;
  }

  let receiptStatus = options.receiptCache.get(txHash);
  if (receiptStatus === undefined) {
    try {
      const receipt = await getTransactionReceipt(txHash);
      receiptStatus =
        receipt == null
          ? null
          : receipt.status == null
            ? 1
            : Number(receipt.status);
      options.receiptCache.set(txHash, receiptStatus);
    } catch {
      options.receiptCache.set(txHash, null);
      receiptStatus = null;
    }
  }

  // Logs in a mined block imply success; accept when receipt is unavailable.
  if (receiptStatus !== 1 && receiptStatus !== null) {
    return null;
  }

  const blockNumber = Number(log.blockNumber);
  let unixTs = options.timestampCache.get(blockNumber);
  if (unixTs === undefined) {
    unixTs = await getBlockTimestamp(blockNumber);
    options.timestampCache.set(blockNumber, unixTs);
  }

  return buildValidatedTransfer({
    txHash,
    logIndex: Number(log.index),
    blockNumber,
    blockHash: log.blockHash ? log.blockHash.toLowerCase() : null,
    timestampUnix: unixTs,
    from: decoded.from,
    to: decoded.to,
    value: decoded.value,
    tokenDecimals: options.tokenDecimals,
    tokenSymbol: options.tokenSymbol,
    tokenContract: options.tokenContract,
    status: "success",
  });
}

function transfersFromSqdBlock(
  block: SqdBlock,
  options: {
    tokenDecimals: number;
    tokenSymbol: string;
    tokenContract: string;
    chainId: number;
  },
): ValidatedTransfer[] {
  if (options.chainId !== CHAIN_ID) {
    return [];
  }

  const logs = block.logs || [];
  if (logs.length === 0) {
    return [];
  }

  const txStatus = new Map<string, number>();
  for (const tx of block.transactions || []) {
    if (tx.hash) {
      txStatus.set(
        tx.hash.toLowerCase(),
        tx.status == null ? 1 : Number(tx.status),
      );
    }
  }

  const out: ValidatedTransfer[] = [];
  for (const log of logs) {
    if (
      normalizeAddress(log.address) !==
      normalizeAddress(options.tokenContract)
    ) {
      continue;
    }

    const decoded = decodeTransferLog(log);
    if (!decoded) continue;

    const txHash = log.transactionHash?.toLowerCase();
    if (!txHash) continue;

    const statusCode = txStatus.get(txHash);
    // Indexed Transfer logs are only present for successful txs.
    if (statusCode !== undefined && statusCode !== 1) {
      continue;
    }

    const validated = buildValidatedTransfer({
      txHash,
      logIndex: Number(log.logIndex),
      blockNumber: Number(block.header.number),
      blockHash: block.header.hash ? block.header.hash.toLowerCase() : null,
      timestampUnix: Number(block.header.timestamp),
      from: decoded.from,
      to: decoded.to,
      value: decoded.value,
      tokenDecimals: options.tokenDecimals,
      tokenSymbol: options.tokenSymbol,
      tokenContract: options.tokenContract,
      status: "success",
    });
    if (validated) {
      out.push(validated);
    }
  }
  return out;
}

/**
 * Find the earliest block with a USDT Transfer to any monitored wallet.
 * Walks backward from `toBlock` down to `fromBlock` via eth_getLogs.
 */
export async function findEarliestTransferBlock(options: {
  fromBlock: number;
  toBlock: number;
  contractAddress: string;
  toAddresses: string[];
}): Promise<number | null> {
  const chunk = Math.min(LOG_SCAN_CHUNK_SIZE, 9_999);
  const searchFloor = Math.max(0, options.fromBlock);
  let cursor = Math.max(searchFloor, options.toBlock);
  let earliest: number | null = null;
  let emptyStreak = 0;
  const emptyLimit = Math.max(15, Math.ceil(300_000 / chunk));

  console.log(
    `[logs] Searching earliest activity in blocks ${searchFloor}–${options.toBlock}`,
  );

  while (cursor >= searchFloor && emptyStreak < emptyLimit) {
    const to = cursor;
    const from = Math.max(searchFloor, to - chunk + 1);
    try {
      const { logs } = await fetchTransferLogsAdaptive({
        contractAddress: options.contractAddress,
        toAddresses: options.toAddresses,
        fromBlock: from,
        toBlock: to,
        preferredChunk: chunk,
      });

      if (logs.length > 0) {
        emptyStreak = 0;
        for (const log of logs) {
          const n = Number(log.blockNumber);
          if (Number.isFinite(n)) {
            earliest = earliest == null ? n : Math.min(earliest, n);
          }
        }
      } else if (earliest != null) {
        emptyStreak += 1;
      }

      cursor = from - 1;

      if ((options.toBlock - from) % (chunk * 10) < chunk) {
        console.log(
          `[logs] earliest search @ ${from}${earliest != null ? ` min=${earliest}` : ""}`,
        );
      }

      await sleep(700);
    } catch (err) {
      const wait = extractRetryAfterMs(err) ?? 5_000;
      console.warn(
        `[logs] earliest search retry at ${from}-${to}:`,
        err instanceof Error ? err.message : err,
      );
      await sleep(wait);
    }
  }

  return earliest;
}

export interface ScanProgress {
  fromBlock: number;
  toBlock: number;
  logsFound: number;
  chunkSize: number;
}

export interface ScanChunkComplete {
  toBlock: number;
  transfers: ValidatedTransfer[];
}

async function scanViaSqd(options: {
  startBlock: number;
  endBlock: number;
  tokenDecimals: number;
  tokenSymbol: string;
  tokenContract: string;
  chainId: number;
  onProgress?: (progress: ScanProgress) => void;
  onChunkComplete?: (chunk: ScanChunkComplete) => Promise<void>;
}): Promise<{ lastScannedBlock: number; errors: string[]; ok: boolean }> {
  const errors: string[] = [];
  let cursor = options.startBlock;
  let lastScannedBlock = Math.max(0, cursor - 1);
  const windowSize = SQD_WINDOW_SIZE;

  while (cursor <= options.endBlock) {
    const windowEnd = Math.min(cursor + windowSize - 1, options.endBlock);
    let pageFrom = cursor;
    const windowTransfers: ValidatedTransfer[] = [];
    let logsFound = 0;
    let advancedTo = cursor - 1;

    try {
      while (pageFrom <= windowEnd) {
        const { status, blocks } = await fetchSqdPage(pageFrom, windowEnd);
        if (status === 204 || blocks.length === 0) {
          advancedTo = windowEnd;
          break;
        }

        for (const block of blocks) {
          const transfers = transfersFromSqdBlock(block, options);
          windowTransfers.push(...transfers);
          logsFound += block.logs?.length ?? 0;
          advancedTo = Math.max(advancedTo, block.header.number);
        }

        const lastNum = blocks[blocks.length - 1].header.number;
        if (lastNum >= windowEnd) {
          advancedTo = windowEnd;
          break;
        }
        pageFrom = lastNum + 1;
        // Small pause to respect free-tier portal limits
        await sleep(150);
      }

      if (advancedTo < cursor) {
        // No progress — advance window to avoid stall
        advancedTo = windowEnd;
      }

      options.onProgress?.({
        fromBlock: cursor,
        toBlock: advancedTo,
        logsFound,
        chunkSize: windowEnd - cursor + 1,
      });

      if (options.onChunkComplete) {
        await options.onChunkComplete({
          toBlock: advancedTo,
          transfers: windowTransfers,
        });
      }

      lastScannedBlock = advancedTo;
      cursor = advancedTo + 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`SQD blocks ${cursor}–${windowEnd}: ${msg}`);
      return { lastScannedBlock, errors, ok: false };
    }
  }

  return { lastScannedBlock, errors, ok: true };
}

async function scanViaRpc(options: {
  startBlock: number;
  endBlock: number;
  tokenDecimals: number;
  tokenSymbol: string;
  tokenContract: string;
  chainId: number;
  onProgress?: (progress: ScanProgress) => void;
  onChunkComplete?: (chunk: ScanChunkComplete) => Promise<void>;
}): Promise<{ lastScannedBlock: number; errors: string[] }> {
  const errors: string[] = [];
  const toAddresses = [DEPOSIT_WALLET, WITHDRAW_WALLET].filter((a) =>
    isAddress(a),
  );

  let cursor = Math.max(0, options.startBlock);
  const endBlock = Math.max(cursor, options.endBlock);
  let preferredChunk = Math.min(LOG_SCAN_CHUNK_SIZE, 9_999);
  let lastScannedBlock = Math.max(0, cursor - 1);

  const timestampCache = new Map<number, number>();
  const receiptCache = new Map<string, number | null>();

  while (cursor <= endBlock) {
    try {
      const { logs, scannedTo, usedChunk } = await fetchTransferLogsAdaptive({
        contractAddress: options.tokenContract,
        toAddresses,
        fromBlock: cursor,
        toBlock: endBlock,
        preferredChunk,
      });

      if (usedChunk < preferredChunk) {
        preferredChunk = usedChunk;
      } else if (preferredChunk < 9_999) {
        preferredChunk = Math.min(9_999, preferredChunk * 2);
      }

      const transfers: ValidatedTransfer[] = [];
      for (const log of logs) {
        try {
          const validated = await validateAndEnrichRpcLog(log, {
            tokenDecimals: options.tokenDecimals,
            tokenSymbol: options.tokenSymbol,
            tokenContract: options.tokenContract,
            chainId: options.chainId,
            timestampCache,
            receiptCache,
          });
          if (validated) transfers.push(validated);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`log ${log.transactionHash}:${log.index}: ${msg}`);
        }
      }

      options.onProgress?.({
        fromBlock: cursor,
        toBlock: scannedTo,
        logsFound: logs.length,
        chunkSize: usedChunk,
      });

      if (options.onChunkComplete) {
        await options.onChunkComplete({ toBlock: scannedTo, transfers });
      }

      lastScannedBlock = scannedTo;
      cursor = scannedTo + 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`RPC blocks ${cursor}–${endBlock}: ${msg}`);

      if (isRetryableRpcError(err) && preferredChunk > MIN_CHUNK_SIZE) {
        preferredChunk = Math.max(
          MIN_CHUNK_SIZE,
          Math.floor(preferredChunk / 2),
        );
        const wait = extractRetryAfterMs(err) ?? 1000;
        await sleep(wait);
        continue;
      }

      const skipTo = Math.min(cursor, endBlock);
      lastScannedBlock = skipTo;
      if (options.onChunkComplete) {
        await options.onChunkComplete({ toBlock: skipTo, transfers: [] });
      }
      cursor = skipTo + 1;
      if (errors.length > 50) break;
    }
  }

  return { lastScannedBlock, errors };
}

/**
 * Chunked scan of USDT Transfer events to deposit/withdraw wallets.
 * Prefers SQD Portal (indexed); falls back to RPC eth_getLogs.
 */
export async function scanUsdtTransfersToWallets(options: {
  startBlock: number;
  endBlock: number;
  tokenDecimals: number;
  tokenSymbol: string;
  onProgress?: (progress: ScanProgress) => void;
  onChunkComplete?: (chunk: ScanChunkComplete) => Promise<void>;
}): Promise<{ lastScannedBlock: number; errors: string[] }> {
  const tokenContract = USDT_CONTRACT_ADDRESS;
  if (!tokenContract) {
    return {
      lastScannedBlock: Math.max(0, options.startBlock - 1),
      errors: ["USDT_CONTRACT_ADDRESS is not configured."],
    };
  }

  const chainId = await getChainId();
  if (chainId !== CHAIN_ID) {
    return {
      lastScannedBlock: Math.max(0, options.startBlock - 1),
      errors: [`Unexpected chain ID ${chainId}; expected ${CHAIN_ID}`],
    };
  }

  if (options.startBlock > options.endBlock) {
    return {
      lastScannedBlock: options.endBlock,
      errors: [],
    };
  }

  const shared = {
    startBlock: options.startBlock,
    endBlock: options.endBlock,
    tokenDecimals: options.tokenDecimals,
    tokenSymbol: options.tokenSymbol,
    tokenContract,
    chainId,
    onProgress: options.onProgress,
    onChunkComplete: options.onChunkComplete,
  };

  const preferRpc = (process.env.LOG_SCAN_SOURCE || "auto").toLowerCase() === "rpc";
  const preferSqd = (process.env.LOG_SCAN_SOURCE || "auto").toLowerCase() === "sqd";

  if (!preferRpc) {
    console.log(
      `[logs] Scanning via SQD Portal (${SQD_STREAM_URL.replace(/\/stream$/, "")})`,
    );
    const sqd = await scanViaSqd(shared);
    if (sqd.ok) {
      return { lastScannedBlock: sqd.lastScannedBlock, errors: sqd.errors };
    }

    if (preferSqd) {
      return { lastScannedBlock: sqd.lastScannedBlock, errors: sqd.errors };
    }

    console.warn(
      "[logs] SQD scan incomplete; falling back to RPC eth_getLogs from",
      sqd.lastScannedBlock + 1,
    );
    shared.startBlock = Math.max(shared.startBlock, sqd.lastScannedBlock + 1);
    const rpc = await scanViaRpc(shared);
    return {
      lastScannedBlock: Math.max(sqd.lastScannedBlock, rpc.lastScannedBlock),
      errors: [...sqd.errors, ...rpc.errors],
    };
  }

  console.log("[logs] Scanning via RPC eth_getLogs");
  return scanViaRpc(shared);
}
