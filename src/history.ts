import { cloneState } from "./model";
import type { HistoryEntry, HistoryState, TransactionKind, WorkspaceState } from "./types";
import { MAX_HISTORY } from "./types";

function cloneEntry(entry: HistoryEntry): HistoryEntry {
  return { ...entry, state: cloneState(entry.state) };
}

export function createHistory(
  initial: WorkspaceState,
  label = "Workspace started",
  kind: TransactionKind = "start",
): HistoryState {
  return {
    past: [],
    present: { id: 1, label, kind, state: cloneState(initial) },
    future: [],
    nextId: 2,
  };
}

export function commit(
  history: HistoryState,
  next: WorkspaceState,
  label = "Workspace changed",
  kind: TransactionKind = "start",
): HistoryState {
  const present: HistoryEntry = { id: history.nextId, label, kind, state: cloneState(next) };
  const past = [...history.past.map(cloneEntry), cloneEntry(history.present)].slice(-MAX_HISTORY);
  return { past, present, future: [], nextId: history.nextId + 1 };
}

export function undo(history: HistoryState): HistoryState {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1).map(cloneEntry),
    present: cloneEntry(previous),
    future: [cloneEntry(history.present), ...history.future.map(cloneEntry)],
    nextId: history.nextId,
  };
}

export function redo(history: HistoryState): HistoryState {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past.map(cloneEntry), cloneEntry(history.present)].slice(-MAX_HISTORY),
    present: cloneEntry(next),
    future: history.future.slice(1).map(cloneEntry),
    nextId: history.nextId,
  };
}

export function jumpToHistoryEntry(history: HistoryState, entryId: number): HistoryState {
  const timeline = [...history.past, history.present, ...history.future];
  const index = timeline.findIndex((entry) => entry.id === entryId);
  if (index < 0) return history;
  const target = timeline[index]!;
  return {
    past: timeline.slice(0, index).slice(-MAX_HISTORY).map(cloneEntry),
    present: cloneEntry(target),
    future: timeline.slice(index + 1).map(cloneEntry),
    nextId: history.nextId,
  };
}
