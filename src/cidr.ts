import type { Cidr, ProfileSelection } from "./types";

export const UINT32_SIZE = 2 ** 32;

export function assertPrefix(prefix: number): void {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error("Prefix must be an integer from 0 to 32");
  }
}

export function ipToInt(ip: string): number {
  const octets = ip.split(".");
  if (octets.length !== 4) throw new Error("IPv4 address must contain four octets");
  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) throw new Error("IPv4 octets must be decimal numbers");
    const parsed = Number(octet);
    if (parsed < 0 || parsed > 255) throw new Error("IPv4 octets must be between 0 and 255");
    value = value * 256 + parsed;
  }
  return value;
}

export function intToIp(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_SIZE) {
    throw new Error("IPv4 integer is outside the unsigned 32-bit range");
  }
  return [
    Math.floor(value / 2 ** 24),
    Math.floor(value / 2 ** 16) % 256,
    Math.floor(value / 2 ** 8) % 256,
    value % 256,
  ].join(".");
}

export function blockSize(prefix: number): number {
  assertPrefix(prefix);
  return 2 ** (32 - prefix);
}

export function maskInt(prefix: number): number {
  assertPrefix(prefix);
  if (prefix === 0) return 0;
  return (UINT32_SIZE - blockSize(prefix)) >>> 0;
}

export function canonicalNetwork(address: number, prefix: number): number {
  assertPrefix(prefix);
  if (!Number.isInteger(address) || address < 0 || address >= UINT32_SIZE) {
    throw new Error("IPv4 integer is outside the unsigned 32-bit range");
  }
  const size = blockSize(prefix);
  return Math.floor(address / size) * size;
}

export function parseCidr(input: string): Cidr {
  const match = input.trim().match(/^([^/]+)\/(\d{1,2})$/);
  if (!match?.[1] || !match[2]) throw new Error("Use CIDR notation such as 192.168.1.0/24");
  const address = ipToInt(match[1]);
  const prefix = Number(match[2]);
  assertPrefix(prefix);
  const network = canonicalNetwork(address, prefix);
  if (network !== address) {
    throw new Error(`${intToIp(address)} is not the network address; use ${intToIp(network)}/${prefix}`);
  }
  return { network, prefix };
}

export function formatCidr(cidr: Cidr): string {
  return `${intToIp(cidr.network)}/${cidr.prefix}`;
}

export function endAddress(cidr: Cidr): number {
  return cidr.network + blockSize(cidr.prefix) - 1;
}

export function contains(outer: Cidr, inner: Cidr): boolean {
  return inner.network >= outer.network && endAddress(inner) <= endAddress(outer);
}

export function isAligned(cidr: Cidr): boolean {
  return canonicalNetwork(cidr.network, cidr.prefix) === cidr.network;
}

export function usableCount(prefix: number, profile: ProfileSelection): number {
  const total = blockSize(prefix);
  const reserved = profile.reservedHead + profile.reservedTail;
  if (reserved > 0) return Math.max(0, total - reserved);
  if (prefix === 31) return 2;
  if (prefix === 32) return 1;
  return total - 2;
}

export function subnetDetails(cidr: Cidr, profile: ProfileSelection) {
  const total = blockSize(cidr.prefix);
  const last = endAddress(cidr);
  const reserved = profile.reservedHead + profile.reservedTail;
  let usableStart: number | null;
  let usableEnd: number | null;
  let usable: number;
  if (reserved > 0) {
    usable = Math.max(0, total - reserved);
    usableStart = usable > 0 ? cidr.network + profile.reservedHead : null;
    usableEnd = usable > 0 ? last - profile.reservedTail : null;
  } else if (cidr.prefix === 31) {
    usable = 2;
    usableStart = cidr.network;
    usableEnd = last;
  } else if (cidr.prefix === 32) {
    usable = 1;
    usableStart = cidr.network;
    usableEnd = cidr.network;
  } else {
    usable = total - 2;
    usableStart = cidr.network + 1;
    usableEnd = last - 1;
  }
  return {
    total,
    network: intToIp(cidr.network),
    broadcast: cidr.prefix >= 31 ? null : intToIp(last),
    mask: intToIp(maskInt(cidr.prefix)),
    usable,
    usableStart: usableStart === null ? null : intToIp(usableStart),
    usableEnd: usableEnd === null ? null : intToIp(usableEnd),
  };
}

export function keyOf(cidr: Cidr): string {
  return `${cidr.network}/${cidr.prefix}`;
}
