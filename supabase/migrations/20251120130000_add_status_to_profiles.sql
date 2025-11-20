-- Migration: Add status field to profiles for custom user status
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'Available';
