package services

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
	"math/big"
	"net/mail"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// User service errors
var (
	ErrInvalidEmail       = errors.New("invalid email format")
	ErrEmailExists        = errors.New("email already registered")
	ErrUsernameExists     = errors.New("username already taken")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserNotFound       = errors.New("user not found")
	ErrEmailNotVerified   = errors.New("email not verified")
	ErrAccountInactive    = errors.New("account not activated")
	ErrCodeInvalid        = errors.New("invalid verification code")
	ErrCodeExpired        = errors.New("verification code expired")
	ErrPasswordIncorrect  = errors.New("current password incorrect")
	ErrNotAdmin           = errors.New("admin privileges required")
	ErrCannotDeleteSelf   = errors.New("cannot delete your own account")
	ErrInvalidGroup       = errors.New("invalid user group. Must be 'normal' or 'vip'")
)

// UserService handles user-related business logic
type UserService struct {
	db           *Database
	emailService *EmailService
	jwtService   *JWTService
}

// NewUserService creates a new UserService instance
func NewUserService(db *Database, email *EmailService, jwt *JWTService) *UserService {
	return &UserService{
		db:           db,
		emailService: email,
		jwtService:   jwt,
	}
}

// EnsureSchema repairs critical user columns when the migration history drifts
// from the actual table definition.
func (s *UserService) EnsureSchema(ctx context.Context) error {
	if s == nil || s.db == nil {
		return nil
	}

	statements := []string{
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_group VARCHAR(20) NOT NULL DEFAULT 'normal'`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS release_notification_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS ios_lossless_hls_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
	}

	for _, stmt := range statements {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("failed to ensure user schema: %w", err)
		}
	}

	return nil
}

// =============================================================================
// Email Validation (Task 2.1)
// =============================================================================

// emailRegex is a simplified RFC 5322 compliant email regex
// This covers the most common valid email formats
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9.!#$%&'*+/=?^_` + "`" + `{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$`)

// ValidateEmail validates an email address according to RFC 5322
// Returns true if the email is valid, false otherwise
func ValidateEmail(email string) bool {
	// Check basic length constraints
	if len(email) < 3 || len(email) > 254 {
		return false
	}

	// Use Go's mail.ParseAddress for RFC 5322 compliance
	_, err := mail.ParseAddress(email)
	if err != nil {
		return false
	}

	// Additional regex check for common patterns
	if !emailRegex.MatchString(email) {
		return false
	}

	// Check local part length (before @)
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return false
	}

	localPart := parts[0]
	domainPart := parts[1]

	// Local part must be 1-64 characters
	if len(localPart) < 1 || len(localPart) > 64 {
		return false
	}

	// Domain part must be 1-255 characters
	if len(domainPart) < 1 || len(domainPart) > 255 {
		return false
	}

	// Domain must have at least one dot
	if !strings.Contains(domainPart, ".") {
		return false
	}

	return true
}

// =============================================================================
// Password Hashing (Task 2.3)
// =============================================================================

// bcryptCost is the cost factor for bcrypt hashing
const bcryptCost = 12

// HashPassword hashes a password using bcrypt
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}
	return string(bytes), nil
}

// VerifyPassword verifies a password against a bcrypt hash
func VerifyPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// IsBcryptHash checks if a string is a valid bcrypt hash
func IsBcryptHash(hash string) bool {
	// Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters long
	if len(hash) != 60 {
		return false
	}
	return strings.HasPrefix(hash, "$2a$") || strings.HasPrefix(hash, "$2b$") || strings.HasPrefix(hash, "$2y$")
}

// =============================================================================
// Verification Code Generation
// =============================================================================

// GenerateVerificationCode generates a 6-digit numeric verification code
func GenerateVerificationCode() (string, error) {
	// Generate a random 6-digit number (100000-999999)
	max := big.NewInt(900000)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", fmt.Errorf("failed to generate verification code: %w", err)
	}
	code := n.Int64() + 100000
	return fmt.Sprintf("%06d", code), nil
}

// =============================================================================
// User Registration (Task 2.6)
// =============================================================================

// RegisterRequest contains the data needed for user registration
type RegisterRequest struct {
	Email    string
	Username string
	Password string
}

