import { describe, expect, it } from "vitest";
import { keyOf, parseCidr } from "../src/cidr";
import { commit, createHistory, jumpToHistoryEntry, redo, undo } from "../src/history";
import { createWorkspace, planAllocations, splitLeaf } from "../src/model";

describe("snapshot history", () => {
  it("preserves the complete future chain across repeated redo", () => {
    const root = createWorkspace(parseCidr("10.0.0.0/24"));
    let history = createHistory(root);
    const first = splitLeaf(history.present.state, keyOf(root.envelope), 25).state!;
    history = commit(history, first, "First split", "split");
    const second = splitLeaf(history.present.state, keyOf(first.leaves[0]!), 26).state!;
    history = commit(history, second, "Second split", "split");
    history = undo(undo(history));
    expect(history.future).toHaveLength(2);
    history = redo(history);
    expect(history.future).toHaveLength(1);
    history = redo(history);
    expect(history.future).toHaveLength(0);
    expect(history.present.state).toEqual(second);
  });

  it("clears future only when a new action is committed", () => {
    const root = createWorkspace(parseCidr("10.0.0.0/24"));
    const split = splitLeaf(root, keyOf(root.envelope), 25).state!;
    let history = undo(commit(createHistory(root), split));
    expect(history.future).toHaveLength(1);
    history = commit(history, splitLeaf(root, keyOf(root.envelope), 26).state!);
    expect(history.future).toHaveLength(0);
  });

  it("caps history at 100 committed domain transactions", () => {
    const root = createWorkspace(parseCidr("10.0.0.0/24"));
    let history = createHistory(root);
    for (let index = 0; index < 105; index += 1) {
      const next = structuredClone(history.present.state);
      next.preferences.compact = index % 2 === 0;
      history = commit(history, next);
    }
    expect(history.past).toHaveLength(100);
  });

  it("treats a complete plan as one exact undo and redo step", () => {
    const root = createWorkspace(parseCidr("10.0.0.0/24"));
    const planned = planAllocations(root, [
      { label: "Web", prefix: 26, count: 2 },
      { label: "Data", prefix: 27, count: 1 },
    ], "closest").state!;
    let history = commit(createHistory(root), planned);
    history = undo(history);
    expect(history.present.state).toEqual(root);
    history = redo(history);
    expect(history.present.state).toEqual(planned);
  });

  it("jumps to a labelled entry while preserving later work as redo", () => {
    const root = createWorkspace(parseCidr("10.0.0.0/24"));
    const split25 = splitLeaf(root, keyOf(root.envelope), 25).state!;
    const split26 = splitLeaf(split25, keyOf(split25.leaves[0]!), 26).state!;
    let history = commit(createHistory(root), split25, "Split to /25", "split");
    const targetId = history.present.id;
    history = commit(history, split26, "Split left to /26", "split");
    history = jumpToHistoryEntry(history, targetId);
    expect(history.present.label).toBe("Split to /25");
    expect(history.present.state).toEqual(split25);
    expect(history.future).toHaveLength(1);
  });
});
