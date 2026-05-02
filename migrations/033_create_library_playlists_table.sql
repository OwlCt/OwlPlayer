-- Create library_playlists table for storing Apple Music playlists added to user's library
CREATE TABLE IF NOT EXISTS library_playlists (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    playlist_id TEXT NOT NULL,  -- Apple Music playlist ID (e.g., pl.xxxxx)
    playlist_name TEXT NOT NULL,
    curator_name TEXT,
    artwork_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, playlist_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_library_playlists_user_id ON library_playlists(user_id);
