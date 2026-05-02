package services

import "testing"

func TestEmailSettingsValidateOptionalAllowsEmpty(t *testing.T) {
	settings := &EmailSettings{}
	if err := settings.ValidateOptional(); err != nil {
		t.Fatalf("ValidateOptional() error = %v", err)
	}
}

func TestValidateRuntimeLocalMediaConfigRequiresStorefrontWhenMetadataEnabled(t *testing.T) {
	root := t.TempDir()
	cfg := &LocalMediaConfig{
		Enabled: true,
		Roots:   []string{root},
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: true,
			MatchThreshold:      0.75,
		},
	}

	if err := ValidateRuntimeLocalMediaConfig(cfg, "", ""); err == nil {
		t.Fatalf("expected storefront validation error")
	}
}

func TestValidateRuntimeLocalMediaConfigRequiresMediaUserTokenWhenLyricsEnabled(t *testing.T) {
	root := t.TempDir()
	cfg := &LocalMediaConfig{
		Enabled: true,
		Roots:   []string{root},
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: true,
			LyricsEnhancement:   true,
			MatchThreshold:      0.75,
		},
	}

	if err := ValidateRuntimeLocalMediaConfig(cfg, "us", ""); err == nil {
		t.Fatalf("expected media user token validation error")
	}
}

