import { formatCidr, usableCount } from "./cidr";
import type { WorkspaceState } from "./types";

export interface RenderedLeaf {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

export function createSvg(state: WorkspaceState, rendered: RenderedLeaf[], width: number, height: number): string {
  const svg = svgElement("svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  const background = svgElement("rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", state.preferences.theme === "dark" ? "#0b1220" : "#f8fafc");
  svg.append(background);
  const leavesByKey = new Map(state.leaves.map((leaf) => [`${leaf.network}/${leaf.prefix}`, leaf]));
  const groups = new Map(state.groups.map((group) => [group.id, group]));
  for (const item of rendered) {
    const leaf = leavesByKey.get(item.key);
    if (!leaf) continue;
    const group = leaf.allocationGroupId ? groups.get(leaf.allocationGroupId) : undefined;
    const rect = svgElement("rect");
    rect.setAttribute("x", String(item.x));
    rect.setAttribute("y", String(item.y));
    rect.setAttribute("width", String(item.width));
    rect.setAttribute("height", String(item.height));
    rect.setAttribute("rx", "8");
    rect.setAttribute("fill", group?.color ?? item.color);
    rect.setAttribute("stroke", group ? "#15803d" : "#94a3b8");
    svg.append(rect);
    if (item.width >= 80 && item.height >= 28) {
      const text = svgElement("text");
      text.setAttribute("x", String(item.x + item.width / 2));
      text.setAttribute("y", String(item.y + item.height / 2));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("font-family", "system-ui, sans-serif");
      text.setAttribute("font-size", "12");
      text.setAttribute("fill", "#0f172a");
      text.textContent = `${formatCidr(leaf)}${group ? ` — ${group.label}` : ""}`;
      svg.append(text);
    }
  }
  return new XMLSerializer().serializeToString(svg);
}

export function createCsv(state: WorkspaceState): string {
  const groups = new Map(state.groups.map((group) => [group.id, group]));
  const rows = [["CIDR", "Usable", "Status", "Group"]];
  for (const leaf of state.leaves) {
    const group = leaf.allocationGroupId ? groups.get(leaf.allocationGroupId) : undefined;
    rows.push([formatCidr(leaf), String(usableCount(leaf.prefix, state.profile)), group ? "Allocated" : "Unallocated", group?.label ?? ""]);
  }
  return rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function downloadText(filename: string, data: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadPng(svgText: string, width: number, height: number): Promise<void> {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
  canvas.height = Math.max(1, Math.round(height * devicePixelRatio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is not available");
  context.scale(devicePixelRatio, devicePixelRatio);
  context.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG export failed")), "image/png"));
  const pngUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = pngUrl;
  anchor.download = "subnets.png";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(pngUrl), 0);
}
