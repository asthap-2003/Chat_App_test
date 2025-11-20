-- Migration: Add chat_requests table for chat accept/reject logic
CREATE TABLE IF NOT EXISTS chat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  status text DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_requests_sender_id_idx ON chat_requests(sender_id);
CREATE INDEX IF NOT EXISTS chat_requests_recipient_id_idx ON chat_requests(recipient_id);
