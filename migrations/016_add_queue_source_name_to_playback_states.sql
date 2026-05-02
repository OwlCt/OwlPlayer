-- Add queue_source_name column to playback_states table
-- This stores the display name of the queue source (playlist name, album name, etc.)

ALTER TABLE playback_states ADD COLUMN IF NOT EXISTS queue_source_name VARCHAR(255) DEFAULT NULL;
