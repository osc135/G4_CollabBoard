import { useEffect, useState, useCallback, useRef } from "react";
import type { BoardObject, Cursor } from "@collabboard/shared";
import { SupabaseBoardService } from "./lib/supabase-boards";
import { supabase } from "./lib/supabase";

export function useSupabaseBoard(userId: string, displayName: string, roomId?: string) {
  // Create unique session ID for each tab
  const [sessionId] = useState(() => `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  const [connected, setConnected] = useState(false);
  const dragThrottleRef = useRef<{ [key: string]: number }>({});
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});

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
  const [boardId, setBoardId] = useState<string | null>(null);
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
        
        // Convert Supabase objects to legacy format for compatibility
        const legacyObjects = board.objects.map((obj: any) => 
          SupabaseBoardService.convertToLegacyObject(obj)
        );
        setObjects(legacyObjects);
        setConnected(true);

        // Subscribe to real-time changes
        subscription = SupabaseBoardService.subscribeToBoard(board.id, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const legacyObject = SupabaseBoardService.convertToLegacyObject(payload.new);
            
            // Apply real-time update and deduplicate
            setObjects((prev) => {
              // Remove any existing object with the same ID first
              const filteredObjects = prev.filter(o => o.id !== legacyObject.id);
              
              // Add the updated object
              const newObjects = [...filteredObjects, legacyObject];
              
              return newObjects;
            });
          } else if (payload.eventType === 'DELETE') {
            setObjects((prev) => prev.filter(obj => obj.id !== payload.old.id));
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
            // Apply temporary position update during drag from other users
            // Only apply if it's from a different session
            if (payload.sessionId !== sessionId) {
              setObjects(prev => prev.map(obj => 
                obj.id === payload.objectId 
                  ? { ...obj, x: payload.x, y: payload.y }
                  : obj
              ));
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


  const createObject = async (obj: BoardObject) => {
    if (!boardId) return;
    
    // Add to UI immediately (optimistic update)
    setObjects(prev => [...prev, obj]);
    
    // Save to database
    try {
      const supabaseObj = SupabaseBoardService.convertLegacyObject(obj, boardId);
      await SupabaseBoardService.upsertBoardObject(boardId, supabaseObj);
    } catch (error) {
      console.error('Failed to save object:', error);
      // Remove from UI if save failed
      setObjects(prev => prev.filter(o => o.id !== obj.id));
    }
  };

  const updateObject = async (obj: BoardObject) => {
    if (!boardId) return;
    
    // Immediate UI update
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
      const supabaseObj = SupabaseBoardService.convertLegacyObject(obj, boardId);
      await SupabaseBoardService.upsertBoardObject(boardId, supabaseObj);
    } catch (error) {
      console.error('Failed to update object:', error);
    }
  };

  const deleteObject = async (objectId: string) => {
    // Immediate UI update
    setObjects(prev => prev.filter(obj => obj.id !== objectId));
    
    try {
      await SupabaseBoardService.deleteBoardObject(objectId);
    } catch (error) {
      console.error('Failed to delete object:', error);
      // Could add object back on error, but for now just log
    }
  };


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