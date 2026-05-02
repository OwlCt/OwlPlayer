-- +migrate Up
-- Add genres column to followed_artists table for recommendation system
ALTER TABLE followed_artists ADD COLUMN genres TEXT[] DEFAULT '{}';

-- +migrate Down
ALTER TABLE followed_artists DROP COLUMN IF EXISTS genres;
