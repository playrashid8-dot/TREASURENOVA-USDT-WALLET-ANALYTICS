import { describe, expect, it } from "vitest";
import {
  DEPOSIT_WALLET,
  RESERVE_FUND_WALLET,
  WITHDRAW_WALLET,
} from "@/lib/config";
import {
  RECENT_TX_LIMIT,
  RECENT_TX_MIN_USDT,
  applyRecentTxQuery,
  selectRecentTxFeed,
} from "@/lib/analytics/filters";
import { normalizeAddress } from "@/lib/utils/addresses";
import type { WalletCardType } from "@/types/analytics";

const DEPOSIT = normalizeAddress(DEPOSIT_WALLET);
const WITHDRAW = normalizeAddress(WITHDRAW_WALLET);
const RESERVE = normalizeAddress(RESERVE_FUND_WALLET);
const UNRELATED = "0x1111111111111111111111111111111111111111";

type Call = { method: string; args: unknown[] };

/**
 * Records the same PostgREST constraint methods the Supabase query builder
 * exposes. applyRecentTxQuery is what GET /api/recent-transactions calls.
 */
function recordingQuery() {
  const calls: Call[] = [];
  const query = {
    gte(col: string, val: number | string) {
      calls.push({ method: "gte", args: [col, val] });
      return query;
    },
    eq(col: string, val: string) {
      calls.push({ method: "eq", args: [col, val] });
      return query;
    },
    neq(col: string, val: string) {
      calls.push({ method: "neq", args: [col, val] });
      return query;
    },
    or(filters: string) {
      calls.push({ method: "or", args: [filters] });
      return query;
    },
  };
  return { query, calls };
}

function constraintsFor(walletType: WalletCardType) {
  const { query, calls } = recordingQuery();
  applyRecentTxQuery(query, walletType);
  const amount = calls.find((c) => c.method === "gte" && c.args[0] === "amount_usdt");
  const wallet = calls.find((c) => c.method === "or");
  if (!amount || typeof amount.args[1] !== "number") {
    throw new Error("amount_usdt gte constraint missing");
  }
  if (!wallet || typeof wallet.args[0] !== "string") {
    throw new Error("wallet or constraint missing");
  }
  return { minAmount: amount.args[1], walletOr: wallet.args[0] };
}

