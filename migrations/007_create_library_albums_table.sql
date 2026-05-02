-- Migration: 007_create_library_albums_table
-- Description: Create library_albums table for storing user's saved albums
-- Created: 2025-12-01

-- Library albums table
CREATE TABLE IF NOT EXISTS library_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    album_id VARCHAR(255) NOT NULL,
    album_name VARCHAR(500) NOT NULL,
    artist_name VARCHAR(500) NOT NULL,
    artwork_url VARCHAR(1000),
    release_date VARCHAR(50),
    track_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure a user can only save an album once
    UNIQUE(user_id, album_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_library_albums_user_id ON library_albums(user_id);
CREATE INDEX IF NOT EXISTS idx_library_albums_album_id ON library_albums(album_id);
CREATE INDEX IF NOT EXISTS idx_library_albums_created_at ON library_albums(created_at DESC);
