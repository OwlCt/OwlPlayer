-- Create liked_albums_cache table for storing daily shuffled liked albums
CREATE TABLE IF NOT EXISTS liked_albums_cache (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    albums_json TEXT NOT NULL,              -- JSON array of shuffled albums
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    shuffle_date DATE NOT NULL              -- Date when the shuffle was generated
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_liked_albums_cache_user 
    ON liked_albums_cache(user_id);

-- Create index for cleanup by date
CREATE INDEX IF NOT EXISTS idx_liked_albums_cache_date 
    ON liked_albums_cache(shuffle_date);

-- Add liked albums cache settings to system_settings
INSERT INTO system_settings (key, value) VALUES 
    ('liked_albums_cache.shuffle_hour', '6')    -- Shuffle at 6 AM daily
ON CONFLICT (key) DO NOTHING;
