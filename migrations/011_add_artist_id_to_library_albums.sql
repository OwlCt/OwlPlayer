-- Migration: 011_add_artist_id_to_library_albums
-- Description: Add artist_id column to library_albums table for direct artist navigation
-- Created: 2025-12-03

-- Add artist_id column to library_albums table
ALTER TABLE library_albums ADD COLUMN IF NOT EXISTS artist_id VARCHAR(255);

-- Create index for artist_id
CREATE INDEX IF NOT EXISTS idx_library_albums_artist_id ON library_albums(artist_id);
