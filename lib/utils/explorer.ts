const EXPLORER =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://bscscan.com";

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER}/address/${address}`;
}

export function explorerTokenUrl(address: string): string {
  return `${EXPLORER}/token/${address}`;
}