// Register creates a new user account
func (s *UserService) Register(ctx context.Context, req *RegisterRequest) (*models.User, error) {
	// Validate email format
	if !ValidateEmail(req.Email) {
		return nil, ErrInvalidEmail
	}

	// Normalize email to lowercase
	email := strings.ToLower(strings.TrimSpace(req.Email))
	username := strings.TrimSpace(req.Username)

	// Check if email already exists
	existingUser, err := s.GetUserByEmail(ctx, email)
	if err != nil && !errors.Is(err, ErrUserNotFound) {
		return nil, fmt.Errorf("failed to check email: %w", err)
	}
	if existingUser != nil {
		return nil, ErrEmailExists
	}

	// Check if username already exists (excluding the user we just deleted)
	existingUserByUsername, err := s.GetUserByUsername(ctx, username)
	if err != nil && !errors.Is(err, ErrUserNotFound) {
		return nil, fmt.Errorf("failed to check username: %w", err)
	}
	if existingUserByUsername != nil {
		return nil, ErrUsernameExists
	}

	// Hash password
	passwordHash, err := HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	// Check if this is the first user (will be admin)
	isFirstUser, err := s.isFirstUser(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to check first user: %w", err)
	}

	// Create user with default "normal" group
	// **Feature: admin-user-management, Property 4: New user default group**
	user := &models.User{
		ID:                         uuid.New().String(),
		Email:                      email,
		Username:                   username,
		PasswordHash:               passwordHash,
		IsEmailVerified:            false,
		IsActive:                   isFirstUser,            // First user is auto-activated
		IsAdmin:                    isFirstUser,            // First user is auto-admin
		UserGroup:                  models.UserGroupNormal, // Default group for new users
		ReleaseNotificationEnabled: true,                   // Default to enabled
		IOSLosslessHLSEnabled:      false,
		CreatedAt:                  time.Now(),
		UpdatedAt:                  time.Now(),
	}

	// Insert user into database
	query := `
		INSERT INTO users (id, email, username, password_hash, avatar_url, is_email_verified, is_active, is_admin, user_group, release_notification_enabled, ios_lossless_hls_enabled, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	_, err = s.db.ExecContext(ctx, query,
		user.ID,
		user.Email,
		user.Username,
		user.PasswordHash,
		sql.NullString{},
		user.IsEmailVerified,
		user.IsActive,
		user.IsAdmin,
		user.UserGroup,
		user.ReleaseNotificationEnabled,
		user.IOSLosslessHLSEnabled,
		user.CreatedAt,
		user.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Send verification code email
	if err := s.SendVerificationCode(ctx, user.ID); err != nil {
		// Log error but don't fail registration
		fmt.Printf("[WARN] Failed to send verification email: %v\n", err)
	}

	return user, nil
}

// emailExists checks if an email is already registered
func (s *UserService) emailExists(ctx context.Context, email string) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM users WHERE LOWER(email) = LOWER($1)`
	err := s.db.QueryRowContext(ctx, query, email).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// usernameExists checks if a username is already taken
func (s *UserService) usernameExists(ctx context.Context, username string) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER($1)`
	err := s.db.QueryRowContext(ctx, query, username).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// isFirstUser checks if there are no users in the database
func (s *UserService) isFirstUser(ctx context.Context) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM users`
	err := s.db.QueryRowContext(ctx, query).Scan(&count)
	if err != nil {
		return false, err
	}
	return count == 0, nil
}

// deleteUnverifiedUser deletes a user who has not verified their email
// This allows re-registration with the same email/username
func (s *UserService) deleteUnverifiedUser(ctx context.Context, userID string) error {
	// First delete any verification codes for this user
	deleteCodesQuery := `DELETE FROM verification_codes WHERE user_id = $1`
	_, err := s.db.ExecContext(ctx, deleteCodesQuery, userID)
	if err != nil {
		return fmt.Errorf("failed to delete verification codes: %w", err)
	}

	// Then delete the user
	deleteUserQuery := `DELETE FROM users WHERE id = $1 AND is_email_verified = false`
	result, err := s.db.ExecContext(ctx, deleteUserQuery, userID)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return errors.New("user not found or already verified")
	}

	return nil
}

// GetUserByEmail retrieves a user by email
func (s *UserService) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	query := fmt.Sprintf(`SELECT %s FROM users WHERE LOWER(email) = LOWER($1)`, models.UserColumns())
	row := s.db.QueryRowContext(ctx, query, email)
	user, err := models.ScanUser(row)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

// GetUserByUsername retrieves a user by username
func (s *UserService) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	query := fmt.Sprintf(`SELECT %s FROM users WHERE LOWER(username) = LOWER($1)`, models.UserColumns())
	row := s.db.QueryRowContext(ctx, query, username)
	user, err := models.ScanUser(row)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

// GetUserByID retrieves a user by ID
func (s *UserService) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	query := fmt.Sprintf(`SELECT %s FROM users WHERE id = $1`, models.UserColumns())
	row := s.db.QueryRowContext(ctx, query, id)
	user, err := models.ScanUser(row)
	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

// =============================================================================
// Verification Code Management (Task 3.2)
// =============================================================================

// VerificationCodeExpiry is the duration after which a verification code expires
const VerificationCodeExpiry = 10 * time.Minute

