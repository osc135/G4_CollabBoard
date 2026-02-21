import { supabase } from './supabase';
// Direct type definitions to avoid import issues
interface Board {
  id: string;
  name: string;
  room_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_public: boolean;
  is_locked: boolean;
}

interface SupabaseBoardObject {
  id: string;
  board_id: string;
  type: 'sticky' | 'rectangle' | 'circle' | 'textbox' | 'connector' | 'line' | 'drawing';
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation: number;
  color: string;
  text?: string;
  font_size?: number;
  start_object_id?: string;
  end_object_id?: string;
  start_point?: { x: number; y: number };
  end_point?: { x: number; y: number };
  start_anchor?: string;
  end_anchor?: string;
  style?: string;
  stroke_width?: number;
  arrow_end?: boolean;
  z_index?: number;
  points?: number[];
  pen_type?: string;
  created_at: string;
  updated_at: string;
}

interface BoardWithObjects extends Board {
  objects: SupabaseBoardObject[];
}

interface BoardSummary extends Board {
  object_count: number;
  collaborator_count: number;
}

interface UserBoardsResult {
  owned: BoardSummary[];
  shared: BoardSummary[];
}

export class SupabaseBoardService {
  
  // Create a new board
  static async createBoard(name: string, roomId: string): Promise<Board> {
    const user = await supabase.auth.getUser();
    const userId = user.data.user?.id;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    const { data, error } = await supabase
      .from('boards')
      .insert({
        name,
        room_id: roomId,
        created_by: userId,
        is_public: true,  // Make all boards public by default for room joining
      })
      .select()
      .single();
    
    
    if (error) throw error;
    
    // Ensure user is added as owner collaborator (in case trigger doesn't work)
    const { error: collabError } = await supabase
      .from('board_collaborators')
      .insert({
        board_id: data.id,
        user_id: userId,
        role: 'owner'
      });
    
    // Ignore duplicate key errors (409 Conflict) as user may already be added
    if (collabError && collabError.code !== '23505') {
      console.warn('Could not add owner as collaborator:', collabError);
    }
    
    return data;
  }
  
  // Get board by room_id
  static async getBoardByRoomId(roomId: string): Promise<BoardWithObjects | null> {
    const { data: board, error: boardError } = await supabase
      .from('boards')
      .select('*')
      .eq('room_id', roomId)
      .single();
    
    if (boardError) {
      if (boardError.code === 'PGRST116') return null; // Not found
      throw boardError;
    }
    
    // Only allow access if user is already a collaborator or owner
    const user = await supabase.auth.getUser();
    const userId = user.data.user?.id;
    
    if (userId && board.created_by !== userId) {
      // Check if user is already a collaborator
      const { data: collaborator } = await supabase
        .from('board_collaborators')
        .select('*')
        .eq('board_id', board.id)
        .eq('user_id', userId)
        .single();
      
      // If not a collaborator and not the owner, deny access
      if (!collaborator) {
        throw new Error('Access denied: You must be invited to this board');
      }
    }
    
    const { data: objects, error: objectsError } = await supabase
      .from('board_objects')
      .select('*')
      .eq('board_id', board.id)
      .order('created_at', { ascending: true });
    
    if (objectsError) throw objectsError;
    
    return {
      ...board,
      objects: objects || [],
    };
  }
  
