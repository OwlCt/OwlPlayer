package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

type MetadataOverrideMode string

const (
	MetadataOverrideModeInherit        MetadataOverrideMode = "inherit"
	MetadataOverrideModeForceLocal     MetadataOverrideMode = "force_local"
	MetadataOverrideModePreferApple    MetadataOverrideMode = "prefer_am"
	MetadataOverrideModeManualOverride MetadataOverrideMode = "manual_override"
)

type MetadataLyricsSource string

const (
	MetadataLyricsSourceInherit    MetadataLyricsSource = "inherit"
	MetadataLyricsSourceLocal      MetadataLyricsSource = "local"
	MetadataLyricsSourceAppleMusic MetadataLyricsSource = "apple_music"
	MetadataLyricsSourceDisabled   MetadataLyricsSource = "disabled"
)

type LocalEntityMetadataControl struct {
	EntityType   LocalEntityType      `json:"entityType"`
	EntityID     int64                `json:"entityId"`
	OverrideMode MetadataOverrideMode `json:"overrideMode"`
	ManualData   map[string]any       `json:"manualData,omitempty"`
	LyricsSource MetadataLyricsSource `json:"lyricsSource,omitempty"`
	UpdatedBy    string               `json:"updatedBy,omitempty"`
	CreatedAt    time.Time            `json:"createdAt"`
	UpdatedAt    time.Time            `json:"updatedAt"`
}

type MetadataState struct {
	OverrideMode       MetadataOverrideMode `json:"overrideMode"`
	UsesAppleMusic     bool                 `json:"usesAppleMusic"`
	UsesManualOverride bool                 `json:"usesManualOverride"`
	DisplaySource      string               `json:"displaySource"`
}

func ScanLocalEntityMetadataControl(row interface{ Scan(...any) error }) (*LocalEntityMetadataControl, error) {
	var control LocalEntityMetadataControl
	var manualData []byte
	var lyricsSource sql.NullString
	var updatedBy sql.NullString

	err := row.Scan(
		&control.EntityType,
		&control.EntityID,
		&control.OverrideMode,
		&manualData,
		&lyricsSource,
		&updatedBy,
		&control.CreatedAt,
		&control.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if len(manualData) > 0 {
		if err := json.Unmarshal(manualData, &control.ManualData); err != nil {
			return nil, err
		}
	}
	if control.ManualData == nil {
		control.ManualData = map[string]any{}
	}
	if lyricsSource.Valid {
		control.LyricsSource = MetadataLyricsSource(lyricsSource.String)
	}
	if updatedBy.Valid {
		control.UpdatedBy = updatedBy.String
	}
	return &control, nil
}

func LocalEntityMetadataControlColumns() string {
	return "entity_type, entity_id, override_mode, manual_data, lyrics_source, updated_by, created_at, updated_at"
}
