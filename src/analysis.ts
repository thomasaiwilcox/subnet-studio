import { blockSize, endAddress, usableCount } from "./cidr";
import type { WorkspaceAnalysis, WorkspaceState } from "./types";

export function analyseWorkspace(state: WorkspaceState): WorkspaceAnalysis {
  const totals = new Map<string, { addresses: number; usable: number; subnetCount: number }>();
  let allocatedAddresses = 0;
  let usableAddresses = 0;
  let reservedAddresses = 0;
  let providerOverhead = 0;
  let largestAvailable = undefined as WorkspaceAnalysis["largestAvailable"];
  let freeRegionCount = 0;
  let previousFreeEnd: number | null = null;

  for (const leaf of state.leaves) {
    const total = blockSize(leaf.prefix);
    const usable = usableCount(leaf.prefix, state.profile);
    usableAddresses += usable;
    reservedAddresses += total - usable;
    if (state.profile.reservedHead + state.profile.reservedTail > 0) {
      providerOverhead += Math.min(total, state.profile.reservedHead + state.profile.reservedTail);
    }
    if (leaf.allocationGroupId) {
      allocatedAddresses += total;
      const current = totals.get(leaf.allocationGroupId) ?? { addresses: 0, usable: 0, subnetCount: 0 };
      current.addresses += total;
      current.usable += usable;
      current.subnetCount += 1;
      totals.set(leaf.allocationGroupId, current);
      previousFreeEnd = null;
    } else {
      if (!largestAvailable || leaf.prefix < largestAvailable.prefix) largestAvailable = { network: leaf.network, prefix: leaf.prefix };
      if (previousFreeEnd === null || leaf.network !== previousFreeEnd + 1) freeRegionCount += 1;
      previousFreeEnd = endAddress(leaf);
    }
  }

  let measuredWaste = 0;
  let unknownRequestAllocations = 0;
  const breakdown = state.groups.map((group) => {
    const total = totals.get(group.id) ?? { addresses: 0, usable: 0, subnetCount: 0 };
    const requestedTotal = group.requestedHosts === undefined ? undefined : group.requestedHosts * total.subnetCount;
    const waste = requestedTotal === undefined ? undefined : Math.max(0, total.usable - requestedTotal);
    if (waste === undefined && total.subnetCount > 0) unknownRequestAllocations += total.subnetCount;
    else measuredWaste += waste ?? 0;
    return {
      groupId: group.id,
      label: group.label,
      color: group.color,
      addresses: total.addresses,
      usable: total.usable,
      requestedHosts: group.requestedHosts,
      measuredWaste: waste,
      subnetCount: total.subnetCount,
    };
  });
  const totalAddresses = blockSize(state.envelope.prefix);
  return {
    totalAddresses,
    allocatedAddresses,
    freeAddresses: totalAddresses - allocatedAddresses,
    usableAddresses,
    reservedAddresses,
    providerOverhead,
    allocationPercentage: totalAddresses === 0 ? 0 : allocatedAddresses / totalAddresses * 100,
    measuredWaste,
    unknownRequestAllocations,
    largestAvailable,
    freeRegionCount,
    groups: breakdown,
  };
}
