import {
  blockSize,
  canonicalNetwork,
  contains,
  endAddress,
  formatCidr,
  isAligned,
  keyOf,
  usableCount,
} from "./cidr";
import { profileFor, validateCidrForProfile, validateProfileSelection } from "./profiles";
import type {
  AllocationGroup,
  Cidr,
  OperationResult,
  JoinCandidate,
  PlanHeuristic,
  PlanRequest,
  ProfileSelection,
  SubnetLeaf,
  WorkspaceState,
} from "./types";
import { MAX_LEAVES } from "./types";

export function cloneState(state: WorkspaceState): WorkspaceState {
  return structuredClone(state);
}

export function createWorkspace(envelope: Cidr, profile: ProfileSelection = profileFor("none")): WorkspaceState {
  const profileDefinitionError = validateProfileSelection(profile);
  if (profileDefinitionError) throw new Error(profileDefinitionError);
  const error = validateCidrForProfile(envelope, profile);
  if (error) throw new Error(error);
  return {
    schemaVersion: 1,
    envelope: { ...envelope },
    profile: { ...profile },
    leaves: [{ ...envelope }],
    groups: [],
    preferences: { theme: "dark", labelDensity: "normal", compact: false, animation: "normal" },
  };
}

export function sortLeaves(leaves: SubnetLeaf[]): SubnetLeaf[] {
  return leaves.sort((a, b) => a.network - b.network || a.prefix - b.prefix);
}

export function validateWorkspace(state: WorkspaceState): string[] {
  const errors: string[] = [];
  const profileDefinitionError = validateProfileSelection(state.profile);
  if (profileDefinitionError) errors.push(profileDefinitionError);
  if (state.leaves.length === 0) errors.push("Workspace must contain at least one leaf");
  if (state.leaves.length > MAX_LEAVES) errors.push(`Workspace exceeds the ${MAX_LEAVES}-leaf limit`);
  if (!isAligned(state.envelope)) errors.push("Envelope is not aligned to its prefix");
  const groupIds = new Set(state.groups.map((group) => group.id));
  if (groupIds.size !== state.groups.length) errors.push("Allocation group IDs must be unique");
  const leaves = sortLeaves(state.leaves.map((leaf) => ({ ...leaf })));
  let cursor = state.envelope.network;
  const envelopeEnd = endAddress(state.envelope) + 1;
  for (const leaf of leaves) {
    if (!isAligned(leaf)) errors.push(`${formatCidr(leaf)} is not aligned`);
    if (!contains(state.envelope, leaf)) errors.push(`${formatCidr(leaf)} is outside the envelope`);
    const profileError = validateCidrForProfile(leaf, state.profile);
    if (profileError) errors.push(profileError);
    if (leaf.network !== cursor) {
      errors.push(leaf.network < cursor ? `${formatCidr(leaf)} overlaps another leaf` : `Gap before ${formatCidr(leaf)}`);
    }
    cursor = Math.max(cursor, endAddress(leaf) + 1);
    if (leaf.allocationGroupId && !groupIds.has(leaf.allocationGroupId)) {
      errors.push(`${formatCidr(leaf)} references an unknown allocation group`);
    }
  }
  if (cursor !== envelopeEnd) errors.push("Leaves do not cover the complete envelope");
  return [...new Set(errors)];
}

function result(state: WorkspaceState): OperationResult {
  const errors = validateWorkspace(state);
  return errors.length > 0 ? { ok: false, error: errors.join("\n") } : { ok: true, state };
}

