-- Squid Game Trivia Database Schema
-- Run this in your Supabase SQL Editor

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pin VARCHAR(4) UNIQUE NOT NULL,
  current_question JSONB,
  status VARCHAR(20) DEFAULT 'lobby',
  timer_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_pin VARCHAR(4) NOT NULL REFERENCES rooms(pin) ON DELETE CASCADE,
  nickname VARCHAR(50) NOT NULL,
  score INTEGER DEFAULT 0,
  is_eliminated BOOLEAN DEFAULT FALSE,
  last_answer INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Question bank table
CREATE TABLE IF NOT EXISTS question_bank (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  question_text TEXT NOT NULL,
  image_url TEXT,
  answers JSONB NOT NULL, -- Array of 4 answer strings
  correct_index INTEGER NOT NULL CHECK (correct_index >= 0 AND correct_index < 4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_pin ON rooms(pin);
CREATE INDEX IF NOT EXISTS idx_players_room_pin ON players(room_pin);
CREATE INDEX IF NOT EXISTS idx_players_eliminated ON players(is_eliminated);
CREATE INDEX IF NOT EXISTS idx_question_bank_category ON question_bank(category);

-- Enable Row Level Security (RLS)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow all operations for now (adjust based on your security needs)
CREATE POLICY "Allow all operations on rooms" ON rooms
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on players" ON players
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow read access to question_bank" ON question_bank
  FOR SELECT USING (true);

-- Enable Realtime for rooms and players
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
