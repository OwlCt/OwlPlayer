-- +migrate Up
-- Add genres column to play_history table for recommendation system
ALTER TABLE play_history ADD COLUMN genres TEXT[] DEFAULT '{}';

-- Create index on genres for efficient queries
CREATE INDEX IF NOT EXISTS idx_play_history_genres ON play_history USING GIN(genres);

-- +migrate Down
DROP INDEX IF EXISTS idx_play_history_genres;
ALTER TABLE play_history DROP COLUMN IF EXISTS genres;
