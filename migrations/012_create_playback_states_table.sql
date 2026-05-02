-- +migrate Up
CREATE TABLE IF NOT EXISTS playback_states (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    queue_song_ids TEXT[] NOT NULL DEFAULT '{}',
    current_index INTEGER NOT NULL DEFAULT 0,
    position DECIMAL(10, 3) NOT NULL DEFAULT 0,
    play_mode VARCHAR(20) NOT NULL DEFAULT 'sequential',
    is_shuffled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playback_states_updated_at ON playback_states(updated_at DESC);

-- +migrate Down
DROP INDEX IF EXISTS idx_playback_states_updated_at;
DROP TABLE IF EXISTS playback_states;
