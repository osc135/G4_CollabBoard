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
  const [isOwner, setIsOwner] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const dragThrottleRef = useRef<{ [key: string]: number }>({});
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});

  // Ref-based remote drag buffering — avoids calling setObjects on every ~30fps drag event
  const remoteDragRef = useRef<Record<string, { x: number; y: number; rotation?: number }>>({});
  const remoteDragRafRef = useRef<number | null>(null);
  const flushRemoteDrags = useCallback(() => {
    const drags = remoteDragRef.current;
    const ids = Object.keys(drags);
    if (ids.length === 0) { remoteDragRafRef.current = null; return; }
    setObjects(prev => {
      let changed = false;
      const next = prev.map(obj => {
        const drag = drags[obj.id];
        if (drag) {
          changed = true;
          const update: any = { ...obj, x: drag.x, y: drag.y };
          if (drag.rotation !== undefined) update.rotation = drag.rotation;
          return update;
        }
        return obj;
      });
      return changed ? next : prev;
    });
    remoteDragRef.current = {};
    remoteDragRafRef.current = null;
  }, []);

  // Ref-based remote transform buffering
  const remoteTransformRef = useRef<Record<string, { x: number; y: number; width: number; height: number; rotation: number }>>({});
  const remoteTransformRafRef = useRef<number | null>(null);
  const flushRemoteTransforms = useCallback(() => {
    const transforms = remoteTransformRef.current;
    const ids = Object.keys(transforms);
    if (ids.length === 0) { remoteTransformRafRef.current = null; return; }
    setObjects(prev => {
      let changed = false;
      const next = prev.map(obj => {
        const t = transforms[obj.id];
        if (t) {
          changed = true;
          return { ...obj, x: t.x, y: t.y, width: t.width, height: t.height, rotation: t.rotation } as any;
        }
        return obj;
      });
      return changed ? next : prev;
    });
    remoteTransformRef.current = {};
    remoteTransformRafRef.current = null;
  }, []);
  const transformThrottleRef = useRef<{ [key: string]: number }>({});

  // Ref-based remote text edit buffering
  const remoteTextRef = useRef<Record<string, string>>({});
  const remoteTextRafRef = useRef<number | null>(null);
  const flushRemoteTexts = useCallback(() => {
    const edits = remoteTextRef.current;
    const ids = Object.keys(edits);
    if (ids.length === 0) { remoteTextRafRef.current = null; return; }
    setObjects(prev => {
      let changed = false;
      const next = prev.map(obj => {
        const text = edits[obj.id];
        if (text !== undefined && (obj as any).text !== text) {
          changed = true;
          return { ...obj, text } as any;
        }
        return obj;
      });
      return changed ? next : prev;
    });
    remoteTextRef.current = {};
    remoteTextRafRef.current = null;
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
  const [remoteSelections, setRemoteSelections] = useState<Record<string, { sessionId: string; selectedIds: string[] }>>({});
  const [remoteEditingMap, setRemoteEditingMap] = useState<Record<string, { sessionId: string; name: string }>>({});
  const [remoteDraggingIds, setRemoteDraggingIds] = useState<Set<string>>(new Set());
  const [remoteDrawingPaths, setRemoteDrawingPaths] = useState<Record<string, { points: number[]; color: string; strokeWidth: number; penType: string }>>({});
  const [, setBoardId] = useState<string | null>(null);
  const boardIdRef = useRef<string | null>(null);
  const [presenceChannel, setPresenceChannel] = useState<any>(null);
  const presenceChannelRef = useRef<any>(null);

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
        setIsOwner(board.created_by === userId);
        setIsLocked(!!(board as any).is_locked);

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
            // Remove cursors and selections for users who left
            setCursors(prev => {
              const newCursors = { ...prev };
              leftPresences.forEach((presence: any) => {
                if (presence.sessionId) {
                  delete newCursors[presence.sessionId];
                }
              });
              return newCursors;
            });
            setRemoteSelections(prev => {
              const next = { ...prev };
              leftPresences.forEach((presence: any) => {
                if (presence.sessionId) {
                  delete next[presence.sessionId];
                }
              });
              return next;
            });
            setRemoteEditingMap(prev => {
              const leftSessionIds = new Set(leftPresences.map((p: any) => p.sessionId).filter(Boolean));
              const next: typeof prev = {};
              for (const [objId, editor] of Object.entries(prev)) {
                if (!leftSessionIds.has(editor.sessionId)) next[objId] = editor;
              }
              return Object.keys(next).length === Object.keys(prev).length ? prev : next;
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
              remoteDragRef.current[payload.objectId] = { x: payload.x, y: payload.y, rotation: payload.rotation };
              if (!remoteDragRafRef.current) {
                remoteDragRafRef.current = requestAnimationFrame(flushRemoteDrags);
              }
              setRemoteDraggingIds(prev => prev.has(payload.objectId) ? prev : new Set(prev).add(payload.objectId));
            }
          })
          .on('broadcast', { event: 'object-drag-end' }, ({ payload }) => {
            if (payload.sessionId !== sessionId && payload.objectId) {
              setRemoteDraggingIds(prev => {
                if (!prev.has(payload.objectId)) return prev;
                const next = new Set(prev);
                next.delete(payload.objectId);
                return next;
              });
            }
          })
          .on('broadcast', { event: 'object-transform' }, ({ payload }) => {
            if (payload.sessionId !== sessionId) {
              remoteTransformRef.current[payload.objectId] = {
                x: payload.x, y: payload.y,
                width: payload.width, height: payload.height,
                rotation: payload.rotation,
              };
              if (!remoteTransformRafRef.current) {
                remoteTransformRafRef.current = requestAnimationFrame(flushRemoteTransforms);
              }
            }
          })
          .on('broadcast', { event: 'object-selection' }, ({ payload }) => {
            if (payload.sessionId !== sessionId) {
              setRemoteSelections(prev => ({
                ...prev,
                [payload.sessionId]: { sessionId: payload.sessionId, selectedIds: payload.selectedIds },
              }));
            }
          })
          .on('broadcast', { event: 'object-text-edit' }, ({ payload }) => {
            if (payload.sessionId !== sessionId) {
              remoteTextRef.current[payload.objectId] = payload.text;
              if (!remoteTextRafRef.current) {
                remoteTextRafRef.current = requestAnimationFrame(flushRemoteTexts);
              }
            }
          })
          .on('broadcast', { event: 'sticky-edit-lock' }, ({ payload }) => {
            if (payload.sessionId !== sessionId) {
              if (payload.action === 'lock') {
                setRemoteEditingMap(prev => ({
                  ...prev,
                  [payload.objectId]: { sessionId: payload.sessionId, name: payload.name },
                }));
              } else {
                setRemoteEditingMap(prev => {
                  const next = { ...prev };
                  delete next[payload.objectId];
                  return next;
                });
              }
            }
          })
          .on('broadcast', { event: 'board-lock' }, ({ payload }) => {
            setIsLocked(!!payload.locked);
          })
          .on('broadcast', { event: 'drawing-path' }, ({ payload }) => {
            if (payload.sessionId !== sessionId) {
              setRemoteDrawingPaths(prev => ({
                ...prev,
                [payload.sessionId]: {
                  points: payload.points,
                  color: payload.color,
                  strokeWidth: payload.strokeWidth,
                  penType: payload.penType,
                },
              }));
            }
          })
          .on('broadcast', { event: 'drawing-end' }, ({ payload }) => {
            if (payload.sessionId !== sessionId) {
              setRemoteDrawingPaths(prev => {
                const next = { ...prev };
                delete next[payload.sessionId];
                return next;
              });
            }
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
        presenceChannelRef.current = channel;


      } catch (error) {
        console.error('Failed to initialize board:', error);
        setConnected(false);
      }
    }

    initializeBoard();

    // Immediate presence removal on tab close / navigation
    const handleBeforeUnload = () => {
      const ch = presenceChannelRef.current;
      if (ch) {
        // Use synchronous sendBeacon-style untrack; Supabase will pick up the leave
        ch.untrack();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (subscription) {
        subscription.unsubscribe();
      }
      const ch = presenceChannelRef.current;
      if (ch) {
        supabase.removeChannel(ch);
        presenceChannelRef.current = null;
        setPresenceChannel(null);
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

  const emitObjectDrag = useCallback((objectId: string, x: number, y: number, rotation?: number) => {
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
      rotation,
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

  const emitObjectTransform = useCallback((objectId: string, x: number, y: number, width: number, height: number, rotation: number) => {
    if (!presenceChannel) return;

    const now = Date.now();
    const lastEmit = transformThrottleRef.current[objectId] || 0;
    if (now - lastEmit < 33) return;
    transformThrottleRef.current[objectId] = now;

    presenceChannel.httpSend('object-transform', {
      sessionId,
      objectId,
      x, y, width, height, rotation,
      timestamp: now
    }).catch((error: any) => {
      console.error('Failed to broadcast object transform:', error);
    });
  }, [presenceChannel, sessionId]);

  const emitObjectTransformEnd = useCallback((objectId: string) => {
    if (!presenceChannel) return;
    delete transformThrottleRef.current[objectId];
  }, [presenceChannel]);

  const emitTextEdit = useCallback((objectId: string, text: string) => {
    if (!presenceChannel) return;

    const now = Date.now();
    const lastEmit = dragThrottleRef.current[`text-${objectId}`] || 0;
    if (now - lastEmit < 33) return;
    dragThrottleRef.current[`text-${objectId}`] = now;

    presenceChannel.httpSend('object-text-edit', {
      sessionId,
      objectId,
      text,
    }).catch((error: any) => {
      console.error('Failed to broadcast text edit:', error);
    });
  }, [presenceChannel, sessionId]);

  const emitStickyLock = useCallback((objectId: string) => {
    if (!presenceChannel) return;
    presenceChannel.httpSend('sticky-edit-lock', {
      sessionId,
      name: displayName,
      objectId,
      action: 'lock',
    }).catch((error: any) => {
      console.error('Failed to broadcast sticky lock:', error);
    });
  }, [presenceChannel, sessionId, displayName]);

  const emitStickyUnlock = useCallback((objectId: string) => {
    if (!presenceChannel) return;
    presenceChannel.httpSend('sticky-edit-lock', {
      sessionId,
      name: displayName,
      objectId,
      action: 'unlock',
    }).catch((error: any) => {
      console.error('Failed to broadcast sticky unlock:', error);
    });
  }, [presenceChannel, sessionId, displayName]);

  const emitSelection = useCallback((selectedIds: string[]) => {
    if (!presenceChannel) return;
    presenceChannel.httpSend('object-selection', {
      sessionId,
      selectedIds,
    }).catch((error: any) => {
      console.error('Failed to broadcast selection:', error);
    });
  }, [presenceChannel, sessionId]);

  const drawingThrottleRef = useRef(0);
  const emitDrawingPath = useCallback((points: number[], color: string, strokeWidth: number, penType: string) => {
    if (!presenceChannel) return;
    const now = Date.now();
    if (now - drawingThrottleRef.current < 50) return; // ~20fps
    drawingThrottleRef.current = now;
    presenceChannel.httpSend('drawing-path', {
      sessionId,
      points,
      color,
      strokeWidth,
      penType,
    }).catch(() => {});
  }, [presenceChannel, sessionId]);

  const emitDrawingEnd = useCallback(() => {
    if (!presenceChannel) return;
    presenceChannel.httpSend('drawing-end', {
      sessionId,
    }).catch(() => {});
  }, [presenceChannel, sessionId]);

  const toggleLock = useCallback(async () => {
    const bid = boardIdRef.current;
    if (!bid) return;
    const newLocked = !isLocked;
    setIsLocked(newLocked);
    try {
      await SupabaseBoardService.setBoardLocked(bid, newLocked);
      // Broadcast to other users
      presenceChannelRef.current?.send({
        type: 'broadcast',
        event: 'board-lock',
        payload: { locked: newLocked },
      });
    } catch (error) {
      console.error('Failed to toggle lock:', error);
      setIsLocked(!newLocked); // revert
    }
  }, [isLocked]);

  return {
    connected,
    objects,
    cursors,
    presence,
    isOwner,
    isLocked,
    toggleLock,
    remoteSelections,
    remoteEditingMap,
    remoteDraggingIds,
    emitCursor,
    emitSelection,
    emitTextEdit,
    emitStickyLock,
    emitStickyUnlock,
    emitObjectDrag,
    emitObjectDragEnd,
    emitObjectTransform,
    emitObjectTransformEnd,
    emitDrawingPath,
    emitDrawingEnd,
    remoteDrawingPaths,
    createObject,
    updateObject,
    deleteObject,
  };
}