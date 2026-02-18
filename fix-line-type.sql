-- Add 'line' to the allowed types in board_objects table
ALTER TABLE board_objects 
DROP CONSTRAINT board_objects_type_check;

ALTER TABLE board_objects 
ADD CONSTRAINT board_objects_type_check 
CHECK (type IN ('sticky', 'rectangle', 'circle', 'line', 'textbox', 'connector'));