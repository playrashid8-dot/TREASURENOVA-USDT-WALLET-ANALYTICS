import { describe, expect, it } from "vitest";
import {
  externalPageConfirmsRange,
  planSyncWindow,
  resolveNextCheckpoint,
  FAST_INCREMENTAL_MAX_LAG,
  REQUEST_BACKFILL_BLOCKS,
} from "@/lib/blockchain/sync-plan";
import { buildValidatedTransfers, parseBeyondHeadBlock } from "@/lib/blockchain/logs";
import {
  selectLatestCombinedTransactions,
  selectRecentTxFeed,
} from "@/lib/analytics/filters";
import {
  recentTxCacheHeaders,
  recentTxRefreshStrategy,
} from "@/lib/analytics/recent-refresh";
import {
  DEPOSIT_WALLET,
  USDT_CONTRACT_ADDRESS,
  WITHDRAW_WALLET,
} from "@/lib/config";

const USDT = USDT_CONTRACT_ADDRESS;
const DEPOSIT = DEPOSIT_WALLET;
const WITHDRAW = WITHDRAW_WALLET;
const EXTERNAL = "0x2222222222222222222222222222222222222222";

function transfer(partial: {
  from: string;
  to: string;
  value: bigint;
  blockNumber: number;
  logIndex?: number;
  txHash?: string;
}) {
  return buildValidatedTransfers({
    txHash:
      partial.txHash ??
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    logIndex: partial.logIndex ?? 0,
    blockNumber: partial.blockNumber,
    blockHash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    timestampUnix: 1_780_000_000,
    from: partial.from,
    to: partial.to,
    value: partial.value,
    tokenDecimals: 18,
    tokenSymbol: "USDT",
    tokenContract: USDT,
    status: "success",
  });
}

describe("incremental sync planning", () => {
  it("runs when the RPC head is only a few blocks ahead", () => {
    const plan = planSyncWindow({
      lastIndexedBlock: 1_000,
      latestBlock: 1_003,
      mode: "incremental",
      syncStartBlock: 1,
    });
    expect(plan.shouldRun).toBe(true);
    expect(plan.checkpointAllowed).toBe(true);
    expect(plan.endBlock - plan.startBlock).toBeLessThan(FAST_INCREMENTAL_MAX_LAG);
    expect(plan.startBlock).toBe(995);
    expect(plan.endBlock).toBe(1_003);
  });

  it("still plans a bounded contiguous backfill when the head is far ahead", () => {
    const plan = planSyncWindow({
      lastIndexedBlock: 124_685_028,
      latestBlock: 125_011_458,
      mode: "incremental",
      maxBlocksPerRun: REQUEST_BACKFILL_BLOCKS,
      syncStartBlock: 1,
    });
    expect(plan.shouldRun).toBe(true);
    expect(plan.checkpointAllowed).toBe(true);
    expect(plan.endBlock - plan.startBlock + 1).toBeLessThanOrEqual(
      REQUEST_BACKFILL_BLOCKS + 5,
    );
    expect(plan.startBlock).toBe(124_685_028 - 5);
    const next = resolveNextCheckpoint({
      stored: 124_685_028,
      startBlock: plan.startBlock,
      endBlock: plan.endBlock,
      lastSuccessfulChunk: plan.endBlock,
      scanComplete: true,
      checkpointAllowed: plan.checkpointAllowed,
    });
    expect(next).toBe(plan.endBlock);
    expect(next).toBeGreaterThan(124_685_028);
    expect(next).toBeLessThan(125_011_458);
  });

  it("clamps a beyond-head RPC error to the node head instead of treating it as an oversized range", () => {
    const message =
      'could not coalesce error (error={ "code": -32602, "message": "block range extends beyond current head block: requested 125011129, head 125011127" }, payload={ "id": 441, "jsonrpc": "2.0", "method": "eth_getLogs" })';
    expect(parseBeyondHeadBlock(message)).toBe(125_011_127);
    expect(parseBeyondHeadBlock("query returned more than 10000 results")).toBeNull();
  });

  it("does not scan when the checkpoint is already at the head", () => {
    const plan = planSyncWindow({
      lastIndexedBlock: 5_000,
      latestBlock: 5_000,
      mode: "incremental",
    });
    expect(plan.shouldRun).toBe(false);
    expect(plan.reason).toBe("caught-up");
  });

  it("does not advance the checkpoint past a gap during tip refresh", () => {
    const plan = planSyncWindow({
      lastIndexedBlock: 1_000,
      latestBlock: 50_000,
      mode: "tip",
    });
    expect(plan.shouldRun).toBe(true);
    expect(plan.checkpointAllowed).toBe(false);
    expect(plan.endBlock).toBe(50_000);
    expect(
      resolveNextCheckpoint({
        stored: 1_000,
        startBlock: plan.startBlock,
        endBlock: plan.endBlock,
        lastSuccessfulChunk: plan.endBlock,
        scanComplete: true,
        checkpointAllowed: plan.checkpointAllowed,
      }),
    ).toBe(1_000);
  });
});

