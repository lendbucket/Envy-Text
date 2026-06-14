-- Cost calibration loop: seed settings keys for calibrated rates and manual override toggle.
-- These are stored alongside existing pricing settings in the key-value settings table.

INSERT INTO settings (key, value) VALUES
  ('calibrated_sms_rate', 'null'),
  ('calibrated_mms_rate', 'null'),
  ('calibration_sample_size', '0'),
  ('calibration_updated_at', 'null'),
  ('calibration_pinned', 'false')
ON CONFLICT (key) DO NOTHING;
