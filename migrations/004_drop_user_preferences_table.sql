-- Migration: 004_drop_user_preferences_table
-- Description: Drop user_preferences table as chinese_variant feature is removed

DROP TABLE IF EXISTS user_preferences;