  // Get all user's boards split into owned and shared
  static async getUserBoards(): Promise<UserBoardsResult> {
    const user = await supabase.auth.getUser();
    const userId = user.data.user?.id;

    if (!userId) {
      return { owned: [], shared: [] };
    }

    // Get boards where user is owner
    const { data: ownedBoards, error: ownedError } = await supabase
      .from('boards')
      .select('*')
      .eq('created_by', userId)
      .order('updated_at', { ascending: false });

    if (ownedError) throw ownedError;

    // Get boards where user is a collaborator (but not owner)
    const { data: collaborations, error: collabError } = await supabase
      .from('board_collaborators')
      .select('board_id')
      .eq('user_id', userId);

    if (collabError) throw collabError;

    const ownedIds = new Set((ownedBoards || []).map(b => b.id));

    let sharedBoards: any[] = [];
    if (collaborations && collaborations.length > 0) {
      // Filter out boards the user owns
      const sharedBoardIds = collaborations
        .map(c => c.board_id)
        .filter(id => !ownedIds.has(id));

      if (sharedBoardIds.length > 0) {
        const { data: collabBoards, error: collabBoardsError } = await supabase
          .from('boards')
          .select('*')
          .in('id', sharedBoardIds)
          .order('updated_at', { ascending: false });

        if (collabBoardsError) throw collabBoardsError;
        sharedBoards = collabBoards || [];
      }
    }

    // Fetch collaborator counts for all boards
    const allBoardIds = [...(ownedBoards || []), ...sharedBoards].map(b => b.id);
    let collabCounts: Record<string, number> = {};

    if (allBoardIds.length > 0) {
      const { data: counts } = await supabase
        .from('board_collaborators')
        .select('board_id')
        .in('board_id', allBoardIds);

      if (counts) {
        for (const row of counts) {
          collabCounts[row.board_id] = (collabCounts[row.board_id] || 0) + 1;
        }
      }
    }

    const toSummary = (board: any): BoardSummary => ({
      ...board,
      object_count: 0,
      collaborator_count: collabCounts[board.id] || 1,
    });

    return {
      owned: (ownedBoards || []).map(toSummary),
      shared: sharedBoards.map(toSummary),
    };
  }

  // Delete a board and all its data (owner only)
  static async deleteBoard(boardId: string): Promise<void> {
    // Delete board objects first
    const { error: objError } = await supabase
      .from('board_objects')
      .delete()
      .eq('board_id', boardId);
    if (objError) throw objError;

    // Delete collaborators
    const { error: collabError } = await supabase
      .from('board_collaborators')
      .delete()
      .eq('board_id', boardId);
    if (collabError) throw collabError;

    // Delete the board itself
    const { error: boardError } = await supabase
      .from('boards')
      .delete()
      .eq('id', boardId);
    if (boardError) throw boardError;
  }

  // Leave a shared board (remove user from collaborators)
  static async leaveBoard(boardId: string): Promise<void> {
    const user = await supabase.auth.getUser();
    const userId = user.data.user?.id;
    if (!userId) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('board_collaborators')
      .delete()
      .eq('board_id', boardId)
      .eq('user_id', userId);
    if (error) throw error;
  }
  
  // Add or update a board object
  static async upsertBoardObject(boardId: string, object: Omit<SupabaseBoardObject, 'board_id' | 'created_at' | 'updated_at'>): Promise<SupabaseBoardObject> {
    const { data, error } = await supabase
      .from('board_objects')
      .upsert({
        ...object,
        board_id: boardId,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  // Delete a board object
  static async deleteBoardObject(objectId: string): Promise<void> {
    const { error } = await supabase
      .from('board_objects')
      .delete()
      .eq('id', objectId);
    
    if (error) throw error;
  }
  
  // Subscribe to real-time changes for a board
  static subscribeToBoard(boardId: string, callback: (payload: any) => void) {
    console.log('🟡 Setting up subscription for board:', boardId);
    
    // Create a unique channel name
    const channelName = `board-objects-${boardId}-${Date.now()}`;
    
    return supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'board_objects', 
          filter: `board_id=eq.${boardId}` 
        },
        (payload) => {
          console.log('🟢 Raw subscription payload:', payload);
          callback(payload);
        }
      )
      .subscribe((status, err) => {
        console.log('🔵 Subscription status:', status, err ? `Error: ${err}` : '');
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription failed. Check if real-time is enabled in Supabase.');
        }
      });
  }
  