// CreateVerificationCode generates and stores a new verification code for a user
// It invalidates any existing codes of the same type for the user
func (s *UserService) CreateVerificationCode(ctx context.Context, userID string, codeType models.VerificationCodeType, newEmail string) (*models.VerificationCode, error) {
	// First, invalidate any existing codes of the same type for this user
	err := s.invalidateVerificationCodes(ctx, userID, codeType)
	if err != nil {
		return nil, fmt.Errorf("failed to invalidate old codes: %w", err)
	}

	// Generate a new 6-digit code
	code, err := GenerateVerificationCode()
	if err != nil {
		return nil, err
	}

	// Create verification code record
	vc := &models.VerificationCode{
		ID:        uuid.New().String(),
		UserID:    userID,
		Code:      code,
		Type:      codeType,
		NewEmail:  newEmail,
		ExpiresAt: time.Now().Add(VerificationCodeExpiry),
		CreatedAt: time.Now(),
	}

	// Insert into database
	query := `
		INSERT INTO verification_codes (id, user_id, code, type, new_email, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err = s.db.ExecContext(ctx, query,
		vc.ID,
		vc.UserID,
		vc.Code,
		vc.Type,
		sql.NullString{String: vc.NewEmail, Valid: vc.NewEmail != ""},
		vc.ExpiresAt,
		vc.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create verification code: %w", err)
	}

	return vc, nil
}

// invalidateVerificationCodes deletes all verification codes of a specific type for a user
func (s *UserService) invalidateVerificationCodes(ctx context.Context, userID string, codeType models.VerificationCodeType) error {
	query := `DELETE FROM verification_codes WHERE user_id = $1 AND type = $2`
	_, err := s.db.ExecContext(ctx, query, userID, codeType)
	return err
}

// GetVerificationCode retrieves a verification code by user ID and type
func (s *UserService) GetVerificationCode(ctx context.Context, userID string, codeType models.VerificationCodeType) (*models.VerificationCode, error) {
	query := fmt.Sprintf(`SELECT %s FROM verification_codes WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1`, models.VerificationCodeColumns())
	row := s.db.QueryRowContext(ctx, query, userID, codeType)
	vc, err := models.ScanVerificationCode(row)
	if err == sql.ErrNoRows {
		return nil, ErrCodeInvalid
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get verification code: %w", err)
	}
	return vc, nil
}

// ValidateVerificationCode checks if a verification code is valid and not expired
func (s *UserService) ValidateVerificationCode(ctx context.Context, userID, code string, codeType models.VerificationCodeType) (*models.VerificationCode, error) {
	vc, err := s.GetVerificationCode(ctx, userID, codeType)
	if err != nil {
		return nil, err
	}

	// Check if code matches
	if vc.Code != code {
		return nil, ErrCodeInvalid
	}

	// Check if code is expired
	if vc.IsExpired() {
		return nil, ErrCodeExpired
	}

	return vc, nil
}

// SendVerificationCode creates a new verification code and sends it via email
func (s *UserService) SendVerificationCode(ctx context.Context, userID string) error {
	// Get user
	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	// Create verification code
	vc, err := s.CreateVerificationCode(ctx, userID, models.VerificationCodeTypeEmailVerify, "")
	if err != nil {
		return err
	}

	// Send email
	if s.emailService != nil {
		return s.emailService.SendVerificationCode(ctx, user.Email, vc.Code)
	}

	return nil
}

// ResendVerificationCode generates a new code and sends it to the user's email
func (s *UserService) ResendVerificationCode(ctx context.Context, userID string) error {
	return s.SendVerificationCode(ctx, userID)
}

// =============================================================================
// Email Verification (Task 3.4)
// =============================================================================

// VerifyEmail verifies a user's email using the provided verification code
func (s *UserService) VerifyEmail(ctx context.Context, userID, code string) error {
	// Validate the verification code
	vc, err := s.ValidateVerificationCode(ctx, userID, code, models.VerificationCodeTypeEmailVerify)
	if err != nil {
		return err
	}

	// Update user's email_verified status
	query := `UPDATE users SET is_email_verified = true, updated_at = $1 WHERE id = $2`
	result, err := s.db.ExecContext(ctx, query, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update email verification status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	// Delete the used verification code
	deleteQuery := `DELETE FROM verification_codes WHERE id = $1`
	_, err = s.db.ExecContext(ctx, deleteQuery, vc.ID)
	if err != nil {
		// Log but don't fail - the verification was successful
		fmt.Printf("[WARN] Failed to delete used verification code: %v\n", err)
	}

	return nil
}

// VerifyEmailByEmail verifies a user's email using email address and verification code
// This is useful when the user doesn't have a session yet
func (s *UserService) VerifyEmailByEmail(ctx context.Context, email, code string) error {
	// Get user by email
	user, err := s.GetUserByEmail(ctx, email)
	if err != nil {
		return err
	}

	// Verify using user ID
	return s.VerifyEmail(ctx, user.ID, code)
}

// ResendVerificationCodeByEmail generates a new code and sends it to the user's email
// This is useful when the user doesn't have a session yet
func (s *UserService) ResendVerificationCodeByEmail(ctx context.Context, email string) error {
	// Get user by email
	user, err := s.GetUserByEmail(ctx, email)
	if err != nil {
		return err
	}

	// Check if already verified
	if user.IsEmailVerified {
		return errors.New("email already verified")
	}

	// Send verification code
	return s.SendVerificationCode(ctx, user.ID)
}

// =============================================================================
// User Authentication (Task 5.2)
// =============================================================================

// LoginRequest contains the data needed for user login
type LoginRequest struct {
	Identifier string // Email or username
	Password   string
}

// Login authenticates a user and returns a JWT token pair
// Supports login with either email or username
// **Feature: user-account-system, Property 9: Login with valid identifier returns JWT**
// **Feature: user-account-system, Property 10: Invalid credentials rejected**
// **Feature: user-account-system, Property 11: Unverified user cannot login**
func (s *UserService) Login(ctx context.Context, req *LoginRequest) (*TokenPair, *models.User, error) {
	// Try to find user by email or username
	var user *models.User
	var err error

	// Check if identifier looks like an email
	if strings.Contains(req.Identifier, "@") {
		user, err = s.GetUserByEmail(ctx, req.Identifier)
	} else {
		user, err = s.GetUserByUsername(ctx, req.Identifier)
	}

	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return nil, nil, ErrInvalidCredentials
		}
		return nil, nil, fmt.Errorf("failed to find user: %w", err)
	}

	// Verify password
	if !VerifyPassword(req.Password, user.PasswordHash) {
		return nil, nil, ErrInvalidCredentials
	}

	// Generate JWT token pair
	if s.jwtService == nil {
		return nil, nil, errors.New("JWT service not configured")
	}

	tokenPair, err := s.jwtService.GenerateTokenPair(
		user.ID,
		user.Email,
		user.Username,
		user.IsAdmin,
		user.IsActive,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate token: %w", err)
	}

	return tokenPair, user, nil
}

// GetUserByIdentifier retrieves a user by email or username
func (s *UserService) GetUserByIdentifier(ctx context.Context, identifier string) (*models.User, error) {
	if strings.Contains(identifier, "@") {
		return s.GetUserByEmail(ctx, identifier)
	}
	return s.GetUserByUsername(ctx, identifier)
}

// =============================================================================
// Admin Functions - User Activation (Task 8.2)
// =============================================================================

// ActivateUser activates a user account (admin only)
// **Feature: user-account-system, Property 13: Activation state changes affect access**
func (s *UserService) ActivateUser(ctx context.Context, adminID, userID string) error {
	// Verify admin privileges
	admin, err := s.GetUserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin {
		return ErrNotAdmin
	}

	// Update user's active status
	query := `UPDATE users SET is_active = true, updated_at = $1 WHERE id = $2`
	result, err := s.db.ExecContext(ctx, query, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to activate user: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	return nil
}

// DeactivateUser deactivates a user account (admin only)
// **Feature: user-account-system, Property 13: Activation state changes affect access**
func (s *UserService) DeactivateUser(ctx context.Context, adminID, userID string) error {
	// Verify admin privileges
	admin, err := s.GetUserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin {
		return ErrNotAdmin
	}

	// Prevent admin from deactivating themselves
	if adminID == userID {
		return errors.New("cannot deactivate your own account")
	}

	// Update user's active status
	query := `UPDATE users SET is_active = false, updated_at = $1 WHERE id = $2`
	result, err := s.db.ExecContext(ctx, query, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to deactivate user: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	return nil
}

// =============================================================================
// Admin Functions - Role Management (Task 8.4)
// =============================================================================

// GrantAdmin grants admin privileges to a user (admin only)
// **Feature: user-account-system, Property 14: Admin role changes update correctly**
func (s *UserService) GrantAdmin(ctx context.Context, adminID, userID string) error {
	// Verify admin privileges
	admin, err := s.GetUserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin {
		return ErrNotAdmin
	}

	// Update user's admin status and set user_group to 'vip' (admins should be VIP)
	query := `UPDATE users SET is_admin = true, user_group = 'vip', updated_at = $1 WHERE id = $2`
	result, err := s.db.ExecContext(ctx, query, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to grant admin: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	return nil
}

// RevokeAdmin revokes admin privileges from a user (admin only)
// **Feature: user-account-system, Property 14: Admin role changes update correctly**
func (s *UserService) RevokeAdmin(ctx context.Context, adminID, userID string) error {
	// Verify admin privileges
	admin, err := s.GetUserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin {
		return ErrNotAdmin
	}

	// Prevent admin from revoking their own admin privileges
	if adminID == userID {
		return errors.New("cannot revoke your own admin privileges")
	}

	// Update user's admin status
	query := `UPDATE users SET is_admin = false, updated_at = $1 WHERE id = $2`
	result, err := s.db.ExecContext(ctx, query, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to revoke admin: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	return nil
}

// =============================================================================
// Admin Functions - Delete User (Feature: admin-user-management)
// =============================================================================

// DeleteUser deletes a user and all associated data (admin only)
// **Feature: admin-user-management, Property 1: Delete user removes all associated data**
func (s *UserService) DeleteUser(ctx context.Context, adminID, userID string) error {
	// Verify admin privileges
	admin, err := s.GetUserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin {
		return ErrNotAdmin
	}

	// Prevent admin from deleting themselves
	if adminID == userID {
		return ErrCannotDeleteSelf
	}

	// Verify target user exists
	_, err = s.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	// Delete all associated data in order (to handle foreign key constraints)

	// 1. Delete verification codes
	deleteCodesQuery := `DELETE FROM verification_codes WHERE user_id = $1`
	_, err = s.db.ExecContext(ctx, deleteCodesQuery, userID)
	if err != nil {
		return fmt.Errorf("failed to delete verification codes: %w", err)
	}

	// 2. Delete liked songs
	deleteLikedSongsQuery := `DELETE FROM liked_songs WHERE user_id = $1`
	_, err = s.db.ExecContext(ctx, deleteLikedSongsQuery, userID)
	if err != nil {
		return fmt.Errorf("failed to delete liked songs: %w", err)
	}

	// 3. Delete library albums
	deleteLibraryAlbumsQuery := `DELETE FROM library_albums WHERE user_id = $1`
	_, err = s.db.ExecContext(ctx, deleteLibraryAlbumsQuery, userID)
	if err != nil {
		return fmt.Errorf("failed to delete library albums: %w", err)
	}

	// 4. Delete playlists (this will cascade delete playlist_songs due to foreign key)
	deletePlaylistsQuery := `DELETE FROM playlists WHERE user_id = $1`
	_, err = s.db.ExecContext(ctx, deletePlaylistsQuery, userID)
	if err != nil {
		return fmt.Errorf("failed to delete playlists: %w", err)
	}

	// 5. Delete followed artists
	deleteFollowedArtistsQuery := `DELETE FROM followed_artists WHERE user_id = $1`
	_, err = s.db.ExecContext(ctx, deleteFollowedArtistsQuery, userID)
	if err != nil {
		return fmt.Errorf("failed to delete followed artists: %w", err)
	}

	// 6. Delete playback states
	deletePlaybackStatesQuery := `DELETE FROM playback_states WHERE user_id = $1`
	_, err = s.db.ExecContext(ctx, deletePlaybackStatesQuery, userID)
	if err != nil {
		return fmt.Errorf("failed to delete playback states: %w", err)
	}

	// 7. Finally, delete the user record
	deleteUserQuery := `DELETE FROM users WHERE id = $1`
	result, err := s.db.ExecContext(ctx, deleteUserQuery, userID)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	return nil
}

// =============================================================================
// Admin Functions - Set User Group (Feature: admin-user-management)
// =============================================================================

// SetUserGroup sets a user's group (admin only)
// **Feature: admin-user-management, Property 5: Admin can set valid user groups**
func (s *UserService) SetUserGroup(ctx context.Context, adminID, userID, group string) error {
	// Verify admin privileges
	admin, err := s.GetUserByID(ctx, adminID)
	if err != nil {
		return err
	}
	if !admin.IsAdmin {
		return ErrNotAdmin
	}

	// Validate group value
	if !models.ValidUserGroup(group) {
		return ErrInvalidGroup
	}

	// Verify target user exists
	_, err = s.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	// Update user's group
	query := `UPDATE users SET user_group = $1, updated_at = $2 WHERE id = $3`
	result, err := s.db.ExecContext(ctx, query, group, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update user group: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	return nil
}

// AdminCreateUserRequest contains the data needed for an administrator-created account.
type AdminCreateUserRequest struct {
	Email           string
	Username        string
	Password        string
	IsActive        bool
	IsAdmin         bool
	IsEmailVerified bool
	UserGroup       string
}

// AdminCreateUser creates a user account directly from the admin panel.
func (s *UserService) AdminCreateUser(ctx context.Context, adminID string, req *AdminCreateUserRequest) (*models.User, error) {
	admin, err := s.GetUserByID(ctx, adminID)
	if err != nil {
		return nil, err
	}
	if !admin.IsAdmin {
		return nil, ErrNotAdmin
	}

	if !ValidateEmail(req.Email) {
		return nil, ErrInvalidEmail
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	username := strings.TrimSpace(req.Username)

	existingUser, err := s.GetUserByEmail(ctx, email)
	if err != nil && !errors.Is(err, ErrUserNotFound) {
		return nil, fmt.Errorf("failed to check email: %w", err)
	}
	if existingUser != nil {
		return nil, ErrEmailExists
	}

	existingUserByUsername, err := s.GetUserByUsername(ctx, username)
	if err != nil && !errors.Is(err, ErrUserNotFound) {
		return nil, fmt.Errorf("failed to check username: %w", err)
	}
	if existingUserByUsername != nil {
		return nil, ErrUsernameExists
	}

	passwordHash, err := HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	group := req.UserGroup
	if group == "" {
		group = models.UserGroupNormal
	}
	if req.IsAdmin {
		group = models.UserGroupVIP
	}
	if !models.ValidUserGroup(group) {
		return nil, ErrInvalidGroup
	}

	user := &models.User{
		ID:                         uuid.New().String(),
		Email:                      email,
		Username:                   username,
		PasswordHash:               passwordHash,
		IsEmailVerified:            req.IsEmailVerified,
		IsActive:                   req.IsActive,
		IsAdmin:                    req.IsAdmin,
		UserGroup:                  group,
		ReleaseNotificationEnabled: true,
		IOSLosslessHLSEnabled:      false,
		CreatedAt:                  time.Now(),
		UpdatedAt:                  time.Now(),
	}

	query := `
		INSERT INTO users (id, email, username, password_hash, avatar_url, is_email_verified, is_active, is_admin, user_group, release_notification_enabled, ios_lossless_hls_enabled, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	_, err = s.db.ExecContext(ctx, query,
		user.ID,
		user.Email,
		user.Username,
		user.PasswordHash,
		sql.NullString{},
		user.IsEmailVerified,
		user.IsActive,
		user.IsAdmin,
		user.UserGroup,
		user.ReleaseNotificationEnabled,
		user.IOSLosslessHLSEnabled,
		user.CreatedAt,
		user.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil
}

// AdminUpdateUserEmail updates a user's email directly from the admin panel.
func (s *UserService) AdminUpdateUserEmail(ctx context.Context, adminID, userID, newEmail string) (*models.User, error) {
	admin, err := s.GetUserByID(ctx, adminID)
	if err != nil {
		return nil, err
	}
	if !admin.IsAdmin {
		return nil, ErrNotAdmin
	}

	if !ValidateEmail(newEmail) {
		return nil, ErrInvalidEmail
	}
	newEmail = strings.ToLower(strings.TrimSpace(newEmail))

	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if strings.EqualFold(user.Email, newEmail) {
		return user, nil
	}

	exists, err := s.emailExists(ctx, newEmail)
	if err != nil {
		return nil, fmt.Errorf("failed to check email: %w", err)
	}
	if exists {
		return nil, ErrNewEmailExists
	}

	query := `UPDATE users SET email = $1, is_email_verified = true, updated_at = $2 WHERE id = $3`
	result, err := s.db.ExecContext(ctx, query, newEmail, time.Now(), userID)
	if err != nil {
		return nil, fmt.Errorf("failed to update email: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return nil, ErrUserNotFound
	}

	_, _ = s.db.ExecContext(ctx,
		`DELETE FROM verification_codes WHERE user_id = $1 AND type IN ($2, $3, $4)`,
		userID,
		models.VerificationCodeTypeEmailVerify,
		models.VerificationCodeTypeEmailChange,
		models.VerificationCodeTypeEmailLogin,
	)

	return s.GetUserByID(ctx, userID)
}

// =============================================================================
// Admin Functions - User List (Task 8.6)
// =============================================================================

// UserListResult represents the result of listing users with pagination
type UserListResult struct {
	Users      []*models.User `json:"users"`
	Total      int            `json:"total"`
	Page       int            `json:"page"`
	Limit      int            `json:"limit"`
	TotalPages int            `json:"total_pages"`
}

// ListUsers returns a paginated list of all users (admin only)
// **Feature: user-account-system, Property 15: User list contains required fields**
func (s *UserService) ListUsers(ctx context.Context, adminID string, page, limit int) (*UserListResult, error) {
	// Verify admin privileges
	admin, err := s.GetUserByID(ctx, adminID)
	if err != nil {
		return nil, err
	}
	if !admin.IsAdmin {
		return nil, ErrNotAdmin
	}

	// Set default pagination values
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	// Get total count
	var total int
	countQuery := `SELECT COUNT(*) FROM users`
	err = s.db.QueryRowContext(ctx, countQuery).Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("failed to count users: %w", err)
	}

	// Calculate offset
	offset := (page - 1) * limit

	// Get users
	query := fmt.Sprintf(`SELECT %s FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`, models.UserColumns())
	rows, err := s.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		user, err := models.ScanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, user)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating users: %w", err)
	}

	// Calculate total pages
	totalPages := (total + limit - 1) / limit

	return &UserListResult{
		Users:      users,
		Total:      total,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}, nil
}

