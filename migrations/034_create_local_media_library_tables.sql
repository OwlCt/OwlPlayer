CREATE TABLE IF NOT EXISTS local_artists (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    sort_name TEXT,
    apple_music_artist_id TEXT,
    artwork_path TEXT,
    artwork_url TEXT,
    availability_status TEXT NOT NULL DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_artists_normalized_name ON local_artists(normalized_name);
CREATE INDEX IF NOT EXISTS idx_local_artists_apple_music_artist_id ON local_artists(apple_music_artist_id);
CREATE INDEX IF NOT EXISTS idx_local_artists_availability_status ON local_artists(availability_status);

CREATE TABLE IF NOT EXISTS local_albums (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    sort_title TEXT,
    primary_artist_id BIGINT REFERENCES local_artists(id) ON DELETE SET NULL,
    release_date DATE,
    release_year INTEGER,
    total_tracks INTEGER NOT NULL DEFAULT 0,
    artwork_path TEXT,
    artwork_url TEXT,
    apple_music_album_id TEXT,
    availability_status TEXT NOT NULL DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_albums_primary_artist_id ON local_albums(primary_artist_id);
CREATE INDEX IF NOT EXISTS idx_local_albums_normalized_title ON local_albums(normalized_title);
CREATE INDEX IF NOT EXISTS idx_local_albums_apple_music_album_id ON local_albums(apple_music_album_id);
CREATE INDEX IF NOT EXISTS idx_local_albums_availability_status ON local_albums(availability_status);

CREATE TABLE IF NOT EXISTS local_media (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    sort_title TEXT,
    album_id BIGINT REFERENCES local_albums(id) ON DELETE SET NULL,
    primary_artist_id BIGINT REFERENCES local_artists(id) ON DELETE SET NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    track_number INTEGER NOT NULL DEFAULT 0,
    track_total INTEGER NOT NULL DEFAULT 0,
    disc_number INTEGER NOT NULL DEFAULT 0,
    disc_total INTEGER NOT NULL DEFAULT 0,
    release_date DATE,
    composer TEXT,
    genres TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    lyrics_available BOOLEAN NOT NULL DEFAULT FALSE,
    content_rating TEXT,
    apple_music_song_id TEXT,
    availability_status TEXT NOT NULL DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_media_album_id ON local_media(album_id);
CREATE INDEX IF NOT EXISTS idx_local_media_primary_artist_id ON local_media(primary_artist_id);
CREATE INDEX IF NOT EXISTS idx_local_media_normalized_title ON local_media(normalized_title);
CREATE INDEX IF NOT EXISTS idx_local_media_apple_music_song_id ON local_media(apple_music_song_id);
CREATE INDEX IF NOT EXISTS idx_local_media_availability_status ON local_media(availability_status);

CREATE TABLE IF NOT EXISTS local_media_files (
    id BIGSERIAL PRIMARY KEY,
    media_id BIGINT NOT NULL REFERENCES local_media(id) ON DELETE CASCADE,
    library_root TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    absolute_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    modified_at TIMESTAMP WITH TIME ZONE NOT NULL,
    fingerprint TEXT,
    mime_type TEXT,
    container TEXT,
    codec TEXT,
    bitrate INTEGER NOT NULL DEFAULT 0,
    sample_rate INTEGER NOT NULL DEFAULT 0,
    channels INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    availability_status TEXT NOT NULL DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(absolute_path)
);

CREATE INDEX IF NOT EXISTS idx_local_media_files_media_id ON local_media_files(media_id);
CREATE INDEX IF NOT EXISTS idx_local_media_files_library_root ON local_media_files(library_root);
CREATE INDEX IF NOT EXISTS idx_local_media_files_availability_status ON local_media_files(availability_status);

CREATE TABLE IF NOT EXISTS local_metadata_fields (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    field_name TEXT NOT NULL,
    source TEXT NOT NULL,
    confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
    is_enhanced BOOLEAN NOT NULL DEFAULT FALSE,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_local_metadata_fields_entity_type CHECK (entity_type IN ('artist', 'album', 'media', 'media_file', 'lyrics_mapping', 'scan_task')),
    CONSTRAINT chk_local_metadata_fields_source CHECK (source IN ('tag', 'embedded_art', 'directory', 'filename', 'remote', 'manual', 'system', 'scan')),
    CONSTRAINT chk_local_metadata_fields_confidence CHECK (confidence >= 0 AND confidence <= 1),
    UNIQUE(entity_type, entity_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_local_metadata_fields_entity ON local_metadata_fields(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_local_metadata_fields_source ON local_metadata_fields(source);

CREATE TABLE IF NOT EXISTS local_lyrics_mappings (
    id BIGSERIAL PRIMARY KEY,
    media_id BIGINT NOT NULL REFERENCES local_media(id) ON DELETE CASCADE,
    apple_music_song_id TEXT,
    source TEXT NOT NULL DEFAULT 'apple_music',
    match_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.000,
    status TEXT NOT NULL DEFAULT 'unmatched',
    last_requested_at TIMESTAMP WITH TIME ZONE,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_local_lyrics_mappings_source CHECK (source IN ('apple_music', 'manual', 'disabled')),
    CONSTRAINT chk_local_lyrics_mappings_status CHECK (status IN ('unmatched', 'matched', 'available', 'error', 'disabled')),
    CONSTRAINT chk_local_lyrics_mappings_confidence CHECK (match_confidence >= 0 AND match_confidence <= 1),
    UNIQUE(media_id)
);

CREATE INDEX IF NOT EXISTS idx_local_lyrics_mappings_apple_music_song_id ON local_lyrics_mappings(apple_music_song_id);
CREATE INDEX IF NOT EXISTS idx_local_lyrics_mappings_status ON local_lyrics_mappings(status);

CREATE TABLE IF NOT EXISTS local_scan_tasks (
    id BIGSERIAL PRIMARY KEY,
    scan_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    library_root TEXT NOT NULL,
    trigger_source TEXT NOT NULL DEFAULT 'system',
    phase TEXT NOT NULL DEFAULT 'queued',
    files_discovered INTEGER NOT NULL DEFAULT 0,
    files_indexed INTEGER NOT NULL DEFAULT 0,
    files_updated INTEGER NOT NULL DEFAULT 0,
    files_unavailable INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    scan_context JSONB NOT NULL DEFAULT '{}'::JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_local_scan_tasks_scan_mode CHECK (scan_mode IN ('manual', 'startup-full', 'startup-incremental', 'scheduled')),
    CONSTRAINT chk_local_scan_tasks_status CHECK (status IN ('queued', 'running', 'completed', 'failed', 'partial', 'stale'))
);

CREATE INDEX IF NOT EXISTS idx_local_scan_tasks_status ON local_scan_tasks(status);
CREATE INDEX IF NOT EXISTS idx_local_scan_tasks_library_root ON local_scan_tasks(library_root);
CREATE INDEX IF NOT EXISTS idx_local_scan_tasks_created_at ON local_scan_tasks(created_at DESC);
