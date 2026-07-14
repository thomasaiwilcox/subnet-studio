import "./styles.css";
import packageInfo from "../package.json";
import { analyseWorkspace } from "./analysis";
import { clearAutosave, loadAutosave, saveAutosave } from "./autosave";
import {
  blockSize,
  endAddress,
  formatCidr,
  intToIp,
  keyOf,
  maskInt,
  parseCidr,
  subnetDetails,
  usableCount,
} from "./cidr";
import { createCsv, createSvg, downloadPng, downloadText, type RenderedLeaf } from "./exporter";
import { commit, createHistory, jumpToHistoryEntry, redo, undo } from "./history";
import {
  allocateLeaf,
  changeProfile,
  createWorkspace,
  deallocateLeaf,
  discoverJoinCandidates,
  joinLeaves,
  resetWorkspace,
  siblingKey,
  splitLeaf,
} from "./model";
import { createPlanPreview } from "./plan-preview";
import { parseWorkspaceJson, decodeShareState, encodeShareState, stringifyWorkspace } from "./persistence";
import { parsePlan } from "./planner";
import { customProfile, profileFor, profileLabel, validateCidrForProfile } from "./profiles";
import { createReportHtml, createReportMarkdown } from "./report";
import { SCENARIOS } from "./scenarios";
import type {
  Cidr,
  HistoryState,
  OperationResult,
  PlanHeuristic,
  PlanPreview,
  SubnetLeaf,
  TransactionKind,
  WorkspacePreferences,
  WorkspaceState,
} from "./types";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

const profileSelect = byId<HTMLSelectElement>("profile-select");
const customProfileButton = byId<HTMLButtonElement>("custom-profile-button");
const themeButton = byId<HTMLButtonElement>("theme-button");
const undoButton = byId<HTMLButtonElement>("undo-button");
const redoButton = byId<HTMLButtonElement>("redo-button");
const resetButton = byId<HTMLButtonElement>("reset-button");
const fitButton = byId<HTMLButtonElement>("fit-button");
const panButton = byId<HTMLButtonElement>("pan-button");
const resetViewButton = byId<HTMLButtonElement>("reset-view-button");
const addressButton = byId<HTMLButtonElement>("address-button");
const planButton = byId<HTMLButtonElement>("plan-button");
const selectButton = byId<HTMLButtonElement>("select-button");
const joinButton = byId<HTMLButtonElement>("join-button");
const findFitPrefix = byId<HTMLSelectElement>("find-fit-prefix");
const findFitButton = byId<HTMLButtonElement>("find-fit-button");
const clearHighlightButton = byId<HTMLButtonElement>("clear-highlight-button");
const viewport = byId<HTMLElement>("viewport");
const world = byId<HTMLElement>("world");
const minimapView = byId<HTMLElement>("minimap-view");
const envelopeLabel = byId<HTMLElement>("envelope-label");
const detailsPanel = byId<HTMLElement>("details-panel");
const inspectorEmpty = byId<HTMLElement>("inspector-empty");
const detailsClose = byId<HTMLButtonElement>("details-close");
const detailsSplit = byId<HTMLButtonElement>("details-split");
const detailsDeallocate = byId<HTMLButtonElement>("details-deallocate");
const binaryToggle = byId<HTMLButtonElement>("binary-toggle");
const binaryPanel = byId<HTMLElement>("binary-panel");
const tableFilter = byId<HTMLSelectElement>("table-filter");
const tableSort = byId<HTMLSelectElement>("table-sort");
const tableBody = byId<HTMLTableSectionElement>("subnet-table-body");
const activityLog = byId<HTMLOListElement>("activity-log");
const toast = byId<HTMLElement>("toast");
const liveRegion = byId<HTMLElement>("live-region");
const metricLeaves = byId<HTMLElement>("metric-leaves");
const metricAllocated = byId<HTMLElement>("metric-allocated");
const metricFree = byId<HTMLElement>("metric-free");
const workspaceProfileLabel = byId<HTMLElement>("workspace-profile-label");
const lensTitle = byId<HTMLElement>("lens-title");
const lensDescription = byId<HTMLElement>("lens-description");
const prefixRuler = byId<HTMLElement>("prefix-ruler");
const lensMask = byId<HTMLElement>("lens-mask");
const lensAddresses = byId<HTMLElement>("lens-addresses");
const lensUsable = byId<HTMLElement>("lens-usable");
const zoomReadout = byId<HTMLElement>("zoom-readout");
const prefixSlider = byId<HTMLInputElement>("prefix-slider");
const learnButton = byId<HTMLButtonElement>("learn-button");
const learnPanel = byId<HTMLElement>("learn-panel");
const lessonList = byId<HTMLElement>("lesson-list");
const lessonActive = byId<HTMLElement>("lesson-active");
const planPreview = byId<HTMLElement>("plan-preview");

type DockView = "inspector" | "inventory" | "learn" | "prefix" | "analyse" | "plan";
const dockViews: Record<DockView, { tab: HTMLButtonElement; panel: HTMLElement }> = {
  inspector: { tab: byId("dock-inspector-tab"), panel: byId("dock-inspector-panel") },
  inventory: { tab: byId("dock-inventory-tab"), panel: byId("dock-inventory-panel") },
  learn: { tab: byId("dock-learn-tab"), panel: byId("dock-learn-panel") },
  prefix: { tab: byId("dock-prefix-tab"), panel: byId("dock-prefix-panel") },
  analyse: { tab: byId("dock-analyse-tab"), panel: byId("dock-analyse-panel") },
  plan: { tab: byId("dock-plan-tab"), panel: byId("dock-plan-panel") },
};
let activeDockView: DockView = "inspector";

const dialogs = {
  address: byId<HTMLDialogElement>("address-dialog"),
  split: byId<HTMLDialogElement>("split-dialog"),
  custom: byId<HTMLDialogElement>("custom-profile-dialog"),
  import: byId<HTMLDialogElement>("import-dialog"),
  help: byId<HTMLDialogElement>("help-dialog"),
  allocation: byId<HTMLDialogElement>("allocation-dialog"),
  scenarios: byId<HTMLDialogElement>("scenarios-dialog"),
  report: byId<HTMLDialogElement>("report-dialog"),
  confirm: byId<HTMLDialogElement>("confirm-dialog"),
  walkthrough: byId<HTMLDialogElement>("walkthrough-dialog"),
};
const dialogReturnFocus = new WeakMap<HTMLDialogElement, HTMLElement>();

let history: HistoryState;
let selected = new Set<string>();
let activeKey: string | null = null;
let candidateKeys = new Set<string>();
let selectMode = false;
let panMode = false;
let scale = 1;
let panX = 0;
let panY = 0;
let toastTimer = 0;
let splitSourceKey: string | null = null;
let binaryVisible = false;
let suppressNextLeafClick = false;
let planWorkspacePreview: PlanPreview | null = null;
let historyPreviewEntryId: number | null = null;
let coachStep = -1;
let allocationSourceKey: string | null = null;
let commitAnimationKeys = new Set<string>();
let confirmAction: (() => void) | null = null;
let historyHoverSuppressedUntil = 0;

type LessonId = "split-four" | "vlsm-plan" | "partial-join" | "cloud-rules";

interface LessonStep {
  instruction: string;
  check: (state: WorkspaceState) => boolean;
}

interface LessonDefinition {
  id: LessonId;
  kicker: string;
  title: string;
  description: string;
  hint: string;
  start: () => WorkspaceState;
  steps: LessonStep[];
}

const LESSONS: LessonDefinition[] = [
  {
    id: "split-four",
    kicker: "Lesson 1 · Prefixes",
    title: "Turn one /24 into four /26s",
    description: "Watch two borrowed host bits create four equal networks.",
    hint: "Select the /24 block, choose Split subnet, then set New prefix to /26.",
    start: () => createWorkspace(parseCidr("192.168.10.0/24")),
    steps: [
      { instruction: "Split the starting /24 into smaller leaves.", check: (state) => state.leaves.length > 1 },
      { instruction: "Finish with exactly four /26 subnets.", check: (state) => state.leaves.length === 4 && state.leaves.every((leaf) => leaf.prefix === 26) },
    ],
  },
  {
    id: "vlsm-plan",
    kicker: "Lesson 2 · VLSM",
    title: "Size subnets from host needs",
    description: "Allocate Web for 50 hosts and Database for 20 without wasting a whole /24.",
    hint: "Open Plan and enter “Web: hosts=50” and “Database: hosts=20” on separate lines.",
    start: () => createWorkspace(parseCidr("10.20.0.0/24")),
    steps: [
      { instruction: "Allocate a Web group sized for 50 hosts.", check: (state) => state.groups.some((group) => group.label.toLowerCase() === "web" && group.requestedHosts === 50) },
      { instruction: "Allocate a Database group sized for 20 hosts in the same atomic plan.", check: (state) => state.groups.some((group) => group.label.toLowerCase() === "database" && group.requestedHosts === 20) },
    ],
  },
  {
    id: "partial-join",
    kicker: "Lesson 3 · Aggregation",
    title: "Join only half the address space",
    description: "Combine the first two /26s into a /25 while leaving the other two untouched.",
    hint: "Enable Select, choose 172.16.8.0/26 and 172.16.8.64/26, then press Join.",
    start: () => {
      const root = createWorkspace(parseCidr("172.16.8.0/24"));
      return splitLeaf(root, keyOf(root.envelope), 26).state!;
    },
    steps: [
      { instruction: "Select two adjacent /26 leaves.", check: () => selected.size === 2 },
      { instruction: "Join them into one /25 and keep two /26 siblings.", check: (state) => state.leaves.length === 3 && state.leaves.filter((leaf) => leaf.prefix === 25).length === 1 && state.leaves.filter((leaf) => leaf.prefix === 26).length === 2 },
    ],
  },
  {
    id: "cloud-rules",
    kicker: "Lesson 4 · Providers",
    title: "Plan inside AWS rules",
    description: "See how provider prefix limits and five reserved addresses affect a real allocation.",
    hint: "Choose AWS (4 + 1), then Plan an “App: hosts=200” subnet. The planner will choose /24.",
    start: () => createWorkspace(parseCidr("10.40.0.0/16")),
    steps: [
      { instruction: "Switch the reservation profile to AWS (4 + 1).", check: (state) => state.profile.id === "aws" },
      { instruction: "Allocate an App group for 200 hosts.", check: (state) => state.groups.some((group) => group.label.toLowerCase() === "app" && group.requestedHosts === 200) },
    ],
  },
];

