-- Add opt_in_source to contacts for consent records
alter table contacts add column if not exists opt_in_source text;

-- Add compliance fields to campaigns for Phase 4
alter table campaigns add column if not exists append_opt_out boolean default true;
alter table campaigns add column if not exists quiet_hours_checked boolean default true;
