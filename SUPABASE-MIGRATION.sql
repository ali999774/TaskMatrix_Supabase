-- ============================================================
-- TaskMatrix — Supabase Migration Script
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
-- TASKS TABLE
create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  title         text not null,
  notes         text,
  category      text default 'Personal',
  importance    int default 5,
  urgency       int default 5,
  status        text default 'todo',
  due_date      date,
  due_time      time,
  estimated_duration int,
  recurring     boolean default false,
  recur_frequency text,
  recur_interval  int default 1,
  recur_days    int[],
  tags          text[],
  subtasks      jsonb default '[]'::jsonb,
  pinned        boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
-- STICKY NOTES TABLE
create table if not exists sticky_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  content     text default '',
  color       text default 'yellow',
  position_x  int default 0,
  position_y  int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table tasks enable row level security;
alter table sticky_notes enable row level security;
create policy "users_own_tasks"
  on tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "users_own_notes"
  on sticky_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
create trigger tasks_updated_at
  before update on tasks
  for each row execute function update_updated_at();
create trigger sticky_notes_updated_at
  before update on sticky_notes
  for each row execute function update_updated_at();
