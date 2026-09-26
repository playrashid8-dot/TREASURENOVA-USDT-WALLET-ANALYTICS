import {
  DEPOSIT_WALLET,
  WITHDRAW_WALLET,
  getPrimaryConfigError,
  explorerAddressUrl,
} from "@/lib/config";
import { getWalletBalances } from "@/lib/blockchain/balance";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/utils/addresses";
import {
  enforceRateLimit,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";
import type { WalletCardData } from "@/types/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "wallets", 30, 60_000);
  if (!limited.ok) return limited.response;

  const configError = getPrimaryConfigError();

  const base: WalletCardData[] = [
    {
      address: DEPOSIT_WALLET,
      walletType: "deposit",
      label: "Deposit Wallet",
      balance: null,
      totalIncoming: 0,
      transactionCount: 0,
    },
    {
      address: WITHDRAW_WALLET,
      walletType: "withdraw",
      label: "Withdraw Wallet",
      balance: null,
      totalIncoming: 0,
      transactionCount: 0,
    },
  ];

  if (!configError) {
    try {
      const balances = await getWalletBalances([
        DEPOSIT_WALLET,
        WITHDRAW_WALLET,
      ]);
      for (const w of base) {
        const bal = balances.get(normalizeAddress(w.address));
        if (bal && "balance" in bal) {
          w.balance = bal.balance;
        } else if (bal && "error" in bal) {
          w.balanceError = bal.error;
        }
      }
    } catch {
      for (const w of base) {
        w.balanceError = "Live balance temporarily unavailable.";
      }
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdmin();
      for (const w of base) {
        const { data, error } = await supabase
          .from("transactions")
          .select("amount_usdt")
          .eq("wallet_address", normalizeAddress(w.address))
          .eq("wallet_type", w.walletType)
          .eq("status", "success");

        if (!error && data) {
          w.transactionCount = data.length;
          w.totalIncoming = data.reduce(
            (sum, row) => sum + (Number(row.amount_usdt) || 0),
            0,
          );
        }
      }
    } catch (err) {
      console.error("[api/wallets] stats", err);
    }
  }

  return withRateLimitHeaders(
    jsonOk({
      wallets: base.map((w) => ({
        ...w,
        explorerUrl: explorerAddressUrl(w.address),
      })),
      configError,
    }),
    limited.result,
  );
}
