import { formatUnits } from "ethers";
import { getTokenContract, getTokenInfo } from "./token";
import { USDT_CONTRACT_ADDRESS } from "@/lib/config";
import { normalizeAddress } from "@/lib/utils/addresses";

export interface WalletBalanceResult {
  address: string;
  balanceRaw: string;
  balance: number;
  decimals: number;
  symbol: string;
  tokenContract: string;
}

export async function getTokenBalance(
  walletAddress: string,
  tokenAddress?: string,
): Promise<WalletBalanceResult> {
  const contractAddress = tokenAddress || USDT_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("USDT_CONTRACT_ADDRESS is not configured.");
  }

  const token = await getTokenInfo(contractAddress);
  const contract = getTokenContract(contractAddress);
  const raw: bigint = await contract.balanceOf(walletAddress);
  const balanceRaw = raw.toString();
  const balance = Number.parseFloat(formatUnits(raw, token.decimals));

  return {
    address: normalizeAddress(walletAddress),
    balanceRaw,
    balance,
    decimals: token.decimals,
    symbol: token.symbol,
    tokenContract: normalizeAddress(contractAddress),
  };
}

export async function getWalletBalances(
  addresses: string[],
): Promise<Map<string, WalletBalanceResult | { error: string }>> {
  const results = new Map<string, WalletBalanceResult | { error: string }>();

  await Promise.all(
    addresses.map(async (addr) => {
      try {
        const bal = await getTokenBalance(addr);
        results.set(normalizeAddress(addr), bal);
      } catch (err) {
        results.set(normalizeAddress(addr), {
          error:
            err instanceof Error
              ? err.message
              : "Live balance temporarily unavailable.",
        });
      }
    }),
  );

  return results;
}