let activeLessonId: LessonId | null = null;
let lessonReturnHistory: HistoryState | null = null;
let lessonCompletionAnnounced = false;
let lessonStepProgress: boolean[] = [];
const completedLessons = new Set<LessonId>();

function current(): WorkspaceState {
  return history.present.state;
}

function displayState(): WorkspaceState {
  if (historyPreviewEntryId !== null) {
    const entry = [...history.past, history.present, ...history.future].find((candidate) => candidate.id === historyPreviewEntryId);
    if (entry) return entry.state;
  }
  if (planWorkspacePreview?.ok && planWorkspacePreview.state) {
    return coachStep >= 0 ? (planWorkspacePreview.steps[coachStep]?.state ?? planWorkspacePreview.state) : planWorkspacePreview.state;
  }
  return current();
}

function showToast(message: string, announce = true): void {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  if (announce) {
    liveRegion.textContent = "";
    requestAnimationFrame(() => { liveRegion.textContent = message; });
  }
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3800);
}

function addLog(message: string): void {
  showToast(message, false);
  renderLog();
}

function renderLog(): void {
  activityLog.replaceChildren();
  const entries = [...history.past, history.present, ...history.future];
  for (const entry of entries) {
    const item = document.createElement("li");
    if (entry.id === history.present.id) item.classList.add("current");
    if (history.future.some((future) => future.id === entry.id)) item.classList.add("future");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = entry.label;
    const kind = document.createElement("small");
    kind.textContent = `${entry.kind} · #${entry.id}`;
    button.append(kind);
    const preview = () => {
      if (Date.now() < historyHoverSuppressedUntil) return;
      historyPreviewEntryId = entry.id;
      planWorkspacePreview = null;
      renderWorld(); renderWorkspaceSummary(); renderCidrLens(); renderHistoryPreview(); renderMapActions();
    };
    button.addEventListener("mouseenter", preview);
    button.addEventListener("focus", preview);
    button.addEventListener("mouseleave", () => { if (navigator.maxTouchPoints === 0) { historyPreviewEntryId = null; renderWorld(); renderWorkspaceSummary(); renderCidrLens(); renderHistoryPreview(); renderMapActions(); } });
    button.addEventListener("click", () => {
      if (navigator.maxTouchPoints > 0) preview();
      else restoreHistoryEntry(entry.id);
    });
    item.append(button);
    activityLog.append(item);
  }
}

function applyOperation(operation: OperationResult, message: string, kind: TransactionKind = "start"): boolean {
  if (historyPreviewEntryId !== null) { showToast("Close or restore the history preview before changing the workspace"); return false; }
  if (!operation.ok || !operation.state) {
    showToast(operation.error ?? "Operation failed");
    return false;
  }
  const before = new Set(current().leaves.map(keyOf));
  history = commit(history, operation.state, message, kind);
  commitAnimationKeys = new Set(operation.state.leaves.map(keyOf).filter((key) => !before.has(key)));
  selected.clear();
  activeKey = null;
  candidateKeys.clear();
  detailsPanel.hidden = true;
  planWorkspacePreview = null;
  coachStep = -1;
  safelyAutosave();
  addLog(message);
  renderAll();
  if (activeLessonId) setDockView("learn");
  return true;
}

function subnetColor(leaf: SubnetLeaf): string {
  const hue = 190 + Math.abs((leaf.network / 256 + leaf.prefix * 47) % 150);
  return `hsl(${hue} 52% 36%)`;
}

function groupFor(leaf: SubnetLeaf) {
  return leaf.allocationGroupId ? displayState().groups.find((group) => group.id === leaf.allocationGroupId) : undefined;
}

function labelFor(leaf: SubnetLeaf): { label: string; meta: string } {
  const density = current().preferences.labelDensity;
  const cidr = formatCidr(leaf);
  const size = blockSize(leaf.prefix);
  if (density === "minimal") return { label: `/${leaf.prefix}`, meta: "" };
  if (density === "verbose") return { label: `${intToIp(leaf.network)} – ${intToIp(endAddress(leaf))}`, meta: `${cidr} · ${size.toLocaleString()} IPs` };
  return { label: cidr, meta: `${size.toLocaleString()} IPs` };
}

function focusLeafByOffset(key: string, offset: number): void {
  const index = current().leaves.findIndex((leaf) => keyOf(leaf) === key);
  const next = current().leaves[index + offset];
  if (!next) return;
  const nextKey = keyOf(next);
  activeKey = nextKey;
  selected.clear();
  renderAll();
  requestAnimationFrame(() => world.querySelector<HTMLElement>(`[data-key="${CSS.escape(nextKey)}"]`)?.focus());
}

function toggleSelection(key: string): void {
  if (selected.has(key)) selected.delete(key); else selected.add(key);
  activeKey = key;
  renderAll();
  showToast(`${selected.size} subnet${selected.size === 1 ? "" : "s"} selected`, false);
}

function handleLeafClick(event: MouseEvent, key: string): void {
  if (suppressNextLeafClick) {
    suppressNextLeafClick = false;
    event.preventDefault();
    return;
  }
  if (panMode) return;
  if (selectMode || event.ctrlKey || event.metaKey) {
    toggleSelection(key);
    return;
  }
  selected.clear();
  activeKey = key;
  renderAll();
  showDetails();
}

function leafButton(leaf: SubnetLeaf): HTMLButtonElement {
  const key = keyOf(leaf);
  const group = groupFor(leaf);
  const text = labelFor(leaf);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "leaf";
  button.dataset.key = key;
  button.style.setProperty("--leaf-color", subnetColor(leaf));
  if (group) {
    const proposed = Boolean(planWorkspacePreview?.ok && planWorkspacePreview.proposedLeafKeys.includes(key));
    button.classList.add(proposed ? "ghost-allocated" : "allocated");
    button.style.setProperty("--allocation-color", group.color);
  }
  if (selected.has(key) || activeKey === key) button.classList.add("selected");
  if (candidateKeys.has(key)) button.classList.add("candidate");
  if (planWorkspacePreview?.ok) {
    button.classList.add(planWorkspacePreview.proposedLeafKeys.includes(key) ? "preview-proposed" : "preview-unchanged");
  }
  if (commitAnimationKeys.has(key)) button.classList.add("just-committed");
  if (selectMode && activeKey) {
    const validKeys = new Set(discoverJoinCandidates(current(), activeKey).candidates.flatMap((candidate) => candidate.leafKeys));
    if (!validKeys.has(key)) button.classList.add("join-invalid");
  }
  const label = document.createElement("span");
  label.className = "leaf-label";
  label.textContent = text.label;
  const meta = document.createElement("span");
  meta.className = "leaf-meta";
  meta.textContent = group ? group.label : text.meta;
  button.append(label, meta);
  button.setAttribute("aria-label", `${formatCidr(leaf)}, ${blockSize(leaf.prefix).toLocaleString()} addresses${group ? `, allocated to ${group.label}` : ", available"}`);
  button.addEventListener("click", (event) => handleLeafClick(event, key));
  button.addEventListener("dblclick", () => openSplitDialog(key));
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); focusLeafByOffset(key, -1); }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); focusLeafByOffset(key, 1); }
    if (event.key === "Enter") { event.preventDefault(); openSplitDialog(key); }
    if (event.key === " ") { event.preventDefault(); toggleSelection(key); }
  });
  return button;
}

function renderTreeNode(cidr: Cidr, leaves: SubnetLeaf[], depth: number, rootRow: boolean): HTMLElement {
  const exact = leaves.length === 1 && leaves[0]?.network === cidr.network && leaves[0].prefix === cidr.prefix;
  if (exact) return leafButton(leaves[0]!);
  const branch = document.createElement("div");
  branch.className = `branch ${(rootRow ? depth % 2 === 0 : depth % 2 !== 0) ? "row" : "column"}`;
  const childPrefix = cidr.prefix + 1;
  const half = blockSize(childPrefix);
  const middle = cidr.network + half;
  const leftLeaves = leaves.filter((leaf) => leaf.network < middle);
  const rightLeaves = leaves.filter((leaf) => leaf.network >= middle);
  if (leftLeaves.length === 0 || rightLeaves.length === 0 || childPrefix > 32) {
    const invalid = document.createElement("div");
    invalid.textContent = "Invalid workspace coverage";
    branch.append(invalid);
    return branch;
  }
  branch.append(
    renderTreeNode({ network: cidr.network, prefix: childPrefix }, leftLeaves, depth + 1, rootRow),
    renderTreeNode({ network: middle, prefix: childPrefix }, rightLeaves, depth + 1, rootRow),
  );
  return branch;
}

function renderWorld(): void {
  world.replaceChildren();
  const rootRow = viewport.clientWidth >= viewport.clientHeight;
  const shown = displayState();
  world.append(renderTreeNode(shown.envelope, shown.leaves, 0, rootRow));
  applyViewTransform();
  if (commitAnimationKeys.size > 0) window.setTimeout(() => { commitAnimationKeys.clear(); }, 500);
}

