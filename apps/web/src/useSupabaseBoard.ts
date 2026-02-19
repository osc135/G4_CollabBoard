import { useEffect, useState, useCallback, useRef } from "react";
import type { BoardObject, Cursor } from "@collabboard/shared";
import { SupabaseBoardService } from "./lib/supabase-boards";
import { supabase } from "./lib/supabase";

// Shallow-compare two board objects (fast path for echo detection)
function boardObjectEqual(a: BoardObject, b: BoardObject): boolean {
  if (a === b) return true;
  if (a.type !== b.type || a.id !== b.id) return false;
  const aa = a as any;
  const bb = b as any;
  // Compare positional/content fields that actually change
  if (aa.x !== bb.x || aa.y !== bb.y) return false;
  if (aa.width !== bb.width || aa.height !== bb.height) return false;
  if (aa.text !== bb.text) return false;
  if (aa.color !== bb.color) return false;
  if (aa.rotation !== bb.rotation) return false;
  return true;
}

export function useSupabaseBoard(userId: string, displayName: string, roomId?: string) {
  // Create unique session ID for each tab
  const [sessionId] = useState(() => `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  const [connected, setConnected] = useState(false);
  const dragThrottleRef = useRef<{ [key: string]: number }>({});
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});

  // Ref-based remote drag buffering — avoids calling setObjects on every ~30fps drag event
  const remoteDragRef = useRef<Record<string, { x: number; y: number }>>({});
  const remoteDragRafRef = useRef<number | null>(null);
  const flushRemoteDrags = useCallback(() => {
    const drags = remoteDragRef.current;
    const ids = Object.keys(drags);
    if (ids.length === 0) { remoteDragRafRef.current = null; return; }
    setObjects(prev => {
      let changed = false;
      const next = prev.map(obj => {
        const drag = drags[obj.id];
        if (drag) { changed = true; return { ...obj, x: drag.x, y: drag.y }; }
        return obj;
      });
      return changed ? next : prev;
    });
    remoteDragRef.current = {};
    remoteDragRafRef.current = null;
  }, []);

  // ============= Batch Supabase realtime events =============
  // Buffer incoming INSERT/UPDATE/DELETE events and flush once per frame.
  // This prevents N rapid Supabase events from causing N separate re-renders.
  const pendingRealtimeRef = useRef<{ type: 'upsert' | 'delete'; obj?: BoardObject; id?: string }[]>([]);
  const realtimeRafRef = useRef<number | null>(null);
  const flushRealtimeEvents = useCallback(() => {
    const events = pendingRealtimeRef.current;
    pendingRealtimeRef.current = [];
    realtimeRafRef.current = null;
    if (events.length === 0) return;

    setObjects(prev => {
      let next = prev;
      let changed = false;

      for (const event of events) {
        if (event.type === 'upsert' && event.obj) {
          const incoming = event.obj;
          const idx = next.findIndex(o => o.id === incoming.id);
          if (idx >= 0) {
            // Skip if identical (echo of our own optimistic update)
            if (boardObjectEqual(next[idx], incoming)) continue;
            // Update in-place to preserve array order / z-index
            if (!changed) { next = [...next]; changed = true; }
            next[idx] = incoming;
          } else {
            // Genuinely new object (from another tab)
            if (!changed) { next = [...next]; changed = true; }
            next.push(incoming);
          }
        } else if (event.type === 'delete' && event.id) {
          const idx = next.findIndex(o => o.id === event.id);
          if (idx >= 0) {
            if (!changed) { next = [...next]; changed = true; }
            next.splice(idx, 1);
          }
        }
      }

      return changed ? next : prev;
    });
  }, []);

  const queueRealtimeEvent = useCallback((event: { type: 'upsert' | 'delete'; obj?: BoardObject; id?: string }) => {
    pendingRealtimeRef.current.push(event);
    if (!realtimeRafRef.current) {
      realtimeRafRef.current = requestAnimationFrame(flushRealtimeEvents);
    }
  }, [flushRealtimeEvents]);

  // Batch cursor updates — collect incoming cursors and apply once per frame
  const pendingCursorsRef = useRef<Record<string, Cursor>>({});
  const cursorRafRef = useRef<number | null>(null);
  const flushCursors = useCallback(() => {
    const pending = pendingCursorsRef.current;
    if (Object.keys(pending).length === 0) return;
    setCursors(prev => ({ ...prev, ...pending }));
    pendingCursorsRef.current = {};
    cursorRafRef.current = null;
  }, []);
  const queueCursorUpdate = useCallback((sessionId: string, cursor: Cursor) => {
    pendingCursorsRef.current[sessionId] = cursor;
    if (!cursorRafRef.current) {
      cursorRafRef.current = requestAnimationFrame(flushCursors);
    }
  }, [flushCursors]);
  const [presence, setPresence] = useState<{ userId: string; name: string }[]>([]);
  const [, setBoardId] = useState<string | null>(null);
  const boardIdRef = useRef<string | null>(null);
  const [presenceChannel, setPresenceChannel] = useState<any>(null);

  useEffect(() => {
    if (!roomId || !userId) return;

    let subscription: any = null;

    async function initializeBoard() {
      try {
        // Get or create board
        let board = await SupabaseBoardService.getBoardByRoomId(roomId!);
        
        if (!board) {
          // Create new board if it doesn't exist
          const newBoard = await SupabaseBoardService.createBoard("New Board", roomId!);
          board = {
            ...newBoard,
            objects: [],
          };
        }

        setBoardId(board.id);
        boardIdRef.current = board.id;
        
        // Convert Supabase objects to legacy format for compatibility
        const legacyObjects = board.objects.map((obj: any) => 
          SupabaseBoardService.convertToLegacyObject(obj)
        );
        setObjects(legacyObjects);
        setConnected(true);

        // Subscribe to real-time changes — batched via RAF to avoid per-event re-renders
        subscription = SupabaseBoardService.subscribeToBoard(board.id, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const legacyObject = SupabaseBoardService.convertToLegacyObject(payload.new);
            queueRealtimeEvent({ type: 'upsert', obj: legacyObject });
          } else if (payload.eventType === 'DELETE') {
            queueRealtimeEvent({ type: 'delete', id: payload.old.id });
          }
        });

        // Set up presence channel for user tracking
        const channel = supabase.channel(`board-presence-${board.id}`, {
          config: {
            presence: {
              key: sessionId
            }
          }
        })
          .on('presence', { event: 'sync' }, () => {
            const presenceState = channel.presenceState();
            const users = (Object.values(presenceState).flat() as any[]).filter((u: any) => u?.userId && u?.name) as { userId: string; name: string }[];
            setPresence(users.map(u => ({ userId: u.userId, name: u.name })));
          })
          .on('presence', { event: 'join' }, () => {
            // User joined
          })
          .on('presence', { event: 'leave' }, ({ leftPresences }) => {
            // Remove cursors for users who left
            setCursors(prev => {
              const newCursors = { ...prev };
              leftPresences.forEach((presence: any) => {
                if (presence.sessionId) {
                  delete newCursors[presence.sessionId];
                }
              });
              return newCursors;
            });
          })
          // Add broadcast listener for real-time cursor updates
          .on('broadcast', { event: 'cursor-move' }, ({ payload }) => {
            if (payload.sessionId !== sessionId) {
              queueCursorUpdate(payload.sessionId, {
                id: payload.sessionId,
                userId: payload.userId,
                name: payload.name,
                x: payload.x,
                y: payload.y,
              });
            }
          })
          // Add broadcast listener for real-time drag updates
          .on('broadcast', { event: 'object-drag' }, ({ payload }) => {
            // Buffer remote drag positions and flush once per frame
            if (payload.sessionId !== sessionId) {
              remoteDragRef.current[payload.objectId] = { x: payload.x, y: payload.y };
              if (!remoteDragRafRef.current) {
                remoteDragRafRef.current = requestAnimationFrame(flushRemoteDrags);
              }
            }
          })
          // Handle drag end to reset temporary states
          .on('broadcast', { event: 'object-drag-end' }, () => {
            // The actual database update will come through the regular subscription
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              // Track this user's presence (without cursor data)
              await channel.track({
                sessionId,
                userId,
                name: displayName,
                joinedAt: new Date().toISOString(),
              });
            }
          });

        // Store channel reference for cursor updates
        setPresenceChannel(channel);


      } catch (error) {
        console.error('Failed to initialize board:', error);
        setConnected(false);
      }
    }

    initializeBoard();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
      if (presenceChannel) {
        presenceChannel.unsubscribe();
      }
    };
  }, [roomId, userId, displayName]);


  const createObject = useCallback(async (obj: BoardObject) => {
    const bid = boardIdRef.current;
    if (!bid) return;

    // Add to UI immediately (optimistic update)
    setObjects(prev => [...prev, obj]);

    try {
      const supabaseObj = SupabaseBoardService.convertLegacyObject(obj, bid);
      await SupabaseBoardService.upsertBoardObject(bid, supabaseObj);
    } catch (error) {
      console.error('Failed to save object:', error);
      setObjects(prev => prev.filter(o => o.id !== obj.id));
    }
  }, []);

  const updateObject = useCallback(async (obj: BoardObject) => {
    const bid = boardIdRef.current;
    if (!bid) return;

    // Update in-place to preserve array order
    setObjects(prev => {
      const idx = prev.findIndex(o => o.id === obj.id);
      if (idx >= 0) {
        const newState = [...prev];
        newState[idx] = obj;
        return newState;
      }
      return prev;
    });

    try {
      const supabaseObj = SupabaseBoardService.convertLegacyObject(obj, bid);
      await SupabaseBoardService.upsertBoardObject(bid, supabaseObj);
    } catch (error) {
      console.error('Failed to update object:', error);
    }
  }, []);

  const deleteObject = useCallback(async (objectId: string) => {
    setObjects(prev => prev.filter(obj => obj.id !== objectId));

    try {
      await SupabaseBoardService.deleteBoardObject(objectId);
    } catch (error) {
      console.error('Failed to delete object:', error);
    }
  }, []);


  const cursorThrottleRef = useRef(0);
  const emitCursor = useCallback((x: number, y: number) => {
    if (!presenceChannel) return;

    // Throttle cursor emission to ~30fps
    const now = Date.now();
    if (now - cursorThrottleRef.current < 33) return;
    cursorThrottleRef.current = now;

    presenceChannel.httpSend('cursor-move', {
      sessionId,
      userId,
      name: displayName,
      x,
      y,
      timestamp: now
    }).catch((error: any) => {
      console.error('Failed to broadcast cursor:', error);
    });
  }, [presenceChannel, sessionId, userId, displayName]);

  const emitObjectDrag = useCallback((objectId: string, x: number, y: number) => {
    if (!presenceChannel) return;
    
    // Throttle drag events to 30fps (33ms)
    const now = Date.now();
    const lastEmit = dragThrottleRef.current[objectId] || 0;
    if (now - lastEmit < 33) return;
    dragThrottleRef.current[objectId] = now;
    
    // Broadcast object drag position in real-time
    presenceChannel.httpSend('object-drag', {
      sessionId,
      userId,
      name: displayName,
      objectId,
      x,
      y,
      timestamp: now
    }).catch((error: any) => {
      console.error('Failed to broadcast object drag:', error);
    });
  }, [presenceChannel, sessionId, userId, displayName]);

  const emitObjectDragEnd = useCallback((objectId: string, x: number, y: number) => {
    if (!presenceChannel) return;
    
    // Clear throttle for this object
    delete dragThrottleRef.current[objectId];
    
    // Broadcast drag end to clean up temporary states
    presenceChannel.httpSend('object-drag-end', {
      sessionId,
      userId,
      name: displayName,
      objectId,
      x,
      y,
      timestamp: Date.now()
    }).catch((error: any) => {
      console.error('Failed to broadcast object drag end:', error);
    });
  }, [presenceChannel, sessionId, userId, displayName]);

  return {
    connected,
    objects,
    cursors,
    presence,
    emitCursor,
    emitObjectDrag,
    emitObjectDragEnd,
    createObject,
    updateObject,
    deleteObject,
  };
}