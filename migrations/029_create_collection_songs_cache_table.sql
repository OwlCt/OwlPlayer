-- Create collection_songs_cache table for storing pre-generated collection songs
CREATE TABLE IF NOT EXISTS collection_songs_cache (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    collection_type VARCHAR(50) NOT NULL,  -- 'artist' or 'genre'
    collection_key VARCHAR(255) NOT NULL,  -- artist_id or genre name
    songs_json TEXT NOT NULL,              -- JSON array of songs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE(user_id, collection_type, collection_key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_collection_songs_cache_lookup 
    ON collection_songs_cache(user_id, collection_type, collection_key);

-- Create index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_collection_songs_cache_expires 
    ON collection_songs_cache(expires_at);

-- Create artist_playlists_cache table for storing pre-generated artist playlists
CREATE TABLE IF NOT EXISTS artist_playlists_cache (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    playlists_json TEXT NOT NULL,          -- JSON array of playlists
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Create index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_artist_playlists_cache_expires 
    ON artist_playlists_cache(expires_at);

-- Add collection cache settings to system_settings
INSERT INTO system_settings (key, value) VALUES 
    ('collection_cache.ttl_hours', '48'),           -- Default 48 hours cache TTL
    ('collection_cache.auto_refresh', 'false'),     -- Auto refresh disabled by default
    ('collection_cache.refresh_hour', '5')          -- Refresh at 5 AM if enabled
ON CONFLICT (key) DO NOTHING;
