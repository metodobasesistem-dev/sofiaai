-- Migration: Add predefined_labels to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS predefined_labels TEXT[] DEFAULT '{}';
