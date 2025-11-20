-- Migration: Add group chat support

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

ALTER TABLE messages ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE CASCADE;
-- For group messages, recipient_id can be NULL, and group_id is set.
-- For 1-on-1 messages, group_id is NULL, and recipient_id is set.

-- Policy: Users can read messages in groups they belong to
CREATE POLICY "Users can read group messages" ON messages FOR SELECT TO authenticated USING (
  group_id IS NOT NULL AND group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
);

-- Policy: Users can send messages to groups they belong to
CREATE POLICY "Users can send group messages" ON messages FOR INSERT TO authenticated WITH CHECK (
  (group_id IS NOT NULL AND group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())) OR
  (group_id IS NULL AND sender_id = auth.uid())
);
