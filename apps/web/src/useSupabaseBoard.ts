import { useEffect, useState } from "react";
import type { BoardObject, Cursor } from "@collabboard/shared";
import { SupabaseBoardService } from "./lib/supabase-boards";
import { supabase } from "./lib/supabase";

export function useSupabaseBoard(userId: string, displayName: string, roomId?: string) {
  const [connected, setConnected] = useState(false);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [presence, setPresence] = useState<{ userId: string; name: string }[]>([]);
  const [boardId, setBoardId] = useState<string | null>(null);

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
          console.log('Real-time update received:', payload);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const legacyObject = SupabaseBoardService.convertToLegacyObject(payload.new);
            
            setObjects((prev) => {
              const idx = prev.findIndex((o) => o.id === legacyObject.id);
              if (idx < 0) {
                // New object
                return [...prev, legacyObject];
              } else {
                // Update existing object
                const next = [...prev];
                next[idx] = { ...next[idx], ...legacyObject };
                return next;
              }
            });
          } else if (payload.eventType === 'DELETE') {
            setObjects((prev) => prev.filter(obj => obj.id !== payload.old.id));
          }
        });

        // Set up presence channel for real-time collaboration
        const channel = supabase.channel(`board-presence-${board.id}`)
          .on('presence', { event: 'sync' }, () => {
            const presenceState = channel.presenceState();
            const users = (Object.values(presenceState).flat() as any[]).filter((u: any) => u?.userId && u?.name) as { userId: string; name: string; x?: number; y?: number }[];
            
            setPresence(users.map(u => ({ userId: u.userId, name: u.name })));
            
            // Update cursors
            const cursorMap: Record<string, Cursor> = {};
            users.forEach(user => {
              if (user.x !== undefined && user.y !== undefined && user.userId !== userId) {
                cursorMap[user.userId] = {
                  id: user.userId,
                  userId: user.userId,
                  name: user.name,
                  x: user.x,
                  y: user.y,
                };
              }
            });
            setCursors(cursorMap);
          })
          .on('presence', { event: 'join' }, ({ newPresences }) => {
            console.log('User joined:', newPresences);
          })
          .on('presence', { event: 'leave' }, ({ leftPresences }) => {
            console.log('User left:', leftPresences);
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              // Track this user's presence
              await channel.track({
                userId,
                name: displayName,
                joinedAt: new Date().toISOString(),
              });
            }
          });


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
    };
  }, [roomId, userId, displayName]);

  // Cleanup presence channel when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup handled in main useEffect
    };
  }, []);

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
      // Revert on error by refreshing from server
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


  const emitCursor = async (x: number, y: number) => {
    // Update cursor position in presence channel
    // This functionality would need to be implemented with proper channel reference
    console.log('Cursor moved:', { x, y });
  };

  return {
    connected,
    objects,
    cursors,
    presence,
    emitCursor,
    createObject,
    updateObject,
    deleteObject,
  };
}