// =============================================================================
// User Settings - Email Change (Task 9.1)
// =============================================================================

// ErrNewEmailExists is returned when the new email is already registered
var ErrNewEmailExists = errors.New("new email already registered")

// RequestEmailChange initiates an email change by sending a verification code to the new email
// **Feature: user-account-system, Property 20: Email change requires verification**
func (s *UserService) RequestEmailChange(ctx context.Context, userID, newEmail string) error {
	// Validate new email format
	if !ValidateEmail(newEmail) {
		return ErrInvalidEmail
	}

	// Normalize email to lowercase
	newEmail = strings.ToLower(strings.TrimSpace(newEmail))

	// Check if new email already exists
	exists, err := s.emailExists(ctx, newEmail)
	if err != nil {
		return fmt.Errorf("failed to check email: %w", err)
	}
	if exists {
		return ErrNewEmailExists
	}

	// Get current user to verify they exist
	_, err = s.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	// Create verification code for email change (stores new email in the code record)
	vc, err := s.CreateVerificationCode(ctx, userID, models.VerificationCodeTypeEmailChange, newEmail)
	if err != nil {
		return err
	}

	// Send verification code to the NEW email address
	if s.emailService != nil {
		return s.emailService.SendEmailChangeCode(ctx, newEmail, vc.Code)
	}

	return nil
}

