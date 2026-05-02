-- +migrate Up
-- Play history table for tracking individual song plays for statistics
CREATE TABLE IF NOT EXISTS play_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id VARCHAR(255) NOT NULL,
    song_name VARCHAR(500) NOT NULL,
    artist_id VARCHAR(255) NOT NULL,
    artist_name VARCHAR(500) NOT NULL,
    album_id VARCHAR(255) NOT NULL,
    album_name VARCHAR(500) NOT NULL,
    artwork_url TEXT,
    duration INTEGER NOT NULL,
    played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_play_history_user_id ON play_history(user_id);
CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_history_artist_id ON play_history(artist_id);
CREATE INDEX IF NOT EXISTS idx_play_history_song_id ON play_history(song_id);
CREATE INDEX IF NOT EXISTS idx_play_history_user_played_at ON play_history(user_id, played_at DESC);

-- +migrate Down
DROP INDEX IF EXISTS idx_play_history_user_played_at;
DROP INDEX IF EXISTS idx_play_history_song_id;
DROP INDEX IF EXISTS idx_play_history_artist_id;
DROP INDEX IF EXISTS idx_play_history_played_at;
DROP INDEX IF EXISTS idx_play_history_user_id;
DROP TABLE IF EXISTS play_history;
