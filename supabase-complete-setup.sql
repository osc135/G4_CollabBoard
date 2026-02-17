-- Create rooms table if not exists
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add invite_code column if not exists
ALTER TABLE rooms 
ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- Enable Row Level Security
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can create rooms" ON rooms;
DROP POLICY IF EXISTS "Users can update own rooms" ON rooms;
DROP POLICY IF EXISTS "Users can delete own rooms" ON rooms;
DROP POLICY IF EXISTS "Users can view own rooms" ON rooms;
DROP POLICY IF EXISTS "Users can view rooms they have access to" ON rooms;

-- Create new policies
CREATE POLICY "Users can view rooms they have access to" ON rooms
  FOR SELECT USING (
    auth.uid() = owner_id OR 
    EXISTS (
      SELECT 1 FROM room_members 
      WHERE room_members.room_id = rooms.id 
      AND room_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create rooms" ON rooms
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own rooms" ON rooms
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own rooms" ON rooms
  FOR DELETE USING (auth.uid() = owner_id);

-- Create indexes if not exists
CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_rooms_last_accessed ON rooms(last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_invite_code ON rooms(invite_code);

-- Create room_members table if not exists
CREATE TABLE IF NOT EXISTS room_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(room_id, user_id)
);

-- Enable RLS on room_members
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

-- Drop existing room_members policies if they exist
DROP POLICY IF EXISTS "Users can view their memberships" ON room_members;
DROP POLICY IF EXISTS "Room owners can manage members" ON room_members;
DROP POLICY IF EXISTS "Users can join with invite code" ON room_members;

-- Create room_members policies
CREATE POLICY "Users can view their memberships" ON room_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Room owners can manage members" ON room_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM rooms 
      WHERE rooms.id = room_members.room_id 
      AND rooms.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can join with invite code" ON room_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);