function renderDetails(): void {
  if (!activeKey) { detailsPanel.hidden = true; inspectorEmpty.hidden = false; return; }
  const leaf = current().leaves.find((candidate) => keyOf(candidate) === activeKey);
  if (!leaf) { detailsPanel.hidden = true; inspectorEmpty.hidden = false; return; }
  const details = subnetDetails(leaf, current().profile);
  const group = groupFor(leaf);
  byId("details-cidr").textContent = formatCidr(leaf);
  byId("details-network").textContent = details.network;
  byId("details-mask").textContent = details.mask;
  byId("details-broadcast").textContent = details.broadcast ?? "No broadcast";
  byId("details-usable").textContent = details.usableStart && details.usableEnd ? `${details.usableStart} – ${details.usableEnd}` : "None";
  byId("details-total").textContent = details.total.toLocaleString();
  byId("details-usable-count").textContent = details.usable.toLocaleString();
  byId("details-allocation").textContent = group?.label ?? "Available";
  detailsSplit.disabled = Boolean(group) || leaf.prefix >= current().profile.maxPrefixLength;
  detailsDeallocate.hidden = !group;
  const total = details.total;
  const classicHead = current().profile.reservedHead + current().profile.reservedTail > 0 ? current().profile.reservedHead : leaf.prefix < 31 ? 1 : 0;
  const classicTail = current().profile.reservedHead + current().profile.reservedTail > 0 ? current().profile.reservedTail : leaf.prefix < 31 ? 1 : 0;
  const headPercent = Math.min(100, classicHead / total * 100);
  const tailStart = Math.max(headPercent, 100 - classicTail / total * 100);
  const bar = byId<HTMLElement>("reservation-bar");
  bar.style.setProperty("--head", `${headPercent}%`);
  bar.style.setProperty("--tail-start", `${tailStart}%`);
  renderBinary(leaf);
}

function renderBinary(leaf: SubnetLeaf): void {
  const value = (leaf.network >>> 0).toString(2).padStart(32, "0");
  byId("binary-address").textContent = `${intToIp(leaf.network)} · mask ${intToIp(maskInt(leaf.prefix))}`;
  const bits = byId("binary-bits");
  bits.replaceChildren();
  [...value].forEach((valueBit, index) => {
    const bit = document.createElement("span");
    bit.className = `bit ${index < leaf.prefix ? "network" : "host"}`;
    bit.textContent = valueBit;
    bits.append(bit);
  });
  byId("binary-explanation").textContent = leaf.prefix === 31
    ? "RFC 3021 treats both addresses as usable on a point-to-point link."
    : leaf.prefix === 32
      ? "A /32 identifies one usable address and has no broadcast address."
      : `The first ${leaf.prefix} bits identify the network; ${32 - leaf.prefix} bits identify addresses inside it.`;
  binaryPanel.hidden = !binaryVisible;
  binaryToggle.setAttribute("aria-expanded", String(binaryVisible));
}

function showDetails(): void {
  if (!activeKey) return;
  setDockView("inspector");
  detailsPanel.hidden = false;
  inspectorEmpty.hidden = true;
  renderDetails();
}

function setDockView(view: DockView, focusTab = false): void {
  activeDockView = view;
  (Object.entries(dockViews) as [DockView, { tab: HTMLButtonElement; panel: HTMLElement }][]).forEach(([key, item]) => {
    const active = key === view;
    item.tab.setAttribute("aria-selected", String(active));
    item.tab.tabIndex = active ? 0 : -1;
    item.panel.hidden = !active;
  });
  if (view === "learn") learnPanel.hidden = false;
  learnButton.setAttribute("aria-expanded", String(view === "learn"));
  if (focusTab) dockViews[view].tab.focus();
}

function renderTable(): void {
  const groups = new Map(current().groups.map((group) => [group.id, group]));
  let leaves = current().leaves.map((leaf) => ({ leaf, group: leaf.allocationGroupId ? groups.get(leaf.allocationGroupId) : undefined }));
  if (tableFilter.value === "allocated") leaves = leaves.filter(({ group }) => group);
  if (tableFilter.value === "unallocated") leaves = leaves.filter(({ group }) => !group);
  leaves.sort((a, b) => {
    if (tableSort.value === "prefix") return a.leaf.prefix - b.leaf.prefix || a.leaf.network - b.leaf.network;
    if (tableSort.value === "size") return blockSize(a.leaf.prefix) - blockSize(b.leaf.prefix) || a.leaf.network - b.leaf.network;
    return a.leaf.network - b.leaf.network;
  });
  tableBody.replaceChildren();
  for (const { leaf, group } of leaves) {
    const row = document.createElement("tr");
    if (activeKey === keyOf(leaf)) row.classList.add("active");
    const values = [formatCidr(leaf), usableCount(leaf.prefix, current().profile).toLocaleString(), group ? "Allocated" : "Available", group?.label ?? ""];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      if (index === 0) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "table-cidr-button";
        button.textContent = value;
        button.setAttribute("aria-label", `Inspect ${value}`);
        button.addEventListener("click", () => {
          activeKey = keyOf(leaf);
          selected.clear();
          renderAll();
          showDetails();
        });
        cell.append(button);
      } else cell.textContent = value;
      row.append(cell);
    });
    tableBody.append(row);
  }
}

function renderFindFitOptions(): void {
  const previous = Number(findFitPrefix.value);
  findFitPrefix.replaceChildren();
  const minimum = Math.max(current().envelope.prefix, current().profile.minPrefixLength);
  for (let prefix = minimum; prefix <= current().profile.maxPrefixLength; prefix += 1) {
    const option = document.createElement("option");
    option.value = String(prefix);
    option.textContent = `/${prefix}`;
    findFitPrefix.append(option);
  }
  if (previous >= minimum && previous <= current().profile.maxPrefixLength) findFitPrefix.value = String(previous);
  else findFitPrefix.value = String(Math.min(current().profile.maxPrefixLength, Math.max(minimum, 24)));
}

function applyPreferences(): void {
  const preferences = current().preferences;
  document.body.classList.toggle("dark", preferences.theme === "dark");
  document.body.classList.toggle("compact", preferences.compact);
  document.documentElement.style.setProperty("--motion", preferences.animation === "off" ? "0ms" : preferences.animation === "reduced" ? "80ms" : "180ms");
  themeButton.textContent = preferences.theme === "dark" ? "☀" : "☾";
  themeButton.setAttribute("aria-label", preferences.theme === "dark" ? "Use light theme" : "Use dark theme");
  byId<HTMLSelectElement>("label-density").value = preferences.labelDensity;
  byId<HTMLSelectElement>("animation-select").value = preferences.animation;
  byId<HTMLButtonElement>("compact-button").setAttribute("aria-pressed", String(preferences.compact));
}

function updatePreferences(patch: Partial<WorkspacePreferences>): void {
  const update = (state: WorkspaceState) => Object.assign(state.preferences, patch);
  history.past.forEach((entry) => update(entry.state));
  history.future.forEach((entry) => update(entry.state));
  update(history.present.state);
  safelyAutosave();
  renderAll();
}

function renderBitRuler(container: HTMLElement, prefix: number): void {
  container.replaceChildren();
  for (let index = 0; index < 32; index += 1) {
    const bit = document.createElement("span");
    bit.className = index < prefix ? "network" : "host";
    if ((index + 1) % 8 === 0) bit.classList.add("octet-end");
    bit.setAttribute("aria-hidden", "true");
    container.append(bit);
  }
}

function lensTarget(): Cidr {
  const selectedKey = activeKey ?? (selected.size === 1 ? [...selected][0] : undefined);
  return displayState().leaves.find((leaf) => keyOf(leaf) === selectedKey) ?? displayState().envelope;
}

function renderWorkspaceSummary(): void {
  const shown = displayState();
  const total = blockSize(shown.envelope.prefix);
  const allocated = shown.leaves
    .filter((leaf) => leaf.allocationGroupId)
    .reduce((sum, leaf) => sum + blockSize(leaf.prefix), 0);
  metricLeaves.textContent = shown.leaves.length.toLocaleString();
  metricAllocated.textContent = `${Math.round(allocated / total * 100)}%`;
  metricFree.textContent = (total - allocated).toLocaleString();
  workspaceProfileLabel.textContent = profileLabel(current().profile);
}

function renderCidrLens(): void {
  const target = lensTarget();
  const details = subnetDetails(target, displayState().profile);
  const hostBits = 32 - target.prefix;
  lensTitle.textContent = formatCidr(target);
  lensDescription.textContent = target.prefix === 31
    ? "31 network bits leave two RFC 3021 point-to-point addresses; neither is a broadcast address."
    : target.prefix === 32
      ? "All 32 bits identify one host address. There are no host bits and no broadcast address."
      : `${target.prefix} network bit${target.prefix === 1 ? "" : "s"} identify the subnet. ${hostBits} host bit${hostBits === 1 ? "" : "s"} identify addresses inside it.`;
  lensMask.textContent = details.mask;
  lensAddresses.textContent = details.total.toLocaleString();
  lensUsable.textContent = details.usable.toLocaleString();
  prefixRuler.style.setProperty("--prefix", String(target.prefix));
  prefixRuler.setAttribute("aria-label", `${target.prefix} network bits followed by ${hostBits} host bits`);
  renderBitRuler(prefixRuler, target.prefix);
}

function renderPrefixLab(): void {
  const prefix = Number(prefixSlider.value);
  const profile = profileFor("none");
  byId("prefix-slider-value").textContent = `/${prefix}`;
  byId("prefix-lab-mask").textContent = intToIp(maskInt(prefix));
  byId("prefix-lab-addresses").textContent = blockSize(prefix).toLocaleString();
  byId("prefix-lab-usable").textContent = usableCount(prefix, profile).toLocaleString();
  byId("prefix-lab-host-bits").textContent = String(32 - prefix);
  renderBitRuler(byId("prefix-slider-bits"), prefix);
}

function saveCompletedLessons(): void {
  localStorage.setItem("subnet-completed-lessons", JSON.stringify([...completedLessons]));
}

function lessonDefinition(): LessonDefinition | undefined {
  return LESSONS.find((lesson) => lesson.id === activeLessonId);
}

