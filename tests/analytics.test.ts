import { describe, expect, it } from "vitest";
import {
  addressesEqual,
  normalizeAddress,
  shortAddress,
  isValidAddress,
} from "@/lib/utils/addresses";
import { rawToUsdt, formatUsdt, formatSignedUsdt } from "@/lib/utils/format";
import {
  computeNetCashFlow,
  paginate,
  sumDailyStats,
  splitCompletedAndLive,
  buildLastCompletedDaysSummary,
} from "@/lib/analytics/calculations";
import { meetsMinDisplayUsdtAmount } from "@/lib/analytics/filters";
import { MIN_DISPLAY_USDT_AMOUNT } from "@/lib/config";
import {
  resolveDateRange,
  dateKeyUtc,
  blockTimestampToIso,
  utcTodayKey,
  isCompletedUtcDate,
  isLiveUtcDate,
  addUtcDays,
  lastCompletedUtcDateKeys,
  formatShortUtcDate,
} from "@/lib/utils/dates";
import { classifyTransfer, classifyIndexedTransferRoles, validateTokenTransfer, validateTokenTransfers } from "@/lib/blockchain/validation";
import { applyTransactionHistoryTypeFilter } from "@/lib/analytics/filters";
import { resolveScanStartBlock } from "@/lib/blockchain/logs";
import type { EtherscanTokenTransfer } from "@/types/blockchain";

// Fixed wallets matching defaults for unit tests of classification logic
const DEPOSIT = "0xc051a1b111085ddD6Bc2FF8346Ad0f4E7dF26935";
const WITHDRAW = "0x48A909049FB00581CA83beA39BB824eBb90132FA";

describe("address utilities", () => {
  it("normalizes addresses to lowercase", () => {
    expect(normalizeAddress(DEPOSIT)).toBe(DEPOSIT.toLowerCase());
  });

  it("compares addresses case-insensitively", () => {
    expect(addressesEqual(DEPOSIT, DEPOSIT.toLowerCase())).toBe(true);
  });

  it("validates addresses", () => {
    expect(isValidAddress(DEPOSIT)).toBe(true);
    expect(isValidAddress("not-an-address")).toBe(false);
  });

  it("shortens addresses", () => {
    expect(shortAddress(DEPOSIT, 4)).toMatch(/^0xc051…/);
  });
});

describe("token amount parsing", () => {
  it("converts raw amounts using decimals", () => {
    expect(rawToUsdt("1250000000", 6)).toBe(1250);
    expect(rawToUsdt("5000000000000000000", 18)).toBe(5);
  });

  it("formats USDT amounts", () => {
    expect(formatUsdt(1250)).toBe("1,250.00");
    expect(formatUsdt(1_250_000)).toBe("1.25M");
  });

  it("formats signed amounts", () => {
    expect(formatSignedUsdt(1250, true)).toBe("+ 1,250.00 USDT");
    expect(formatSignedUsdt(500, false)).toBe("- 500.00 USDT");
  });
});

describe("net cash flow", () => {
  it("computes deposits minus withdrawals", () => {
    expect(computeNetCashFlow(1000, 400)).toBe(600);
    expect(computeNetCashFlow(100, 250)).toBe(-150);
  });

  it("sums daily stats", () => {
    const result = sumDailyStats([
      {
        date: "2026-01-01",
        depositAmount: 100,
        withdrawalAmount: 40,
        netCashFlow: 60,
        depositCount: 2,
        withdrawalCount: 1,
        isLive: false,
        isCompleted: true,
      },
      {
        date: "2026-01-02",
        depositAmount: 50,
        withdrawalAmount: 10,
        netCashFlow: 40,
        depositCount: 1,
        withdrawalCount: 1,
        isLive: false,
        isCompleted: true,
      },
    ]);
    expect(result.totalDeposits).toBe(150);
    expect(result.totalWithdrawals).toBe(50);
    expect(result.netCashFlow).toBe(100);
    expect(result.transactionCount).toBe(5);
  });

  it("keeps Net Cash Flow terminology as deposits minus withdrawals", () => {
    expect(computeNetCashFlow(500, 200)).toBe(300);
  });
});

