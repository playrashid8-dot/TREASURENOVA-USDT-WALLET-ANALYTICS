import { getAddress, isAddress } from "ethers";

/** Normalize address to lowercase for comparisons and DB keys. */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** Return checksum address when valid; otherwise original trimmed string. */
export function toChecksumAddress(address: string): string {
  const trimmed = address.trim();
  if (!isAddress(trimmed)) return trimmed;
  return getAddress(trimmed);
}

export function isValidAddress(address: string): boolean {
  try {
    return isAddress(address.trim());
  } catch {
    return false;
  }
}

export function shortAddress(address: string, chars = 4): string {
  const a = address.trim();
  if (a.length < chars * 2 + 2) return a;
  return `${a.slice(0, 2 + chars)}…${a.slice(-chars)}`;
}

export function addressesEqual(a: string, b: string): boolean {
  return normalizeAddress(a) === normalizeAddress(b);
}