function renderLessonPanel(): void {
  lessonList.replaceChildren();
  if (!activeLessonId) {
    lessonList.hidden = false;
    lessonActive.hidden = true;
    learnButton.textContent = "Learn by doing →";
    for (const [index, lesson] of LESSONS.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lesson-card secondary";
      button.dataset.lessonId = lesson.id;
      const number = document.createElement("span");
      number.className = "lesson-number";
      number.textContent = completedLessons.has(lesson.id) ? "✓" : String(index + 1).padStart(2, "0");
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = lesson.title;
      const description = document.createElement("small");
      description.textContent = lesson.description;
      copy.append(title, description);
      button.append(number, copy);
      button.addEventListener("click", () => startLesson(lesson.id));
      lessonList.append(button);
    }
    return;
  }

  const lesson = lessonDefinition();
  if (!lesson) return;
  lessonList.hidden = true;
  lessonActive.hidden = false;
  learnButton.textContent = "Lesson active →";
  byId("lesson-kicker").textContent = lesson.kicker;
  byId("lesson-title").textContent = lesson.title;
  byId("lesson-objective").textContent = lesson.description;
  const completed = lesson.steps.map((step, index) => lessonStepProgress[index] || step.check(current()));
  lessonStepProgress = completed;
  const completedCount = completed.filter(Boolean).length;
  byId("lesson-progress-bar").style.width = `${completedCount / lesson.steps.length * 100}%`;
  const steps = byId<HTMLOListElement>("lesson-steps");
  steps.replaceChildren();
  lesson.steps.forEach((step, index) => {
    const item = document.createElement("li");
    item.className = completed[index] ? "complete" : "";
    const status = document.createElement("span");
    status.textContent = completed[index] ? "✓" : String(index + 1);
    const copy = document.createElement("span");
    copy.textContent = step.instruction;
    item.append(status, copy);
    steps.append(item);
  });
  if (completedCount === lesson.steps.length) {
    completedLessons.add(lesson.id);
    saveCompletedLessons();
    if (!lessonCompletionAnnounced) {
      lessonCompletionAnnounced = true;
      showToast(`Lesson complete — ${lesson.title}`);
    }
  }
}

function startLesson(id: LessonId): void {
  const lesson = LESSONS.find((candidate) => candidate.id === id);
  if (!lesson) return;
  if (!lessonReturnHistory) lessonReturnHistory = structuredClone(history);
  const preferences = { ...current().preferences };
  const starter = lesson.start();
  starter.preferences = preferences;
  history = createHistory(starter);
  activeLessonId = id;
  lessonCompletionAnnounced = false;
  lessonStepProgress = [];
  byId("lesson-hint").hidden = true;
  byId("lesson-hint-button").textContent = "Show hint";
  selected.clear(); activeKey = null; candidateKeys.clear();
  detailsPanel.hidden = true;
  addLog(`Started guided lesson: ${lesson.title}.`);
  renderAll();
  if (window.innerWidth < 768) {
    learnPanel.hidden = true;
    learnButton.setAttribute("aria-expanded", "false");
    showToast("Lesson started — reopen Lesson active to check your progress");
  }
}

function exitLesson(): void {
  if (lessonReturnHistory) history = lessonReturnHistory;
  lessonReturnHistory = null;
  activeLessonId = null;
  lessonCompletionAnnounced = false;
  lessonStepProgress = [];
  selected.clear(); activeKey = null; candidateKeys.clear();
  detailsPanel.hidden = true;
  addLog("Exited the lesson and restored the previous workspace.");
  renderAll();
}

function updatePlanPreview(): void {
  planPreview.replaceChildren();
  planPreview.className = "plan-preview";
  const input = byId<HTMLTextAreaElement>("plan-text").value;
  if (!input.trim()) {
    planWorkspacePreview = null;
    coachStep = -1;
    byId<HTMLButtonElement>("plan-apply-button").disabled = true;
    byId<HTMLButtonElement>("coach-open-button").disabled = true;
    byId("coach-panel").hidden = true;
    const empty = document.createElement("p");
    empty.textContent = "Add requests or load an example to preview the exact subnet sizes before committing.";
    planPreview.append(empty);
    renderWorld();
    return;
  }
  const parsed = parsePlan(input, current().profile);
  if (parsed.errors.length > 0) {
    planPreview.classList.add("invalid");
    const error = document.createElement("p");
    error.textContent = parsed.errors.join(" · ");
    planPreview.append(error);
    planWorkspacePreview = null;
    byId<HTMLButtonElement>("plan-apply-button").disabled = true;
    byId<HTMLButtonElement>("coach-open-button").disabled = true;
    renderWorld();
    return;
  }
  const heuristic = byId<HTMLSelectElement>("plan-heuristic").value as PlanHeuristic;
  const preview = createPlanPreview(current(), parsed.requests, heuristic);
  planWorkspacePreview = preview;
  if (!preview.ok) {
    planPreview.classList.add("invalid");
    const error = document.createElement("p");
    error.textContent = preview.error ?? "This plan will not fit.";
    planPreview.append(error);
    byId<HTMLButtonElement>("plan-apply-button").disabled = true;
    byId<HTMLButtonElement>("coach-open-button").disabled = true;
    renderWorld();
    return;
  }
  planPreview.classList.add("valid");
  const count = parsed.requests.reduce((sum, request) => sum + request.count, 0);
  const summary = document.createElement("strong");
  summary.textContent = `${count} subnet${count === 1 ? "" : "s"} will be allocated atomically`;
  const list = document.createElement("div");
  list.className = "plan-facts";
  for (const fact of preview.facts) {
    const item = document.createElement("div");
    item.className = "plan-fact";
    const label = document.createElement("strong"); label.textContent = `${fact.label} ·`;
    const prefix = document.createElement("span"); prefix.textContent = ` /${fact.prefix}`;
    const detail = document.createElement("small");
    detail.textContent = fact.requestedHosts === undefined
      ? `${fact.suppliedUsable.toLocaleString()} usable · ${fact.reservationOverhead} reserved/network addresses`
      : `${fact.requestedHosts.toLocaleString()} requested → ${fact.suppliedUsable.toLocaleString()} usable · ${fact.unusedUsable?.toLocaleString()} spare`;
    item.append(label, prefix, detail);
    list.append(item);
  }
  const analysis = analyseWorkspace(preview.state!);
  const capacity = document.createElement("p");
  const heuristicLabel = heuristic === "closest" ? "Closest fit" : heuristic === "left" ? "Lowest address first" : "Largest space first";
  capacity.textContent = `${analysis.freeAddresses.toLocaleString()} addresses remain · largest block ${analysis.largestAvailable ? formatCidr(analysis.largestAvailable) : "none"} · ${heuristicLabel}`;
  planPreview.append(summary, list, capacity);
  byId<HTMLButtonElement>("plan-apply-button").disabled = false;
  byId<HTMLButtonElement>("coach-open-button").disabled = false;
  renderWorld();
}

function renderCoach(): void {
  const panel = byId("coach-panel");
  if (!planWorkspacePreview?.ok || coachStep < 0) { panel.hidden = true; return; }
  const step = planWorkspacePreview.steps[coachStep];
  if (!step) { panel.hidden = true; return; }
  panel.hidden = false;
  byId("coach-step-label").textContent = `Step ${coachStep + 1} of ${planWorkspacePreview.steps.length}`;
  byId<HTMLProgressElement>("coach-progress").value = coachStep + 1;
  byId("coach-title").textContent = step.title;
  byId("coach-explanation").textContent = step.explanation;
  byId<HTMLButtonElement>("coach-previous").disabled = coachStep === 0;
  byId<HTMLButtonElement>("coach-next").disabled = coachStep === planWorkspacePreview.steps.length - 1;
}

function renderAnalysis(): void {
  const analysis = analyseWorkspace(current());
  const summary = byId("analysis-summary");
  summary.replaceChildren();
  const stats: [string, string, boolean?][] = [
    ["Total addresses", analysis.totalAddresses.toLocaleString()],
    ["Allocated", `${analysis.allocatedAddresses.toLocaleString()} · ${analysis.allocationPercentage.toFixed(1)}%`],
    ["Free addresses", analysis.freeAddresses.toLocaleString()],
    ["Usable across leaves", analysis.usableAddresses.toLocaleString()],
    ["Reserved / overhead", `${analysis.reservedAddresses.toLocaleString()} · provider ${analysis.providerOverhead.toLocaleString()}`],
    ["Measured waste", `${analysis.measuredWaste.toLocaleString()}${analysis.unknownRequestAllocations ? ` · ${analysis.unknownRequestAllocations} unknown` : ""}`],
    ["Largest available", analysis.largestAvailable ? formatCidr(analysis.largestAvailable) : "None"],
    ["Contiguous free regions", analysis.freeRegionCount.toLocaleString()],
  ];
  stats.forEach(([label, value], index) => {
    const card = document.createElement("div"); card.className = `analysis-stat${index === 0 ? " wide" : ""}`;
    const name = document.createElement("span"); name.textContent = label;
    const result = document.createElement("strong"); result.textContent = value;
    card.append(name, result); summary.append(card);
  });
  const groups = byId("analysis-groups"); groups.replaceChildren();
  if (analysis.groups.length === 0) {
    const empty = document.createElement("div"); empty.className = "analysis-empty"; empty.textContent = "No allocations yet. Plan or allocate a subnet to see group efficiency."; groups.append(empty);
  } else analysis.groups.forEach((group) => {
    const card = document.createElement("div"); card.className = "analysis-group"; card.style.setProperty("--group-color", group.color);
    const title = document.createElement("strong"); title.textContent = group.label;
    const meta = document.createElement("small"); meta.textContent = `${group.subnetCount} subnet${group.subnetCount === 1 ? "" : "s"} · ${group.usable.toLocaleString()} usable · waste ${group.measuredWaste === undefined ? "unknown" : group.measuredWaste.toLocaleString()}`;
    card.append(title, meta); groups.append(card);
  });
}

