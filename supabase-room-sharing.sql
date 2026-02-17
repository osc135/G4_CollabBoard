-- Add invite_code column to rooms table
ALTER TABLE rooms 
ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- Create index for faster invite code lookups
CREATE INDEX IF NOT EXISTS idx_rooms_invite_code ON rooms(invite_code);

-- Create room_members table for tracking who has access
CREATE TABLE IF NOT EXISTS room_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- 'owner', 'member'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(room_id, user_id)
);

-- Enable RLS on room_members
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

-- Update rooms policies to check membership
DROP POLICY IF EXISTS "Users can view own rooms" ON rooms;
CREATE POLICY "Users can view rooms they have access to" ON rooms
  FOR SELECT USING (
    auth.uid() = owner_id OR 
    EXISTS (
      SELECT 1 FROM room_members 
      WHERE room_members.room_id = rooms.id 
      AND room_members.user_id = auth.uid()
    )
  );

-- Policy for room_members table
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

-- Allow users to join rooms with valid invite code
CREATE POLICY "Users can join with invite code" ON room_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);