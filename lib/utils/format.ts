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
