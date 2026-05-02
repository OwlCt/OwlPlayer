-- Add artist_id column to liked_songs table
ALTER TABLE liked_songs ADD COLUMN artist_id TEXT;

-- Add artist_id column to playlist_songs table
ALTER TABLE playlist_songs ADD COLUMN artist_id TEXT;
