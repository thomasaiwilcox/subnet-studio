import { gzipSync, gunzipSync, strFromU8, strToU8 } from "fflate";
import { z } from "zod";
import { validateWorkspace } from "./model";
import type { WorkspaceState } from "./types";

const uint32 = z.number().int().min(0).max(2 ** 32 - 1);
const prefix = z.number().int().min(0).max(32);
const cidrSchema = z.object({ network: uint32, prefix });
const profileSchema = z.object({
  id: z.enum(["none", "azure", "aws", "gcp", "custom"]),
  reservedHead: z.number().int().min(0).max(65536),
  reservedTail: z.number().int().min(0).max(65536),
  minPrefixLength: prefix,
  maxPrefixLength: prefix,
});
const leafSchema = cidrSchema.extend({ allocationGroupId: z.string().max(120).optional() });
const groupSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  requestedHosts: z.number().int().min(1).max(2 ** 32).optional(),
});
const preferencesSchema = z.object({
  theme: z.enum(["light", "dark"]),
  labelDensity: z.enum(["minimal", "normal", "verbose"]),
  compact: z.boolean(),
  animation: z.enum(["normal", "reduced", "off"]),
});

export const workspaceSchema = z.object({
  schemaVersion: z.literal(1),
  envelope: cidrSchema,
  profile: profileSchema,
  leaves: z.array(leafSchema).min(1).max(2048),
  groups: z.array(groupSchema).max(2048),
  preferences: preferencesSchema,
});

export function parseWorkspaceJson(input: string): WorkspaceState {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    throw new Error("The file is not valid JSON");
  }
  const parsed = workspaceSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(first ? `${first.path.join(".") || "workspace"}: ${first.message}` : "Invalid workspace format");
  }
  const state = parsed.data as WorkspaceState;
  if (state.profile.minPrefixLength > state.profile.maxPrefixLength) {
    throw new Error("Profile minimum prefix cannot exceed its maximum prefix");
  }
  if (state.profile.reservedHead + state.profile.reservedTail > 65536) {
    throw new Error("Profile reservations exceed 65,536 addresses");
  }
  const errors = validateWorkspace(state);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return state;
}

export function stringifyWorkspace(state: WorkspaceState): string {
  return JSON.stringify(state, null, 2);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("Share link is not valid Base64URL data");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeShareState(state: WorkspaceState): string {
  const compressed = gzipSync(strToU8(JSON.stringify(state)), { level: 9 });
  return bytesToBase64Url(compressed);
}

export function decodeShareState(encoded: string): WorkspaceState {
  if (encoded.length > 500_000) throw new Error("Share state is too large");
  try {
    const json = strFromU8(gunzipSync(base64UrlToBytes(encoded)));
    return parseWorkspaceJson(json);
  } catch (error) {
    if (error instanceof Error) throw new Error(`Could not load share state: ${error.message}`);
    throw new Error("Could not load share state");
  }
}
