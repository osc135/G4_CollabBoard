-- CollabBoard Supabase Database Schema

-- Create boards table
CREATE TABLE boards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled Board',
  room_id TEXT UNIQUE NOT NULL, -- Keep compatibility with existing room IDs
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_public BOOLEAN DEFAULT false,
  
  -- Add indexes
  INDEX boards_room_id_idx (room_id),
  INDEX boards_created_by_idx (created_by)
);

-- Create board_objects table for all shapes/elements
CREATE TABLE board_objects (
  id TEXT PRIMARY KEY, -- Use the existing object IDs (like "sticky-1771359844791")
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sticky', 'rectangle', 'circle', 'textbox', 'connector')),
  
  -- Position and dimensions
  x FLOAT NOT NULL DEFAULT 0,
  y FLOAT NOT NULL DEFAULT 0,
  width FLOAT DEFAULT 100,
  height FLOAT DEFAULT 100,
  rotation FLOAT DEFAULT 0,
  
  -- Styling
  color TEXT DEFAULT '#fef08a',
  
  -- Content
  text TEXT,
  
  -- Connector-specific fields
  start_object_id TEXT REFERENCES board_objects(id) ON DELETE CASCADE,
  end_object_id TEXT REFERENCES board_objects(id) ON DELETE CASCADE,
  start_point JSONB, -- {x: number, y: number}
  end_point JSONB,
  start_anchor TEXT,
  end_anchor TEXT,
  style TEXT,
  stroke_width FLOAT DEFAULT 2,
  arrow_end BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Add indexes
  INDEX board_objects_board_id_idx (board_id),
  INDEX board_objects_type_idx (type)
);

-- Create board_collaborators table for access control
CREATE TABLE board_collaborators (
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  PRIMARY KEY (board_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_collaborators ENABLE ROW LEVEL SECURITY;

-- Policies for boards table
CREATE POLICY "Users can view boards they have access to" ON boards
  FOR SELECT USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM board_collaborators 
      WHERE board_id = id AND user_id = auth.uid()
    ) OR
    is_public = true
  );

CREATE POLICY "Users can create boards" ON boards
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Board collaborators can update boards" ON boards
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM board_collaborators 
      WHERE board_id = id AND user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Board owners can delete boards" ON boards
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM board_collaborators 
      WHERE board_id = id AND user_id = auth.uid() AND role = 'owner'
    )
  );

-- Policies for board_objects table
CREATE POLICY "Users can view objects from accessible boards" ON board_objects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM boards b
      LEFT JOIN board_collaborators bc ON b.id = bc.board_id
      WHERE b.id = board_id AND (
        b.created_by = auth.uid() OR
        bc.user_id = auth.uid() OR
        b.is_public = true
      )
    )
  );

CREATE POLICY "Board collaborators can modify objects" ON board_objects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM board_collaborators 
      WHERE board_id = board_objects.board_id AND user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  );

-- Policies for board_collaborators table
CREATE POLICY "Users can view collaborators of their boards" ON board_collaborators
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM board_collaborators bc2
      WHERE bc2.board_id = board_id AND bc2.user_id = auth.uid() AND bc2.role = 'owner'
    )
  );

CREATE POLICY "Board owners can manage collaborators" ON board_collaborators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM board_collaborators bc2
      WHERE bc2.board_id = board_id AND bc2.user_id = auth.uid() AND bc2.role = 'owner'
    )
  );

-- Function to automatically add creator as owner
CREATE OR REPLACE FUNCTION add_board_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO board_collaborators (board_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically add board creator as owner
CREATE TRIGGER add_board_owner_trigger
  AFTER INSERT ON boards
  FOR EACH ROW
  EXECUTE FUNCTION add_board_owner();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER boards_updated_at_trigger
  BEFORE UPDATE ON boards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER board_objects_updated_at_trigger
  BEFORE UPDATE ON board_objects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();