  // Get board objects for preview (limit to reduce data transfer)
  static async getBoardPreview(roomId: string): Promise<SupabaseBoardObject[]> {
    const { data: board, error: boardError } = await supabase
      .from('boards')
      .select('id')
      .eq('room_id', roomId)
      .single();
    
    if (boardError) return [];
    
    const { data: objects, error: objectsError } = await supabase
      .from('board_objects')
      .select('*')
      .eq('board_id', board.id)
      .limit(50)
      .order('created_at', { ascending: true });
    
    if (objectsError) return [];
    return objects || [];
  }
  
  // Convert legacy board object format to Supabase format
  static convertLegacyObject(legacyObj: any, _boardId: string): Omit<SupabaseBoardObject, 'board_id' | 'created_at' | 'updated_at'> {
    const base: any = {
      id: legacyObj.id,
      type: legacyObj.type,
      x: legacyObj.x,
      y: legacyObj.y,
      rotation: legacyObj.rotation || 0,
      color: legacyObj.color,
    };
    if (legacyObj.zIndex != null) base.z_index = legacyObj.zIndex;
    
    if (legacyObj.type === 'connector') {
      return {
        ...base,
        start_object_id: legacyObj.startObjectId,
        end_object_id: legacyObj.endObjectId,
        start_point: legacyObj.startPoint,
        end_point: legacyObj.endPoint,
        start_anchor: legacyObj.startAnchor,
        end_anchor: legacyObj.endAnchor,
        style: legacyObj.style,
        stroke_width: legacyObj.strokeWidth,
        arrow_end: legacyObj.arrowEnd,
      };
    }

    if (legacyObj.type === 'drawing') {
      return {
        ...base,
        x: 0,
        y: 0,
        points: legacyObj.points,
        stroke_width: legacyObj.strokeWidth,
        pen_type: legacyObj.penType,
      };
    }

    return {
      ...base,
      width: legacyObj.width,
      height: legacyObj.height,
      text: legacyObj.text,
      ...(legacyObj.fontSize != null ? { font_size: legacyObj.fontSize } : {}),
    };
  }
  
  // Convert Supabase object to legacy format for compatibility
  static convertToLegacyObject(supabaseObj: SupabaseBoardObject): any {
    if (supabaseObj.type === 'connector') {
      return {
        id: supabaseObj.id,
        type: supabaseObj.type,
        startObjectId: supabaseObj.start_object_id,
        endObjectId: supabaseObj.end_object_id,
        startPoint: supabaseObj.start_point,
        endPoint: supabaseObj.end_point,
        startAnchor: supabaseObj.start_anchor,
        endAnchor: supabaseObj.end_anchor,
        style: supabaseObj.style,
        color: supabaseObj.color,
        strokeWidth: supabaseObj.stroke_width,
        arrowEnd: supabaseObj.arrow_end,
        ...(supabaseObj.z_index != null ? { zIndex: supabaseObj.z_index } : {}),
      };
    }

    if (supabaseObj.type === 'drawing') {
      return {
        id: supabaseObj.id,
        type: 'drawing',
        points: supabaseObj.points || [],
        color: supabaseObj.color,
        strokeWidth: supabaseObj.stroke_width || 3,
        penType: supabaseObj.pen_type || 'pen',
        ...(supabaseObj.z_index != null ? { zIndex: supabaseObj.z_index } : {}),
      };
    }

    return {
      id: supabaseObj.id,
      type: supabaseObj.type,
      x: supabaseObj.x,
      y: supabaseObj.y,
      width: supabaseObj.width,
      height: supabaseObj.height,
      rotation: supabaseObj.rotation,
      text: supabaseObj.text,
      color: supabaseObj.color,
      ...(supabaseObj.font_size != null ? { fontSize: supabaseObj.font_size } : {}),
      ...(supabaseObj.z_index != null ? { zIndex: supabaseObj.z_index } : {}),
    };
  }

  // Toggle board lock state (owner only)
  static async setBoardLocked(boardId: string, locked: boolean): Promise<void> {
    const { error } = await supabase
      .from('boards')
      .update({ is_locked: locked })
      .eq('id', boardId);
    if (error) throw error;
  }
}