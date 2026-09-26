import { isAddress } from "ethers";
import {
  CHAIN_ID,
  DEPOSIT_WALLET,
  USDT_CONTRACT_ADDRESS,
  WITHDRAW_WALLET,
} from "@/lib/config";
import type {
  EtherscanTokenTransfer,
  ValidatedTransfer,
  WalletType,
} from "@/types/blockchain";
import { addressesEqual, normalizeAddress } from "@/lib/utils/addresses";
import { blockTimestampToIso } from "@/lib/utils/dates";
import { rawToUsdt } from "@/lib/utils/format";

export function classifyTransfer(
  toAddress: string,
): WalletType | null {
  if (addressesEqual(toAddress, DEPOSIT_WALLET)) {
    return "deposit";
  }
  if (addressesEqual(toAddress, WITHDRAW_WALLET)) {
    return "withdraw";
  }
  return null;
}

/**
 * Business rule:
 * - Deposit = USDT transfer TO deposit wallet
 * - Withdrawal = USDT transfer TO withdraw wallet
 */
export function validateTokenTransfer(
  tx: EtherscanTokenTransfer,
  expectedDecimals?: number,
  expectedSymbol?: string,
): ValidatedTransfer | null {
  if (!USDT_CONTRACT_ADDRESS) {
    return null;
  }

  const tokenContract = normalizeAddress(tx.contractAddress);
  if (tokenContract !== normalizeAddress(USDT_CONTRACT_ADDRESS)) {
    return null;
  }

  if (!tx.hash || !/^0x[a-fA-F0-9]{64}$/.test(tx.hash)) {
    return null;
  }

  if (!isAddress(tx.from) || !isAddress(tx.to)) {
    return null;
  }

  const walletType = classifyTransfer(tx.to);
  if (!walletType) {
    return null;
  }

  const blockNumber = Number.parseInt(tx.blockNumber, 10);
  if (!Number.isFinite(blockNumber) || blockNumber <= 0) {
    return null;
  }

  const decimals = Number.parseInt(tx.tokenDecimal, 10);
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
    return null;
  }

  if (
    expectedDecimals !== undefined &&
    decimals !== expectedDecimals
  ) {
    return null;
  }

  if (
    expectedSymbol &&
    tx.tokenSymbol &&
    tx.tokenSymbol.toUpperCase() !== expectedSymbol.toUpperCase()
  ) {
    // Soft check — some tokens report slightly different symbols; still require non-empty
    console.warn(
      `[validation] Token symbol mismatch: got ${tx.tokenSymbol}, expected ${expectedSymbol}`,
    );
  }

  const amountRaw = tx.value;
  if (!amountRaw || !/^\d+$/.test(amountRaw)) {
    return null;
  }

  // Skip zero-value transfers
  if (BigInt(amountRaw) <= 0n) {
    return null;
  }

  const amountUsdt = rawToUsdt(amountRaw, decimals);
  if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
    return null;
  }

  let timestamp: string;
  try {
    timestamp = blockTimestampToIso(tx.timeStamp);
  } catch {
    return null;
  }

  const logIndex = tx.logIndex
    ? Number.parseInt(tx.logIndex, 10)
    : deriveStableLogIndex(tx);

  if (!Number.isFinite(logIndex) || logIndex < 0) {
    return null;
  }

  const walletAddress =
    walletType === "deposit"
      ? normalizeAddress(DEPOSIT_WALLET)
      : normalizeAddress(WITHDRAW_WALLET);

  return {
    txHash: tx.hash.toLowerCase(),
    logIndex,
    walletAddress,
    walletType,
    tokenContract,
    fromAddress: normalizeAddress(tx.from),
    toAddress: normalizeAddress(tx.to),
    amountRaw,
    amountUsdt,
    blockNumber,
    blockHash: tx.blockHash || null,
    timestamp,
    status: "success",
    tokenSymbol: tx.tokenSymbol || "USDT",
    tokenDecimals: decimals,
  };
}

/**
 * Etherscan tokentx may omit logIndex. Derive a stable unique index within
 * the tx+wallet space from available fields so upserts remain idempotent.
 */
function deriveStableLogIndex(tx: EtherscanTokenTransfer): number {
  const parts = [
    tx.transactionIndex || "0",
    tx.from.toLowerCase(),
    tx.to.toLowerCase(),
    tx.value,
  ].join("|");
  let hash = 0;
  for (let i = 0; i < parts.length; i++) {
    hash = (hash * 31 + parts.charCodeAt(i)) >>> 0;
  }
  return hash % 1_000_000;
}

export function validateChainId(chainId: number): boolean {
  return chainId === CHAIN_ID;
}

export function assertPositiveAmount(raw: string): boolean {
  try {
    return BigInt(raw) > 0n;
  } catch {
    return false;
  }
}
