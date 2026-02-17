import { supabase } from './supabase';
import type { Board, SupabaseBoardObject, BoardWithObjects, BoardSummary } from '@collabboard/shared/supabase-types';

export class SupabaseBoardService {
  
  // Create a new board
  static async createBoard(name: string, roomId: string): Promise<Board> {
    const { data, error } = await supabase
      .from('boards')
      .insert({
        name,
        room_id: roomId,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .select()
      .single();
    
    if (error) throw error;
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
    const { data, error } = await supabase
      .from('boards')
      .select('*')
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
    return supabase
      .channel(`board-${boardId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'board_objects', filter: `board_id=eq.${boardId}` },
        callback
      )
      .subscribe();
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
  static convertLegacyObject(legacyObj: any, boardId: string): Omit<SupabaseBoardObject, 'board_id' | 'created_at' | 'updated_at'> {
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