// ConfirmEmailChange confirms the email change using the verification code
// **Feature: user-account-system, Property 20: Email change requires verification**
func (s *UserService) ConfirmEmailChange(ctx context.Context, userID, code string) error {
	// Validate the verification code
	vc, err := s.ValidateVerificationCode(ctx, userID, code, models.VerificationCodeTypeEmailChange)
	if err != nil {
		return err
	}

	// Get the new email from the verification code
	newEmail := vc.NewEmail
	if newEmail == "" {
		return errors.New("no new email associated with verification code")
	}

	// Double-check that new email is still available
	exists, err := s.emailExists(ctx, newEmail)
	if err != nil {
		return fmt.Errorf("failed to check email: %w", err)
	}
	if exists {
		return ErrNewEmailExists
	}

	// Update user's email
	query := `UPDATE users SET email = $1, updated_at = $2 WHERE id = $3`
	result, err := s.db.ExecContext(ctx, query, newEmail, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update email: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	// Delete the used verification code
	deleteQuery := `DELETE FROM verification_codes WHERE id = $1`
	_, err = s.db.ExecContext(ctx, deleteQuery, vc.ID)
	if err != nil {
		// Log but don't fail - the email change was successful
		fmt.Printf("[WARN] Failed to delete used verification code: %v\n", err)
	}

	return nil
}

// =============================================================================
// User Settings - Password Change (Task 9.3)
// =============================================================================

// ChangePassword changes the user's password after verifying the current password
// **Feature: user-account-system, Property 21: Password change validation**
func (s *UserService) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	// Get user
	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	// Verify current password
	if !VerifyPassword(currentPassword, user.PasswordHash) {
		return ErrPasswordIncorrect
	}

	// Hash new password
	newPasswordHash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}

	// Update password
	query := `UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`
	result, err := s.db.ExecContext(ctx, query, newPasswordHash, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	return nil
}

