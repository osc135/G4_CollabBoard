// Supabase Database Types for CollabBoard

export interface Board {
  id: string;
  name: string;
  room_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_public: boolean;
}

export interface BoardObject {
  id: string;
  board_id: string;
  type: 'sticky' | 'rectangle' | 'circle' | 'textbox' | 'connector';
  
  // Position and dimensions
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation: number;
  
  // Styling
  color: string;
  
  // Content
  text?: string;
  
  // Connector-specific fields
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

export interface BoardCollaborator {
  board_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: string;
}

// Helper types for API responses
export interface BoardWithObjects extends Board {
  objects: BoardObject[];
}

export interface BoardSummary extends Board {
  object_count: number;
  collaborator_count: number;
}