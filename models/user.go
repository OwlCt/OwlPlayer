package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

// User represents a user account in the system
type User struct {
	ID                         string    `json:"id"`
	Email                      string    `json:"email"`
	Username                   string    `json:"username"`
	PasswordHash               string    `json:"-"` // Never exposed in JSON
	AvatarURL                  string    `json:"avatar_url"`
	IsEmailVerified            bool      `json:"is_email_verified"`
	IsActive                   bool      `json:"is_active"`
	IsAdmin                    bool      `json:"is_admin"`
	UserGroup                  string    `json:"user_group"`
	ReleaseNotificationEnabled bool      `json:"release_notification_enabled"`
	IOSLosslessHLSEnabled      bool      `json:"ios_lossless_hls_enabled"`
	CreatedAt                  time.Time `json:"created_at"`
	UpdatedAt                  time.Time `json:"updated_at"`
}

// User group constants
const (
	UserGroupNormal = "normal"
	UserGroupVIP    = "vip"
)

// ValidUserGroup checks if a group value is valid
func ValidUserGroup(group string) bool {
	return group == UserGroupNormal || group == UserGroupVIP
}

// UserPublic represents the public view of a user (for API responses)
type UserPublic struct {
	ID                         string    `json:"id"`
	Email                      string    `json:"email"`
	Username                   string    `json:"username"`
	AvatarURL                  string    `json:"avatar_url"`
	IsEmailVerified            bool      `json:"is_email_verified"`
	IsActive                   bool      `json:"is_active"`
	IsAdmin                    bool      `json:"is_admin"`
	UserGroup                  string    `json:"user_group"`
	ReleaseNotificationEnabled bool      `json:"release_notification_enabled"`
	IOSLosslessHLSEnabled      bool      `json:"ios_lossless_hls_enabled"`
	CreatedAt                  time.Time `json:"created_at"`
	UpdatedAt                  time.Time `json:"updated_at"`
}

// ToPublic converts a User to UserPublic (excludes sensitive fields)
func (u *User) ToPublic() *UserPublic {
	return &UserPublic{
		ID:                         u.ID,
		Email:                      u.Email,
		Username:                   u.Username,
		AvatarURL:                  u.AvatarURL,
		IsEmailVerified:            u.IsEmailVerified,
		IsActive:                   u.IsActive,
		IsAdmin:                    u.IsAdmin,
		UserGroup:                  u.UserGroup,
		ReleaseNotificationEnabled: u.ReleaseNotificationEnabled,
		IOSLosslessHLSEnabled:      u.IOSLosslessHLSEnabled,
		CreatedAt:                  u.CreatedAt,
		UpdatedAt:                  u.UpdatedAt,
	}
}

// MarshalJSON implements custom JSON marshaling to ensure PasswordHash is never serialized
func (u User) MarshalJSON() ([]byte, error) {
	type Alias User
	return json.Marshal(&struct {
		Alias
		PasswordHash string `json:"-"`
	}{
		Alias: Alias(u),
	})
}

// ScanUser scans a database row into a User struct
func ScanUser(row interface{ Scan(...interface{}) error }) (*User, error) {
	var u User
	var avatarURL sql.NullString

	err := row.Scan(
		&u.ID,
		&u.Email,
		&u.Username,
		&u.PasswordHash,
		&avatarURL,
		&u.IsEmailVerified,
		&u.IsActive,
		&u.IsAdmin,
		&u.UserGroup,
		&u.ReleaseNotificationEnabled,
		&u.IOSLosslessHLSEnabled,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if avatarURL.Valid {
		u.AvatarURL = avatarURL.String
	}

	return &u, nil
}

// UserColumns returns the column names for user queries
func UserColumns() string {
	return "id, email, username, password_hash, avatar_url, is_email_verified, is_active, is_admin, user_group, release_notification_enabled, ios_lossless_hls_enabled, created_at, updated_at"
}

// VerificationCodeType represents the type of verification code
type VerificationCodeType string

const (
	VerificationCodeTypeEmailVerify   VerificationCodeType = "email_verify"
	VerificationCodeTypeEmailChange   VerificationCodeType = "email_change"
	VerificationCodeTypePasswordReset VerificationCodeType = "password_reset"
	VerificationCodeTypeEmailLogin    VerificationCodeType = "email_login"
)

// VerificationCode represents an email verification code
type VerificationCode struct {
	ID        string               `json:"id"`
	UserID    string               `json:"user_id"`
	Code      string               `json:"-"` // Never exposed in JSON
	Type      VerificationCodeType `json:"type"`
	NewEmail  string               `json:"new_email,omitempty"`
	ExpiresAt time.Time            `json:"expires_at"`
	CreatedAt time.Time            `json:"created_at"`
}

// IsExpired checks if the verification code has expired
func (vc *VerificationCode) IsExpired() bool {
	return time.Now().After(vc.ExpiresAt)
}

// ScanVerificationCode scans a database row into a VerificationCode struct
func ScanVerificationCode(row interface{ Scan(...interface{}) error }) (*VerificationCode, error) {
	var vc VerificationCode
	var newEmail sql.NullString

	err := row.Scan(
		&vc.ID,
		&vc.UserID,
		&vc.Code,
		&vc.Type,
		&newEmail,
		&vc.ExpiresAt,
		&vc.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if newEmail.Valid {
		vc.NewEmail = newEmail.String
	}

	return &vc, nil
}

// VerificationCodeColumns returns the column names for verification code queries
func VerificationCodeColumns() string {
	return "id, user_id, code, type, new_email, expires_at, created_at"
}

// TokenPair represents JWT access and refresh tokens
type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"` // seconds until access token expires
}

// TokenClaims represents the claims stored in a JWT token
type TokenClaims struct {
	UserID   string `json:"user_id"`
	Email    string `json:"email"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
	IsActive bool   `json:"is_active"`
}

// DefaultAvatarURL returns the default avatar URL for users without a custom avatar
const DefaultAvatarURL = "/api/avatars/default.svg"

// GetAvatarURLOrDefault returns the user's avatar URL or the default if not set
func (u *User) GetAvatarURLOrDefault() string {
	if u.AvatarURL == "" {
		return DefaultAvatarURL
	}
	return u.AvatarURL
}