function renderMapActions(): void {
  const bar = byId("map-actions");
  const leaf = activeKey ? current().leaves.find((candidate) => keyOf(candidate) === activeKey) : undefined;
  bar.hidden = !leaf || selectMode || historyPreviewEntryId !== null || Boolean(planWorkspacePreview);
  if (!leaf || !bar.hidden) {
    if (!leaf) return;
    const group = leaf.allocationGroupId ? current().groups.find((candidate) => candidate.id === leaf.allocationGroupId) : undefined;
    const sibling = siblingKey(current(), activeKey!);
    const siblingLeaf = sibling ? current().leaves.find((candidate) => keyOf(candidate) === sibling) : undefined;
    const joinResult = sibling ? joinLeaves(current(), [activeKey!, sibling]) : { ok: false, error: "An equal-prefix sibling is not available" };
    byId("map-actions-cidr").textContent = formatCidr(leaf);
    byId<HTMLButtonElement>("map-split-button").disabled = Boolean(group) || leaf.prefix >= current().profile.maxPrefixLength;
    byId<HTMLButtonElement>("map-allocate-button").hidden = Boolean(group);
    byId<HTMLButtonElement>("map-sibling-button").disabled = !sibling;
    byId<HTMLButtonElement>("map-join-sibling-button").disabled = !joinResult.ok;
    byId<HTMLButtonElement>("map-deallocate-button").hidden = !group;
    byId("map-action-reason").textContent = joinResult.ok ? "" : (siblingLeaf?.allocationGroupId ? "Sibling is allocated. Deallocate it before joining." : joinResult.error ?? "Sibling cannot be joined.");
  }
}

function renderJoinCandidates(): void {
  const panel = byId("join-candidates"); panel.replaceChildren();
  if (!selectMode || !activeKey || historyPreviewEntryId !== null || planWorkspacePreview) { panel.hidden = true; return; }
  panel.hidden = false;
  const discovered = discoverJoinCandidates(current(), activeKey);
  const intro = document.createElement("p"); intro.textContent = discovered.candidates.length ? "Choose a complete aligned sibling group. Hover to preview its boundary." : discovered.reason ?? "No valid aggregate is available."; panel.append(intro);
  for (const candidate of discovered.candidates) {
    const button = document.createElement("button"); button.type = "button"; button.className = "secondary";
    const text = document.createTextNode(`${candidate.leafKeys.length} leaves → `); const cidr = document.createElement("span"); cidr.textContent = formatCidr(candidate.cidr); button.append(text, cidr);
    const highlight = () => { candidateKeys = new Set(candidate.leafKeys); renderWorld(); };
    button.addEventListener("pointermove", highlight); button.addEventListener("focus", highlight);
    button.addEventListener("click", () => { selected = new Set(candidate.leafKeys); activeKey = candidate.leafKeys[0] ?? activeKey; renderAll(); showToast(`${candidate.leafKeys.length} leaves selected. Join will remove ${candidate.removedBoundaryBits} binary boundary bit${candidate.removedBoundaryBits === 1 ? "" : "s"}.`); });
    panel.append(button);
  }
}

function renderHistoryPreview(): void {
  const banner = byId("history-preview-banner");
  const entry = historyPreviewEntryId === null ? undefined : [...history.past, history.present, ...history.future].find((candidate) => candidate.id === historyPreviewEntryId);
  banner.hidden = !entry;
  if (entry) byId("history-preview-label").textContent = entry.label;
  const disabled = Boolean(entry);
  const mutationControls = [addressButton, planButton, selectButton, resetButton, profileSelect, customProfileButton, findFitButton, byId<HTMLButtonElement>("scenarios-button")];
  mutationControls.forEach((control) => { control.disabled = disabled; });
  if (!disabled) {
    joinButton.disabled = selected.size < 2 || !joinLeaves(current(), [...selected]).ok;
    undoButton.disabled = history.past.length === 0;
    redoButton.disabled = history.future.length === 0;
  } else {
    joinButton.disabled = true;
    undoButton.disabled = true;
    redoButton.disabled = true;
  }
}

function restoreHistoryEntry(entryId: number): void {
  const next = jumpToHistoryEntry(history, entryId);
  if (next === history) return;
  history = next; historyPreviewEntryId = null; historyHoverSuppressedUntil = Date.now() + 500; selected.clear(); activeKey = null; safelyAutosave(); renderAll(); showToast("History point restored. Later entries remain available to redo.");
}

function safelyAutosave(): void {
  if (activeLessonId) return;
  try { saveAutosave(current()); } catch { showToast("Workspace is safe in this session, but local autosave is unavailable"); }
}

function renderAll(): void {
  applyPreferences();
  envelopeLabel.textContent = formatCidr(current().envelope);
  profileSelect.value = current().profile.id;
  customProfileButton.hidden = current().profile.id !== "custom";
  undoButton.disabled = history.past.length === 0;
  redoButton.disabled = history.future.length === 0;
  selectButton.setAttribute("aria-pressed", String(selectMode));
  panButton.setAttribute("aria-pressed", String(panMode));
  joinButton.disabled = selected.size < 2 || !joinLeaves(current(), [...selected]).ok;
  renderFindFitOptions();
  renderWorkspaceSummary();
  renderCidrLens();
  renderLessonPanel();
  renderWorld();
  renderTable();
  renderLog();
  renderAnalysis();
  renderMapActions();
  renderJoinCandidates();
  renderHistoryPreview();
  renderCoach();
  if (!detailsPanel.hidden) renderDetails();
  inspectorEmpty.hidden = !detailsPanel.hidden;
}

function openDialog(dialog: HTMLDialogElement, focus?: HTMLElement, returnTo?: HTMLElement): void {
  if (!dialog.open) {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    if (returnTo ?? active) dialogReturnFocus.set(dialog, (returnTo ?? active)!);
    dialog.showModal();
  }
  requestAnimationFrame(() => focus?.focus());
}

function openSplitDialog(key: string): void {
  const leaf = current().leaves.find((candidate) => keyOf(candidate) === key);
  if (!leaf) return;
  if (leaf.allocationGroupId) { showToast("Deallocate this subnet before splitting it"); return; }
  const select = byId<HTMLSelectElement>("split-prefix");
  const error = byId("split-error");
  select.replaceChildren();
  for (let prefix = leaf.prefix + 1; prefix <= current().profile.maxPrefixLength; prefix += 1) {
    const option = document.createElement("option");
    option.value = String(prefix);
    option.textContent = `/${prefix}`;
    select.append(option);
  }
  if (select.options.length === 0) { showToast("This subnet cannot be split under the selected profile"); return; }
  splitSourceKey = key;
  byId("split-source").textContent = `Split ${formatCidr(leaf)} into equal-sized child subnets.`;
  error.textContent = "";
  updateSplitPreview();
  const returnTo = world.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) ?? detailsSplit;
  openDialog(dialogs.split, select, returnTo);
}

function updateSplitPreview(): void {
  if (!splitSourceKey) return;
  const leaf = current().leaves.find((candidate) => keyOf(candidate) === splitSourceKey);
  if (!leaf) return;
  const prefix = Number(byId<HTMLSelectElement>("split-prefix").value);
  const count = 2 ** (prefix - leaf.prefix);
  const borrowed = prefix - leaf.prefix;
  byId("split-preview").textContent = `${count.toLocaleString()} × /${prefix} · ${blockSize(prefix).toLocaleString()} addresses each · ${borrowed} borrowed host bit${borrowed === 1 ? "" : "s"}`;
}

function closeMenus(except?: HTMLElement): void {
  document.querySelectorAll<HTMLButtonElement>(".menu-trigger").forEach((trigger) => {
    if (trigger === except) return;
    trigger.setAttribute("aria-expanded", "false");
    const controlled = trigger.getAttribute("aria-controls");
    if (controlled) byId(controlled).hidden = true;
  });
}

function renderedLeaves(): RenderedLeaf[] {
  const viewportRect = viewport.getBoundingClientRect();
  return [...world.querySelectorAll<HTMLElement>(".leaf")].map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      key: element.dataset.key ?? "",
      x: rect.left - viewportRect.left,
      y: rect.top - viewportRect.top,
      width: rect.width,
      height: rect.height,
      color: getComputedStyle(element).backgroundColor,
    };
  });
}

function exportSvgText(): string {
  return createSvg(current(), renderedLeaves(), viewport.clientWidth, viewport.clientHeight);
}

function applyViewTransform(): void {
  world.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
  zoomReadout.textContent = `${Math.round(scale * 100)}%`;
  const inverse = Math.min(1, 1 / scale);
  minimapView.style.width = `${inverse * 100}%`;
  minimapView.style.height = `${inverse * 100}%`;
  minimapView.style.left = `${Math.max(0, Math.min(100 - inverse * 100, -panX / Math.max(1, viewport.clientWidth * scale) * 100))}%`;
  minimapView.style.top = `${Math.max(0, Math.min(100 - inverse * 100, -panY / Math.max(1, viewport.clientHeight * scale) * 100))}%`;
}

function fitView(): void {
  const availableWidth = viewport.clientWidth - 24;
  const availableHeight = viewport.clientHeight - 24;
  const contentWidth = Math.max(1, world.scrollWidth);
  const contentHeight = Math.max(1, world.scrollHeight);
  scale = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
  panX = (availableWidth - contentWidth * scale) / 2;
  panY = (availableHeight - contentHeight * scale) / 2;
  applyViewTransform();
}

function resetView(): void {
  scale = 1; panX = 0; panY = 0; applyViewTransform();
}

function initializeDialogs(): void {
  document.querySelectorAll<HTMLButtonElement>(".dialog-close, .dialog-cancel").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });
  Object.values(dialogs).forEach((dialog) => {
    dialog.addEventListener("close", () => {
      const returnFocus = dialogReturnFocus.get(dialog);
      dialogReturnFocus.delete(dialog);
      requestAnimationFrame(() => returnFocus?.focus());
    });
    dialog.addEventListener("cancel", () => dialog.close());
  });
}