describe("checkpoint safety", () => {
  it("does not advance when an RPC scan fails before any chunk", () => {
    expect(
      resolveNextCheckpoint({
        stored: 8_000,
        startBlock: 7_995,
        endBlock: 8_100,
        lastSuccessfulChunk: null,
        scanComplete: false,
        checkpointAllowed: true,
      }),
    ).toBe(8_000);
  });

  it("keeps a partial chunk but never jumps to the target head", () => {
    expect(
      resolveNextCheckpoint({
        stored: 8_000,
        startBlock: 7_995,
        endBlock: 9_000,
        lastSuccessfulChunk: 8_200,
        scanComplete: false,
        checkpointAllowed: true,
      }),
    ).toBe(8_200);
  });

  it("does not treat external 204 or empty pages as a successful scan", () => {
    expect(externalPageConfirmsRange(204, 0)).toBe(false);
    expect(externalPageConfirmsRange(200, 0)).toBe(false);
    expect(externalPageConfirmsRange(503, 0)).toBe(false);
    expect(externalPageConfirmsRange(200, 2)).toBe(true);
  });
});

describe("recent tx feed", () => {
  const row = (
    amount: number,
    block: number,
    logIndex: number,
    direction: "deposit" | "withdraw",
  ) => ({
    txHash: `0x${block.toString(16).padStart(64, "0")}`,
    logIndex,
    fromAddress: direction === "deposit" ? EXTERNAL : WITHDRAW.toLowerCase(),
    toAddress: direction === "deposit" ? DEPOSIT.toLowerCase() : EXTERNAL,
    blockNumber: block,
    timestamp: "2026-10-01T00:00:00.000Z",
    amountUsdt: amount,
    amountRaw: (BigInt(Math.round(amount)) * 10n ** 18n).toString(),
    tokenDecimals: 18,
  });

  it("hides transfers under 10000 USDT and keeps 10000", () => {
    const selected = selectRecentTxFeed(
      [row(5_000, 10, 0, "deposit"), row(9_999, 11, 0, "withdraw"), row(10_000, 9, 0, "deposit")],
      10,
    );
    expect(selected.map((t) => t.amountUsdt)).toEqual([10_000]);
  });

  it("still applies the large-tx floor only on the large-tx selector", () => {
    const selected = selectLatestCombinedTransactions(
      [row(9_999, 11, 0, "deposit"), row(10_000, 10, 0, "deposit")],
      10,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.amountUsdt).toBe(10_000);
  });

  it("orders newest block then log index first", () => {
    const selected = selectRecentTxFeed(
      [
        row(10_000, 5, 2, "deposit"),
        row(12_000, 7, 0, "withdraw"),
        row(11_000, 7, 3, "deposit"),
      ],
      10,
    );
    expect(selected.map((t) => [t.blockNumber, t.logIndex])).toEqual([
      [7, 3],
      [7, 0],
      [5, 2],
    ]);
  });

  it("classifies deposits and withdrawals and converts decimals", () => {
    const deposit = transfer({
      from: EXTERNAL,
      to: DEPOSIT,
      value: 5_000n * 10n ** 18n,
      blockNumber: 42,
      logIndex: 1,
    });
    const withdraw = transfer({
      from: EXTERNAL,
      to: WITHDRAW,
      value: 9_999n * 10n ** 18n,
      blockNumber: 43,
      logIndex: 2,
      txHash:
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });
    expect(deposit).toHaveLength(1);
    expect(deposit[0]).toMatchObject({
      walletType: "deposit",
      amountUsdt: 5000,
      tokenDecimals: 18,
      amountRaw: (5_000n * 10n ** 18n).toString(),
      blockNumber: 42,
      logIndex: 1,
      status: "success",
    });
    expect(withdraw[0]).toMatchObject({
      walletType: "withdraw",
      amountUsdt: 9999,
    });
  });
});

describe("refresh and cache", () => {
  it("keeps polling when Supabase Realtime is disabled", () => {
    const disabled = recentTxRefreshStrategy(false);
    const enabled = recentTxRefreshStrategy(true);
    expect(disabled.poll).toBe(true);
    expect(disabled.realtime).toBe(false);
    expect(disabled.pollMs).toBeLessThanOrEqual(10_000);
    expect(enabled.poll).toBe(true);
    expect(enabled.realtime).toBe(true);
  });

  it("sends no-store headers so the Recent TX API is not cached", () => {
    const headers = recentTxCacheHeaders();
    expect(headers["Cache-Control"]).toContain("no-store");
    expect(headers["Cache-Control"]).toContain("max-age=0");
    expect(headers.Pragma).toBe("no-cache");
  });
});
