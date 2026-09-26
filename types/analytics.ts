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

/** Aggregated deposit/withdrawal flow for a period or day. */
export interface DayFlowSummary {
  depositAmount: number;
  withdrawalAmount: number;
  netCashFlow: number;
  depositCount: number;
  withdrawalCount: number;
}

export interface KpiSummary {
  /** Range totals including today's live day when it falls in range. */
  totalDeposits: number;
  totalWithdrawals: number;
  netCashFlow: number;
  depositCount: number;
  withdrawalCount: number;
  transactionCount: number;
  /** Finalized UTC days only — excludes today's running totals. */
  completedDeposits: number;
  completedWithdrawals: number;
  completedNetCashFlow: number;
  completedDepositCount: number;
  completedWithdrawalCount: number;
  /** Today's UTC calendar day — live/running until the day ends. */
  liveDeposits: number;
  liveWithdrawals: number;
  liveNetCashFlow: number;
  liveDepositCount: number;
  liveWithdrawalCount: number;
  liveInRange: boolean;
  todayDate: string;
  depositBalance: number | null;
  withdrawBalance: number | null;
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
  /** True when date is the current UTC calendar day (still running). */
  isLive: boolean;
  /** True when the full UTC calendar day has ended (final record). */
  isCompleted: boolean;
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

/** Display wallets: deposit/withdraw (indexed) plus read-only reserve fund. */
export type WalletCardType = WalletType | "reserve";

export interface WalletCardData {
  address: string;
  walletType: WalletCardType;
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
