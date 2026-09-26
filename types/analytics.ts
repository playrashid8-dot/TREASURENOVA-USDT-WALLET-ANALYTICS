import type { WalletType } from "./blockchain";

export type DateRangePreset =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "all"
  | "custom";

export interface DateRange {
  from: string | null;
  to: string | null;
  preset: DateRangePreset;
}

export interface KpiSummary {
  totalDeposits: number;
  totalWithdrawals: number;
  netCashFlow: number;
  depositBalance: number | null;
  withdrawBalance: number | null;
  transactionCount: number;
  lastUpdated: string | null;
  syncStatus: string;
  dateRange: DateRange;
  balanceError?: string | null;
  configError?: string | null;
}

export interface DailyStatRow {
  date: string;
  depositAmount: number;
  withdrawalAmount: number;
  netCashFlow: number;
  depositCount: number;
  withdrawalCount: number;
}

export interface TransactionRow {
  id: string;
  txHash: string;
  logIndex: number;
  walletAddress: string;
  walletType: WalletType;
  tokenContract: string;
  fromAddress: string;
  toAddress: string;
  amountRaw: string;
  amountUsdt: number;
  blockNumber: number;
  blockHash: string | null;
  timestamp: string;
  status: string;
  tokenSymbol: string;
  tokenDecimals: number;
}

export interface WalletCardData {
  address: string;
  walletType: WalletType;
  label: string;
  balance: number | null;
  totalIncoming: number;
  transactionCount: number;
  balanceError?: string | null;
}

export interface SyncStatusResponse {
  blockchain: "CONNECTED" | "DEGRADED" | "OFFLINE";
  indexer: "SYNCED" | "SYNCING" | "ERROR" | "IDLE";
  database: "CONNECTED" | "ERROR";
  latestBlock: number | null;
  indexedBlock: number | null;
  syncPercentage: number | null;
  lastSuccessfulSync: string | null;
  lastError: string | null;
  status: string;
  isHistoricalSyncing: boolean;
  configError?: string | null;
}

export interface PaginatedTransactions {
  data: TransactionRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
