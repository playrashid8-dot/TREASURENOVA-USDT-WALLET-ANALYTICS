import { getAddress, isAddress } from "ethers";
import type { WalletType } from "@/types/blockchain";

/**
 * Central application configuration.
 * Wallet addresses and token contract come from environment variables only.
 */

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    return "";
  }
  return value.trim();
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseNonNegativeNumber(
  value: string | undefined,
  fallback: number,
): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const APP_NAME =
  requireEnv("NEXT_PUBLIC_APP_NAME", "TreasureNOVA USDT Wallet Analytics") ||
  "TreasureNOVA USDT Wallet Analytics";

export const CHAIN_ID = parsePositiveInt(process.env.NEXT_PUBLIC_CHAIN_ID, 56);

/** Prefer an archive-capable BSC RPC for historical eth_getLogs (dataseeds often lack getLogs/archive). */
export const BSC_RPC_URL =
  requireEnv("BSC_RPC_URL", "https://rpc-bsc.blockmachine.io") ||
  "https://rpc-bsc.blockmachine.io";

export const EXPLORER_URL =
  requireEnv("NEXT_PUBLIC_EXPLORER_URL", "https://bscscan.com") ||
  "https://bscscan.com";

export const USDT_CONTRACT_ADDRESS = requireEnv("USDT_CONTRACT_ADDRESS");

export const DEPOSIT_WALLET = requireEnv(
  "DEPOSIT_WALLET",
  "0xc051a1b111085ddD6Bc2FF8346Ad0f4E7dF26935",
);

export const WITHDRAW_WALLET = requireEnv(
  "WITHDRAW_WALLET",
  "0x48A909049FB00581CA83beA39BB824eBb90132FA",
);

/** Read-only USDT reserve fund wallet (display balance only — not indexed). */
export const RESERVE_FUND_WALLET = requireEnv(
  "RESERVE_FUND_WALLET",
  "0xe1ce23017882f3630e2B5dC4f2Fb3f33947E5904",
);

export const ETHERSCAN_API_KEY = requireEnv("ETHERSCAN_API_KEY");

export const SYNC_INTERVAL_SECONDS = parsePositiveInt(
  process.env.SYNC_INTERVAL_SECONDS,
  20,
);

export const HISTORICAL_BATCH_SIZE = parsePositiveInt(
  process.env.HISTORICAL_BATCH_SIZE,
  1000,
);

/**
 * First-time eth_getLogs lower bound (BEP-20 USDT deployment-era on BSC).
 * Incremental runs resume from sync_state.last_indexed_block instead.
 */
export const SYNC_START_BLOCK = parsePositiveInt(
  process.env.SYNC_START_BLOCK,
  6_982_962,
);

/** Preferred eth_getLogs block-range size (adapts down/up on RPC limits). Inclusive span. */
export const LOG_SCAN_CHUNK_SIZE = parsePositiveInt(
  process.env.LOG_SCAN_CHUNK_SIZE,
  9_999,
);

/**
 * Display-only floor for optional transaction list tooling (e.g. sync verification).
 * Does not delete or alter indexed rows; daily stats/totals stay unfiltered.
 */
export const MIN_DISPLAY_USDT_AMOUNT = parseNonNegativeNumber(
  process.env.MIN_DISPLAY_USDT_AMOUNT,
  50,
);

/**
 * Floor for the Recent Large Transactions dashboard section.
 * Display-only — does not alter indexed rows or daily stats.
 */
export const LARGE_TX_MIN_USDT = parseNonNegativeNumber(
  process.env.LARGE_TX_MIN_USDT,
  10_000,
);

/** Number of latest completed UTC days shown in Recent Large Transactions. */
export const LARGE_TX_COMPLETED_DAYS = parsePositiveInt(
  process.env.LARGE_TX_COMPLETED_DAYS,
  5,
);

export const SYNC_SECRET = requireEnv("SYNC_SECRET");

export const SYNC_KEY = "usdt_wallet_transfers";

/** ERC-20 Transfer(address,address,uint256) topic */
export const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const MONITORED_WALLETS = {
  deposit: DEPOSIT_WALLET,
  withdraw: WITHDRAW_WALLET,
} as const;

export function getMonitoredWalletList(): Array<{
  address: string;
  walletType: WalletType;
  label: string;
}> {
  return [
    {
      address: DEPOSIT_WALLET,
      walletType: "deposit",
      label: "Deposit Wallet",
    },
    {
      address: WITHDRAW_WALLET,
      walletType: "withdraw",
      label: "Withdraw Wallet",
    },
  ];
}

export function getConfigErrors(): string[] {
  const errors: string[] = [];

  if (!USDT_CONTRACT_ADDRESS) {
    errors.push(
      "USDT_CONTRACT_ADDRESS is not configured. Set it in .env.local and run npm run verify:token.",
    );
  } else if (!isAddress(USDT_CONTRACT_ADDRESS)) {
    errors.push("USDT_CONTRACT_ADDRESS is not a valid Ethereum address.");
  }

  if (!DEPOSIT_WALLET || !isAddress(DEPOSIT_WALLET)) {
    errors.push("DEPOSIT_WALLET is missing or invalid.");
  }

  if (!WITHDRAW_WALLET || !isAddress(WITHDRAW_WALLET)) {
    errors.push("WITHDRAW_WALLET is missing or invalid.");
  }

  if (
    DEPOSIT_WALLET &&
    WITHDRAW_WALLET &&
    isAddress(DEPOSIT_WALLET) &&
    isAddress(WITHDRAW_WALLET) &&
    DEPOSIT_WALLET.toLowerCase() === WITHDRAW_WALLET.toLowerCase()
  ) {
    errors.push("DEPOSIT_WALLET and WITHDRAW_WALLET must be different addresses.");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }

  if (!process.env.SUPABASE_SECRET_KEY) {
    errors.push("SUPABASE_SECRET_KEY is not configured.");
  }

  // ETHERSCAN_API_KEY is optional — historical sync uses BSC RPC eth_getLogs.

  return errors;
}

export function getPrimaryConfigError(): string | null {
  const errors = getConfigErrors();
  return errors.length > 0 ? errors[0] : null;
}

export function checksumAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER_URL}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

export function explorerTokenUrl(address: string): string {
  return `${EXPLORER_URL}/token/${address}`;
}