function initializeForms(): void {
  addressButton.addEventListener("click", () => {
    const input = byId<HTMLInputElement>("address-input");
    input.value = formatCidr(current().envelope);
    byId("address-error").textContent = "";
    openDialog(dialogs.address, input, addressButton);
  });
  byId<HTMLFormElement>("address-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const envelope = parseCidr(byId<HTMLInputElement>("address-input").value);
      const next = createWorkspace(envelope, current().profile);
      next.preferences = { ...current().preferences };
      history = createHistory(next, `Address space ${formatCidr(envelope)}`, "address-space");
      selected.clear(); activeKey = null; candidateKeys.clear();
      dialogs.address.close();
      safelyAutosave();
      addLog(`Started a new workspace at ${formatCidr(envelope)}.`);
      renderAll();
    } catch (error) { byId("address-error").textContent = error instanceof Error ? error.message : "Invalid address space"; }
  });

  byId<HTMLSelectElement>("split-prefix").addEventListener("change", updateSplitPreview);
  byId<HTMLFormElement>("split-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!splitSourceKey) return;
    const prefix = Number(byId<HTMLSelectElement>("split-prefix").value);
    const source = current().leaves.find((leaf) => keyOf(leaf) === splitSourceKey);
    const ok = applyOperation(splitLeaf(current(), splitSourceKey, prefix), `Split ${source ? formatCidr(source) : "subnet"} to /${prefix}`, "split");
    if (ok) dialogs.split.close(); else byId("split-error").textContent = "The split was rejected; see the status message.";
  });

  planButton.addEventListener("click", () => {
    byId<HTMLButtonElement>("dock-plan-tab").hidden = false;
    byId("plan-error").textContent = "";
    updatePlanPreview();
    setDockView("plan");
    requestAnimationFrame(() => byId<HTMLTextAreaElement>("plan-text").focus());
  });
  byId<HTMLTextAreaElement>("plan-text").addEventListener("input", updatePlanPreview);
  byId<HTMLSelectElement>("plan-heuristic").addEventListener("change", updatePlanPreview);
  document.querySelectorAll<HTMLButtonElement>(".plan-example").forEach((button) => {
    button.addEventListener("click", () => {
      byId<HTMLTextAreaElement>("plan-text").value = button.dataset.planExample ?? "";
      updatePlanPreview();
      byId<HTMLTextAreaElement>("plan-text").focus();
    });
  });
  byId<HTMLFormElement>("plan-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!planWorkspacePreview?.ok || !planWorkspacePreview.state) { byId("plan-error").textContent = "Create a valid preview first."; return; }
    const count = planWorkspacePreview.requests.reduce((sum, request) => sum + request.count, 0);
    const exactState = structuredClone(planWorkspacePreview.state);
    const ok = applyOperation({ ok: true, state: exactState }, `Applied plan for ${count} subnet${count === 1 ? "" : "s"}`, "plan");
    if (ok) {
      byId<HTMLButtonElement>("dock-plan-tab").hidden = true;
      if (!activeLessonId) setDockView("inventory");
    } else byId("plan-error").textContent = "The plan could not fit; no changes were made.";
  });
  byId("plan-close-button").addEventListener("click", () => { planWorkspacePreview = null; coachStep = -1; byId<HTMLButtonElement>("dock-plan-tab").hidden = true; setDockView("inspector"); renderAll(); planButton.focus(); });
  byId("coach-open-button").addEventListener("click", () => { coachStep = 0; renderCoach(); renderWorld(); });
  byId("coach-previous").addEventListener("click", () => { coachStep = Math.max(0, coachStep - 1); renderCoach(); renderWorld(); });
  byId("coach-next").addEventListener("click", () => { if (planWorkspacePreview) coachStep = Math.min(planWorkspacePreview.steps.length - 1, coachStep + 1); renderCoach(); renderWorld(); });

  byId<HTMLFormElement>("custom-profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const profile = customProfile(Number(byId<HTMLInputElement>("custom-head").value), Number(byId<HTMLInputElement>("custom-tail").value));
      const ok = applyOperation(changeProfile(current(), profile), `Changed reservation profile to ${profileLabel(profile)}`, "profile");
      if (ok) dialogs.custom.close(); else byId("custom-profile-error").textContent = "The current workspace is incompatible with these reservations.";
    } catch (error) { byId("custom-profile-error").textContent = error instanceof Error ? error.message : "Invalid custom profile"; }
  });

  byId<HTMLFormElement>("import-form").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const state = parseWorkspaceJson(byId<HTMLTextAreaElement>("import-text").value);
      history = createHistory(state, `Imported ${state.leaves.length} subnets`, "import");
      selected.clear(); activeKey = null; candidateKeys.clear();
      dialogs.import.close();
      safelyAutosave();
      addLog(`Imported ${state.leaves.length} subnets from schema version 1.`);
      renderAll();
    } catch (error) { byId("import-error").textContent = error instanceof Error ? error.message : "Invalid workspace"; }
  });

  byId<HTMLFormElement>("allocation-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!allocationSourceKey) return;
    const label = byId<HTMLInputElement>("allocation-label").value;
    const hostsText = byId<HTMLInputElement>("allocation-hosts").value;
    const groupId = byId<HTMLSelectElement>("allocation-group").value || undefined;
    const result = allocateLeaf(current(), allocationSourceKey, label, hostsText ? Number(hostsText) : undefined, groupId);
    if (applyOperation(result, `Allocated ${allocationSourceKey} to ${groupId ? "an existing group" : label.trim()}`, "allocate")) dialogs.allocation.close();
    else byId("allocation-error").textContent = result.error ?? "Allocation failed";
  });
  byId<HTMLSelectElement>("allocation-group").addEventListener("change", (event) => { byId<HTMLInputElement>("allocation-label").disabled = Boolean((event.target as HTMLSelectElement).value); });
}

function initializeMenus(): void {
  document.querySelectorAll<HTMLButtonElement>(".menu-trigger").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const expanded = trigger.getAttribute("aria-expanded") === "true";
      closeMenus(trigger);
      trigger.setAttribute("aria-expanded", String(!expanded));
      const controlled = trigger.getAttribute("aria-controls");
      if (controlled) byId(controlled).hidden = expanded;
    });
  });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest(".menu")) closeMenus();
  });

  byId("copy-link-button").addEventListener("click", async () => {
    const encoded = encodeShareState(current());
    const url = `${location.origin}${location.pathname}#state=${encoded}`;
    window.history.replaceState(null, "", `#state=${encoded}`);
    try { await navigator.clipboard.writeText(url); showToast("Share link copied"); }
    catch { showToast("Share link added to the address bar"); }
    closeMenus();
  });
  byId("export-json-button").addEventListener("click", () => downloadText("subnet-workspace.json", stringifyWorkspace(current()), "application/json"));
  byId("import-json-button").addEventListener("click", () => {
    byId<HTMLTextAreaElement>("import-text").value = "";
    byId("import-error").textContent = "";
    openDialog(dialogs.import, byId("import-text"), byId("import-json-button"));
    closeMenus();
  });
  byId("export-svg-button").addEventListener("click", () => { downloadText("subnets.svg", exportSvgText(), "image/svg+xml"); closeMenus(); });
  byId("export-png-button").addEventListener("click", async () => {
    try { await downloadPng(exportSvgText(), viewport.clientWidth, viewport.clientHeight); }
    catch (error) { showToast(error instanceof Error ? error.message : "PNG export failed"); }
    closeMenus();
  });
  byId("export-csv-button").addEventListener("click", () => { downloadText("subnets.csv", createCsv(current()), "text/csv"); closeMenus(); });
  byId("report-html-button").addEventListener("click", () => { downloadText("subnet-studio-report.html", createReportHtml(current()), "text/html"); closeMenus(); });
  byId("report-markdown-button").addEventListener("click", () => { downloadText("subnet-studio-report.md", createReportMarkdown(current()), "text/markdown"); closeMenus(); });
  byId("report-print-button").addEventListener("click", () => { openReportPreview(true); closeMenus(); });

  byId("help-button").addEventListener("click", () => showHelp(false));
  byId("shortcuts-button").addEventListener("click", () => showHelp(true));
  byId("replay-walkthrough-button").addEventListener("click", () => { closeMenus(); startWalkthrough(); });
}

function showHelp(shortcuts: boolean): void {
  const title = byId("help-title");
  const content = byId("help-content");
  const search = byId<HTMLInputElement>("help-search");
  title.textContent = shortcuts ? "Keyboard shortcuts" : `Help, privacy & about`;
  content.replaceChildren();
  const items = shortcuts
    ? ["Arrow keys: move between leaf subnets", "Enter: open the split dialog", "Space: add or remove a subnet from the join selection", "Ctrl/Cmd-click: multi-select without enabling Select mode"]
    : ["Select a map block for direct Split, Allocate, sibling, Join and Copy actions.", "Plan opens a transient ghost workspace. Subnet Coach explains every sizing and placement decision before you apply it.", "Join mode offers every valid aligned aggregation that contains your selected subnet.", "The timeline previews old states without changing them; restore a point to keep later work as redo history.", "Analyse measures capacity, provider overhead, contiguous free space and waste without guessing missing host requirements.", "Scenarios and guided lessons create safe practice workspaces.", `Subnet Studio ${packageInfo.version} is telemetry-free and works offline. Autosave stays in this browser. Workspace data leaves only when you copy a share link or export a file.`];
  const render = () => {
    const query = search.value.trim().toLowerCase();
    const matches = items.filter((text) => !query || text.toLowerCase().includes(query));
    const list = document.createElement("ul");
    matches.forEach((text) => { const item = document.createElement("li"); item.textContent = text; list.append(item); });
    content.replaceChildren(list);
    if (matches.length === 0) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "No matching help topics."; content.append(empty); }
  };
  search.value = "";
  search.oninput = render;
  render();
  openDialog(dialogs.help, search, shortcuts ? byId("shortcuts-button") : byId("help-button"));
  closeMenus();
}

