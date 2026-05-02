-- +migrate Up
ALTER TABLE users ADD COLUMN IF NOT EXISTS release_notification_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- +migrate Down
ALTER TABLE users DROP COLUMN IF EXISTS release_notification_enabled;
