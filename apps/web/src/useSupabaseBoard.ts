import { useEffect, useState } from "react";
import type { BoardObject, Cursor } from "@collabboard/shared";
import { SupabaseBoardService } from "./lib/supabase-boards";
import { supabase } from "./lib/supabase";

export function useSupabaseBoard(userId: string, displayName: string, roomId?: string) {
  // Create unique session ID for each tab
  const [sessionId] = useState(() => `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  const [connected, setConnected] = useState(false);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
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

        // Set up presence channel for real-time collaboration
        const channel = supabase.channel(`board-presence-${board.id}`)
          .on('presence', { event: 'sync' }, () => {
            const presenceState = channel.presenceState();
            const users = (Object.values(presenceState).flat() as any[]).filter((u: any) => u?.userId && u?.name) as { userId: string; name: string; x?: number; y?: number }[];
            
            console.log('👥 Presence sync - all users:', users);
            setPresence(users.map(u => ({ userId: u.userId, name: u.name })));
            
            // Update cursors - exclude current session but show all others
            const cursorMap: Record<string, Cursor> = {};
            users.forEach((user: any) => {
              if (user.x !== undefined && user.y !== undefined && user.sessionId !== sessionId) {
                console.log('🖱️ Adding cursor for user:', user.name, 'at', user.x, user.y, 'sessionId:', user.sessionId);
                cursorMap[user.sessionId] = {
                  id: user.sessionId,
                  userId: user.userId,
                  name: user.name,
                  x: user.x,
                  y: user.y,
                };
              }
            });
            console.log('🖱️ Final cursor map:', cursorMap);
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
              // Track this user's presence with unique session ID
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
    console.log('🖱️ emitCursor called:', { x, y, sessionId, userId, displayName, hasChannel: !!presenceChannel });
    
    // Update cursor position in presence channel
    if (presenceChannel) {
      try {
        await presenceChannel.track({
          sessionId,
          userId,
          name: displayName,
          x,
          y,
          joinedAt: new Date().toISOString(),
        });
        console.log('✅ Cursor position tracked successfully');
      } catch (error) {
        console.error('❌ Failed to emit cursor:', error);
      }
    } else {
      console.log('❌ No presence channel available for cursor tracking');
    }
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