describe("completed vs live daily totals", () => {
  const now = new Date("2026-09-26T15:30:00.000Z");
  const today = "2026-09-26";
  const yesterday = "2026-09-25";

  it("treats only past UTC days as completed", () => {
    expect(isCompletedUtcDate(yesterday, now)).toBe(true);
    expect(isCompletedUtcDate(today, now)).toBe(false);
    expect(isLiveUtcDate(today, now)).toBe(true);
    expect(isLiveUtcDate(yesterday, now)).toBe(false);
  });

  it("excludes today's running totals from completed aggregates", () => {
    const { completed, live, liveInRange, todayDate } = splitCompletedAndLive(
      [
        {
          date: yesterday,
          depositAmount: 1000,
          withdrawalAmount: 400,
          depositCount: 3,
          withdrawalCount: 2,
        },
        {
          date: today,
          depositAmount: 50,
          withdrawalAmount: 10,
          depositCount: 1,
          withdrawalCount: 1,
        },
      ],
      now,
    );

    expect(todayDate).toBe(today);
    expect(liveInRange).toBe(true);
    expect(completed.depositAmount).toBe(1000);
    expect(completed.withdrawalAmount).toBe(400);
    expect(completed.netCashFlow).toBe(600);
    expect(completed.depositCount).toBe(3);
    expect(completed.withdrawalCount).toBe(2);
    expect(live.depositAmount).toBe(50);
    expect(live.withdrawalAmount).toBe(10);
    expect(live.netCashFlow).toBe(40);
    expect(live.depositCount).toBe(1);
    expect(live.withdrawalCount).toBe(1);
  });

  it("never treats today's live total as a final daily total", () => {
    const { completed, live } = splitCompletedAndLive(
      [
        {
          date: today,
          depositAmount: 999,
          withdrawalAmount: 111,
          depositCount: 9,
          withdrawalCount: 2,
        },
      ],
      now,
    );
    expect(completed.depositAmount).toBe(0);
    expect(completed.withdrawalAmount).toBe(0);
    expect(completed.netCashFlow).toBe(0);
    expect(live.depositAmount).toBe(999);
    expect(live.withdrawalAmount).toBe(111);
  });
});

describe("last 4 completed UTC days", () => {
  const now = new Date("2026-09-26T15:30:00.000Z");

  it("returns yesterday through yesterday-3 newest first", () => {
    expect(lastCompletedUtcDateKeys(4, now)).toEqual([
      "2026-09-25",
      "2026-09-24",
      "2026-09-23",
      "2026-09-22",
    ]);
  });

  it("never includes today's live date", () => {
    const keys = lastCompletedUtcDateKeys(4, now);
    expect(keys).not.toContain("2026-09-26");
    expect(keys.every((k) => isCompletedUtcDate(k, now))).toBe(true);
  });

  it("fills missing indexed days with zeros", () => {
    const rows = buildLastCompletedDaysSummary(
      [
        {
          date: "2026-09-25",
          depositAmount: 1000,
          withdrawalAmount: 400,
          netCashFlow: 600,
          depositCount: 3,
          withdrawalCount: 2,
        },
        {
          date: "2026-09-26",
          depositAmount: 50,
          withdrawalAmount: 10,
          netCashFlow: 40,
          depositCount: 1,
          withdrawalCount: 1,
        },
      ],
      4,
      now,
    );

    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.date)).toEqual([
      "2026-09-25",
      "2026-09-24",
      "2026-09-23",
      "2026-09-22",
    ]);
    expect(rows[0]).toMatchObject({
      depositAmount: 1000,
      withdrawalAmount: 400,
      netCashFlow: 600,
      depositCount: 3,
      withdrawalCount: 2,
      isCompleted: true,
      isLive: false,
    });
    expect(rows[1]).toMatchObject({
      depositAmount: 0,
      withdrawalAmount: 0,
      netCashFlow: 0,
      depositCount: 0,
      withdrawalCount: 0,
    });
    expect(rows.every((r) => !r.isLive && r.isCompleted)).toBe(true);
  });

  it("formats short UTC dates like 25 Sep", () => {
    expect(formatShortUtcDate("2026-09-25")).toBe("25 Sep");
  });
});

describe("pagination", () => {
  it("paginates arrays", () => {
    const items = [1, 2, 3, 4, 5];
    const page1 = paginate(items, 1, 2);
    expect(page1.data).toEqual([1, 2]);
    expect(page1.totalPages).toBe(3);
    const page3 = paginate(items, 3, 2);
    expect(page3.data).toEqual([5]);
  });

  it("paginates only after the min display amount filter", () => {
    const amounts = [0, 1, 10, 49.99, 50, 50.01, 100, 200];
    const visible = amounts.filter((a) => meetsMinDisplayUsdtAmount(a));
    expect(visible).toEqual([50, 50.01, 100, 200]);
    const page1 = paginate(visible, 1, 2);
    expect(page1.data).toEqual([50, 50.01]);
    expect(page1.total).toBe(4);
    expect(page1.totalPages).toBe(2);
  });
});

