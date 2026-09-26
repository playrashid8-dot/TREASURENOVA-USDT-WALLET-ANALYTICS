import { Contract, Interface } from "ethers";
import { getRpcProvider } from "./rpc";
import {
  CHAIN_ID,
  TRANSFER_EVENT_TOPIC,
  USDT_CONTRACT_ADDRESS,
} from "@/lib/config";
import type { TokenInfo } from "@/types/blockchain";
import { normalizeAddress } from "@/lib/utils/addresses";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
] as const;

export function getTokenContract(address?: string): Contract {
  const tokenAddress = address || USDT_CONTRACT_ADDRESS;
  if (!tokenAddress) {
    throw new Error("USDT_CONTRACT_ADDRESS is not configured.");
  }
  return new Contract(tokenAddress, ERC20_ABI, getRpcProvider());
}

export async function getTokenInfo(address?: string): Promise<TokenInfo> {
  const tokenAddress = address || USDT_CONTRACT_ADDRESS;
  if (!tokenAddress) {
    throw new Error(
      "Configured USDT contract could not be verified on BNB Smart Chain.",
    );
  }

  const provider = getRpcProvider();
  const code = await provider.getCode(tokenAddress);
  if (!code || code === "0x") {
    throw new Error(
      "Configured USDT contract could not be verified on BNB Smart Chain.",
    );
  }

  const contract = getTokenContract(tokenAddress);
  let name = "";
  let symbol = "";
  let decimals = 0;

  try {
    [name, symbol, decimals] = await Promise.all([
      contract.name().catch(() => ""),
      contract.symbol(),
      contract.decimals(),
    ]);
  } catch {
    throw new Error(
      "Configured USDT contract could not be verified on BNB Smart Chain.",
    );
  }

  const iface = new Interface(ERC20_ABI);
  const transferEvent = iface.getEvent("Transfer");
  if (!transferEvent) {
    throw new Error(
      "Configured USDT contract could not be verified on BNB Smart Chain.",
    );
  }

  const topic = transferEvent.topicHash.toLowerCase();
  if (topic !== TRANSFER_EVENT_TOPIC.toLowerCase()) {
    throw new Error(
      "Configured USDT contract could not be verified on BNB Smart Chain.",
    );
  }

  return {
    address: normalizeAddress(tokenAddress),
    name: name || "Unknown",
    symbol: String(symbol),
    decimals: Number(decimals),
  };
}

export async function verifyTokenContract(address?: string): Promise<{
  ok: boolean;
  token?: TokenInfo;
  chainId?: number;
  error?: string;
}> {
  try {
    const provider = getRpcProvider();
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    if (chainId !== CHAIN_ID) {
      return {
        ok: false,
        chainId,
        error: `Chain ID mismatch: got ${chainId}, expected ${CHAIN_ID}`,
      };
    }
    const token = await getTokenInfo(address);
    return { ok: true, token, chainId };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Configured USDT contract could not be verified on BNB Smart Chain.",
    };
  }
}
