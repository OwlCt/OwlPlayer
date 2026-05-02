-- +migrate Up
CREATE TABLE IF NOT EXISTS release_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artist_id VARCHAR(255) NOT NULL,
    artist_name VARCHAR(500) NOT NULL,
    release_id VARCHAR(255) NOT NULL,
    release_type VARCHAR(20) NOT NULL,
    release_name VARCHAR(500) NOT NULL,
    artwork_url TEXT,
    release_date DATE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, release_id)
);

CREATE INDEX IF NOT EXISTS idx_release_notifications_user_id ON release_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_release_notifications_created_at ON release_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_release_notifications_is_read ON release_notifications(user_id, is_read);

-- +migrate Down
DROP INDEX IF EXISTS idx_release_notifications_is_read;
DROP INDEX IF EXISTS idx_release_notifications_created_at;
DROP INDEX IF EXISTS idx_release_notifications_user_id;
DROP TABLE IF EXISTS release_notifications;