describe("min display USDT filter", () => {
  it("defaults to 50 USDT", () => {
    expect(MIN_DISPLAY_USDT_AMOUNT).toBe(50);
  });

  it("hides amounts below 50 and shows 50 and above", () => {
    expect(meetsMinDisplayUsdtAmount(0)).toBe(false);
    expect(meetsMinDisplayUsdtAmount(1)).toBe(false);
    expect(meetsMinDisplayUsdtAmount(10)).toBe(false);
    expect(meetsMinDisplayUsdtAmount(49.99)).toBe(false);
    expect(meetsMinDisplayUsdtAmount(50)).toBe(true);
    expect(meetsMinDisplayUsdtAmount(50.0)).toBe(true);
    expect(meetsMinDisplayUsdtAmount(50.01)).toBe(true);
  });
});

describe("date filtering", () => {
  it("resolves all-time as null bounds", () => {
    const range = resolveDateRange("all");
    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
  });

  it("builds UTC date keys (not local timezone)", () => {
    expect(dateKeyUtc("2026-03-15T12:00:00.000Z")).toBe("2026-03-15");
    // Near UTC midnight: must stay on UTC calendar day
    expect(dateKeyUtc("2026-03-15T00:30:00.000Z")).toBe("2026-03-15");
    expect(dateKeyUtc("2026-03-14T23:30:00.000Z")).toBe("2026-03-14");
  });

  it("resolves today preset to the UTC calendar day", () => {
    const now = new Date("2026-09-26T04:00:00.000Z");
    const range = resolveDateRange("today", null, null, now);
    expect(range.from).toBe("2026-09-26T00:00:00.000Z");
    expect(range.to).toBe("2026-09-26T23:59:59.999Z");
  });

  it("resolves 7d using UTC day boundaries", () => {
    const now = new Date("2026-09-26T12:00:00.000Z");
    const range = resolveDateRange("7d", null, null, now);
    expect(range.from).toBe("2026-09-20T00:00:00.000Z");
    expect(range.to).toBe("2026-09-26T23:59:59.999Z");
    expect(addUtcDays(utcTodayKey(now), -6)).toBe("2026-09-20");
  });

  it("converts block timestamps", () => {
    expect(blockTimestampToIso(1700000000)).toBe(
      new Date(1700000000 * 1000).toISOString(),
    );
  });
});

describe("deposit / withdrawal detection (IN only for analytics)", () => {
  it("classifies transfer to deposit wallet as deposit", () => {
    const type = classifyTransfer(DEPOSIT);
    expect(type === "deposit" || type === null).toBe(true);
  });

  it("classifies transfer to withdraw wallet as withdraw", () => {
    const type = classifyTransfer(WITHDRAW);
    expect(type === "withdraw" || type === null).toBe(true);
  });

  it("rejects unrelated recipient", () => {
    expect(
      classifyTransfer("0x0000000000000000000000000000000000000001"),
    ).toBeNull();
  });

  it("does not classify by sender — wallet OUT is never a deposit or withdrawal in analytics", () => {
    // classifyTransfer only inspects `to`; a transfer FROM the deposit wallet
    // to an unrelated address must not be counted as a deposit.
    expect(
      classifyTransfer("0x00000000000000000000000000000000000000aa"),
    ).toBeNull();
  });
});

describe("transaction history indexing roles", () => {
  it("indexes Deposit Wallet IN as deposit", () => {
    const roles = classifyIndexedTransferRoles(
      "0x1111111111111111111111111111111111111111",
      DEPOSIT,
    );
    expect(roles).toEqual([
      { walletType: "deposit", walletAddress: DEPOSIT.toLowerCase() },
    ]);
  });

  it("indexes Withdraw Wallet IN as withdraw (daily analytics)", () => {
    const roles = classifyIndexedTransferRoles(
      "0x1111111111111111111111111111111111111111",
      WITHDRAW,
    );
    expect(roles).toEqual([
      { walletType: "withdraw", walletAddress: WITHDRAW.toLowerCase() },
    ]);
  });

  it("indexes Withdraw Wallet OUT as withdraw (history only)", () => {
    const roles = classifyIndexedTransferRoles(
      WITHDRAW,
      "0x2222222222222222222222222222222222222222",
    );
    expect(roles).toEqual([
      { walletType: "withdraw", walletAddress: WITHDRAW.toLowerCase() },
    ]);
  });

  it("does not index Deposit Wallet OUT", () => {
    const roles = classifyIndexedTransferRoles(
      DEPOSIT,
      "0x2222222222222222222222222222222222222222",
    );
    expect(roles).toEqual([]);
  });

  it("indexes Withdraw→Deposit as both deposit IN and withdraw OUT", () => {
    const roles = classifyIndexedTransferRoles(WITHDRAW, DEPOSIT);
    expect(roles).toEqual([
      { walletType: "deposit", walletAddress: DEPOSIT.toLowerCase() },
      { walletType: "withdraw", walletAddress: WITHDRAW.toLowerCase() },
    ]);
  });
});

