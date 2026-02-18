-- Check and fix board_collaborators table permissions

-- First check if the table exists
SELECT * FROM board_collaborators LIMIT 1;

-- Enable RLS on board_collaborators if not already enabled
ALTER TABLE board_collaborators ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own collaborations" ON board_collaborators;
DROP POLICY IF EXISTS "Users can insert their own collaborations" ON board_collaborators;
DROP POLICY IF EXISTS "Board owners can manage collaborators" ON board_collaborators;

-- Create policy for users to view collaborations they're part of
CREATE POLICY "Users can view their own collaborations"
ON board_collaborators FOR SELECT
USING (auth.uid() = user_id);

-- Create policy for users to add themselves as collaborators to public boards
CREATE POLICY "Users can join public boards"
ON board_collaborators FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND EXISTS (
    SELECT 1 FROM boards 
    WHERE boards.id = board_collaborators.board_id 
    AND boards.is_public = true
  )
);

-- Create policy for board owners to manage collaborators
CREATE POLICY "Board owners can manage collaborators"
ON board_collaborators FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM boards 
    WHERE boards.id = board_collaborators.board_id 
    AND boards.created_by = auth.uid()
  )
);

-- Also ensure boards table has proper policies for public boards
DROP POLICY IF EXISTS "Public boards are viewable by all" ON boards;

-- Allow anyone to view public boards
CREATE POLICY "Public boards are viewable by all"
ON boards FOR SELECT
USING (
  is_public = true 
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM board_collaborators 
    WHERE board_collaborators.board_id = boards.id 
    AND board_collaborators.user_id = auth.uid()
  )
);

-- Test the policies
SELECT 
  'Boards table RLS enabled' as check_name,
  relrowsecurity as enabled
FROM pg_class
WHERE relname = 'boards';

SELECT 
  'Board_collaborators table RLS enabled' as check_name,
  relrowsecurity as enabled
FROM pg_class
WHERE relname = 'board_collaborators';

-- List all policies on both tables
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('boards', 'board_collaborators')
ORDER BY tablename, policyname;