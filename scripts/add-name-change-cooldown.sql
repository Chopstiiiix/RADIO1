-- Add cooldown tracking columns for display name and handle changes
-- Users can only change these once every 30 days

-- Track when display_name was last changed (all users)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS display_name_changed_at timestamptz DEFAULT NULL;

-- Track when handle was last changed (broadcasters only)
ALTER TABLE broadcaster_profiles
ADD COLUMN IF NOT EXISTS handle_changed_at timestamptz DEFAULT NULL;