/** Evaluate the PostgREST or() string emitted for one monitored wallet. */
function matchesWalletOr(
  walletOr: string,
  fromAddress: string,
  toAddress: string,
): boolean {
  const from = fromAddress.toLowerCase();
  const to = toAddress.toLowerCase();
  const clauses = walletOr.split(/,(?=and\()/);
  return clauses.some((clause) => {
    const inner = clause.replace(/^and\(/, "").replace(/\)$/, "");
    return inner.split(",").every((part) => {
      const match = part.match(/^(from_address|to_address)\.(eq|neq)\.(0x[0-9a-fA-F]+)$/);
      if (!match) return false;
      const actual = match[1] === "from_address" ? from : to;
      const expected = match[3].toLowerCase();
      return match[2] === "eq" ? actual === expected : actual !== expected;
    });
  });
}

function queryWouldReturn(input: {
  walletType: WalletCardType;
  fromAddress: string;
  toAddress: string;
  amountUsdt: number;
}): boolean {
  const { minAmount, walletOr } = constraintsFor(input.walletType);
  if (!(input.amountUsdt >= minAmount)) return false;
  return matchesWalletOr(walletOr, input.fromAddress, input.toAddress);
}

describe("recent tx API query constraints", () => {
  it("requires amount_usdt >= 10000 on the query", () => {
    for (const walletType of ["deposit", "withdraw", "reserve"] as const) {
      const { minAmount } = constraintsFor(walletType);
      expect(minAmount).toBe(10_000);
      expect(minAmount).toBe(RECENT_TX_MIN_USDT);
      expect(9_999 >= minAmount).toBe(false);
      expect(10_000 >= minAmount).toBe(true);
    }
  });

  it("shows a 10000+ USDT transfer involving a monitored wallet", () => {
    expect(
      queryWouldReturn({
        walletType: "deposit",
        fromAddress: UNRELATED,
        toAddress: DEPOSIT,
        amountUsdt: 10_000,
      }),
    ).toBe(true);
    expect(
      queryWouldReturn({
        walletType: "deposit",
        fromAddress: UNRELATED,
        toAddress: DEPOSIT,
        amountUsdt: 25_000,
      }),
    ).toBe(true);
  });

  it("hides a 9999 USDT transfer even when a monitored wallet is involved", () => {
    expect(
      queryWouldReturn({
        walletType: "deposit",
        fromAddress: UNRELATED,
        toAddress: DEPOSIT,
        amountUsdt: 9_999,
      }),
    ).toBe(false);
    expect(
      queryWouldReturn({
        walletType: "withdraw",
        fromAddress: WITHDRAW,
        toAddress: UNRELATED,
        amountUsdt: 9_999,
      }),
    ).toBe(false);
    expect(
      queryWouldReturn({
        walletType: "reserve",
        fromAddress: UNRELATED,
        toAddress: RESERVE,
        amountUsdt: 9_999,
      }),
    ).toBe(false);
  });

  it("hides a 10000+ USDT transfer that does not involve the monitored wallet", () => {
    const other = "0x2222222222222222222222222222222222222222";
    for (const walletType of ["deposit", "withdraw", "reserve"] as const) {
      expect(
        queryWouldReturn({
          walletType,
          fromAddress: UNRELATED,
          toAddress: other,
          amountUsdt: 50_000,
        }),
      ).toBe(false);
    }
    const depositOr = constraintsFor("deposit").walletOr;
    expect(depositOr).toContain(DEPOSIT);
    expect(depositOr).not.toContain(UNRELATED);
    expect(constraintsFor("withdraw").walletOr).toContain(WITHDRAW);
    expect(constraintsFor("reserve").walletOr).toContain(RESERVE);
  });

  it("shows 10000+ deposit, withdraw, and reserve transfers", () => {
    expect(
      queryWouldReturn({
        walletType: "deposit",
        fromAddress: UNRELATED,
        toAddress: DEPOSIT,
        amountUsdt: 10_000,
      }),
    ).toBe(true);
    expect(
      queryWouldReturn({
        walletType: "withdraw",
        fromAddress: WITHDRAW,
        toAddress: UNRELATED,
        amountUsdt: 10_000,
      }),
    ).toBe(true);
    expect(
      queryWouldReturn({
        walletType: "reserve",
        fromAddress: RESERVE,
        toAddress: UNRELATED,
        amountUsdt: 10_000,
      }),
    ).toBe(true);
  });

  it("returns the latest 10 newest first", () => {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const block = 100 + i;
      return {
        txHash: `0x${block.toString(16).padStart(64, "0")}`,
        logIndex: i % 3,
        fromAddress: UNRELATED,
        toAddress: i % 2 === 0 ? DEPOSIT : WITHDRAW,
        blockNumber: block,
        timestamp: `2026-10-01T00:${String(i).padStart(2, "0")}:00.000Z`,
        amountUsdt: 10_000 + i,
      };
    });
    // Duplicate of the newest row must not take a second slot.
    rows.push({
      ...rows[11],
      amountUsdt: 80_000,
    });
    rows.push({
      txHash: `0x${"ab".repeat(32)}`,
      logIndex: 0,
      fromAddress: UNRELATED,
      toAddress: RESERVE,
      blockNumber: 999,
      timestamp: "2026-10-01T01:00:00.000Z",
      amountUsdt: 9_999,
    });

    const selected = selectRecentTxFeed(rows, RECENT_TX_LIMIT);
    expect(selected).toHaveLength(10);
    expect(selected.every((row) => row.amountUsdt >= 10_000)).toBe(true);
    const blocks = selected.map((row) => row.blockNumber);
    expect(blocks).toEqual([...blocks].sort((a, b) => b - a));
    expect(blocks[0]).toBe(111);
    expect(blocks[9]).toBe(102);
    expect(selected.some((row) => row.amountUsdt === 9_999)).toBe(false);
    expect(selected.filter((row) => row.blockNumber === 111)).toHaveLength(1);
  });
});
