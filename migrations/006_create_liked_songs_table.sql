-- Migration: 006_create_liked_songs_table
-- Description: Create liked_songs table for storing user's liked songs
-- Created: 2025-12-01

-- Liked songs table
CREATE TABLE IF NOT EXISTS liked_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id VARCHAR(255) NOT NULL,
    song_name VARCHAR(500) NOT NULL,
    artist_name VARCHAR(500) NOT NULL,
    album_name VARCHAR(500),
    album_id VARCHAR(255),
    duration INTEGER NOT NULL,
    artwork_url VARCHAR(1000),
    has_lyrics BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure a user can only like a song once
    UNIQUE(user_id, song_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_liked_songs_user_id ON liked_songs(user_id);
CREATE INDEX IF NOT EXISTS idx_liked_songs_song_id ON liked_songs(song_id);
CREATE INDEX IF NOT EXISTS idx_liked_songs_created_at ON liked_songs(created_at DESC);
