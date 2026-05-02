-- Migration: 005_add_password_reset_email_login_types
-- Description: Add password_reset and email_login verification code types
-- Created: 2025-12-01

-- Update constraint to allow new verification code types
ALTER TABLE verification_codes DROP CONSTRAINT IF EXISTS chk_verification_code_type;
ALTER TABLE verification_codes ADD CONSTRAINT chk_verification_code_type 
    CHECK (type IN ('email_verify', 'email_change', 'password_reset', 'email_login'));