// =============================================================================
// User Settings - Settings Display (Task 9.5)
// =============================================================================

// UserSettings represents the user settings response with masked email
type UserSettings struct {
	ID                    string `json:"id"`
	Email                 string `json:"email"` // Masked email
	Username              string `json:"username"`
	AvatarURL             string `json:"avatar_url"`
	IsEmailVerified       bool   `json:"is_email_verified"`
	IsActive              bool   `json:"is_active"`
	IsAdmin               bool   `json:"is_admin"`
	IOSLosslessHLSEnabled bool   `json:"ios_lossless_hls_enabled"`
}

// MaskEmail masks an email address for display (e.g., "user@example.com" -> "u***@example.com")
// **Feature: user-account-system, Property 22: Settings email is masked**
func MaskEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return email // Return as-is if not a valid email format
	}

	localPart := parts[0]
	domain := parts[1]

	// Mask the local part, keeping first character
	if len(localPart) <= 1 {
		return localPart + "***@" + domain
	}

	return string(localPart[0]) + "***@" + domain
}

// GetSettings returns the user's settings with masked email
// **Feature: user-account-system, Property 22: Settings email is masked**
func (s *UserService) GetSettings(ctx context.Context, userID string) (*UserSettings, error) {
	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	return &UserSettings{
		ID:                    user.ID,
		Email:                 MaskEmail(user.Email),
		Username:              user.Username,
		AvatarURL:             user.AvatarURL,
		IsEmailVerified:       user.IsEmailVerified,
		IsActive:              user.IsActive,
		IsAdmin:               user.IsAdmin,
		IOSLosslessHLSEnabled: user.IOSLosslessHLSEnabled,
	}, nil
}

