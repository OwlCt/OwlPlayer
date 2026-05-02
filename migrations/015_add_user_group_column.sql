-- Migration: 015_add_user_group_column
-- Description: Add user_group column to users table for normal/VIP user classification
-- Created: 2025-12-03

ALTER TABLE users ADD COLUMN IF NOT EXISTS user_group VARCHAR(20) DEFAULT 'normal' NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_user_group ON users(user_group);

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_group;

ALTER TABLE users ADD CONSTRAINT chk_user_group CHECK (user_group IN ('normal', 'vip'))
