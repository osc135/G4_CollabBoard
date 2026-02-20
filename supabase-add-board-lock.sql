-- Add board locking support
ALTER TABLE boards ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