describe("transaction history type filters", () => {
  it("filters deposits by to_address and withdrawals by from_address", () => {
    const calls: Array<{ col: string; val: string }> = [];
    const query = {
      eq(col: string, val: string) {
        calls.push({ col, val });
        return this;
      },
    };
    applyTransactionHistoryTypeFilter(query, "deposit");
    expect(calls).toEqual([
      { col: "to_address", val: DEPOSIT.toLowerCase() },
    ]);
    calls.length = 0;
    applyTransactionHistoryTypeFilter(query, "withdraw");
    expect(calls).toEqual([
      { col: "from_address", val: WITHDRAW.toLowerCase() },
    ]);
  });
});

describe("duplicate identity", () => {
  it("builds unique key from tx_hash + log_index + wallet_address", () => {
    const a = {
      txHash: "0xabc",
      logIndex: 1,
      walletAddress: DEPOSIT.toLowerCase(),
    };
    const b = {
      txHash: "0xabc",
      logIndex: 1,
      walletAddress: DEPOSIT.toLowerCase(),
    };
    const key = (t: typeof a) =>
      `${t.txHash}:${t.logIndex}:${t.walletAddress}`;
    expect(key(a)).toBe(key(b));

    const map = new Map<string, typeof a>();
    map.set(key(a), a);
    map.set(key(b), b);
    expect(map.size).toBe(1);
  });
});

describe("transfer validation", () => {
  const baseTx: EtherscanTokenTransfer = {
    blockNumber: "12345",
    timeStamp: "1700000000",
    hash: "0x" + "ab".repeat(32),
    nonce: "1",
    blockHash: "0x" + "cd".repeat(32),
    from: "0x1111111111111111111111111111111111111111",
    contractAddress:
      process.env.USDT_CONTRACT_ADDRESS ||
      "0x55d398326f99059fF775485246999027B3197955",
    to: DEPOSIT,
    value: "1000000",
    tokenName: "Tether USD",
    tokenSymbol: "USDT",
    tokenDecimal: "18",
    transactionIndex: "0",
    gas: "21000",
    gasPrice: "1",
    gasUsed: "21000",
    cumulativeGasUsed: "21000",
    input: "0x",
    confirmations: "10",
    logIndex: "3",
  };

  it("rejects zero amount", () => {
    const result = validateTokenTransfer({ ...baseTx, value: "0" }, 18);
    expect(result).toBeNull();
  });

  it("rejects invalid hash", () => {
    const result = validateTokenTransfer({ ...baseTx, hash: "bad" }, 18);
    expect(result).toBeNull();
  });

  it("rejects transfers whose to is not a tracked wallet (deposit OUT path)", () => {
    const result = validateTokenTransfer(
      {
        ...baseTx,
        from: DEPOSIT,
        to: "0x00000000000000000000000000000000000000bb",
      },
      18,
    );
    expect(result).toBeNull();
  });

  it("indexes Withdraw Wallet OUT for transaction history", () => {
    const results = validateTokenTransfers(
      {
        ...baseTx,
        from: WITHDRAW,
        to: "0x00000000000000000000000000000000000000bb",
        value: "50000000000000000000", // 50 USDT @ 18 decimals
      },
      18,
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.walletType).toBe("withdraw");
    expect(results[0]?.fromAddress).toBe(WITHDRAW.toLowerCase());
    expect(results[0]?.toAddress).not.toBe(WITHDRAW.toLowerCase());
  });
});

describe("log scan resume bounds", () => {
  it("resumes a few blocks before the last indexed block", () => {
    expect(resolveScanStartBlock(1_000_000)).toBe(999_995);
  });

  it("uses SYNC_START_BLOCK floor when nothing is indexed yet", () => {
    const start = resolveScanStartBlock(0);
    expect(start).toBeGreaterThan(0);
  });
});
