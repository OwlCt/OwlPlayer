-- +migrate Up
-- Add genres column to liked_songs table for recommendation system
ALTER TABLE liked_songs ADD COLUMN genres TEXT[] DEFAULT '{}';

-- +migrate Down
ALTER TABLE liked_songs DROP COLUMN IF EXISTS genres;