// =============================================================================
// Avatar Management (Task 10.3)
// =============================================================================

// UploadAvatar uploads a new avatar for a user
// **Feature: user-account-system, Property 17: Avatar upload and retrieval round-trip**
func (s *UserService) UploadAvatar(ctx context.Context, userID string, avatarService *AvatarService, data []byte) (string, error) {
	// Verify user exists
	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return "", err
	}

	// Save avatar using avatar service
	filename, err := avatarService.SaveAvatar(ctx, userID, data)
	if err != nil {
		return "", err
	}

	// Delete old avatar if exists
	if user.AvatarURL != "" {
		// Extract filename from URL
		oldFilename := filepath.Base(user.AvatarURL)
		avatarService.DeleteAvatar(oldFilename)
	}

	// Get the avatar URL
	avatarURL := avatarService.GetAvatarURL(filename)

	// Update user's avatar_url in database
	query := `UPDATE users SET avatar_url = $1, updated_at = $2 WHERE id = $3`
	result, err := s.db.ExecContext(ctx, query, avatarURL, time.Now(), userID)
	if err != nil {
		// Try to clean up the saved file
		avatarService.DeleteAvatar(filename)
		return "", fmt.Errorf("failed to update avatar URL: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return "", fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		avatarService.DeleteAvatar(filename)
		return "", ErrUserNotFound
	}

	return avatarURL, nil
}

// GetAvatarURL returns the user's avatar URL or default if not set
// **Feature: user-account-system, Property 19: Avatar URL always present**
func (s *UserService) GetAvatarURL(ctx context.Context, userID string, avatarService *AvatarService) (string, error) {
	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return "", err
	}

	if user.AvatarURL == "" {
		return avatarService.GetDefaultAvatarURL(), nil
	}

	return user.AvatarURL, nil
}

// =============================================================================
// Password Reset (Feature: password-recovery-email-login)
// =============================================================================

// ErrPasswordTooShort is returned when the password is less than 8 characters
var ErrPasswordTooShort = errors.New("password must be at least 8 characters")

// RequestPasswordReset sends a password reset verification code to the user's email
// **Feature: password-recovery-email-login, Property 1: Password Reset Round-Trip**
// **Feature: password-recovery-email-login, Property 7: Unregistered Email Security**
func (s *UserService) RequestPasswordReset(ctx context.Context, email string) error {
	// Validate email format
	if !ValidateEmail(email) {
		return ErrInvalidEmail
	}

	// Normalize email to lowercase
	email = strings.ToLower(strings.TrimSpace(email))

	// Try to find user by email
	user, err := s.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			// Don't reveal if user exists - return success anyway for security
			return nil
		}
		return fmt.Errorf("failed to find user: %w", err)
	}

	// Create verification code for password reset
	vc, err := s.CreateVerificationCode(ctx, user.ID, models.VerificationCodeTypePasswordReset, "")
	if err != nil {
		return err
	}

	// Send password reset email
	if s.emailService != nil {
		return s.emailService.SendPasswordResetCode(ctx, user.Email, vc.Code)
	}

	return nil
}

// ResetPassword resets the user's password using a verification code
// **Feature: password-recovery-email-login, Property 1: Password Reset Round-Trip**
// **Feature: password-recovery-email-login, Property 4: Password Validation**
// **Feature: password-recovery-email-login, Property 5: Code Single-Use Invalidation**
func (s *UserService) ResetPassword(ctx context.Context, email, code, newPassword string) error {
	// Validate new password length
	if len(newPassword) < 8 {
		return ErrPasswordTooShort
	}

	// Normalize email to lowercase
	email = strings.ToLower(strings.TrimSpace(email))

	// Get user by email
	user, err := s.GetUserByEmail(ctx, email)
	if err != nil {
		return err
	}

	// Validate the verification code
	vc, err := s.ValidateVerificationCode(ctx, user.ID, code, models.VerificationCodeTypePasswordReset)
	if err != nil {
		return err
	}

	// Hash new password
	newPasswordHash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}

	// Update password
	query := `UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`
	result, err := s.db.ExecContext(ctx, query, newPasswordHash, time.Now(), user.ID)
	if err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	// Delete the used verification code
	deleteQuery := `DELETE FROM verification_codes WHERE id = $1`
	_, err = s.db.ExecContext(ctx, deleteQuery, vc.ID)
	if err != nil {
		// Log but don't fail - the password reset was successful
		fmt.Printf("[WARN] Failed to delete used verification code: %v\n", err)
	}

	return nil
}