function openAllocationDialog(key: string): void {
  const leaf = current().leaves.find((candidate) => keyOf(candidate) === key);
  if (!leaf) return;
  if (leaf.allocationGroupId) { showToast("This subnet is already allocated"); return; }
  allocationSourceKey = key;
  byId("allocation-cidr").textContent = `${formatCidr(leaf)} · ${usableCount(leaf.prefix, current().profile).toLocaleString()} usable addresses`;
  byId<HTMLInputElement>("allocation-label").value = "";
  byId<HTMLInputElement>("allocation-label").disabled = false;
  byId<HTMLInputElement>("allocation-hosts").value = "";
  byId("allocation-error").textContent = "";
  const select = byId<HTMLSelectElement>("allocation-group");
  select.replaceChildren();
  const fresh = document.createElement("option"); fresh.value = ""; fresh.textContent = "Create a new group"; select.append(fresh);
  current().groups.forEach((group) => { const option = document.createElement("option"); option.value = group.id; option.textContent = group.label; select.append(option); });
  openDialog(dialogs.allocation, byId("allocation-label"), byId("map-allocate-button"));
}

function confirmReplace(message: string, action: () => void): void {
  if (history.past.length === 0 && history.present.kind === "start") { action(); return; }
  confirmAction = action;
  byId("confirm-message").textContent = message;
  openDialog(dialogs.confirm, byId("confirm-cancel"));
}

function startOver(): void {
  const preferences = { ...current().preferences };
  const state = createWorkspace(parseCidr("192.168.1.0/24"));
  state.preferences = preferences;
  try { clearAutosave(); } catch { /* Starting over still works when storage is blocked. */ }
  history = createHistory(state, "Fresh default workspace", "start");
  selected.clear(); activeKey = null; candidateKeys.clear(); planWorkspacePreview = null; historyPreviewEntryId = null;
  window.history.replaceState(null, "", location.pathname);
  renderAll(); showToast("Started fresh with 192.168.1.0/24");
}

function renderScenarioGallery(): void {
  const grid = byId("scenario-grid"); grid.replaceChildren();
  SCENARIOS.forEach((scenario) => {
    const card = document.createElement("article"); card.className = "scenario-card";
    const eyebrow = document.createElement("code"); eyebrow.textContent = scenario.envelope;
    const title = document.createElement("h3"); title.textContent = scenario.title;
    const description = document.createElement("p"); description.textContent = scenario.description;
    const button = document.createElement("button"); button.type = "button"; button.textContent = scenario.challenge ? "Start challenge" : "Load scenario";
    button.addEventListener("click", () => confirmReplace(`Replace the current workspace with “${scenario.title}”?`, () => {
      try {
        const state = scenario.build(current().preferences);
        history = createHistory(state, `Loaded scenario: ${scenario.title}`, "scenario");
        selected.clear(); activeKey = null; candidateKeys.clear(); dialogs.scenarios.close(); safelyAutosave(); renderAll();
        if (scenario.challenge) {
          byId<HTMLTextAreaElement>("plan-text").value = "Network A: hosts=60\nNetwork B: hosts=30\nNetwork C: hosts=14\nPoint-to-point: hosts=2";
          byId<HTMLButtonElement>("dock-plan-tab").hidden = false; setDockView("plan"); updatePlanPreview(); showToast(scenario.challenge);
        } else showToast(`${scenario.title} loaded`);
      } catch (error) { showToast(error instanceof Error ? error.message : "Scenario could not be loaded"); }
    }));
    card.append(eyebrow, title, description, button); grid.append(card);
  });
}

function openReportPreview(printImmediately: boolean): void {
  byId<HTMLIFrameElement>("report-frame").srcdoc = createReportHtml(current());
  openDialog(dialogs.report, byId("report-download-html"), printImmediately ? byId("report-print-button") : byId("analysis-report-button"));
  if (printImmediately) dialogs.report.addEventListener("close", () => undefined, { once: true });
}

function printReport(): void {
  const frame = byId<HTMLIFrameElement>("report-frame");
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
}

const WALKTHROUGH = [
  { title: "Start with an address space", text: "Choose a canonical IPv4 envelope and a provider profile. Every operation stays aligned, complete and valid.", visual: "address" },
  { title: "Work directly on the map", text: "Select a block to split, allocate, find its buddy, join a sibling or copy the CIDR. Join mode reveals every valid aggregation.", visual: "map" },
  { title: "Use the contextual dock", text: "Inspect binary boundaries, browse every subnet, analyse capacity, practise lessons and explore prefixes without losing your place.", visual: "dock" },
  { title: "Preview, then understand", text: "Planning creates ghost subnets first. Subnet Coach explains reservations, prefix sizing, placement and retained sibling space before one atomic Apply.", visual: "coach" },
];
let walkthroughIndex = 0;

function renderWalkthrough(): void {
  const step = WALKTHROUGH[walkthroughIndex]!;
  byId("walkthrough-step").textContent = `Welcome · ${walkthroughIndex + 1} of ${WALKTHROUGH.length}`;
  byId("walkthrough-title").textContent = step.title;
  byId("walkthrough-text").textContent = step.text;
  byId("walkthrough-visual").dataset.step = step.visual;
  const dots = byId("walkthrough-dots"); dots.replaceChildren();
  WALKTHROUGH.forEach((_, index) => { const dot = document.createElement("i"); if (index === walkthroughIndex) dot.classList.add("active"); dots.append(dot); });
  byId<HTMLButtonElement>("walkthrough-back").disabled = walkthroughIndex === 0;
  byId("walkthrough-next").textContent = walkthroughIndex === WALKTHROUGH.length - 1 ? "Start exploring" : "Next";
}

function finishWalkthrough(): void {
  try { localStorage.setItem("subnet-studio-walkthrough-v1", "complete"); } catch { /* Completion persistence is optional. */ }
  dialogs.walkthrough.close();
}

function startWalkthrough(): void {
  walkthroughIndex = 0; renderWalkthrough(); openDialog(dialogs.walkthrough, byId("walkthrough-next"), byId("replay-walkthrough-button"));
}

function initializePublicationFeatures(): void {
  renderScenarioGallery();
  byId("version-label").textContent = `Subnet Studio ${packageInfo.version} · IPv4 · Offline · 2,048 leaf limit`;
  byId("confirm-cancel").addEventListener("click", () => { confirmAction = null; dialogs.confirm.close(); });
  byId("confirm-accept").addEventListener("click", () => { const action = confirmAction; confirmAction = null; dialogs.confirm.close(); action?.(); });
  byId("walkthrough-skip").addEventListener("click", finishWalkthrough);
  byId("walkthrough-back").addEventListener("click", () => { walkthroughIndex = Math.max(0, walkthroughIndex - 1); renderWalkthrough(); });
  byId("walkthrough-next").addEventListener("click", () => { if (walkthroughIndex === WALKTHROUGH.length - 1) finishWalkthrough(); else { walkthroughIndex += 1; renderWalkthrough(); } });
  let complete = false;
  try { complete = localStorage.getItem("subnet-studio-walkthrough-v1") === "complete"; } catch { /* Show walkthrough when storage is unavailable. */ }
  if (!complete) requestAnimationFrame(startWalkthrough);
}

