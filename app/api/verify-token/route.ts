import { getPrimaryConfigError, USDT_CONTRACT_ADDRESS } from "@/lib/config";
import { verifyTokenContract } from "@/lib/blockchain/token";
import { checkRpcHealth } from "@/lib/blockchain/rpc";
import {
  enforceRateLimit,
  jsonOk,
  withRateLimitHeaders,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * Setup/verification endpoint — checks configured token contract before sync.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "verify-token", 20, 60_000);
  if (!limited.ok) return limited.response;

  const configError = getPrimaryConfigError();
  const health = await checkRpcHealth();

  if (!USDT_CONTRACT_ADDRESS) {
    return withRateLimitHeaders(
      jsonOk({
        ok: false,
        error:
          "USDT_CONTRACT_ADDRESS is not configured. Set it in environment variables.",
        rpc: health,
        configError,
      }),
      limited.result,
    );
  }

  const verification = await verifyTokenContract(USDT_CONTRACT_ADDRESS);

  return withRateLimitHeaders(
    jsonOk({
      ok: verification.ok,
      token: verification.token ?? null,
      chainId: verification.chainId ?? health.chainId,
      error: verification.error ?? null,
      rpc: health,
      configError,
      message: verification.ok
        ? "Token contract verified on BNB Smart Chain."
        : verification.error ||
          "Configured USDT contract could not be verified on BNB Smart Chain.",
    }),
    limited.result,
  );
}
