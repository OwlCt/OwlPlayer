-- Add prefetch settings for audio prefetch feature
-- prefetch.count: Number of songs to prefetch (default: 3)
-- prefetch.concurrent_limit: Maximum concurrent downloads (default: 3)
INSERT INTO system_settings (key, value) VALUES 
    ('prefetch.count', '3'),
    ('prefetch.concurrent_limit', '3')
ON CONFLICT (key) DO NOTHING;
