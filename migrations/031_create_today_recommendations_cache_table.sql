-- Create today_recommendations_cache table for caching daily shuffled recommendations
CREATE TABLE IF NOT EXISTS today_recommendations_cache (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    items_json TEXT NOT NULL,
    shuffle_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_today_recommendations_cache_user_date ON today_recommendations_cache(user_id, shuffle_date);
