-- Add "launching" as a valid campaign status for atomic double-submit protection.
-- The launch endpoint transitions draft -> launching -> sending atomically.
-- If two requests race, only one succeeds at the draft -> launching step.
alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns add constraint campaigns_status_check
  check (status in ('draft', 'launching', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'));