export function splitLeaf(state: WorkspaceState, leafKey: string, targetPrefix: number): OperationResult {
  const index = state.leaves.findIndex((leaf) => keyOf(leaf) === leafKey);
  const leaf = state.leaves[index];
  if (!leaf) return { ok: false, error: "The selected subnet no longer exists" };
  if (leaf.allocationGroupId) return { ok: false, error: "Deallocate this subnet before splitting it" };
  if (!Number.isInteger(targetPrefix) || targetPrefix <= leaf.prefix || targetPrefix > 32) {
    return { ok: false, error: `Choose a prefix from /${leaf.prefix + 1} to /32` };
  }
  const profileError = validateCidrForProfile({ network: leaf.network, prefix: targetPrefix }, state.profile);
  if (profileError) return { ok: false, error: profileError };
  const count = 2 ** (targetPrefix - leaf.prefix);
  const projected = state.leaves.length - 1 + count;
  if (projected > MAX_LEAVES) return { ok: false, error: `This split would create ${projected} leaves; the limit is ${MAX_LEAVES}` };
  const size = blockSize(targetPrefix);
  const children = Array.from({ length: count }, (_, childIndex) => ({
    network: leaf.network + childIndex * size,
    prefix: targetPrefix,
  }));
  const next = cloneState(state);
  next.leaves.splice(index, 1, ...children);
  sortLeaves(next.leaves);
  return result(next);
}

export function joinLeaves(state: WorkspaceState, selectedKeys: string[]): OperationResult {
  const selected = state.leaves.filter((leaf) => selectedKeys.includes(keyOf(leaf)));
  if (selected.length !== selectedKeys.length || selected.length < 2) {
    return { ok: false, error: "Select at least two existing subnets" };
  }
  if (selected.some((leaf) => leaf.allocationGroupId)) {
    return { ok: false, error: "Deallocate selected subnets before joining them" };
  }
  const prefix = selected[0]?.prefix;
  if (prefix === undefined || selected.some((leaf) => leaf.prefix !== prefix)) {
    return { ok: false, error: "Selected subnets must have the same prefix" };
  }
  const count = selected.length;
  if ((count & (count - 1)) !== 0) return { ok: false, error: "The number selected must be a power of two" };
  selected.sort((a, b) => a.network - b.network);
  const size = blockSize(prefix);
  for (let index = 1; index < selected.length; index += 1) {
    if (selected[index]?.network !== selected[0]!.network + index * size) {
      return { ok: false, error: "Selected subnets must be contiguous" };
    }
  }
  const aggregatePrefix = prefix - Math.log2(count);
  const aggregate: Cidr = { network: selected[0]!.network, prefix: aggregatePrefix };
  if (aggregatePrefix < state.envelope.prefix || canonicalNetwork(aggregate.network, aggregatePrefix) !== aggregate.network) {
    return { ok: false, error: "The selected range is not aligned to a valid supernet" };
  }
  const profileError = validateCidrForProfile(aggregate, state.profile);
  if (profileError) return { ok: false, error: profileError };
  const keys = new Set(selectedKeys);
  const next = cloneState(state);
  next.leaves = next.leaves.filter((leaf) => !keys.has(keyOf(leaf)));
  next.leaves.push(aggregate);
  sortLeaves(next.leaves);
  return result(next);
}

export function deallocateLeaf(state: WorkspaceState, leafKey: string): OperationResult {
  const next = cloneState(state);
  const leaf = next.leaves.find((candidate) => keyOf(candidate) === leafKey);
  if (!leaf?.allocationGroupId) return { ok: false, error: "This subnet is not allocated" };
  const groupId = leaf.allocationGroupId;
  delete leaf.allocationGroupId;
  if (!next.leaves.some((candidate) => candidate.allocationGroupId === groupId)) {
    next.groups = next.groups.filter((group) => group.id !== groupId);
  }
  return result(next);
}

export function changeProfile(state: WorkspaceState, profile: ProfileSelection): OperationResult {
  const profileDefinitionError = validateProfileSelection(profile);
  if (profileDefinitionError) return { ok: false, error: profileDefinitionError };
  const candidates = [state.envelope, ...state.leaves];
  const incompatible = candidates
    .map((cidr) => validateCidrForProfile(cidr, profile))
    .filter((message): message is string => message !== null);
  if (incompatible.length > 0) return { ok: false, error: [...new Set(incompatible)].join("\n") };
  const next = cloneState(state);
  next.profile = { ...profile };
  return result(next);
}

export function prefixForHosts(hosts: number, profile: ProfileSelection): number | null {
  if (!Number.isInteger(hosts) || hosts < 1) return null;
  for (let prefix = profile.maxPrefixLength; prefix >= profile.minPrefixLength; prefix -= 1) {
    if (usableCount(prefix, profile) >= hosts) return prefix;
  }
  return null;
}

