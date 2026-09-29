import { formatUnits, parseUnits } from "ethers";

export function formatUsdt(
  amount: number | string | null | undefined,
  decimals = 2,
): string {
  if (amount === null || amount === undefined || amount === "") {
    return "—";
  }
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return "—";

  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }

  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatUsdtExact(
  amount: number | string | null | undefined,
  decimals = 6,
): string {
  if (amount === null || amount === undefined || amount === "") {
    return "—";
  }
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

export function formatSignedUsdt(amount: number, isDeposit: boolean): string {
  const formatted = formatUsdt(Math.abs(amount));
  return isDeposit ? `+ ${formatted} USDT` : `- ${formatted} USDT`;
}

export function rawToUsdt(raw: string, decimals: number): number {
  const formatted = formatUnits(raw, decimals);
  return Number.parseFloat(formatted);
}

export function usdtToRaw(amount: string | number, decimals: number): string {
  return parseUnits(String(amount), decimals).toString();
}

/**
 * Compare a raw token amount to a human USDT floor using BigInt
 * (avoids float errors). `minUsdt` should be a finite non-negative number.
 */
export function rawMeetsMinUsdt(
  amountRaw: string,
  decimals: number,
  minUsdt: number,
): boolean {
  if (!/^\d+$/.test(amountRaw)) return false;
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) return false;
  if (!Number.isFinite(minUsdt) || minUsdt < 0) return false;
  try {
    const minRaw = parseUnits(
      Number.isInteger(minUsdt) ? String(minUsdt) : minUsdt.toFixed(decimals),
      decimals,
    );
    return BigInt(amountRaw) >= minRaw;
  } catch {
    return false;
  }
}

export function formatBlockNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US");
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
