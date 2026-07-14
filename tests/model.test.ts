import { describe, expect, it } from "vitest";
import { parseCidr, keyOf } from "../src/cidr";
import {
  createWorkspace,
  deallocateLeaf,
  joinLeaves,
  planAllocations,
  splitLeaf,
  validateWorkspace,
} from "../src/model";
import { profileFor } from "../src/profiles";

describe("canonical subnet model", () => {
  it("supports a real partial join without losing coverage", () => {
    const initial = createWorkspace(parseCidr("192.168.1.0/24"));
    const split = splitLeaf(initial, keyOf(initial.envelope), 26);
    expect(split.ok).toBe(true);
    const leaves = split.state!.leaves;
    const joined = joinLeaves(split.state!, leaves.slice(0, 2).map(keyOf));
    expect(joined.ok).toBe(true);
    expect(joined.state!.leaves.map(keyOf)).toEqual([
      `${parseCidr("192.168.1.0/25").network}/25`,
      `${parseCidr("192.168.1.128/26").network}/26`,
      `${parseCidr("192.168.1.192/26").network}/26`,
    ]);
    expect(validateWorkspace(joined.state!)).toEqual([]);
  });

  it("rejects misaligned, gapped and mixed-prefix joins", () => {
    const initial = createWorkspace(parseCidr("10.0.0.0/24"));
    const split = splitLeaf(initial, keyOf(initial.envelope), 26).state!;
    expect(joinLeaves(split, [keyOf(split.leaves[1]!), keyOf(split.leaves[2]!)]).ok).toBe(false);
    expect(joinLeaves(split, [keyOf(split.leaves[0]!), keyOf(split.leaves[2]!)]).ok).toBe(false);
    const mixed = splitLeaf(split, keyOf(split.leaves[0]!), 27).state!;
    expect(joinLeaves(mixed, [keyOf(mixed.leaves[0]!), keyOf(mixed.leaves[2]!)]).ok).toBe(false);
  });

  it("blocks splitting and joining allocated leaves until deallocation", () => {
    const initial = createWorkspace(parseCidr("10.0.0.0/24"));
    const planned = planAllocations(initial, [{ label: "Web", prefix: 26, count: 1 }], "closest").state!;
    const allocated = planned.leaves.find((leaf) => leaf.allocationGroupId)!;
    expect(splitLeaf(planned, keyOf(allocated), 27).error).toContain("Deallocate");
    const sibling = planned.leaves.find((leaf) => leaf.prefix === allocated.prefix && !leaf.allocationGroupId)!;
    expect(joinLeaves(planned, [keyOf(allocated), keyOf(sibling)]).error).toContain("Deallocate");
    const deallocated = deallocateLeaf(planned, keyOf(allocated));
    expect(deallocated.ok).toBe(true);
    expect(deallocated.state!.groups).toEqual([]);
  });

  it("allocates atomically and leaves the source untouched on failure", () => {
    const initial = createWorkspace(parseCidr("10.0.0.0/24"));
    const before = structuredClone(initial);
    const failed = planAllocations(initial, [{ label: "Too large", prefix: 23, count: 1 }], "closest");
    expect(failed.ok).toBe(false);
    expect(initial).toEqual(before);

    const success = planAllocations(initial, [
      { label: "Web", prefix: 26, count: 2 },
      { label: "DB", prefix: 27, count: 1, requestedHosts: 20 },
    ], "closest");
    expect(success.ok).toBe(true);
    expect(success.state!.leaves.filter((leaf) => leaf.allocationGroupId)).toHaveLength(3);
    expect(validateWorkspace(success.state!)).toEqual([]);
  });

  it("enforces the total leaf cap", () => {
    const initial = createWorkspace(parseCidr("0.0.0.0/0"), profileFor("none"));
    expect(splitLeaf(initial, keyOf(initial.envelope), 11).state!.leaves).toHaveLength(2048);
    expect(splitLeaf(initial, keyOf(initial.envelope), 12).error).toContain("limit");
  });

  it("honours closest, lowest-address and largest-space placement", () => {
    const root = createWorkspace(parseCidr("10.0.0.0/24"));
    const quarters = splitLeaf(root, keyOf(root.envelope), 26).state!;
    const largeLeft = joinLeaves(quarters, quarters.leaves.slice(0, 2).map(keyOf)).state!;
    const closest = planAllocations(largeLeft, [{ label: "A", prefix: 27, count: 1 }], "closest").state!;
    const left = planAllocations(largeLeft, [{ label: "A", prefix: 27, count: 1 }], "left").state!;
    expect(closest.leaves.find((leaf) => leaf.allocationGroupId)?.network).toBe(parseCidr("10.0.0.128/27").network);
    expect(left.leaves.find((leaf) => leaf.allocationGroupId)?.network).toBe(parseCidr("10.0.0.0/27").network);

    const largeRight = joinLeaves(quarters, quarters.leaves.slice(2, 4).map(keyOf)).state!;
    const largest = planAllocations(largeRight, [{ label: "A", prefix: 27, count: 1 }], "largest").state!;
    expect(largest.leaves.find((leaf) => leaf.allocationGroupId)?.network).toBe(parseCidr("10.0.0.128/27").network);
  });

  it("derives deterministic allocation colours with readable white-text contrast", () => {
    const root = createWorkspace(parseCidr("10.0.0.0/24"));
    const requests = [
      { label: "Web", prefix: 27, count: 1 },
      { label: "Data", prefix: 27, count: 1 },
      { label: "Cache", prefix: 27, count: 1 },
    ];
    const first = planAllocations(root, requests, "closest").state!;
    const second = planAllocations(root, requests, "closest").state!;
    expect(first.groups).toEqual(second.groups);
    for (const group of first.groups) {
      const channels = group.color.slice(1).match(/.{2}/g)!.map((value) => Number.parseInt(value, 16) / 255);
      const luminance = channels
        .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
      expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
