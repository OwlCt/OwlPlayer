-- Create system_settings table for storing system-wide configuration
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default cache settings
-- max_size: 1GB (1073741824 bytes)
-- max_age: 30 days (2592000 seconds)
-- idle_expiry: 7 days (604800 seconds)
INSERT INTO system_settings (key, value) VALUES 
    ('cache.max_size', '1073741824'),
    ('cache.max_age', '2592000'),
    ('cache.idle_expiry', '604800')
ON CONFLICT (key) DO NOTHING;
