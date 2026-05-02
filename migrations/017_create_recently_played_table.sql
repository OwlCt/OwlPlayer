-- +migrate Up
-- Recently played items table for tracking user's play history
CREATE TABLE IF NOT EXISTS recently_played (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL, -- 'playlist', 'album', 'artist', 'liked-songs'
    item_id VARCHAR(255) NOT NULL,
    last_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure a user can only have one entry per item
    UNIQUE(user_id, item_type, item_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_recently_played_user_id ON recently_played(user_id);
CREATE INDEX IF NOT EXISTS idx_recently_played_last_played_at ON recently_played(last_played_at DESC);
CREATE INDEX IF NOT EXISTS idx_recently_played_user_item ON recently_played(user_id, item_type, item_id);

-- +migrate Down
DROP INDEX IF EXISTS idx_recently_played_user_item;
DROP INDEX IF EXISTS idx_recently_played_last_played_at;
DROP INDEX IF EXISTS idx_recently_played_user_id;
DROP TABLE IF EXISTS recently_played;
