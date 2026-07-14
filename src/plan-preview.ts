import { blockSize, keyOf, usableCount } from "./cidr";
import { analyseWorkspace } from "./analysis";
import { planAllocations } from "./model";
import type { PlanHeuristic, PlanPreview, PlanRequest, WorkspaceState } from "./types";

const HEURISTIC_LABELS: Record<PlanHeuristic, string> = {
  closest: "Closest fit",
  left: "Lowest address first",
  largest: "Largest space first",
};

export function createPlanPreview(state: WorkspaceState, requests: PlanRequest[], heuristic: PlanHeuristic): PlanPreview {
  const outcome = planAllocations(state, requests, heuristic);
  const facts = requests.map((request) => {
    const suppliedUsable = usableCount(request.prefix, state.profile);
    const requestedHosts = request.requestedHosts;
    return {
      label: request.label || `/${request.prefix} allocation`,
      requestedHosts,
      suppliedUsable,
      prefix: request.prefix,
      reservationOverhead: blockSize(request.prefix) - suppliedUsable,
      unusedUsable: requestedHosts === undefined ? undefined : Math.max(0, suppliedUsable - requestedHosts),
    };
  });
  if (!outcome.ok || !outcome.state) return { ok: false, error: outcome.error, requests, heuristic, facts, steps: [], proposedLeafKeys: [] };
  const finalState = outcome.state;
  const prior = new Map(state.leaves.map((leaf) => [keyOf(leaf), leaf.allocationGroupId]));
  const proposedLeafKeys = finalState.leaves
    .filter((leaf) => leaf.allocationGroupId && prior.get(keyOf(leaf)) !== leaf.allocationGroupId)
    .map(keyOf);
  const analysis = analyseWorkspace(finalState);
  const ordered = [...requests].sort((a, b) => a.prefix - b.prefix);
  const steps = [
    { title: "Read the requirements", explanation: `${requests.length} requirement${requests.length === 1 ? "" : "s"} parsed into ${requests.reduce((sum, item) => sum + item.count, 0)} subnet allocation${requests.reduce((sum, item) => sum + item.count, 0) === 1 ? "" : "s"}.`, state, highlightGroupIds: [] },
    { title: "Account for reservations", explanation: `${state.profile.reservedHead + state.profile.reservedTail} address${state.profile.reservedHead + state.profile.reservedTail === 1 ? " is" : "es are"} reserved in each subnet by the selected profile.`, state, highlightGroupIds: [] },
    { title: "Choose the smallest prefixes", explanation: facts.map((fact) => `${fact.label}: /${fact.prefix} supplies ${fact.suppliedUsable.toLocaleString()} usable`).join(" · "), state, highlightGroupIds: [] },
    { title: "Place largest first", explanation: ordered.map((request) => `${request.label || "Allocation"} /${request.prefix}`).join(" → "), state, highlightGroupIds: [] },
    { title: "Place and retain siblings", explanation: `${HEURISTIC_LABELS[heuristic]} placement leaves ${analysis.freeAddresses.toLocaleString()} addresses free, with unused binary siblings retained for later.`, state: finalState, highlightGroupIds: finalState.groups.map((group) => group.id) },
    { title: "Review efficiency", explanation: `${analysis.allocationPercentage.toFixed(1)}% allocated · ${analysis.measuredWaste.toLocaleString()} measured unused usable addresses · ${analysis.freeRegionCount} free region${analysis.freeRegionCount === 1 ? "" : "s"}.`, state: finalState, highlightGroupIds: finalState.groups.map((group) => group.id) },
  ];
  return { ok: true, state: finalState, requests, heuristic, facts, steps, proposedLeafKeys };
}