export function colorForGroup(seed: string): string {
  const palette = ["#2563eb", "#7c3aed", "#c026d3", "#db2777", "#dc2626", "#c2410c", "#047857", "#0f766e", "#0369a1", "#4f46e5"];
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return palette[Math.abs(hash) % palette.length] ?? palette[0]!;
}

function nextGroupId(state: WorkspaceState, label: string): string {
  let serial = state.groups.length + 1;
  let id = `group-${serial}-${Math.abs(label.length * 2654435761).toString(36)}`;
  const existing = new Set(state.groups.map((group) => group.id));
  while (existing.has(id)) {
    serial += 1;
    id = `group-${serial}-${Math.abs(label.length * 2654435761).toString(36)}`;
  }
  return id;
}

export function allocateLeaf(
  state: WorkspaceState,
  leafKey: string,
  label: string,
  requestedHosts?: number,
  existingGroupId?: string,
): OperationResult {
  const next = cloneState(state);
  const leaf = next.leaves.find((candidate) => keyOf(candidate) === leafKey);
  if (!leaf) return { ok: false, error: "The selected subnet no longer exists" };
  if (leaf.allocationGroupId) return { ok: false, error: "This subnet is already allocated" };
  const cleanLabel = label.trim();
  if (!existingGroupId && (cleanLabel.length < 1 || cleanLabel.length > 120)) {
    return { ok: false, error: "Enter an allocation label from 1 to 120 characters" };
  }
  if (requestedHosts !== undefined) {
    if (!Number.isInteger(requestedHosts) || requestedHosts < 1) return { ok: false, error: "Requested hosts must be a positive whole number" };
    const capacity = usableCount(leaf.prefix, next.profile);
    if (requestedHosts > capacity) return { ok: false, error: `${formatCidr(leaf)} supplies ${capacity.toLocaleString()} usable addresses, fewer than requested` };
  }
  let group = existingGroupId ? next.groups.find((candidate) => candidate.id === existingGroupId) : undefined;
  if (existingGroupId && !group) return { ok: false, error: "The selected allocation group no longer exists" };
  if (group && requestedHosts !== undefined) {
    if (group.requestedHosts !== undefined && group.requestedHosts !== requestedHosts) {
      return { ok: false, error: `This group records ${group.requestedHosts.toLocaleString()} requested hosts per subnet; use the same value or leave requested hosts blank` };
    }
    group.requestedHosts = requestedHosts;
  }
  if (!group) {
    const id = nextGroupId(next, cleanLabel);
    group = { id, label: cleanLabel, color: colorForGroup(id), requestedHosts };
    next.groups.push(group);
  }
  leaf.allocationGroupId = group.id;
  return result(next);
}

export function siblingKey(state: WorkspaceState, leafKey: string): string | null {
  const leaf = state.leaves.find((candidate) => keyOf(candidate) === leafKey);
  if (!leaf || leaf.prefix <= state.envelope.prefix) return null;
  const buddy = leaf.network ^ blockSize(leaf.prefix);
  const sibling = state.leaves.find((candidate) => candidate.network === buddy && candidate.prefix === leaf.prefix);
  return sibling ? keyOf(sibling) : null;
}

