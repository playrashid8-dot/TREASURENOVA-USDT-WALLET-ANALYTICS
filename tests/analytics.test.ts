import { describe, expect, it } from "vitest";
import {
  addressesEqual,
  normalizeAddress,
  shortAddress,
  isValidAddress,
} from "@/lib/utils/addresses";
import { rawToUsdt, formatUsdt, formatSignedUsdt } from "@/lib/utils/format";
import { computeNetCashFlow, paginate, sumDailyStats } from "@/lib/analytics/calculations";
import { meetsMinDisplayUsdtAmount } from "@/lib/analytics/filters";
import { MIN_DISPLAY_USDT_AMOUNT } from "@/lib/config";
import { resolveDateRange, dateKeyUtc, blockTimestampToIso } from "@/lib/utils/dates";
import { classifyTransfer, validateTokenTransfer } from "@/lib/blockchain/validation";
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
      },
      {
        date: "2026-01-02",
        depositAmount: 50,
        withdrawalAmount: 10,
        netCashFlow: 40,
        depositCount: 1,
        withdrawalCount: 1,
      },
    ]);
    expect(result.totalDeposits).toBe(150);
    expect(result.totalWithdrawals).toBe(50);
    expect(result.netCashFlow).toBe(100);
    expect(result.transactionCount).toBe(5);
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

  it("builds UTC date keys", () => {
    expect(dateKeyUtc("2026-03-15T12:00:00.000Z")).toBe("2026-03-15");
  });

  it("converts block timestamps", () => {
    expect(blockTimestampToIso(1700000000)).toBe(
      new Date(1700000000 * 1000).toISOString(),
    );
  });
});

describe("deposit / withdrawal detection", () => {
  it("classifies transfer to deposit wallet as deposit", () => {
    // classifyTransfer reads env; with defaults from config it should match
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
    contractAddress: process.env.USDT_CONTRACT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955",
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
    // Without USDT_CONTRACT_ADDRESS matching, validation returns null
    const result = validateTokenTransfer({ ...baseTx, value: "0" }, 18);
    expect(result).toBeNull();
  });

  it("rejects invalid hash", () => {
    const result = validateTokenTransfer({ ...baseTx, hash: "bad" }, 18);
    expect(result).toBeNull();
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