function initializeControls(): void {
  profileSelect.addEventListener("change", () => {
    const requested = profileSelect.value;
    if (requested === "custom") {
      profileSelect.value = current().profile.id;
      byId<HTMLInputElement>("custom-head").value = String(current().profile.reservedHead);
      byId<HTMLInputElement>("custom-tail").value = String(current().profile.reservedTail);
      byId("custom-profile-error").textContent = "";
      openDialog(dialogs.custom, byId("custom-head"), profileSelect);
      return;
    }
    const profile = profileFor(requested as "none" | "azure" | "aws" | "gcp");
    if (!applyOperation(changeProfile(current(), profile), `Changed profile to ${profileLabel(profile)}`, "profile")) profileSelect.value = current().profile.id;
  });
  customProfileButton.addEventListener("click", () => {
    byId<HTMLInputElement>("custom-head").value = String(current().profile.reservedHead);
    byId<HTMLInputElement>("custom-tail").value = String(current().profile.reservedTail);
    openDialog(dialogs.custom, byId("custom-head"), customProfileButton);
  });
  themeButton.addEventListener("click", () => updatePreferences({ theme: current().preferences.theme === "dark" ? "light" : "dark" }));
  undoButton.addEventListener("click", () => { const next = undo(history); if (next !== history) { history = next; selected.clear(); activeKey = null; safelyAutosave(); addLog("Undid the last workspace change."); renderAll(); } });
  redoButton.addEventListener("click", () => { const next = redo(history); if (next !== history) { history = next; selected.clear(); activeKey = null; safelyAutosave(); addLog("Redid the next workspace change."); renderAll(); } });
  resetButton.addEventListener("click", () => applyOperation({ ok: true, state: resetWorkspace(current()) }, "Reset allocations and subdivisions", "reset"));
  byId("start-over-button").addEventListener("click", () => confirmReplace("Start over with the default 192.168.1.0/24? This clears timeline history and local autosave, but keeps your display preferences and completed lessons.", startOver));
  selectButton.addEventListener("click", () => { selectMode = !selectMode; if (!selectMode) { selected.clear(); candidateKeys.clear(); } selectButton.setAttribute("aria-pressed", String(selectMode)); renderAll(); showToast(selectMode ? "Join mode enabled — select a subnet to see valid aggregates" : "Join mode disabled"); });
  joinButton.addEventListener("click", () => applyOperation(joinLeaves(current(), [...selected]), `Joined ${selected.size} subnets into their aggregate`, "join"));
  findFitButton.addEventListener("click", () => {
    const prefix = Number(findFitPrefix.value);
    if (prefix < current().envelope.prefix) { showToast("Requested prefix is larger than the workspace envelope"); return; }
    const error = validateCidrForProfile({ network: current().envelope.network, prefix }, current().profile);
    if (error) { showToast(error); return; }
    candidateKeys = new Set(current().leaves.filter((leaf) => !leaf.allocationGroupId && leaf.prefix <= prefix).map(keyOf));
    renderAll();
    showToast(`${candidateKeys.size} candidate space${candidateKeys.size === 1 ? "" : "s"} highlighted`);
  });
  clearHighlightButton.addEventListener("click", () => { candidateKeys.clear(); renderAll(); });
  detailsClose.addEventListener("click", () => { detailsPanel.hidden = true; activeKey = null; renderAll(); });
  detailsSplit.addEventListener("click", () => { if (activeKey) openSplitDialog(activeKey); });
  detailsDeallocate.addEventListener("click", () => { if (activeKey) applyOperation(deallocateLeaf(current(), activeKey), `Deallocated ${activeKey}`, "deallocate"); });
  binaryToggle.addEventListener("click", () => { binaryVisible = !binaryVisible; if (activeKey) renderDetails(); });
  tableFilter.addEventListener("change", renderTable);
  tableSort.addEventListener("change", renderTable);
  byId<HTMLSelectElement>("label-density").addEventListener("change", (event) => updatePreferences({ labelDensity: (event.target as HTMLSelectElement).value as WorkspacePreferences["labelDensity"] }));
  byId<HTMLSelectElement>("animation-select").addEventListener("change", (event) => updatePreferences({ animation: (event.target as HTMLSelectElement).value as WorkspacePreferences["animation"] }));
  byId("compact-button").addEventListener("click", () => updatePreferences({ compact: !current().preferences.compact }));
  fitButton.addEventListener("click", fitView);
  resetViewButton.addEventListener("click", resetView);
  panButton.addEventListener("click", () => {
    panMode = !panMode;
    viewport.classList.toggle("pan-mode", panMode);
    panButton.setAttribute("aria-pressed", String(panMode));
    showToast(panMode ? "Pan mode enabled — drag the canvas to move it" : "Pan mode disabled");
  });
  byId("scenarios-button").addEventListener("click", () => openDialog(dialogs.scenarios, byId("scenario-grid").querySelector("button") ?? undefined, byId("scenarios-button")));
  byId("analysis-report-button").addEventListener("click", () => openReportPreview(false));
  byId("report-download-html").addEventListener("click", () => downloadText("subnet-studio-report.html", createReportHtml(current()), "text/html"));
  byId("report-print-preview").addEventListener("click", () => printReport());
  byId("history-preview-close").addEventListener("click", () => { historyPreviewEntryId = null; renderAll(); });
  byId("history-restore-button").addEventListener("click", () => { if (historyPreviewEntryId !== null) restoreHistoryEntry(historyPreviewEntryId); });
  byId("map-split-button").addEventListener("click", () => { if (activeKey) openSplitDialog(activeKey); });
  byId("map-allocate-button").addEventListener("click", () => { if (activeKey) openAllocationDialog(activeKey); });
  byId("map-deallocate-button").addEventListener("click", () => { if (activeKey) applyOperation(deallocateLeaf(current(), activeKey), `Deallocated ${activeKey}`, "deallocate"); });
  byId("map-sibling-button").addEventListener("click", () => { if (!activeKey) return; const sibling = siblingKey(current(), activeKey); if (!sibling) return; selected = new Set([activeKey, sibling]); selectMode = true; renderAll(); showToast("Complete sibling pair selected"); });
  byId("map-join-sibling-button").addEventListener("click", () => { if (!activeKey) return; const sibling = siblingKey(current(), activeKey); if (sibling) applyOperation(joinLeaves(current(), [activeKey, sibling]), `Joined ${activeKey} with its sibling`, "join"); });
  byId("map-copy-button").addEventListener("click", async () => { if (!activeKey) return; const leaf = current().leaves.find((candidate) => keyOf(candidate) === activeKey); if (!leaf) return; try { await navigator.clipboard.writeText(formatCidr(leaf)); showToast("CIDR copied"); } catch { showToast(formatCidr(leaf)); } });
}

function initializePointerControls(): void {
  const pointers = new Map<number, { x: number; y: number }>();
  const desktopDragPointers = new Set<number>();
  let previousDistance = 0;
  let previousCenter = { x: 0, y: 0 };
  let dragDistance = 0;
  viewport.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!panMode && event.button === 0 && event.pointerType !== "touch") {
      desktopDragPointers.add(event.pointerId);
      dragDistance = 0;
    }
    if (panMode || pointers.size > 1) {
      try { viewport.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers may not be capturable. */ }
      viewport.classList.add("is-panning");
      world.classList.add("no-transition");
      event.preventDefault();
    }
    if (pointers.size === 2) {
      const values = [...pointers.values()];
      const first = values[0]!; const second = values[1]!;
      previousDistance = Math.hypot(first.x - second.x, first.y - second.y);
      previousCenter = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    }
  });
  viewport.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const values = [...pointers.values()];
      const first = values[0]!; const second = values[1]!;
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const rect = viewport.getBoundingClientRect();
      const localX = center.x - rect.left;
      const localY = center.y - rect.top;
      const nextScale = Math.max(.3, Math.min(4, scale * (distance / Math.max(1, previousDistance))));
      panX = localX - (localX - panX) * (nextScale / scale) + (center.x - previousCenter.x);
      panY = localY - (localY - panY) * (nextScale / scale) + (center.y - previousCenter.y);
      scale = nextScale;
      previousDistance = distance;
      previousCenter = center;
      applyViewTransform();
      event.preventDefault();
    } else if (panMode || desktopDragPointers.has(event.pointerId)) {
      const deltaX = event.clientX - previous.x;
      const deltaY = event.clientY - previous.y;
      dragDistance += Math.hypot(deltaX, deltaY);
      if (!panMode && dragDistance < 4) return;
      if (!panMode) {
        try { viewport.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers may not be capturable. */ }
        viewport.classList.add("is-panning");
        world.classList.add("no-transition");
        suppressNextLeafClick = true;
      }
      panX += deltaX;
      panY += deltaY;
      applyViewTransform();
      event.preventDefault();
    }
  });
  const release = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    desktopDragPointers.delete(event.pointerId);
    if (pointers.size === 0) {
      viewport.classList.remove("is-panning");
      world.classList.remove("no-transition");
      if (suppressNextLeafClick) window.setTimeout(() => { suppressNextLeafClick = false; }, 0);
    }
  };
  viewport.addEventListener("pointerup", release);
  viewport.addEventListener("pointercancel", release);
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const nextScale = Math.max(.3, Math.min(4, scale * Math.exp(-event.deltaY * .001)));
    panX = x - (x - panX) * (nextScale / scale);
    panY = y - (y - panY) * (nextScale / scale);
    scale = nextScale;
    applyViewTransform();
  }, { passive: false });
}

function initializeDetailsDrag(): void {
  window.addEventListener("resize", renderWorld);
}

function initializeDock(): void {
  (Object.entries(dockViews) as [DockView, { tab: HTMLButtonElement; panel: HTMLElement }][]).forEach(([view, item]) => {
    item.tab.addEventListener("click", () => setDockView(view));
    item.tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const views = Object.keys(dockViews) as DockView[];
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = views[(views.indexOf(activeDockView) + direction + views.length) % views.length]!;
      setDockView(next, true);
    });
  });
  setDockView("inspector");
}

function initializeLearning(): void {
  try {
    const saved = JSON.parse(localStorage.getItem("subnet-completed-lessons") ?? "[]") as unknown;
    if (Array.isArray(saved)) {
      saved.forEach((id) => {
        if (typeof id === "string" && LESSONS.some((lesson) => lesson.id === id)) completedLessons.add(id as LessonId);
      });
    }
  } catch { localStorage.removeItem("subnet-completed-lessons"); }

  learnButton.addEventListener("click", () => {
    setDockView("learn");
    renderLessonPanel();
    if (window.innerWidth >= 901) byId("learn-close").focus();
  });
  byId("learn-close").addEventListener("click", () => {
    setDockView("inspector");
    learnButton.focus();
  });
  byId("lesson-hint-button").addEventListener("click", () => {
    const hint = byId("lesson-hint");
    const lesson = lessonDefinition();
    if (!lesson) return;
    hint.hidden = !hint.hidden;
    hint.textContent = lesson.hint;
    byId("lesson-hint-button").textContent = hint.hidden ? "Show hint" : "Hide hint";
  });
  byId("lesson-restart-button").addEventListener("click", () => {
    if (activeLessonId) startLesson(activeLessonId);
  });
  byId("lesson-exit-button").addEventListener("click", exitLesson);
  prefixSlider.addEventListener("input", renderPrefixLab);
  renderPrefixLab();
}

function initializeState(): HistoryState {
  const fallback = createWorkspace(parseCidr("192.168.1.0/24"), profileFor("none"));
  const encoded = location.hash.startsWith("#state=") ? location.hash.slice(7) : "";
  if (encoded) {
    try {
      const loaded = decodeShareState(encoded);
      requestAnimationFrame(() => showToast(`Loaded ${loaded.leaves.length} subnets from a share link`));
      return createHistory(loaded, "Loaded shared workspace", "import");
    } catch (error) {
      requestAnimationFrame(() => showToast(error instanceof Error ? error.message : "Invalid share link"));
      window.history.replaceState(null, "", location.pathname);
    }
  }
  let autosave = null as ReturnType<typeof loadAutosave>;
  try { autosave = loadAutosave(); } catch { /* Opaque file origins may deny local storage. */ }
  if (autosave) {
    requestAnimationFrame(() => showToast(`Recovered local autosave from ${new Date(autosave.savedAt).toLocaleString()}. Use Start over to discard it.`));
    return createHistory(autosave.workspace, "Recovered local autosave", "start");
  }
  return createHistory(fallback);
}

history = initializeState();
initializeDialogs();
initializeForms();
initializeMenus();
initializeControls();
initializePointerControls();
initializeDetailsDrag();
initializeDock();
initializeLearning();
initializePublicationFeatures();
addLog(`Ready with ${formatCidr(current().envelope)}.`);
renderAll();