// =============================================================================
// Email Login (Feature: password-recovery-email-login)
// =============================================================================

// SendLoginCodeByEmail sends a login verification code to the user's email
// **Feature: password-recovery-email-login, Property 2: Email Login Round-Trip**
// **Feature: password-recovery-email-login, Property 7: Unregistered Email Security**
func (s *UserService) SendLoginCodeByEmail(ctx context.Context, email string) error {
	// Validate email format
	if !ValidateEmail(email) {
		return ErrInvalidEmail
	}

	// Normalize email to lowercase
	email = strings.ToLower(strings.TrimSpace(email))

	// Try to find user by email
	user, err := s.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			// Don't reveal if user exists - return success anyway for security
			return nil
		}
		return fmt.Errorf("failed to find user: %w", err)
	}

	// Create verification code for email login
	vc, err := s.CreateVerificationCode(ctx, user.ID, models.VerificationCodeTypeEmailLogin, "")
	if err != nil {
		return err
	}

	// Send login code email
	if s.emailService != nil {
		return s.emailService.SendLoginCode(ctx, user.Email, vc.Code)
	}

	return nil
}

// LoginWithCode authenticates a user using email and verification code
// **Feature: password-recovery-email-login, Property 2: Email Login Round-Trip**
// **Feature: password-recovery-email-login, Property 5: Code Single-Use Invalidation**
func (s *UserService) LoginWithCode(ctx context.Context, email, code string) (*TokenPair, *models.User, error) {
	// Normalize email to lowercase
	email = strings.ToLower(strings.TrimSpace(email))

	// Get user by email
	user, err := s.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return nil, nil, ErrInvalidCredentials
		}
		return nil, nil, fmt.Errorf("failed to find user: %w", err)
	}

	// Validate the verification code
	vc, err := s.ValidateVerificationCode(ctx, user.ID, code, models.VerificationCodeTypeEmailLogin)
	if err != nil {
		if errors.Is(err, ErrCodeInvalid) || errors.Is(err, ErrCodeExpired) {
			return nil, nil, err
		}
		return nil, nil, ErrInvalidCredentials
	}

	// Generate JWT token pair
	if s.jwtService == nil {
		return nil, nil, errors.New("JWT service not configured")
	}

	tokenPair, err := s.jwtService.GenerateTokenPair(
		user.ID,
		user.Email,
		user.Username,
		user.IsAdmin,
		user.IsActive,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate token: %w", err)
	}

	// Delete the used verification code
	deleteQuery := `DELETE FROM verification_codes WHERE id = $1`
	_, err = s.db.ExecContext(ctx, deleteQuery, vc.ID)
	if err != nil {
		// Log but don't fail - the login was successful
		fmt.Printf("[WARN] Failed to delete used verification code: %v\n", err)
	}

	return tokenPair, user, nil
}

// =============================================================================
// Notification Settings
// =============================================================================

// SetReleaseNotificationEnabled updates the user's release notification preference
func (s *UserService) SetReleaseNotificationEnabled(ctx context.Context, userID string, enabled bool) error {
	query := `UPDATE users SET release_notification_enabled = $1, updated_at = $2 WHERE id = $3`
	result, err := s.db.ExecContext(ctx, query, enabled, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update notification setting: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	return nil
}

// GetReleaseNotificationEnabled returns the user's release notification preference
func (s *UserService) GetReleaseNotificationEnabled(ctx context.Context, userID string) (bool, error) {
	var enabled bool
	query := `SELECT release_notification_enabled FROM users WHERE id = $1`
	err := s.db.QueryRowContext(ctx, query, userID).Scan(&enabled)
	if err == sql.ErrNoRows {
		return false, ErrUserNotFound
	}
	if err != nil {
		return false, fmt.Errorf("failed to get notification setting: %w", err)
	}
	return enabled, nil
}

func (s *UserService) SetIOSLosslessHLSEnabled(ctx context.Context, userID string, enabled bool) error {
	query := `UPDATE users SET ios_lossless_hls_enabled = $1, updated_at = $2 WHERE id = $3`
	result, err := s.db.ExecContext(ctx, query, enabled, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update iOS lossless HLS setting: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrUserNotFound
	}

	return nil
}

// =============================================================================
// Precache Support Functions
// =============================================================================

// GetAllActiveUserIDs returns all active user IDs for precache queue building
func (s *UserService) GetAllActiveUserIDs(ctx context.Context) ([]string, error) {
	query := `SELECT id FROM users WHERE is_active = true`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query active users: %w", err)
	}
	defer rows.Close()

	var userIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to scan user ID: %w", err)
		}
		userIDs = append(userIDs, id)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating users: %w", err)
	}

	return userIDs, nil
}
