-- +migrate Up
-- Add a JSONB column to store full song information
ALTER TABLE playback_states ADD COLUMN IF NOT EXISTS queue_songs JSONB NOT NULL DEFAULT '[]';

-- +migrate Down
ALTER TABLE playback_states DROP COLUMN IF EXISTS queue_songs;
