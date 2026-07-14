import { describe, expect, it } from "vitest";
import { parseCidr } from "../src/cidr";
import { createWorkspace, joinLeaves, planAllocations, splitLeaf } from "../src/model";
import { decodeShareState, encodeShareState, parseWorkspaceJson, stringifyWorkspace } from "../src/persistence";
import { customProfile } from "../src/profiles";
import { keyOf } from "../src/cidr";

describe("versioned persistence", () => {
  it("round-trips allocations and Unicode labels through JSON and share encoding", () => {
    const initial = createWorkspace(parseCidr("10.0.0.0/24"));
    const planned = planAllocations(initial, [{ label: "München – 数据", prefix: 26, count: 2 }], "closest").state!;
    expect(parseWorkspaceJson(stringifyWorkspace(planned))).toEqual(planned);
    expect(decodeShareState(encodeShareState(planned))).toEqual(planned);
  });

  it("rejects legacy, overlapping, oversized and dangling state", () => {
    expect(() => parseWorkspaceJson(JSON.stringify({ envelope: "10.0.0.0/24" }))).toThrow();
    const valid = createWorkspace(parseCidr("10.0.0.0/24"));
    const overlap = structuredClone(valid);
    overlap.leaves.push({ ...overlap.leaves[0]! });
    expect(() => parseWorkspaceJson(stringifyWorkspace(overlap))).toThrow(/overlap|coverage/i);
    const dangling = structuredClone(valid);
    dangling.leaves[0]!.allocationGroupId = "missing";
    expect(() => parseWorkspaceJson(stringifyWorkspace(dangling))).toThrow(/unknown allocation group/i);
  });

  it("keeps hostile labels as inert JSON strings", () => {
    const initial = createWorkspace(parseCidr("10.0.0.0/24"));
    const label = '<img src=x onerror="globalThis.pwned=true">';
    const planned = planAllocations(initial, [{ label, prefix: 26, count: 1 }], "closest").state!;
    expect(parseWorkspaceJson(stringifyWorkspace(planned)).groups[0]?.label).toBe(label);
  });

  it("round-trips custom reservations, colours and an irregular partial-join tree", () => {
    const root = createWorkspace(parseCidr("10.0.0.0/24"), customProfile(2, 2));
    const quarters = splitLeaf(root, keyOf(root.envelope), 26).state!;
    const irregular = joinLeaves(quarters, quarters.leaves.slice(0, 2).map(keyOf)).state!;
    const planned = planAllocations(irregular, [{ label: "Zürich 数据", prefix: 27, count: 1, requestedHosts: 20 }], "closest").state!;
    expect(decodeShareState(encodeShareState(planned))).toEqual(planned);
  });

  it("rejects malformed JSON, oversized workspaces and forged provider rules", () => {
    expect(() => parseWorkspaceJson("{not json")).toThrow("not valid JSON");
    const valid = createWorkspace(parseCidr("10.0.0.0/24"));
    const oversized = structuredClone(valid);
    oversized.leaves = Array.from({ length: 2049 }, () => ({ ...valid.leaves[0]! }));
    expect(() => parseWorkspaceJson(stringifyWorkspace(oversized))).toThrow(/2048|too big/i);
    const forged = structuredClone(valid);
    forged.profile = { ...forged.profile, id: "aws", minPrefixLength: 0, maxPrefixLength: 32 };
    expect(() => parseWorkspaceJson(stringifyWorkspace(forged))).toThrow(/AWS profile rules/i);
  });
});
