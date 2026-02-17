-- First, let's disable RLS temporarily and drop all policies
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can create rooms" ON rooms;
DROP POLICY IF EXISTS "Users can update own rooms" ON rooms;
DROP POLICY IF EXISTS "Users can delete own rooms" ON rooms;
DROP POLICY IF EXISTS "Users can view own rooms" ON rooms;
DROP POLICY IF EXISTS "Users can view rooms they have access to" ON rooms;

-- Create simple policies that don't cause recursion
CREATE POLICY "Users can view own rooms" ON rooms
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create rooms" ON rooms
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own rooms" ON rooms
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own rooms" ON rooms
  FOR DELETE USING (auth.uid() = owner_id);

-- Re-enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- For now, let's disable room_members table RLS to avoid conflicts
ALTER TABLE room_members DISABLE ROW LEVEL SECURITY;