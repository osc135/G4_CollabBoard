import { describe, it, expect } from 'vitest';
import { extractRoomCode } from './roomCode';

describe('extractRoomCode', () => {
  it('should extract the first 6 characters of the random string portion', () => {
    expect(extractRoomCode('room-1771392740060-s2uwvq20w')).toBe('S2UWVQ');
    expect(extractRoomCode('room-1771394309369-1b2tn30x5')).toBe('1B2TN3');
    expect(extractRoomCode('room-1771393770038-2bn6y2083')).toBe('2BN6Y2');
  });

  it('should return uppercase codes', () => {
    expect(extractRoomCode('room-1234567890-abcdef123')).toBe('ABCDEF');
    expect(extractRoomCode('room-0000000000-xyz12345')).toBe('XYZ123');
  });

  it('should handle different timestamp lengths', () => {
    expect(extractRoomCode('room-123-abcdef')).toBe('ABCDEF');
    expect(extractRoomCode('room-1234567890123-qwerty')).toBe('QWERTY');
  });

  it('should return empty string for invalid formats', () => {
    expect(extractRoomCode('invalid')).toBe('');
    expect(extractRoomCode('room-only-two')).toBe('');
    expect(extractRoomCode('')).toBe('');
  });

  it('should handle short random strings', () => {
    expect(extractRoomCode('room-123-abc')).toBe('ABC');
    expect(extractRoomCode('room-123-12345')).toBe('12345');
  });
});