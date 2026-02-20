-- Add drawing type support to board_objects

-- 1. Update the type CHECK constraint to include 'drawing'
ALTER TABLE board_objects DROP CONSTRAINT IF EXISTS board_objects_type_check;
ALTER TABLE board_objects ADD CONSTRAINT board_objects_type_check
  CHECK (type IN ('sticky', 'rectangle', 'circle', 'textbox', 'connector', 'line', 'drawing'));

-- 2. Add drawing-specific columns
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS points JSONB;       -- flat array [x0,y0,x1,y1,...]
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS pen_type TEXT;       -- 'pen', 'marker', 'highlighter'

-- 3. Make x/y nullable for drawings (they don't have x/y, they use points)
ALTER TABLE board_objects ALTER COLUMN x DROP NOT NULL;
ALTER TABLE board_objects ALTER COLUMN y DROP NOT NULL;
ALTER TABLE board_objects ALTER COLUMN x SET DEFAULT 0;
ALTER TABLE board_objects ALTER COLUMN y SET DEFAULT 0;
