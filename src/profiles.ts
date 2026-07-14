import type { ProfileSelection, ProviderProfileId } from "./types";
import { blockSize, formatCidr } from "./cidr";
import type { Cidr } from "./types";

const PRESETS: Record<Exclude<ProviderProfileId, "custom">, ProfileSelection> = {
  none: { id: "none", reservedHead: 0, reservedTail: 0, minPrefixLength: 0, maxPrefixLength: 32 },
  azure: { id: "azure", reservedHead: 4, reservedTail: 1, minPrefixLength: 2, maxPrefixLength: 29 },
  aws: { id: "aws", reservedHead: 4, reservedTail: 1, minPrefixLength: 16, maxPrefixLength: 28 },
  gcp: { id: "gcp", reservedHead: 2, reservedTail: 2, minPrefixLength: 4, maxPrefixLength: 29 },
};

export function profileFor(id: Exclude<ProviderProfileId, "custom">): ProfileSelection {
  return { ...PRESETS[id] };
}

export function customProfile(head: number, tail: number): ProfileSelection {
  if (!Number.isInteger(head) || !Number.isInteger(tail) || head < 0 || tail < 0 || head + tail > 65536) {
    throw new Error("Custom reservations must be non-negative integers totalling no more than 65,536");
  }
  return { id: "custom", reservedHead: head, reservedTail: tail, minPrefixLength: 0, maxPrefixLength: 32 };
}

export function profileLabel(profile: ProfileSelection): string {
  const names: Record<ProviderProfileId, string> = {
    none: "No cloud reservations",
    azure: "Azure",
    aws: "AWS",
    gcp: "GCP",
    custom: "Custom",
  };
  return `${names[profile.id]} (${profile.reservedHead} + ${profile.reservedTail})`;
}

export function validateProfileSelection(profile: ProfileSelection): string | null {
  if (!Number.isInteger(profile.reservedHead) || !Number.isInteger(profile.reservedTail)
    || profile.reservedHead < 0 || profile.reservedTail < 0
    || profile.reservedHead + profile.reservedTail > 65536) {
    return "Profile reservations must be non-negative integers totalling no more than 65,536";
  }
  if (profile.id === "custom") {
    return profile.minPrefixLength === 0 && profile.maxPrefixLength === 32
      ? null
      : "Custom profiles must support prefix lengths /0–/32";
  }
  const expected = PRESETS[profile.id];
  return profile.reservedHead === expected.reservedHead
    && profile.reservedTail === expected.reservedTail
    && profile.minPrefixLength === expected.minPrefixLength
    && profile.maxPrefixLength === expected.maxPrefixLength
    ? null
    : `${profile.id.toUpperCase()} profile rules do not match the supported preset`;
}

export function validateCidrForProfile(cidr: Cidr, profile: ProfileSelection): string | null {
  if (cidr.prefix < profile.minPrefixLength || cidr.prefix > profile.maxPrefixLength) {
    return `${formatCidr(cidr)} is outside ${profileLabel(profile)} prefix limits /${profile.minPrefixLength}–/${profile.maxPrefixLength}`;
  }
  if (blockSize(cidr.prefix) <= profile.reservedHead + profile.reservedTail) {
    return `${formatCidr(cidr)} has no usable addresses under ${profileLabel(profile)}`;
  }
  return null;
}
