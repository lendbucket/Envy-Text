-- Envy Texts initial schema
-- All phone numbers stored in E.164 format

-- contacts
create table contacts (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  first_name text,
  last_name text,
  email text,
  tags text[] default '{}',
  notes text,
  opted_out boolean default false,
  opted_out_at timestamptz,
  source text check (source in ('csv', 'manual', 'inbound')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_contacts_phone on contacts (phone);

-- conversations
create table conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts on delete cascade unique not null,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count int default 0,
  created_at timestamptz default now()
);

-- campaigns (must be created before messages so messages can reference it)
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  media_urls text[] default '{}',
  audience_type text not null check (audience_type in ('all', 'tags')),
  audience_tags text[] default '{}',
  recipient_count int default 0,
  status text default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  estimated_cost numeric(10,2),
  actual_sent int default 0,
  actual_failed int default 0,
  created_at timestamptz default now()
);

create index idx_campaigns_status_scheduled on campaigns (status, scheduled_at);

-- messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations on delete cascade not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text,
  media_urls text[] default '{}',
  status text default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'received')),
  twilio_sid text,
  error_code text,
  error_message text,
  campaign_id uuid references campaigns on delete set null,
  segments int,
  estimated_cost numeric(10,5),
  created_at timestamptz default now()
);

create index idx_messages_conversation_created on messages (conversation_id, created_at);

-- campaign_recipients
create table campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns on delete cascade not null,
  contact_id uuid references contacts on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed', 'skipped_opted_out')),
  twilio_sid text,
  error_code text,
  error_message text,
  sent_at timestamptz,
  replied_at timestamptz,
  unique (campaign_id, contact_id)
);

create index idx_campaign_recipients_campaign_status on campaign_recipients (campaign_id, status);

-- tracked_links
create table tracked_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns on delete cascade not null,
  original_url text not null,
  created_at timestamptz default now()
);

-- tracked_link_codes (per-recipient short codes for click attribution)
create table tracked_link_codes (
  id uuid primary key default gen_random_uuid(),
  tracked_link_id uuid references tracked_links on delete cascade not null,
  contact_id uuid references contacts on delete cascade not null,
  short_code text unique not null,
  unique (tracked_link_id, contact_id)
);

create index idx_tracked_link_codes_short_code on tracked_link_codes (short_code);

-- link_clicks
create table link_clicks (
  id uuid primary key default gen_random_uuid(),
  tracked_link_code_id uuid references tracked_link_codes on delete cascade not null,
  clicked_at timestamptz default now(),
  user_agent text
);

-- settings (key-value store for app configuration)
create table settings (
  key text primary key,
  value jsonb not null
);

-- Seed default pricing and config
insert into settings (key, value) values
  ('sms_price_per_segment', '0.0079'),
  ('mms_price', '0.02'),
  ('carrier_fee_per_sms', '0.003'),
  ('carrier_fee_per_mms', '0.01'),
  ('test_phone_number', '""');

-- Enable RLS on all tables, deny anon access.
-- The app uses the service role key for all server-side operations.

alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;
alter table tracked_links enable row level security;
alter table tracked_link_codes enable row level security;
alter table link_clicks enable row level security;
alter table settings enable row level security;

-- Realtime: allow anon to subscribe to changes for live inbox updates.
-- Actual reads still go through the service role; this just enables
-- the Realtime broadcast channel.
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;

-- Updated_at trigger for contacts
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger contacts_updated_at
  before update on contacts
  for each row execute function update_updated_at();
