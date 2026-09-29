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

/** Indexed USDT transfer row for Recent Large Transactions. */
export interface TransactionRow {
  id: string;
  txHash: string;
  logIndex: number;
  walletAddress: string;
  walletType: WalletCardType;
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

export interface LargeTxWalletSection {
  walletType: WalletCardType;
  label: string;
  address: string;
  transactionCount: number;
  totalUsdt: number;
  transactions: TransactionRow[];
}

export interface LargeTransactionsResponse {
  wallets: LargeTxWalletSection[];
  minAmountUsdt: number;
  completedDays: number;
  dateKeys: string[];
  dateRange: { from: string; to: string };
  lastUpdated: string | null;
  configError?: string | null;
}

/** Combined latest-N USDT transfers across all monitored wallets. */
export interface RecentTransactionsResponse {
  transactions: TransactionRow[];
  limit: number;
  lastUpdated: string | null;
  /** LIVE | SYNCING | STALE | ERROR — derived from indexer/RPC health */
  liveStatus: "LIVE" | "SYNCING" | "STALE" | "ERROR";
  latestBlock: number | null;
  indexedBlock: number | null;
  blockLag: number | null;
  configError?: string | null;
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
