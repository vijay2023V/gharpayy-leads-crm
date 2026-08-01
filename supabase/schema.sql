-- Gharpayy Leads CRM — Supabase schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query)

create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  preferred_location text,
  budget numeric,
  move_in_date date,               -- used by the intent scoring
  status text not null default 'New'
    check (status in ('New','Contacted','Visit Scheduled','Booked','Lost')),
  notes jsonb not null default '[]'::jsonb,   -- [{ text, created_at, author }]
  last_activity_at timestamptz not null default now(),  -- bumped on any note/status change
  created_at timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_location_idx on public.leads (preferred_location);
create index if not exists leads_created_idx on public.leads (created_at desc);

-- keep last_activity_at fresh automatically on any update
create or replace function public.touch_last_activity()
returns trigger language plpgsql as $$
begin
  new.last_activity_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_last_activity on public.leads;
create trigger trg_touch_last_activity
  before update on public.leads
  for each row execute function public.touch_last_activity();

-- Row Level Security — MVP policy: any authenticated request (anon key) can read/write.
-- Tighten this before real production use (see README "Security note").
alter table public.leads enable row level security;

create policy "leads_select_all" on public.leads for select using (true);
create policy "leads_insert_all" on public.leads for insert with check (true);
create policy "leads_update_all" on public.leads for update using (true);

-- Realtime (optional but recommended so multiple operators see live updates)
alter publication supabase_realtime add table public.leads;

-- Seed data
insert into public.leads (name, phone, preferred_location, budget, move_in_date, status, notes)
values
  ('Aarav Shah', '+919800000001', 'Koramangala', 12000, current_date + 2, 'New', '[]'),
  ('Pooja Menon', '+919800000002', 'HSR Layout', 8500, current_date + 20, 'Contacted', '[]'),
  ('Ravi Kumar', '+919800000003', 'Whitefield', 15000, current_date + 3, 'Visit Scheduled', '[]'),
  ('Sneha Reddy', '+919800000004', 'Indiranagar', 9000, current_date + 15, 'Booked', '[]'),
  ('Karthik Iyer', '+919800000005', 'BTM Layout', 7000, current_date + 30, 'Lost', '[]');
