export type WalletType = "deposit" | "withdraw";

export type TransactionStatus = "success" | "failed";

export type SyncStatusValue = "idle" | "syncing" | "synced" | "error";

export type ConnectionStatus = "CONNECTED" | "DEGRADED" | "OFFLINE" | "ERROR";

export type IndexerStatus = "SYNCED" | "SYNCING" | "ERROR" | "IDLE";

export interface MonitoredWallet {
  address: string;
  walletType: WalletType;
  label: string;
}

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface ValidatedTransfer {
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
  status: TransactionStatus;
  tokenSymbol: string;
  tokenDecimals: number;
}

export interface EtherscanTokenTransfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  contractAddress: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;
  /** Present on some Etherscan V2 responses */
  logIndex?: string;
}

export interface BlockchainHealth {
  rpcConnected: boolean;
  chainId: number | null;
  latestBlock: number | null;
  error?: string;
}
