-- Fix for board_objects RLS policy
-- This policy should match the SELECT policy logic

-- Drop the existing problematic policy
DROP POLICY IF EXISTS "Board collaborators can modify objects" ON board_objects;

-- Create the corrected policy that allows both board creators AND collaborators
CREATE POLICY "Board collaborators can modify objects" ON board_objects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM boards b
      LEFT JOIN board_collaborators bc ON b.id = bc.board_id
      WHERE b.id = board_objects.board_id AND (
        b.created_by = auth.uid() OR
        (bc.user_id = auth.uid() AND bc.role IN ('owner', 'editor'))
      )
    )
  );