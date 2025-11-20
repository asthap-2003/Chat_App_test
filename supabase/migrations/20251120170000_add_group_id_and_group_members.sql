-- Add group_id column to messages table
ALTER TABLE messages ADD COLUMN group_id uuid REFERENCES groups(id);

-- Create group_members table
CREATE TABLE group_members (
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);