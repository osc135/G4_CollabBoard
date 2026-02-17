-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable Row Level Security
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own rooms
CREATE POLICY "Users can view own rooms" ON rooms
  FOR SELECT USING (auth.uid() = owner_id);

-- Policy: Users can create rooms
CREATE POLICY "Users can create rooms" ON rooms
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Policy: Users can update their own rooms
CREATE POLICY "Users can update own rooms" ON rooms
  FOR UPDATE USING (auth.uid() = owner_id);

-- Policy: Users can delete their own rooms  
CREATE POLICY "Users can delete own rooms" ON rooms
  FOR DELETE USING (auth.uid() = owner_id);

-- Create index for faster queries
CREATE INDEX idx_rooms_owner_id ON rooms(owner_id);
CREATE INDEX idx_rooms_last_accessed ON rooms(last_accessed DESC);