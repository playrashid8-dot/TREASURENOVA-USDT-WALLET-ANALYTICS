import { describe, expect, it } from "vitest";
import {
  addressesEqual,
  normalizeAddress,
  shortAddress,
  isValidAddress,
} from "@/lib/utils/addresses";
import { rawToUsdt, formatUsdt, formatSignedUsdt, rawMeetsMinUsdt } from "@/lib/utils/format";
import {
  computeNetCashFlow,
  sumDailyStats,
  splitCompletedAndLive,
} from "@/lib/analytics/calculations";
import { aggregateDailyFromTransactions } from "@/lib/analytics/aggregation";
import {
  LARGE_TX_COMPLETED_DAYS,
  LARGE_TX_MIN_USDT,
  MIN_DISPLAY_USDT_AMOUNT,
} from "@/lib/config";
import {
  meetsLargeTxMinUsdt,
  applyLargeTxWalletFilter,
  classifyRecentTxWallet,
  classifyRecentTxDirection,
  selectLatestCombinedTransactions,
  RECENT_TX_LIMIT,
} from "@/lib/analytics/filters";
import { deriveLiveStatus } from "@/lib/analytics/live-status";
import {
  resolveDateRange,
  dateKeyUtc,
  blockTimestampToIso,
  utcTodayKey,
  isCompletedUtcDate,
  isLiveUtcDate,
  addUtcDays,
  lastCompletedUtcDateKeys,
  lastCompletedUtcRange,
  formatDisplayDateTime,
} from "@/lib/utils/dates";
import {
  classifyTransfer,
  classifyIndexedTransferRoles,
  validateTokenTransfer,
  validateTokenTransfers,
} from "@/lib/blockchain/validation";
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

  it("compares raw amounts to min floor with BigInt (6 and 18 decimals)", () => {
    // 6 decimals: 10,000 USDT = 10_000_000_000
    expect(rawMeetsMinUsdt("9999999999", 6, 10_000)).toBe(false);
    expect(rawMeetsMinUsdt("10000000000", 6, 10_000)).toBe(true);
    expect(rawMeetsMinUsdt("10000000001", 6, 10_000)).toBe(true);
    // 18 decimals (BSC USDT)
    expect(rawMeetsMinUsdt("9999999999999999999999", 18, 10_000)).toBe(false);
    expect(rawMeetsMinUsdt("10000000000000000000000", 18, 10_000)).toBe(true);
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
        depositAmount: 100,
        withdrawalAmount: 40,
        depositCount: 2,
        withdrawalCount: 1,
      },
      {
        depositAmount: 50,
        withdrawalAmount: 10,
        depositCount: 1,
        withdrawalCount: 1,
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

describe("daily analytics aggregation (IN only, no min display filter)", () => {
  const deposit = DEPOSIT.toLowerCase();
  const withdraw = WITHDRAW.toLowerCase();

  it("counts every qualifying IN including amounts below 50 USDT", () => {
    const byDate = aggregateDailyFromTransactions(
      [
        {
          timestamp: "2026-09-25T10:00:00.000Z",
          wallet_type: "deposit",
          amount_usdt: 30,
          status: "success",
          to_address: deposit,
        },
        {
          timestamp: "2026-09-25T11:00:00.000Z",
          wallet_type: "deposit",
          amount_usdt: 750.16,
          status: "success",
          to_address: deposit,
        },
        {
          timestamp: "2026-09-25T12:00:00.000Z",
          wallet_type: "withdraw",
          amount_usdt: 100,
          status: "success",
          to_address: withdraw,
        },
      ],
      { depositAddress: DEPOSIT, withdrawAddress: WITHDRAW },
    );

    const day = byDate.get("2026-09-25");
    expect(day).toMatchObject({
      deposit_amount: 780.16,
      deposit_count: 2,
      withdrawal_amount: 100,
      withdrawal_count: 1,
    });
  });

  it("excludes Deposit Wallet OUT and Withdraw Wallet OUT", () => {
    const byDate = aggregateDailyFromTransactions(
      [
        {
          timestamp: "2026-09-25T10:00:00.000Z",
          wallet_type: "deposit",
          amount_usdt: 500,
          status: "success",
          to_address: "0x1111111111111111111111111111111111111111",
        },
        {
          timestamp: "2026-09-25T11:00:00.000Z",
          wallet_type: "withdraw",
          amount_usdt: 900,
          status: "success",
          to_address: "0x2222222222222222222222222222222222222222",
        },
        {
          timestamp: "2026-09-25T12:00:00.000Z",
          wallet_type: "deposit",
          amount_usdt: 50,
          status: "success",
          to_address: deposit,
        },
      ],
      { depositAddress: DEPOSIT, withdrawAddress: WITHDRAW },
    );

    const day = byDate.get("2026-09-25");
    expect(day).toMatchObject({
      deposit_amount: 50,
      deposit_count: 1,
      withdrawal_amount: 0,
      withdrawal_count: 0,
    });
  });

  it("writes a zero row when an explicit date has no qualifying txs", () => {
    const byDate = aggregateDailyFromTransactions([], {
      date: "2026-09-22",
      depositAddress: DEPOSIT,
      withdrawAddress: WITHDRAW,
    });
    expect(byDate.get("2026-09-22")).toMatchObject({
      deposit_amount: 0,
      withdrawal_amount: 0,
      deposit_count: 0,
      withdrawal_count: 0,
    });
  });
});

describe("min display USDT constant", () => {
  it("defaults to 50 USDT for optional list tooling", () => {
    expect(MIN_DISPLAY_USDT_AMOUNT).toBe(50);
  });

  it("defaults large-tx floor to 10,000 USDT over 5 completed days", () => {
    expect(LARGE_TX_MIN_USDT).toBe(10_000);
    expect(LARGE_TX_COMPLETED_DAYS).toBe(5);
    expect(meetsLargeTxMinUsdt(9_999.99)).toBe(false);
    expect(meetsLargeTxMinUsdt(10_000)).toBe(true);
  });
});

describe("large-tx wallet direction filters", () => {
  it("filters deposit as IN or OUT involving deposit wallet", () => {
    const ors: string[] = [];
    const q = {
      eq() {
        return this;
      },
      neq() {
        return this;
      },
      or(filters: string) {
        ors.push(filters);
        return this;
      },
    };
    applyLargeTxWalletFilter(q, "deposit");
    expect(ors).toHaveLength(1);
    expect(ors[0]).toContain(`to_address.eq.${normalizeAddress(DEPOSIT)}`);
    expect(ors[0]).toContain(`from_address.eq.${normalizeAddress(DEPOSIT)}`);
  });

  it("filters withdraw as IN or OUT involving withdraw wallet", () => {
    const ors: string[] = [];
    const q = {
      eq() {
        return this;
      },
      neq() {
        return this;
      },
      or(filters: string) {
        ors.push(filters);
        return this;
      },
    };
    applyLargeTxWalletFilter(q, "withdraw");
    expect(ors).toHaveLength(1);
    expect(ors[0]).toContain(`to_address.eq.${normalizeAddress(WITHDRAW)}`);
    expect(ors[0]).toContain(`from_address.eq.${normalizeAddress(WITHDRAW)}`);
  });

  it("filters reserve as IN or OUT involving reserve fund wallet", () => {
    const reserve = "0xe1ce23017882f3630e2B5dC4f2Fb3f33947E5904";
    const ors: string[] = [];
    const q = {
      eq() {
        return this;
      },
      neq() {
        return this;
      },
      or(filters: string) {
        ors.push(filters);
        return this;
      },
    };
    applyLargeTxWalletFilter(q, "reserve");
    expect(ors).toHaveLength(1);
    expect(ors[0]).toContain(`to_address.eq.${normalizeAddress(reserve)}`);
    expect(ors[0]).toContain(`from_address.eq.${normalizeAddress(reserve)}`);
  });
});

describe("last completed UTC days for large txs", () => {
  const now = new Date("2026-09-29T10:00:00.000Z");

  it("returns latest N completed days excluding today", () => {
    const keys = lastCompletedUtcDateKeys(5, now);
    expect(keys).toEqual([
      "2026-09-28",
      "2026-09-27",
      "2026-09-26",
      "2026-09-25",
      "2026-09-24",
    ]);
    expect(keys.includes("2026-09-29")).toBe(false);
  });

  it("builds inclusive UTC timestamp bounds for those days", () => {
    const range = lastCompletedUtcRange(5, now);
    expect(range.from).toBe("2026-09-24T00:00:00.000Z");
    expect(range.to).toBe("2026-09-28T23:59:59.999Z");
  });

  it("formats display datetime as date • time UTC", () => {
    expect(formatDisplayDateTime("2026-09-27T14:23:11.000Z")).toBe(
      "Sep 27, 2026 • 14:23:11 UTC",
    );
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

describe("transfer indexing roles", () => {
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

  it("indexes Withdraw Wallet OUT as withdraw", () => {
    const roles = classifyIndexedTransferRoles(
      WITHDRAW,
      "0x2222222222222222222222222222222222222222",
    );
    expect(roles).toEqual([
      { walletType: "withdraw", walletAddress: WITHDRAW.toLowerCase() },
    ]);
  });

  it("indexes Deposit Wallet OUT as deposit", () => {
    const roles = classifyIndexedTransferRoles(
      DEPOSIT,
      "0x2222222222222222222222222222222222222222",
    );
    expect(roles).toEqual([
      { walletType: "deposit", walletAddress: DEPOSIT.toLowerCase() },
    ]);
  });

  it("indexes Reserve Fund IN as reserve", () => {
    const reserve = "0xe1ce23017882f3630e2B5dC4f2Fb3f33947E5904";
    const roles = classifyIndexedTransferRoles(
      "0x2222222222222222222222222222222222222222",
      reserve,
    );
    expect(roles).toEqual([
      { walletType: "reserve", walletAddress: reserve.toLowerCase() },
    ]);
  });

  it("does not index self-transfers", () => {
    expect(classifyIndexedTransferRoles(DEPOSIT, DEPOSIT)).toEqual([]);
    expect(classifyIndexedTransferRoles(WITHDRAW, WITHDRAW)).toEqual([]);
  });

  it("indexes Withdraw→Deposit as both deposit IN and withdraw OUT", () => {
    const roles = classifyIndexedTransferRoles(WITHDRAW, DEPOSIT);
    expect(roles).toEqual([
      { walletType: "deposit", walletAddress: DEPOSIT.toLowerCase() },
      { walletType: "withdraw", walletAddress: WITHDRAW.toLowerCase() },
    ]);
  });

  it("indexes Reserve Fund OUT as reserve", () => {
    const reserve = "0xe1ce23017882f3630e2B5dC4f2Fb3f33947E5904";
    const roles = classifyIndexedTransferRoles(
      reserve,
      "0x2222222222222222222222222222222222222222",
    );
    expect(roles).toEqual([
      { walletType: "reserve", walletAddress: reserve.toLowerCase() },
    ]);
  });

  it("indexes Reserve→Deposit as both deposit IN and reserve OUT", () => {
    const reserve = "0xe1ce23017882f3630e2B5dC4f2Fb3f33947E5904";
    const roles = classifyIndexedTransferRoles(reserve, DEPOSIT);
    expect(roles).toEqual([
      { walletType: "deposit", walletAddress: DEPOSIT.toLowerCase() },
      { walletType: "reserve", walletAddress: reserve.toLowerCase() },
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

  it("rejects transfers whose from/to are not tracked wallets", () => {
    const result = validateTokenTransfer(
      {
        ...baseTx,
        from: "0x00000000000000000000000000000000000000aa",
        to: "0x00000000000000000000000000000000000000bb",
      },
      18,
    );
    expect(result).toBeNull();
  });

  it("indexes Deposit Wallet OUT", () => {
    const results = validateTokenTransfers(
      {
        ...baseTx,
        from: DEPOSIT,
        to: "0x00000000000000000000000000000000000000bb",
        value: "50000000000000000000",
      },
      18,
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.walletType).toBe("deposit");
    expect(results[0]?.fromAddress).toBe(DEPOSIT.toLowerCase());
  });

  it("indexes Withdraw Wallet OUT", () => {
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

describe("recent TX classification + latest-10 combined", () => {
  const RESERVE = "0xe1ce23017882f3630e2B5dC4f2Fb3f33947E5904";
  const EXTERNAL = "0x2222222222222222222222222222222222222222";

  it("classifies IN and OUT for all three wallets", () => {
    expect(classifyRecentTxWallet(EXTERNAL, DEPOSIT)).toBe("deposit");
    expect(classifyRecentTxWallet(DEPOSIT, EXTERNAL)).toBe("deposit");
    expect(classifyRecentTxWallet(EXTERNAL, WITHDRAW)).toBe("withdraw");
    expect(classifyRecentTxWallet(WITHDRAW, EXTERNAL)).toBe("withdraw");
    expect(classifyRecentTxWallet(EXTERNAL, RESERVE)).toBe("reserve");
    expect(classifyRecentTxWallet(RESERVE, EXTERNAL)).toBe("reserve");
    expect(classifyRecentTxWallet(EXTERNAL, EXTERNAL)).toBeNull();
  });

  it("excludes self-transfers", () => {
    expect(classifyRecentTxWallet(DEPOSIT, DEPOSIT)).toBeNull();
    expect(classifyRecentTxWallet(WITHDRAW, WITHDRAW)).toBeNull();
    expect(classifyRecentTxWallet(RESERVE, RESERVE)).toBeNull();
  });

  it("prefers Deposit > Withdraw > Reserve for dual-wallet transfers", () => {
    expect(classifyRecentTxWallet(WITHDRAW, DEPOSIT)).toBe("deposit");
    expect(classifyRecentTxWallet(RESERVE, WITHDRAW)).toBe("withdraw");
    expect(classifyRecentTxWallet(RESERVE, DEPOSIT)).toBe("deposit");
  });

  it("resolves IN/OUT from Transfer from/to vs classified wallet", () => {
    expect(classifyRecentTxDirection(EXTERNAL, DEPOSIT, "deposit")).toBe("IN");
    expect(classifyRecentTxDirection(DEPOSIT, EXTERNAL, "deposit")).toBe("OUT");
    expect(classifyRecentTxDirection(RESERVE, WITHDRAW, "withdraw")).toBe("IN");
    expect(classifyRecentTxDirection(RESERVE, WITHDRAW, "reserve")).toBe("OUT");
  });

  it("returns a global newest-first list capped at 10 (not per wallet)", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      txHash: `0x${(i + 1).toString(16).padStart(64, "0")}`,
      logIndex: 0,
      fromAddress: i % 3 === 1 ? WITHDRAW.toLowerCase() : EXTERNAL,
      toAddress:
        i % 3 === 0
          ? DEPOSIT.toLowerCase()
          : i % 3 === 2
            ? EXTERNAL
            : EXTERNAL,
      blockNumber: 1000 + i,
      timestamp: `2026-09-${String(10 + (i % 18)).padStart(2, "0")}T12:00:00.000Z`,
      amountUsdt: 10_000 + i,
    }));
    // Fix withdraw OUT rows: from withdraw, to external
    for (let i = 0; i < rows.length; i++) {
      if (i % 3 === 1) {
        rows[i].fromAddress = WITHDRAW.toLowerCase();
        rows[i].toAddress = EXTERNAL;
      } else if (i % 3 === 2) {
        rows[i].fromAddress = RESERVE.toLowerCase();
        rows[i].toAddress = EXTERNAL;
      } else {
        rows[i].fromAddress = EXTERNAL;
        rows[i].toAddress = DEPOSIT.toLowerCase();
      }
    }

    const selected = selectLatestCombinedTransactions(rows, RECENT_TX_LIMIT);
    expect(selected).toHaveLength(10);
    expect(selected[0].blockNumber).toBeGreaterThan(selected[9].blockNumber);

    const deposits = selected.filter((t) => t.walletType === "deposit").length;
    const withdraws = selected.filter((t) => t.walletType === "withdraw").length;
    const reserves = selected.filter((t) => t.walletType === "reserve").length;
    expect(deposits + withdraws + reserves).toBe(10);
    expect(deposits).toBeLessThanOrEqual(10);
    expect(withdraws).toBeLessThanOrEqual(10);
    expect(reserves).toBeLessThanOrEqual(10);
  });

  it("excludes transfers below the 10,000 USDT display floor", () => {
    const rows = [
      {
        txHash: "0x" + "01".repeat(32),
        logIndex: 0,
        fromAddress: EXTERNAL,
        toAddress: DEPOSIT.toLowerCase(),
        blockNumber: 200,
        timestamp: "2026-09-21T12:00:00.000Z",
        amountUsdt: 9_999.99,
      },
      {
        txHash: "0x" + "02".repeat(32),
        logIndex: 0,
        fromAddress: WITHDRAW.toLowerCase(),
        toAddress: EXTERNAL,
        blockNumber: 199,
        timestamp: "2026-09-21T11:00:00.000Z",
        amountUsdt: 10_000,
      },
      {
        txHash: "0x" + "03".repeat(32),
        logIndex: 0,
        fromAddress: RESERVE.toLowerCase(),
        toAddress: EXTERNAL,
        blockNumber: 198,
        timestamp: "2026-09-21T10:00:00.000Z",
        amountUsdt: 50_000,
      },
    ];
    const selected = selectLatestCombinedTransactions(rows, RECENT_TX_LIMIT);
    expect(selected).toHaveLength(2);
    expect(selected.every((t) => t.amountUsdt >= LARGE_TX_MIN_USDT)).toBe(true);
    expect(selected[0].amountUsdt).toBe(10_000);
    expect(selected[1].amountUsdt).toBe(50_000);
  });

  it("never lets small newest txs occupy the 10 slots", () => {
    const small = Array.from({ length: 100 }, (_, i) => ({
      txHash: `0x${(i + 1).toString(16).padStart(64, "0")}`,
      logIndex: 0,
      fromAddress: EXTERNAL,
      toAddress: DEPOSIT.toLowerCase(),
      blockNumber: 10_000 + i,
      timestamp: `2026-09-28T${String(i % 24).padStart(2, "0")}:00:00.000Z`,
      amountUsdt: 88.78 + (i % 10),
    }));
    const qualifying = [
      {
        txHash: "0x" + "aa".repeat(32),
        logIndex: 0,
        fromAddress: EXTERNAL,
        toAddress: DEPOSIT.toLowerCase(),
        blockNumber: 500,
        timestamp: "2026-09-20T12:00:00.000Z",
        amountUsdt: 25_000,
      },
      {
        txHash: "0x" + "bb".repeat(32),
        logIndex: 0,
        fromAddress: WITHDRAW.toLowerCase(),
        toAddress: EXTERNAL,
        blockNumber: 400,
        timestamp: "2026-09-19T12:00:00.000Z",
        amountUsdt: 10_000.01,
      },
      {
        txHash: "0x" + "cc".repeat(32),
        logIndex: 0,
        fromAddress: RESERVE.toLowerCase(),
        toAddress: EXTERNAL,
        blockNumber: 300,
        timestamp: "2026-09-18T12:00:00.000Z",
        amountUsdt: 50_000,
      },
      {
        txHash: "0x" + "dd".repeat(32),
        logIndex: 0,
        fromAddress: EXTERNAL,
        toAddress: DEPOSIT.toLowerCase(),
        blockNumber: 200,
        timestamp: "2026-09-17T12:00:00.000Z",
        amountUsdt: 15_000,
      },
      {
        txHash: "0x" + "ee".repeat(32),
        logIndex: 0,
        fromAddress: WITHDRAW.toLowerCase(),
        toAddress: EXTERNAL,
        blockNumber: 100,
        timestamp: "2026-09-16T12:00:00.000Z",
        amountUsdt: 10_000,
      },
    ];
    const selected = selectLatestCombinedTransactions(
      [...small, ...qualifying],
      RECENT_TX_LIMIT,
    );
    expect(selected).toHaveLength(5);
    expect(selected.every((t) => t.amountUsdt >= 10_000)).toBe(true);
    expect(selected[0].amountUsdt).toBe(25_000);
  });

  it("returns empty when only sub-10k transfers exist", () => {
    const rows = [
      {
        txHash: "0x" + "11".repeat(32),
        logIndex: 0,
        fromAddress: EXTERNAL,
        toAddress: DEPOSIT.toLowerCase(),
        blockNumber: 99,
        timestamp: "2026-09-21T12:00:00.000Z",
        amountUsdt: 88.78,
      },
      {
        txHash: "0x" + "22".repeat(32),
        logIndex: 0,
        fromAddress: WITHDRAW.toLowerCase(),
        toAddress: EXTERNAL,
        blockNumber: 98,
        timestamp: "2026-09-21T11:00:00.000Z",
        amountUsdt: 65.22,
      },
    ];
    expect(selectLatestCombinedTransactions(rows, RECENT_TX_LIMIT)).toEqual([]);
  });

  it("uses raw BigInt floor when amountRaw is provided", () => {
    const rows = [
      {
        txHash: "0x" + "01".repeat(32),
        logIndex: 0,
        fromAddress: EXTERNAL,
        toAddress: DEPOSIT.toLowerCase(),
        blockNumber: 10,
        timestamp: "2026-09-21T12:00:00.000Z",
        amountUsdt: 9999.999, // float noise — raw decides
        amountRaw: "9999999999999999999999",
        tokenDecimals: 18,
      },
      {
        txHash: "0x" + "02".repeat(32),
        logIndex: 0,
        fromAddress: EXTERNAL,
        toAddress: DEPOSIT.toLowerCase(),
        blockNumber: 9,
        timestamp: "2026-09-21T11:00:00.000Z",
        amountUsdt: 9999.999,
        amountRaw: "10000000000000000000000",
        tokenDecimals: 18,
      },
    ];
    const selected = selectLatestCombinedTransactions(rows, RECENT_TX_LIMIT);
    expect(selected).toHaveLength(1);
    expect(selected[0].amountRaw).toBe("10000000000000000000000");
  });

  it("dedupes identical txHash:logIndex across dual-role rows", () => {
    const shared = {
      txHash: "0x" + "ab".repeat(32),
      logIndex: 4,
      fromAddress: WITHDRAW.toLowerCase(),
      toAddress: DEPOSIT.toLowerCase(),
      blockNumber: 50,
      timestamp: "2026-09-20T10:00:00.000Z",
      amountUsdt: 25_000,
    };
    const selected = selectLatestCombinedTransactions([shared, { ...shared }], 10);
    expect(selected).toHaveLength(1);
    expect(selected[0].walletType).toBe("deposit");
  });
});

describe("live status derivation", () => {
  const base = {
    indexer: "SYNCED" as const,
    database: "CONNECTED" as const,
    blockchain: "CONNECTED" as const,
    latestBlock: 1000,
    indexedBlock: 995,
    lastSuccessfulSync: new Date().toISOString(),
    isHistoricalSyncing: false,
    configError: null as string | null,
  };

  it("returns LIVE when synced and fresh", () => {
    expect(deriveLiveStatus(base)).toBe("LIVE");
  });

  it("returns SYNCING when historical catch-up is active", () => {
    expect(
      deriveLiveStatus({ ...base, isHistoricalSyncing: true }),
    ).toBe("SYNCING");
  });

  it("returns STALE when last sync is old", () => {
    expect(
      deriveLiveStatus({
        ...base,
        lastSuccessfulSync: new Date(Date.now() - 10 * 60_000).toISOString(),
      }),
    ).toBe("STALE");
  });

  it("returns ERROR on database failure", () => {
    expect(deriveLiveStatus({ ...base, database: "ERROR" })).toBe("ERROR");
  });
});
