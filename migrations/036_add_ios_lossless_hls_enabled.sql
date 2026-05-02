-- +migrate Up
ALTER TABLE users ADD COLUMN IF NOT EXISTS ios_lossless_hls_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- +migrate Down
ALTER TABLE users DROP COLUMN IF EXISTS ios_lossless_hls_enabled;
