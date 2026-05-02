-- +migrate Up
ALTER TABLE playback_states ADD COLUMN IF NOT EXISTS queue_source_type VARCHAR(20) DEFAULT NULL;
ALTER TABLE playback_states ADD COLUMN IF NOT EXISTS queue_source_id VARCHAR(255) DEFAULT NULL;

-- +migrate Down
ALTER TABLE playback_states DROP COLUMN IF EXISTS queue_source_type;
ALTER TABLE playback_states DROP COLUMN IF EXISTS queue_source_id;
