-- Twilio usage records for invoice-accurate spend tracking.
-- Stores daily aggregates from the Usage Records API.
CREATE TABLE IF NOT EXISTS twilio_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_date date NOT NULL,
  category text NOT NULL,
  count int NOT NULL DEFAULT 0,
  price numeric(10,5) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(usage_date, category)
);

ALTER TABLE twilio_usage ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_twilio_usage_date ON twilio_usage(usage_date);
