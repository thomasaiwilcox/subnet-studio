export type ProviderProfileId = "none" | "azure" | "aws" | "gcp" | "custom";

export interface Cidr {
  network: number;
  prefix: number;
}

export interface ProfileSelection {
  id: ProviderProfileId;
  reservedHead: number;
  reservedTail: number;
  minPrefixLength: number;
  maxPrefixLength: number;
}

export interface SubnetLeaf extends Cidr {
  allocationGroupId?: string;
}

export interface AllocationGroup {
  id: string;
  label: string;
  color: string;
  requestedHosts?: number;
}

export interface WorkspacePreferences {
  theme: "light" | "dark";
  labelDensity: "minimal" | "normal" | "verbose";
  compact: boolean;
  animation: "normal" | "reduced" | "off";
}

export interface WorkspaceState {
  schemaVersion: 1;
  envelope: Cidr;
  profile: ProfileSelection;
  leaves: SubnetLeaf[];
  groups: AllocationGroup[];
  preferences: WorkspacePreferences;
}

export type PlanHeuristic = "closest" | "left" | "largest";

export interface PlanRequest {
  label: string;
  prefix: number;
  count: number;
  requestedHosts?: number;
}

export interface OperationResult {
  ok: boolean;
  state?: WorkspaceState;
  error?: string;
}

export type TransactionKind =
  | "start"
  | "split"
  | "join"
  | "plan"
  | "allocate"
  | "deallocate"
  | "profile"
  | "reset"
  | "scenario"
  | "import"
  | "address-space";

export interface HistoryEntry {
  id: number;
  label: string;
  kind: TransactionKind;
  state: WorkspaceState;
}

export interface HistoryState {
  past: HistoryEntry[];
  present: HistoryEntry;
  future: HistoryEntry[];
  nextId: number;
}

export interface JoinCandidate {
  cidr: Cidr;
  leafKeys: string[];
  removedBoundaryBits: number;
}

export interface PlanFact {
  label: string;
  requestedHosts?: number;
  suppliedUsable: number;
  prefix: number;
  reservationOverhead: number;
  unusedUsable?: number;
}

export interface PlanStep {
  title: string;
  explanation: string;
  state: WorkspaceState;
  highlightGroupIds: string[];
}

export interface PlanPreview {
  ok: boolean;
  error?: string;
  state?: WorkspaceState;
  requests: PlanRequest[];
  heuristic: PlanHeuristic;
  facts: PlanFact[];
  steps: PlanStep[];
  proposedLeafKeys: string[];
}

export interface AllocationBreakdown {
  groupId: string;
  label: string;
  color: string;
  addresses: number;
  usable: number;
  requestedHosts?: number;
  measuredWaste?: number;
  subnetCount: number;
}

export interface WorkspaceAnalysis {
  totalAddresses: number;
  allocatedAddresses: number;
  freeAddresses: number;
  usableAddresses: number;
  reservedAddresses: number;
  providerOverhead: number;
  allocationPercentage: number;
  measuredWaste: number;
  unknownRequestAllocations: number;
  largestAvailable?: Cidr;
  freeRegionCount: number;
  groups: AllocationBreakdown[];
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  description: string;
  envelope: string;
  build: (preferences: WorkspacePreferences) => WorkspaceState;
  challenge?: string;
}

export const MAX_LEAVES = 2048;
export const MAX_HISTORY = 100;
