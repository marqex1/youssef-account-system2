-- Youssef Accounts System V21 Stable Online Storage
-- Run this once in Supabase SQL Editor.
create table if not exists public.app_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "app_state_select_public" on public.app_state;
drop policy if exists "app_state_insert_public" on public.app_state;
drop policy if exists "app_state_update_public" on public.app_state;

-- Quick static-site policies for GitHub Pages. For stronger production security, use Supabase Auth + stricter RLS.
create policy "app_state_select_public"
on public.app_state for select
using (true);

create policy "app_state_insert_public"
on public.app_state for insert
with check (true);

create policy "app_state_update_public"
on public.app_state for update
using (true)
with check (true);
