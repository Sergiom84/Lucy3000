-- Migration: add permissions column + migrate MANAGER → EMPLOYEE
-- Run in Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';

UPDATE users SET role = 'EMPLOYEE' WHERE role = 'MANAGER';
