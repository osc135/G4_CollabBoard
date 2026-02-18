/**
 * Extract the invite code from a room ID
 * Room IDs are in format: room-timestamp-randomstring
 * We use the first 6 characters of the randomstring as the invite code
 */
export function extractRoomCode(roomId: string): string {
  const parts = roomId.split('-');
  if (parts.length < 3) return '';
  
  const lastPart = parts[parts.length - 1];
  return lastPart.substring(0, 6).toUpperCase();
}