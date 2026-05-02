-- Create discovery_cache table for caching discovery recommendations
CREATE TABLE IF NOT EXISTS discovery_cache (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    cache_type VARCHAR(50) NOT NULL,  -- 'similar-artists', 'related-albums', 'discover-songs'
    items_json TEXT NOT NULL,
    shuffle_date DATE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, cache_type)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_discovery_cache_user_type ON discovery_cache(user_id, cache_type);
CREATE INDEX IF NOT EXISTS idx_discovery_cache_expires ON discovery_cache(expires_at);
