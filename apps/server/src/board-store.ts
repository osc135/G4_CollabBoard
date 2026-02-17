import type { BoardState } from "@collabboard/shared";
import { emptyState, applyCreate, applyUpdate, applyDelete } from "@collabboard/shared";

const boards = new Map<string, BoardState>();
let persist: ((boardId: string, state: BoardState) => void) | null = null;

export function setPersist(fn: (boardId: string, state: BoardState) => void) {
  persist = fn;
}

function getOrEmpty(boardId: string): BoardState {
  const state = boards.get(boardId);
  if (state) return state;
  const initial = { ...emptyState };
  boards.set(boardId, initial);
  return initial;
}

export function getBoardState(boardId: string): BoardState {
  return getOrEmpty(boardId);
}

export function loadBoardState(boardId: string, state: BoardState) {
  boards.set(boardId, state);
}

export function addObject(boardId: string, payload: unknown): BoardState {
  const current = getOrEmpty(boardId);
  const next = applyCreate(current, payload);
  boards.set(boardId, next);
  persist?.(boardId, next);
  return next;
}

export function updateObject(boardId: string, payload: unknown): BoardState {
  const current = getOrEmpty(boardId);
  const next = applyUpdate(current, payload);
  if (next !== current) {
    boards.set(boardId, next);
    persist?.(boardId, next);
  }
  return next;
}

export function removeObject(boardId: string, objectId: string): BoardState {
  const current = getOrEmpty(boardId);
  const next = applyDelete(current, objectId);
  if (next !== current) {
    boards.set(boardId, next);
    persist?.(boardId, next);
  }
  return next;
}

export function clearBoardForTesting(boardId: string): void {
  boards.delete(boardId);
}
