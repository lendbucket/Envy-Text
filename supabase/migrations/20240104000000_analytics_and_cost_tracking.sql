-- Add actual cost tracking fields to messages and campaign_recipients
ALTER TABLE messages ADD COLUMN IF NOT EXISTS actual_price numeric(10,5);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS actual_segments int;

ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS actual_price numeric(10,5);
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS actual_segments int;

-- Add line_type to contacts for Twilio Lookup
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS line_type text;

-- Add index for dashboard date-range queries on messages
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Add index for campaign_recipients sent_at for timing queries
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_sent_at ON campaign_recipients(sent_at);
