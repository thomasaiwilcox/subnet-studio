import { analyseWorkspace } from "./analysis";
import { blockSize, formatCidr, usableCount } from "./cidr";
import { profileLabel } from "./profiles";
import type { WorkspaceState } from "./types";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
}

function reportMap(state: WorkspaceState): string {
  const total = blockSize(state.envelope.prefix);
  const groups = new Map(state.groups.map((group) => [group.id, group]));
  let x = 0;
  return `<svg viewBox="0 0 1200 240" role="img" aria-label="Canonical subnet map" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="240" rx="20" fill="#101727"/>${state.leaves.map((leaf) => {
    const width = blockSize(leaf.prefix) / total * 1200;
    const group = leaf.allocationGroupId ? groups.get(leaf.allocationGroupId) : undefined;
    const item = `<rect x="${x.toFixed(3)}" y="0" width="${Math.max(1, width).toFixed(3)}" height="240" fill="${group?.color ?? "#26344f"}" stroke="#0b1020"/><title>${escapeHtml(formatCidr(leaf))}${group ? ` — ${escapeHtml(group.label)}` : " — Available"}</title>`;
    x += width;
    return item;
  }).join("")}</svg>`;
}

export function createReportMarkdown(state: WorkspaceState, generatedAt = new Date()): string {
  const analysis = analyseWorkspace(state);
  const groups = new Map(state.groups.map((group) => [group.id, group]));
  const lines = [
    "# Subnet Studio report", "",
    `Generated: ${generatedAt.toISOString()}`, `Workspace: ${formatCidr(state.envelope)}`, `Profile: ${profileLabel(state.profile)}`, "",
    "## Capacity analysis", "",
    `- Total addresses: ${analysis.totalAddresses.toLocaleString()}`,
    `- Allocated: ${analysis.allocatedAddresses.toLocaleString()} (${analysis.allocationPercentage.toFixed(1)}%)`,
    `- Free: ${analysis.freeAddresses.toLocaleString()}`,
    `- Measured waste: ${analysis.measuredWaste.toLocaleString()}`,
    `- Largest available: ${analysis.largestAvailable ? formatCidr(analysis.largestAvailable) : "None"}`,
    `- Free regions: ${analysis.freeRegionCount}`, "",
    "## Subnet inventory", "", "| CIDR | Usable | Status | Group |", "|---|---:|---|---|",
  ];
  for (const leaf of state.leaves) {
    const group = leaf.allocationGroupId ? groups.get(leaf.allocationGroupId) : undefined;
    const safeLabel = (group?.label ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\|/g, "\\|")
      .replace(/[\r\n]+/g, " ");
    lines.push(`| ${formatCidr(leaf)} | ${usableCount(leaf.prefix, state.profile)} | ${group ? "Allocated" : "Available"} | ${safeLabel} |`);
  }
  lines.push("", "## Planning assumptions", "", "IPv4 only. Provider validation covers prefix limits and per-subnet reserved-address counts. Unknown host requirements are not estimated.");
  return lines.join("\n");
}

export function createReportHtml(state: WorkspaceState, generatedAt = new Date()): string {
  const analysis = analyseWorkspace(state);
  const groups = new Map(state.groups.map((group) => [group.id, group]));
  const groupRows = analysis.groups.map((group) => `<tr><td><i style="background:${group.color}"></i>${escapeHtml(group.label)}</td><td>${group.subnetCount}</td><td>${group.usable.toLocaleString()}</td><td>${group.measuredWaste === undefined ? "Unknown" : group.measuredWaste.toLocaleString()}</td></tr>`).join("");
  const leafRows = state.leaves.map((leaf) => {
    const group = leaf.allocationGroupId ? groups.get(leaf.allocationGroupId) : undefined;
    return `<tr><td>${formatCidr(leaf)}</td><td>${blockSize(leaf.prefix).toLocaleString()}</td><td>${usableCount(leaf.prefix, state.profile).toLocaleString()}</td><td>${group ? "Allocated" : "Available"}</td><td>${escapeHtml(group?.label ?? "")}</td></tr>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Subnet Studio report — ${formatCidr(state.envelope)}</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f6fb;color:#182235;font:14px system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:36px}h1{font-size:34px;margin:0 0 5px}.meta{color:#5d6b82}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:24px 0}.card,section{background:white;border:1px solid #dce3ee;border-radius:14px;padding:18px}.card strong{display:block;font-size:24px}section{margin:16px 0}svg{width:100%;height:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:9px;border-bottom:1px solid #e4e9f1}th{color:#526079}i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px}@page{size:A4 landscape;margin:10mm}@media print{body{background:white}main{max-width:none;padding:0}.card,section{break-inside:avoid;box-shadow:none}.no-print{display:none}}</style></head><body><main><header><h1>Subnet Studio report</h1><p class="meta">${formatCidr(state.envelope)} · ${escapeHtml(profileLabel(state.profile))} · ${generatedAt.toLocaleString()}</p></header><div class="cards"><div class="card"><span>Total</span><strong>${analysis.totalAddresses.toLocaleString()}</strong></div><div class="card"><span>Allocated</span><strong>${analysis.allocationPercentage.toFixed(1)}%</strong></div><div class="card"><span>Free</span><strong>${analysis.freeAddresses.toLocaleString()}</strong></div><div class="card"><span>Waste</span><strong>${analysis.measuredWaste.toLocaleString()}</strong></div><div class="card"><span>Free regions</span><strong>${analysis.freeRegionCount}</strong></div></div><section><h2>Canonical subnet map</h2>${reportMap(state)}</section><section><h2>Allocation groups</h2><table><thead><tr><th>Group</th><th>Subnets</th><th>Usable</th><th>Measured waste</th></tr></thead><tbody>${groupRows || "<tr><td colspan=4>No allocations</td></tr>"}</tbody></table></section><section><h2>Complete subnet inventory</h2><table><thead><tr><th>CIDR</th><th>Addresses</th><th>Usable</th><th>Status</th><th>Group</th></tr></thead><tbody>${leafRows}</tbody></table></section><section><h2>Planning assumptions</h2><p>IPv4 only. Provider validation covers prefix limits and per-subnet reserved-address counts. Allocations without requested-host data are reported separately rather than estimated.</p></section></main></body></html>`;
}
