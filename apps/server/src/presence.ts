type Cursor = { id: string; userId: string; name: string; x: number; y: number; color?: string };

const cursors = new Map<string, Map<string, Cursor>>();
const presence = new Map<string, Map<string, { userId: string; name: string }>>();

function getCursorsMap(boardId: string): Map<string, Cursor> {
  if (!cursors.has(boardId)) cursors.set(boardId, new Map());
  return cursors.get(boardId)!;
}

function getPresenceMap(boardId: string): Map<string, { userId: string; name: string }> {
  if (!presence.has(boardId)) presence.set(boardId, new Map());
  return presence.get(boardId)!;
}

export function setCursor(boardId: string, socketId: string, cursor: Cursor): void {
  getCursorsMap(boardId).set(socketId, cursor);
}

export function removeCursor(boardId: string, socketId: string): void {
  getCursorsMap(boardId).delete(socketId);
}

export function getCursorsForBoard(boardId: string): Cursor[] {
  return Array.from(getCursorsMap(boardId).values());
}

export function setPresence(boardId: string, socketId: string, userId: string, name: string): void {
  getPresenceMap(boardId).set(socketId, { userId, name });
}

export function removePresence(boardId: string, socketId: string): void {
  getPresenceMap(boardId).delete(socketId);
}

export function getPresenceForBoard(boardId: string): { userId: string; name: string }[] {
  return Array.from(getPresenceMap(boardId).values());
}
