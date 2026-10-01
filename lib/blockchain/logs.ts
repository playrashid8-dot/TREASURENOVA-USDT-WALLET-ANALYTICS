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
  RESERVE_FUND_WALLET,
  SYNC_START_BLOCK,
  TRANSFER_EVENT_TOPIC,
  USDT_CONTRACT_ADDRESS,
  WITHDRAW_WALLET,
} from "@/lib/config";
import type { ValidatedTransfer } from "@/types/blockchain";
import { normalizeAddress } from "@/lib/utils/addresses";
import { blockTimestampToIso } from "@/lib/utils/dates";
import { rawToUsdt } from "@/lib/utils/format";
import { classifyIndexedTransferRoles } from "./validation";
import { externalPageConfirmsRange } from "./sync-plan";
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
const MAX_CURSOR_RETRIES = 6;
/** Re-scan a few blocks before the checkpoint so a short reorg is not missed. */
export const OVERLAP_BLOCKS = 5;

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

export interface ScanStats {
  lastScannedBlock: number;
  errors: string[];
  logsFound: number;
  retries: number;
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

async function getLogsWithRetry(
  filter: {
    address: string;
    fromBlock: number;
    toBlock: number;
    topics: (string | null)[];
  },
  stats?: { retries: number },
): Promise<Log[]> {
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
      if (stats) stats.retries += 1;
      const retryAfter = extractRetryAfterMs(err);
      const backoff = retryAfter ?? Math.min(1000 * 2 ** attempt, 30_000);
      console.warn(
        `[logs] eth_getLogs retry ${attempt + 1} blocks ${filter.fromBlock}-${filter.toBlock}: ${lastError.message.slice(0, 180)}`,
      );
      await sleep(backoff);
    }
  }

  throw lastError ?? new Error("eth_getLogs failed");
}

/**
 * Fetch Transfer logs where `to` matches any of the given addresses,
 * and optionally where `from` matches (Withdraw Wallet OUT for history).
 * Adapts the block range down when the RPC rejects the query size.
 */
