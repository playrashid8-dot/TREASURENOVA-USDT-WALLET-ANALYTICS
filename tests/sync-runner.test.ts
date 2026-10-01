import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || "test-secret-not-a-real-key";
process.env.NEXT_PUBLIC_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "56";

const syncState = {
  last_indexed_block: 1_000,
  status: "idle",
  updated_at: new Date().toISOString(),
  last_error: null as string | null,
  last_successful_sync: null as string | null,
};
const transactions = new Map<string, Record<string, unknown>>();
let scanMode: "ok" | "fail" = "ok";

vi.mock("@/lib/blockchain/rpc", () => ({
  checkRpcHealth: vi.fn(async () => ({
    rpcConnected: true,
    chainId: 56,
    latestBlock: 1_010,
  })),
  getLatestBlockNumber: vi.fn(async () => 1_010),
}));

vi.mock("@/lib/blockchain/token", () => ({
  getTokenInfo: vi.fn(async () => ({
    address: "0x55d398326f99059ff775485246999027b3197955",
    name: "Tether USD",
    symbol: "USDT",
    decimals: 18,
  })),
}));

vi.mock("@/lib/analytics/aggregation", () => ({
  reconcileDailyStats: vi.fn(async () => undefined),
}));

vi.mock("@/lib/blockchain/logs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/blockchain/logs")>(
    "@/lib/blockchain/logs",
  );
  return {
    ...actual,
    scanUsdtTransfersToWallets: vi.fn(
      async (options: {
        startBlock: number;
        endBlock: number;
        onChunkComplete?: (chunk: {
          toBlock: number;
          transfers: unknown[];
        }) => Promise<void>;
      }) => {
        if (scanMode === "fail") {
          return {
            lastScannedBlock: Math.max(0, options.startBlock - 1),
            errors: ["RPC timeout"],
            logsFound: 0,
            retries: 3,
          };
        }
        const { DEPOSIT_WALLET, USDT_CONTRACT_ADDRESS } = await import(
          "@/lib/config"
        );
        const transfer = {
          txHash:
            "0xabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabca",
          logIndex: 4,
          walletAddress: DEPOSIT_WALLET.toLowerCase(),
          walletType: "deposit",
          tokenContract: USDT_CONTRACT_ADDRESS.toLowerCase(),
          fromAddress: "0x2222222222222222222222222222222222222222",
          toAddress: DEPOSIT_WALLET.toLowerCase(),
          amountRaw: (5_000n * 10n ** 18n).toString(),
          amountUsdt: 5000,
          blockNumber: 1_008,
          blockHash: null,
          timestamp: "2026-10-01T00:00:00.000Z",
          status: "success",
          tokenSymbol: "USDT",
          tokenDecimals: 18,
        };
        if (options.onChunkComplete) {
          await options.onChunkComplete({
            toBlock: options.endBlock,
            transfers: [transfer],
          });
        }
        return {
          lastScannedBlock: options.endBlock,
          errors: [],
          logsFound: 1,
          retries: 0,
        };
      },
    ),
  };
});

function client() {
  return {
    rpc: async () => ({
      data: null,
      error: { message: "Could not find the function acquire_sync_lease" },
    }),
    from(table: string) {
      let op = "select";
      let payload: unknown;
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const method of [
        "select",
        "eq",
        "or",
        "in",
        "limit",
        "order",
        "maybeSingle",
      ]) {
        chain[method] = self;
      }
      chain.insert = (body: unknown) => {
        op = "insert";
        payload = body;
        return chain;
      };
      chain.update = (body: unknown) => {
        op = "update";
        payload = body;
        return chain;
      };
      chain.upsert = (body: unknown) => {
        op = "upsert";
        payload = body;
        return chain;
      };
      chain.then = (resolve: (value: unknown) => unknown) => {
        if (table === "sync_state" && op === "select") {
          return resolve({ data: { ...syncState }, error: null });
        }
        if (table === "sync_state" && (op === "update" || op === "upsert" || op === "insert")) {
          const patch = (payload ?? {}) as Record<string, unknown>;
          if (typeof patch.last_indexed_block === "number") {
            syncState.last_indexed_block = patch.last_indexed_block;
          }
          if (typeof patch.status === "string") syncState.status = patch.status;
          if (typeof patch.last_error === "string" || patch.last_error === null) {
            syncState.last_error = patch.last_error as string | null;
          }
          if (typeof patch.last_successful_sync === "string") {
            syncState.last_successful_sync = patch.last_successful_sync;
          }
          syncState.updated_at = new Date().toISOString();
          return resolve({ data: [{ ...syncState }], error: null });
        }
        if (table === "transactions" && op === "select") {
          return resolve({ data: [...transactions.values()], error: null });
        }
        if (table === "transactions" && op === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          for (const row of rows) {
            const r = row as {
              tx_hash: string;
              log_index: number;
              wallet_address: string;
            };
            transactions.set(
              `${r.tx_hash}:${r.log_index}:${r.wallet_address}`,
              r as Record<string, unknown>,
            );
          }
          return resolve({ data: rows, error: null });
        }
        return resolve({ data: null, error: null });
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => client(),
}));

describe("runSync incremental", () => {
  beforeEach(() => {
    scanMode = "ok";
    syncState.last_indexed_block = 1_000;
    syncState.status = "idle";
    syncState.last_error = null;
    syncState.last_successful_sync = null;
    transactions.clear();
  });

  it("indexes a new USDT transfer and advances only to the scanned head", async () => {
    const { runSync } = await import("@/lib/blockchain/sync");
    const result = await runSync({ mode: "incremental", maxBlocksPerRun: 300 });
    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(1);
    expect(result.lastIndexedBlock).toBe(1_010);
    expect(transactions.size).toBe(1);
    const row = [...transactions.values()][0] as { amount_usdt: number };
    expect(row.amount_usdt).toBe(5000);
  });

  it("does not insert a duplicate when sync runs twice", async () => {
    const { runSync } = await import("@/lib/blockchain/sync");
    const first = await runSync({ mode: "incremental", maxBlocksPerRun: 300 });
    syncState.last_indexed_block = 1_000;
    const second = await runSync({ mode: "incremental", maxBlocksPerRun: 300 });
    expect(first.inserted).toBe(1);
    expect(second.duplicatesSkipped).toBeGreaterThanOrEqual(1);
    expect(second.inserted).toBe(0);
    expect(transactions.size).toBe(1);
  });

  it("does not advance the checkpoint when RPC scanning fails", async () => {
    scanMode = "fail";
    const { runSync } = await import("@/lib/blockchain/sync");
    const result = await runSync({ mode: "incremental", maxBlocksPerRun: 300 });
    expect(result.ok).toBe(false);
    expect(result.lastIndexedBlock).toBe(1_000);
    expect(syncState.last_indexed_block).toBe(1_000);
    expect(transactions.size).toBe(0);
  });
});