export function discoverJoinCandidates(state: WorkspaceState, anchorKey: string): { candidates: JoinCandidate[]; reason?: string } {
  const anchor = state.leaves.find((leaf) => keyOf(leaf) === anchorKey);
  if (!anchor) return { candidates: [], reason: "The selected subnet no longer exists" };
  if (anchor.allocationGroupId) return { candidates: [], reason: "Deallocate this subnet before joining it" };
  const candidates: JoinCandidate[] = [];
  for (let aggregatePrefix = anchor.prefix - 1; aggregatePrefix >= state.envelope.prefix; aggregatePrefix -= 1) {
    const count = 2 ** (anchor.prefix - aggregatePrefix);
    const network = canonicalNetwork(anchor.network, aggregatePrefix);
    const expected = Array.from({ length: count }, (_, index) => `${network + index * blockSize(anchor.prefix)}/${anchor.prefix}`);
    const leaves = expected.map((key) => state.leaves.find((leaf) => keyOf(leaf) === key));
    if (leaves.some((leaf) => !leaf)) continue;
    if (leaves.some((leaf) => leaf?.allocationGroupId)) continue;
    const cidr = { network, prefix: aggregatePrefix };
    if (validateCidrForProfile(cidr, state.profile)) continue;
    candidates.push({ cidr, leafKeys: expected, removedBoundaryBits: anchor.prefix - aggregatePrefix });
  }
  if (candidates.length > 0) return { candidates };
  const buddyNetwork = anchor.network ^ blockSize(anchor.prefix);
  const covering = state.leaves.find((leaf) => buddyNetwork >= leaf.network && buddyNetwork <= endAddress(leaf));
  if (covering?.allocationGroupId) return { candidates: [], reason: "The sibling space is allocated" };
  if (covering && covering.prefix !== anchor.prefix) return { candidates: [], reason: "The sibling space has a different prefix" };
  return { candidates: [], reason: "A complete aligned sibling group is not available" };
}

function candidateIndex(leaves: SubnetLeaf[], prefix: number, heuristic: PlanHeuristic): number {
  const candidates = leaves
    .map((leaf, index) => ({ leaf, index }))
    .filter(({ leaf }) => !leaf.allocationGroupId && leaf.prefix <= prefix);
  candidates.sort((a, b) => {
    if (heuristic === "left") return a.leaf.network - b.leaf.network;
    if (heuristic === "largest") return a.leaf.prefix - b.leaf.prefix || a.leaf.network - b.leaf.network;
    return b.leaf.prefix - a.leaf.prefix || a.leaf.network - b.leaf.network;
  });
  return candidates[0]?.index ?? -1;
}

function allocateOne(state: WorkspaceState, request: PlanRequest, group: AllocationGroup, heuristic: PlanHeuristic): string | null {
  const index = candidateIndex(state.leaves, request.prefix, heuristic);
  const candidate = state.leaves[index];
  if (!candidate) return `Unable to allocate /${request.prefix}; insufficient contiguous space`;
  state.leaves.splice(index, 1);
  let current = { ...candidate };
  while (current.prefix < request.prefix) {
    const childPrefix = current.prefix + 1;
    const childSize = blockSize(childPrefix);
    state.leaves.push({ network: current.network + childSize, prefix: childPrefix });
    current = { network: current.network, prefix: childPrefix };
  }
  current.allocationGroupId = group.id;
  state.leaves.push(current);
  sortLeaves(state.leaves);
  return null;
}

export function planAllocations(state: WorkspaceState, requests: PlanRequest[], heuristic: PlanHeuristic): OperationResult {
  if (requests.length === 0) return { ok: false, error: "Add at least one allocation request" };
  const next = cloneState(state);
  const expanded = requests.flatMap((request) => Array.from({ length: request.count }, () => request));
  expanded.sort((a, b) => a.prefix - b.prefix);
  for (const request of expanded) {
    const probe: Cidr = { network: state.envelope.network, prefix: request.prefix };
    const profileError = validateCidrForProfile(probe, state.profile);
    if (profileError) return { ok: false, error: profileError };
  }
  const groupsByLabel = new Map<string, AllocationGroup>();
  for (const request of expanded) {
    const label = request.label || `/${request.prefix} allocation`;
    let group = groupsByLabel.get(label);
    if (!group) {
      const id = `group-${next.groups.length + groupsByLabel.size + 1}-${Math.abs(label.length * 2654435761).toString(36)}`;
      group = { id, label, color: colorForGroup(id), requestedHosts: request.requestedHosts };
      groupsByLabel.set(label, group);
      next.groups.push(group);
    }
    const error = allocateOne(next, request, group, heuristic);
    if (error) return { ok: false, error };
    if (next.leaves.length > MAX_LEAVES) return { ok: false, error: `Plan exceeds the ${MAX_LEAVES}-leaf limit` };
  }
  return result(next);
}

export function resetWorkspace(state: WorkspaceState): WorkspaceState {
  const next = cloneState(state);
  next.leaves = [{ ...next.envelope }];
  next.groups = [];
  return next;
}
