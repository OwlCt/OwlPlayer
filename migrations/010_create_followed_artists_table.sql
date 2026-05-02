-- +migrate Up
CREATE TABLE IF NOT EXISTS followed_artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artist_id VARCHAR(255) NOT NULL,
    artist_name VARCHAR(500) NOT NULL,
    artwork_url VARCHAR(1000),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_followed_artists_user_id ON followed_artists(user_id);
CREATE INDEX IF NOT EXISTS idx_followed_artists_created_at ON followed_artists(created_at DESC);

-- +migrate Down
DROP INDEX IF EXISTS idx_followed_artists_created_at;
DROP INDEX IF EXISTS idx_followed_artists_user_id;
DROP TABLE IF EXISTS followed_artists;
