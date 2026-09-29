import { isAddress } from "ethers";
import {
  CHAIN_ID,
  DEPOSIT_WALLET,
  RESERVE_FUND_WALLET,
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

export interface IndexedTransferRole {
  walletType: WalletType;
  walletAddress: string;
}

/**
 * Classify by recipient (Transfer `to`) only — used for Daily Analytics.
 * Deposit Wallet OUT and Withdraw Wallet OUT are never deposits or withdrawals
 * in daily totals.
 */
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
 * Roles to index for a USDT Transfer.
 *
 * All three wallets are monitored independently for IN and OUT:
 * - to == wallet  → IN role
 * - from == wallet (and to != wallet) → OUT role
 *
 * Self-transfers (from == to == same wallet) produce no roles.
 *
 * Daily analytics still counts only Deposit/Withdraw IN (to == wallet);
 * OUT rows are stored for Recent TX History but ignored by aggregation.
 */
export function classifyIndexedTransferRoles(
  fromAddress: string,
  toAddress: string,
): IndexedTransferRole[] {
  const roles: IndexedTransferRole[] = [];
  const deposit = normalizeAddress(DEPOSIT_WALLET);
  const withdraw = normalizeAddress(WITHDRAW_WALLET);
  const reserve = normalizeAddress(RESERVE_FUND_WALLET);

  const pushRole = (walletType: WalletType, walletAddress: string) => {
    if (!roles.some((r) => r.walletType === walletType)) {
      roles.push({ walletType, walletAddress });
    }
  };

  // Deposit IN / OUT (exclude self-transfers)
  if (
    addressesEqual(toAddress, DEPOSIT_WALLET) &&
    !addressesEqual(fromAddress, DEPOSIT_WALLET)
  ) {
    pushRole("deposit", deposit);
  } else if (
    addressesEqual(fromAddress, DEPOSIT_WALLET) &&
    !addressesEqual(toAddress, DEPOSIT_WALLET)
  ) {
    pushRole("deposit", deposit);
  }

  // Withdraw IN / OUT (exclude self-transfers)
  if (
    addressesEqual(toAddress, WITHDRAW_WALLET) &&
    !addressesEqual(fromAddress, WITHDRAW_WALLET)
  ) {
    pushRole("withdraw", withdraw);
  } else if (
    addressesEqual(fromAddress, WITHDRAW_WALLET) &&
    !addressesEqual(toAddress, WITHDRAW_WALLET)
  ) {
    pushRole("withdraw", withdraw);
  }

  // Reserve IN / OUT (exclude self-transfers)
  if (reserve) {
    if (
      addressesEqual(toAddress, RESERVE_FUND_WALLET) &&
      !addressesEqual(fromAddress, RESERVE_FUND_WALLET)
    ) {
      pushRole("reserve", reserve);
    } else if (
      addressesEqual(fromAddress, RESERVE_FUND_WALLET) &&
      !addressesEqual(toAddress, RESERVE_FUND_WALLET)
    ) {
      pushRole("reserve", reserve);
    }
  }

  return roles;
}

/**
 * Business rules for analytics validation (IN only):
 * - Deposit = USDT Transfer where to == Deposit Wallet
 * - Withdrawal = USDT Transfer where to == Withdraw Wallet
 * - Deposit/Withdraw Wallet OUT are never counted in daily analytics
 *
 * For full indexing (including Withdraw OUT),
 * use validateTokenTransfers / classifyIndexedTransferRoles.
 */
export function validateTokenTransfer(
  tx: EtherscanTokenTransfer,
  expectedDecimals?: number,
  expectedSymbol?: string,
): ValidatedTransfer | null {
  const transfers = validateTokenTransfers(tx, expectedDecimals, expectedSymbol);
  // Prefer analytics IN role when multiple roles exist for one log
  const inbound = transfers.find((t) =>
    addressesEqual(t.toAddress, t.walletAddress),
  );
  return inbound ?? transfers[0] ?? null;
}

/** Validate and expand a Transfer into all indexable wallet roles. */
export function validateTokenTransfers(
  tx: EtherscanTokenTransfer,
  expectedDecimals?: number,
  expectedSymbol?: string,
): ValidatedTransfer[] {
  if (!USDT_CONTRACT_ADDRESS) {
    return [];
  }

  const tokenContract = normalizeAddress(tx.contractAddress);
  if (tokenContract !== normalizeAddress(USDT_CONTRACT_ADDRESS)) {
    return [];
  }

  if (!tx.hash || !/^0x[a-fA-F0-9]{64}$/.test(tx.hash)) {
    return [];
  }

  if (!isAddress(tx.from) || !isAddress(tx.to)) {
    return [];
  }

  const roles = classifyIndexedTransferRoles(tx.from, tx.to);
  if (roles.length === 0) {
    return [];
  }

  const blockNumber = Number.parseInt(tx.blockNumber, 10);
  if (!Number.isFinite(blockNumber) || blockNumber <= 0) {
    return [];
  }

  const decimals = Number.parseInt(tx.tokenDecimal, 10);
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
    return [];
  }

  if (
    expectedDecimals !== undefined &&
    decimals !== expectedDecimals
  ) {
    return [];
  }

  if (
    expectedSymbol &&
    tx.tokenSymbol &&
    tx.tokenSymbol.toUpperCase() !== expectedSymbol.toUpperCase()
  ) {
    console.warn(
      `[validation] Token symbol mismatch: got ${tx.tokenSymbol}, expected ${expectedSymbol}`,
    );
  }

  const amountRaw = tx.value;
  if (!amountRaw || !/^\d+$/.test(amountRaw)) {
    return [];
  }

  if (BigInt(amountRaw) <= 0n) {
    return [];
  }

  const amountUsdt = rawToUsdt(amountRaw, decimals);
  if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
    return [];
  }

  let timestamp: string;
  try {
    timestamp = blockTimestampToIso(tx.timeStamp);
  } catch {
    return [];
  }

  const logIndex = tx.logIndex
    ? Number.parseInt(tx.logIndex, 10)
    : deriveStableLogIndex(tx);

  if (!Number.isFinite(logIndex) || logIndex < 0) {
    return [];
  }

  const fromAddress = normalizeAddress(tx.from);
  const toAddress = normalizeAddress(tx.to);

  return roles.map((role) => ({
    txHash: tx.hash.toLowerCase(),
    logIndex,
    walletAddress: role.walletAddress,
    walletType: role.walletType,
    tokenContract,
    fromAddress,
    toAddress,
    amountRaw,
    amountUsdt,
    blockNumber,
    blockHash: tx.blockHash || null,
    timestamp,
    status: "success" as const,
    tokenSymbol: tx.tokenSymbol || "USDT",
    tokenDecimals: decimals,
  }));
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
