import { prefixForHosts } from "./model";
import type { PlanRequest, ProfileSelection } from "./types";

export function parsePlan(input: string, profile: ProfileSelection): { requests: PlanRequest[]; errors: string[] } {
  const requests: PlanRequest[] = [];
  const errors: string[] = [];
  const lines = input.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+/g, " ");
    const match = line.match(/^(?:([^:]{1,120}):\s*)?(?:(?:\/(\d{1,2}))|(?:prefix\s*=\s*(\d{1,2}))|(?:hosts\s*[:=]\s*(\d+)))(?:\s*x\s*(\d+))?$/i);
    if (!match) {
      errors.push(`Line ${index + 1}: use “Label: /26 x3” or “Label: hosts=50”`);
      return;
    }
    const label = (match[1] ?? "").trim();
    const hosts = match[4] ? Number(match[4]) : undefined;
    const resolvedPrefix = hosts === undefined ? Number(match[2] ?? match[3]) : prefixForHosts(hosts, profile);
    const count = Number(match[5] ?? 1);
    if (resolvedPrefix === null || !Number.isInteger(resolvedPrefix) || resolvedPrefix < 0 || resolvedPrefix > 32) {
      errors.push(`Line ${index + 1}: requested size cannot be represented under the selected profile`);
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 2048) {
      errors.push(`Line ${index + 1}: count must be between 1 and 2,048`);
      return;
    }
    requests.push({ label, prefix: resolvedPrefix, count, requestedHosts: hosts });
  });
  if (lines.length === 0) errors.push("Add at least one request");
  return { requests, errors };
}
