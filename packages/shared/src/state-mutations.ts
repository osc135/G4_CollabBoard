import type { BoardObject, BoardState } from "./schema";
import { safeParseBoardObject } from "./schema";

export const emptyState: BoardState = { objects: [] };

/**
 * Apply a create operation. If an object with the same id exists, replace it (LWW).
 */
export function applyCreate(state: BoardState, payload: unknown): BoardState {
  const parsed = safeParseBoardObject(payload);
  if (!parsed.success) {
    throw new Error(`Invalid payload: ${parsed.error.message}`);
  }
  const obj = parsed.data;
  const existing = state.objects.findIndex((o) => o.id === obj.id);
  const objects = [...state.objects];
  if (existing >= 0) {
    objects[existing] = obj;
  } else {
    objects.push(obj);
  }
  return { objects };
}

/**
 * Apply an update operation. Last write wins. Merges payload into existing object to preserve fields like rotation.
 * No-op if objectId not found.
 */
export function applyUpdate(state: BoardState, payload: unknown): BoardState {
  const parsed = safeParseBoardObject(payload);
  if (!parsed.success) {
    throw new Error(`Invalid payload: ${parsed.error.message}`);
  }
  const update = parsed.data;
  const idx = state.objects.findIndex((o) => o.id === update.id);
  if (idx < 0) return state;
  const objects = [...state.objects];
  const existing = objects[idx];
  const merged = { ...existing } as Record<string, unknown>;
  for (const [k, v] of Object.entries(update)) {
    if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
  }
  objects[idx] = merged as BoardObject;
  return { objects };
}

/**
 * Apply a delete operation. No-op if objectId not in state.
 * Also removes any connectors that were attached to the deleted object.
 */
export function applyDelete(state: BoardState, objectId: string): BoardState {
  // Filter out the object itself and any connectors attached to it
  const objects = state.objects.filter((o) => {
    if (o.id === objectId) return false;
    // Also remove connectors that are attached to this object
    if (o.type === "connector") {
      const connector = o as any;
      if (connector.startObjectId === objectId || connector.endObjectId === objectId) {
        return false;
      }
    }
    return true;
  });
  if (objects.length === state.objects.length) return state;
  return { objects };
}
