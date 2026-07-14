import { z } from "zod";
import { parseWorkspaceJson, stringifyWorkspace } from "./persistence";
import type { WorkspaceState } from "./types";

export const AUTOSAVE_KEY = "subnet-studio-autosave-v1";

const autosaveSchema = z.object({
  version: z.literal(1),
  savedAt: z.string().datetime(),
  workspace: z.string(),
});

export interface AutosaveRecord {
  version: 1;
  savedAt: string;
  workspace: WorkspaceState;
}

export function saveAutosave(state: WorkspaceState, storage: Storage = localStorage): string {
  const savedAt = new Date().toISOString();
  storage.setItem(AUTOSAVE_KEY, JSON.stringify({ version: 1, savedAt, workspace: stringifyWorkspace(state) }));
  return savedAt;
}

export function loadAutosave(storage: Storage = localStorage): AutosaveRecord | null {
  const raw = storage.getItem(AUTOSAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = autosaveSchema.parse(JSON.parse(raw));
    return { version: 1, savedAt: parsed.savedAt, workspace: parseWorkspaceJson(parsed.workspace) };
  } catch {
    try { storage.removeItem(AUTOSAVE_KEY); } catch { /* A read-only store is safe to ignore. */ }
    return null;
  }
}

export function clearAutosave(storage: Storage = localStorage): void {
  storage.removeItem(AUTOSAVE_KEY);
}
