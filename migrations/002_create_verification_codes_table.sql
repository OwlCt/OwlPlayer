-- Migration: 002_create_verification_codes_table
-- Description: Create verification_codes table for email verification
-- Created: 2025-11-29

-- Verification codes table
CREATE TABLE IF NOT EXISTS verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(6) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'email_verify', 'email_change'
    new_email VARCHAR(255),    -- Used for email_change type
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_codes_type ON verification_codes(type);

-- Constraint to ensure valid type values
ALTER TABLE verification_codes DROP CONSTRAINT IF EXISTS chk_verification_code_type;
ALTER TABLE verification_codes ADD CONSTRAINT chk_verification_code_type 
    CHECK (type IN ('email_verify', 'email_change'));
