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
}

interface SupabaseBoardObject {
  id: string;
  board_id: string;
  type: 'sticky' | 'rectangle' | 'circle' | 'textbox' | 'connector';
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation: number;
  color: string;
  text?: string;
  start_object_id?: string;
  end_object_id?: string;
  start_point?: { x: number; y: number };
  end_point?: { x: number; y: number };
  start_anchor?: string;
  end_anchor?: string;
  style?: string;
  stroke_width?: number;
  arrow_end?: boolean;
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
    await supabase
      .from('board_collaborators')
      .insert({
        board_id: data.id,
        user_id: userId,
        role: 'owner'
      });
    
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
  
  // Get all user's boards
  static async getUserBoards(): Promise<BoardSummary[]> {
    const user = await supabase.auth.getUser();
    const userId = user.data.user?.id;
    
    if (!userId) {
      return [];
    }

    const { data, error } = await supabase
      .from('boards')
      .select('*')
      .eq('created_by', userId)  // Only get boards created by this user
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(board => ({
      ...board,
      object_count: 0, // TODO: Add count queries later
      collaborator_count: 1, // TODO: Add count queries later
    }));
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
    const base = {
      id: legacyObj.id,
      type: legacyObj.type,
      x: legacyObj.x,
      y: legacyObj.y,
      rotation: legacyObj.rotation || 0,
      color: legacyObj.color,
    };
    
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
    
    return {
      ...base,
      width: legacyObj.width,
      height: legacyObj.height,
      text: legacyObj.text,
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
    };
  }
}