async function fetchTransferLogsAdaptive(options: {
  contractAddress: string;
  toAddresses: string[];
  fromAddresses?: string[];
  fromBlock: number;
  toBlock: number;
  preferredChunk: number;
  stats?: { retries: number };
}): Promise<{
  logs: Log[];
  scannedTo: number;
  usedChunk: number;
}> {
  const {
    contractAddress,
    toAddresses,
    fromAddresses = [],
    fromBlock,
    toBlock,
  } = options;
  let chunkEnd = Math.min(fromBlock + options.preferredChunk - 1, toBlock);
  let attemptChunk = chunkEnd - fromBlock + 1;

  for (;;) {
    try {
      const toList = toAddresses.filter((to) => isAddress(to));
      const fromList = fromAddresses.filter((from) => isAddress(from));
      const batches = await Promise.all([
        ...toList.map((to) =>
          getLogsWithRetry({
            address: contractAddress,
            fromBlock,
            toBlock: chunkEnd,
            topics: [TRANSFER_EVENT_TOPIC, null, addressToTopic(to)],
          }, options.stats),
        ),
        ...fromList.map((from) =>
          getLogsWithRetry({
            address: contractAddress,
            fromBlock,
            toBlock: chunkEnd,
            topics: [TRANSFER_EVENT_TOPIC, addressToTopic(from), null],
          }, options.stats),
        ),
      ]);
      // Deduplicate identical logs from overlapping topic1/topic2 queries
      const seen = new Set<string>();
      const logs: Log[] = [];
      for (const log of batches.flat()) {
        const key = `${log.transactionHash}:${log.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        logs.push(log);
      }
      return {
        logs,
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
      // Deposit Wallet IN
      {
        address: [normalizeAddress(token)],
        topic0: [TRANSFER_EVENT_TOPIC],
        topic2: [topicAddress(DEPOSIT_WALLET)],
      },
      // Deposit Wallet OUT
      {
        address: [normalizeAddress(token)],
        topic0: [TRANSFER_EVENT_TOPIC],
        topic1: [topicAddress(DEPOSIT_WALLET)],
      },
      // Withdraw Wallet IN
      {
        address: [normalizeAddress(token)],
        topic0: [TRANSFER_EVENT_TOPIC],
        topic2: [topicAddress(WITHDRAW_WALLET)],
      },
      // Withdraw Wallet OUT
      {
        address: [normalizeAddress(token)],
        topic0: [TRANSFER_EVENT_TOPIC],
        topic1: [topicAddress(WITHDRAW_WALLET)],
      },
      // Reserve Fund IN + OUT
      ...(isAddress(RESERVE_FUND_WALLET)
        ? [
            {
              address: [normalizeAddress(token)],
              topic0: [TRANSFER_EVENT_TOPIC],
              topic2: [topicAddress(RESERVE_FUND_WALLET)],
            },
            {
              address: [normalizeAddress(token)],
              topic0: [TRANSFER_EVENT_TOPIC],
              topic1: [topicAddress(RESERVE_FUND_WALLET)],
            },
          ]
        : []),
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

export function buildValidatedTransfers(options: {
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
}): ValidatedTransfer[] {
  if (options.status !== "success") {
    return [];
  }

  if (
    !USDT_CONTRACT_ADDRESS ||
    normalizeAddress(options.tokenContract) !==
      normalizeAddress(USDT_CONTRACT_ADDRESS)
  ) {
    return [];
  }

  const roles = classifyIndexedTransferRoles(options.from, options.to);
  if (roles.length === 0) {
    return [];
  }

  const txHash = options.txHash.toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    return [];
  }

  if (!Number.isFinite(options.blockNumber) || options.blockNumber <= 0) {
    return [];
  }

  if (!Number.isFinite(options.logIndex) || options.logIndex < 0) {
    return [];
  }

  const decimals = options.tokenDecimals;
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
    return [];
  }

  if (options.value <= 0n) {
    return [];
  }

  const amountRaw = options.value.toString();
  const amountUsdt = rawToUsdt(amountRaw, decimals);
  if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
    return [];
  }

  let timestamp: string;
  try {
    timestamp = blockTimestampToIso(options.timestampUnix);
  } catch {
    return [];
  }

  const fromAddress = normalizeAddress(options.from);
  const toAddress = normalizeAddress(options.to);
  const tokenContract = normalizeAddress(options.tokenContract);

  return roles.map((role) => ({
    txHash,
    logIndex: options.logIndex,
    walletAddress: role.walletAddress,
    walletType: role.walletType,
    tokenContract,
    fromAddress,
    toAddress,
    amountRaw,
    amountUsdt,
    blockNumber: options.blockNumber,
    blockHash: options.blockHash ? options.blockHash.toLowerCase() : null,
    timestamp,
    status: "success" as const,
    tokenSymbol: options.tokenSymbol || "USDT",
    tokenDecimals: decimals,
  }));
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
): Promise<ValidatedTransfer[]> {
  if (options.chainId !== CHAIN_ID) {
    return [];
  }

  if (
    !log.address ||
    normalizeAddress(log.address) !== normalizeAddress(options.tokenContract)
  ) {
    return [];
  }

  const decoded = decodeTransferLog({
    topics: log.topics as string[],
    data: log.data,
  });
  if (!decoded) {
    return [];
  }

  const txHash = log.transactionHash?.toLowerCase();
  if (!txHash) {
    return [];
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

  // A mined Transfer log still needs a successful receipt. If the receipt
  // cannot be read, fail the chunk so the checkpoint does not skip the tx.
  if (receiptStatus == null) {
    throw new Error(`Receipt unavailable for ${txHash}`);
  }
  if (receiptStatus !== 1) {
    return [];
  }

  const blockNumber = Number(log.blockNumber);
  let unixTs = options.timestampCache.get(blockNumber);
  if (unixTs === undefined) {
    unixTs = await getBlockTimestamp(blockNumber);
    options.timestampCache.set(blockNumber, unixTs);
  }

  return buildValidatedTransfers({
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

    const validated = buildValidatedTransfers({
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
    out.push(...validated);
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
}): Promise<{
  lastScannedBlock: number;
  errors: string[];
  ok: boolean;
  unavailable: boolean;
  logsFound: number;
  retries: number;
}> {
  const errors: string[] = [];
  let cursor = options.startBlock;
  let lastScannedBlock = Math.max(0, cursor - 1);
  let totalLogs = 0;
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
        // 204 or an empty indexer page means "not confirmed", not "no transfers".
        if (!externalPageConfirmsRange(status, blocks.length)) {
          errors.push(
            `SQD ${status === 204 ? "204" : "empty"} blocks ${pageFrom}–${windowEnd}; not indexed`,
          );
          return {
            lastScannedBlock,
            errors,
            ok: false,
            unavailable: true,
            logsFound,
            retries: 0,
          };
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
        errors.push(
          `SQD made no progress for blocks ${cursor}–${windowEnd}; not indexed`,
        );
        return {
          lastScannedBlock,
          errors,
          ok: false,
          unavailable: true,
          logsFound,
          retries: 0,
        };
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

      totalLogs += logsFound;
      lastScannedBlock = advancedTo;
      cursor = advancedTo + 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`SQD blocks ${cursor}–${windowEnd}: ${msg}`);
      return {
        lastScannedBlock,
        errors,
        ok: false,
        unavailable: true,
        logsFound: totalLogs,
        retries: 0,
      };
    }
  }

  return {
    lastScannedBlock,
    errors,
    ok: true,
    unavailable: false,
    logsFound: totalLogs,
    retries: 0,
  };
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
}): Promise<ScanStats> {
  const errors: string[] = [];
  const stats = { retries: 0 };
  let logsFound = 0;
  const toAddresses = [DEPOSIT_WALLET, WITHDRAW_WALLET, RESERVE_FUND_WALLET].filter(
    (a) => isAddress(a),
  );
  const fromAddresses = [
    DEPOSIT_WALLET,
    WITHDRAW_WALLET,
    RESERVE_FUND_WALLET,
  ].filter((a) => isAddress(a));

  let cursor = Math.max(0, options.startBlock);
  const endBlock = Math.max(cursor, options.endBlock);
  let preferredChunk = Math.min(LOG_SCAN_CHUNK_SIZE, 9_999);
  let lastScannedBlock = Math.max(0, cursor - 1);
  let cursorRetries = 0;

  const timestampCache = new Map<number, number>();
  const receiptCache = new Map<string, number | null>();

  while (cursor <= endBlock) {
    try {
      const { logs, scannedTo, usedChunk } = await fetchTransferLogsAdaptive({
        contractAddress: options.tokenContract,
        toAddresses,
        fromAddresses,
        fromBlock: cursor,
        toBlock: endBlock,
        preferredChunk,
        stats,
      });

      if (usedChunk < preferredChunk) {
        preferredChunk = usedChunk;
      } else if (preferredChunk < 2_000) {
        preferredChunk = Math.min(2_000, preferredChunk * 2);
      }
      cursorRetries = 0;
      logsFound += logs.length;

      const transfers: ValidatedTransfer[] = [];
      let chunkFailed = false;
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
          transfers.push(...validated);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`log ${log.transactionHash}:${log.index}: ${msg}`);
          chunkFailed = true;
          break;
        }
      }

      if (chunkFailed) {
        console.warn(
          `[logs] Chunk ${cursor}–${scannedTo} not checkpointed after log enrichment failure`,
        );
        break;
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
      console.warn(`[logs] RPC scan stopped at block ${cursor}: ${msg.slice(0, 200)}`);

      // Never skip the failed block. Retry transient errors, then stop so
      // the checkpoint stays on the last successfully scanned block.
      if (isRetryableRpcError(err) && cursorRetries < MAX_CURSOR_RETRIES) {
        cursorRetries += 1;
        stats.retries += 1;
        if (isRangeTooLargeError(err) && preferredChunk > MIN_CHUNK_SIZE) {
          preferredChunk = Math.max(
            MIN_CHUNK_SIZE,
            Math.floor(preferredChunk / 2),
          );
        }
        const wait = extractRetryAfterMs(err) ?? Math.min(1000 * 2 ** cursorRetries, 20_000);
        await sleep(wait);
        continue;
      }

      break;
    }
  }

  return { lastScannedBlock, errors, logsFound, retries: stats.retries };
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
  /** Incremental / near-head scans must use BSC RPC, not an external indexer. */
  forceRpc?: boolean;
  onProgress?: (progress: ScanProgress) => void;
  onChunkComplete?: (chunk: ScanChunkComplete) => Promise<void>;
}): Promise<ScanStats> {
  const tokenContract = USDT_CONTRACT_ADDRESS;
  if (!tokenContract) {
    return {
      lastScannedBlock: Math.max(0, options.startBlock - 1),
      errors: ["USDT_CONTRACT_ADDRESS is not configured."],
      logsFound: 0,
      retries: 0,
    };
  }

  const chainId = await getChainId();
  if (chainId !== CHAIN_ID) {
    return {
      lastScannedBlock: Math.max(0, options.startBlock - 1),
      errors: [`Unexpected chain ID ${chainId}; expected ${CHAIN_ID}`],
      logsFound: 0,
      retries: 0,
    };
  }

  if (options.startBlock > options.endBlock) {
    return {
      lastScannedBlock: options.endBlock,
      errors: [],
      logsFound: 0,
      retries: 0,
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

  const source = (process.env.LOG_SCAN_SOURCE || "auto").toLowerCase();
  const preferRpc = options.forceRpc || source === "rpc";
  const preferSqd = source === "sqd" && !options.forceRpc;

  if (!preferRpc) {
    console.log("[logs] Historical scan trying SQD Portal before BSC RPC");
    const sqd = await scanViaSqd(shared);
    const sqdDone =
      sqd.ok &&
      !sqd.unavailable &&
      sqd.errors.length === 0 &&
      sqd.lastScannedBlock >= options.endBlock;
    if (sqdDone) {
      return {
        lastScannedBlock: sqd.lastScannedBlock,
        errors: sqd.errors,
        logsFound: sqd.logsFound,
        retries: sqd.retries,
      };
    }

    if (preferSqd) {
      // Forced SQD must not pretend a 204/empty page finished the range.
      return {
        lastScannedBlock: sqd.lastScannedBlock,
        errors: sqd.errors.length
          ? sqd.errors
          : ["SQD did not confirm the requested block range."],
        logsFound: sqd.logsFound,
        retries: sqd.retries,
      };
    }

    const resume = Math.max(shared.startBlock, sqd.lastScannedBlock + 1);
    console.warn(
      "[logs] External indexer did not confirm the range (empty/204/unavailable). Falling back to BSC RPC eth_getLogs from",
      resume,
    );
    if (resume > options.endBlock) {
      return {
        lastScannedBlock: sqd.lastScannedBlock,
        errors: sqd.errors,
        logsFound: sqd.logsFound,
        retries: sqd.retries,
      };
    }
    const rpc = await scanViaRpc({ ...shared, startBlock: resume });
    const rpcDone =
      rpc.errors.length === 0 && rpc.lastScannedBlock >= options.endBlock;
    return {
      lastScannedBlock: Math.max(sqd.lastScannedBlock, rpc.lastScannedBlock),
      errors: rpcDone ? rpc.errors : [...sqd.errors, ...rpc.errors],
      logsFound: sqd.logsFound + rpc.logsFound,
      retries: sqd.retries + rpc.retries,
    };
  }

  console.log("[logs] Scanning via BSC RPC eth_getLogs");
  return scanViaRpc(shared);
}
