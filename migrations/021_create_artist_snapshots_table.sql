-- +migrate Up
CREATE TABLE IF NOT EXISTS artist_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id VARCHAR(255) NOT NULL UNIQUE,
    artist_name VARCHAR(500) NOT NULL,
    album_ids TEXT[] NOT NULL DEFAULT '{}',
    single_ids TEXT[] NOT NULL DEFAULT '{}',
    snapshot_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artist_snapshots_artist_id ON artist_snapshots(artist_id);

-- +migrate Down
DROP INDEX IF EXISTS idx_artist_snapshots_artist_id;
DROP TABLE IF EXISTS artist_snapshots;
