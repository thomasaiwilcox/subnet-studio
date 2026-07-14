import { parseCidr } from "./cidr";
import { createWorkspace, planAllocations } from "./model";
import { profileFor } from "./profiles";
import type { PlanHeuristic, PlanRequest, ScenarioDefinition, WorkspacePreferences, WorkspaceState } from "./types";

function planned(
  envelope: string,
  requests: PlanRequest[],
  preferences: WorkspacePreferences,
  provider: "none" | "aws" | "azure" = "none",
  heuristic: PlanHeuristic = "closest",
): WorkspaceState {
  const root = createWorkspace(parseCidr(envelope), profileFor(provider));
  root.preferences = { ...preferences };
  const result = planAllocations(root, requests, heuristic);
  if (!result.ok || !result.state) throw new Error(result.error ?? "Scenario could not be constructed");
  return result.state;
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "small-office", title: "Small office", envelope: "192.168.10.0/24",
    description: "Staff, voice, guest and infrastructure networks in one compact /24.",
    build: (preferences) => planned("192.168.10.0/24", [
      { label: "Staff", prefix: 25, count: 1, requestedHosts: 100 },
      { label: "Voice", prefix: 26, count: 1, requestedHosts: 50 },
      { label: "Guest", prefix: 27, count: 1, requestedHosts: 25 },
      { label: "Infrastructure", prefix: 28, count: 1 },
    ], preferences),
  },
  {
    id: "three-tier", title: "Three-tier application", envelope: "10.20.0.0/20",
    description: "A realistic application estate with web, app, data and management tiers.",
    build: (preferences) => planned("10.20.0.0/20", [
      { label: "Web", prefix: 23, count: 1, requestedHosts: 300 },
      { label: "App", prefix: 24, count: 1, requestedHosts: 200 },
      { label: "Data", prefix: 25, count: 1, requestedHosts: 100 },
      { label: "Management", prefix: 26, count: 1, requestedHosts: 50 },
    ], preferences),
  },
  {
    id: "aws-vpc", title: "AWS VPC", envelope: "10.0.0.0/16",
    description: "Paired public, application and data tiers plus management, with AWS reservations.",
    build: (preferences) => planned("10.0.0.0/16", [
      { label: "Public", prefix: 24, count: 2 },
      { label: "Application", prefix: 22, count: 2 },
      { label: "Data", prefix: 24, count: 2 },
      { label: "Management", prefix: 26, count: 1 },
    ], preferences, "aws", "left"),
  },
  {
    id: "azure-hub", title: "Azure hub-and-spoke", envelope: "10.10.0.0/16",
    description: "Hub, shared services, production, non-production and bastion subnets.",
    build: (preferences) => planned("10.10.0.0/16", [
      { label: "Production", prefix: 19, count: 1 },
      { label: "Non-production", prefix: 20, count: 1 },
      { label: "Hub", prefix: 22, count: 1 },
      { label: "Shared services", prefix: 23, count: 1 },
      { label: "Azure Bastion", prefix: 26, count: 1 },
    ], preferences, "azure", "left"),
  },
  {
    id: "kubernetes", title: "Kubernetes platform", envelope: "10.40.0.0/16",
    description: "Separate pod, service, node and ingress capacity at platform scale.",
    build: (preferences) => planned("10.40.0.0/16", [
      { label: "Pods", prefix: 18, count: 1, requestedHosts: 8000 },
      { label: "Services", prefix: 20, count: 1, requestedHosts: 2000 },
      { label: "Nodes", prefix: 23, count: 1, requestedHosts: 500 },
      { label: "Ingress", prefix: 24, count: 1, requestedHosts: 250 },
    ], preferences),
  },
  {
    id: "exam-practice", title: "Exam practice", envelope: "172.16.50.0/24",
    description: "A clean /24 and a guided VLSM challenge for four host requirements.",
    challenge: "Allocate networks for 60, 30, 14 and 2 hosts. Work largest-first and preserve every unused sibling.",
    build: (preferences) => {
      const state = createWorkspace(parseCidr("172.16.50.0/24"));
      state.preferences = { ...preferences };
      return state;
    },
  },
];
