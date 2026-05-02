CREATE TABLE IF NOT EXISTS user_metadata_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    artwork_enhancement BOOLEAN NOT NULL DEFAULT TRUE,
    artist_profile_enhancement BOOLEAN NOT NULL DEFAULT TRUE,
    album_metadata_enhancement BOOLEAN NOT NULL DEFAULT TRUE,
    lyrics_enhancement BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS local_entity_metadata_controls (
    entity_type VARCHAR(32) NOT NULL,
    entity_id BIGINT NOT NULL,
    override_mode VARCHAR(32) NOT NULL DEFAULT 'inherit',
    manual_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    lyrics_source VARCHAR(32),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entity_type, entity_id),
    CONSTRAINT local_entity_metadata_controls_entity_type_check
        CHECK (entity_type IN ('artist', 'album', 'media')),
    CONSTRAINT local_entity_metadata_controls_override_mode_check
        CHECK (override_mode IN ('inherit', 'force_local', 'prefer_am', 'manual_override')),
    CONSTRAINT local_entity_metadata_controls_lyrics_source_check
        CHECK (lyrics_source IS NULL OR lyrics_source IN ('inherit', 'local', 'apple_music', 'disabled'))
);
