alter table public.calendar_tasks
  add column if not exists assignee_name text,
  add column if not exists created_by_name text,
  add column if not exists completed_by_name text,
  add column if not exists completed_at timestamptz;

create table if not exists public.calendar_task_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.calendar_task_vendors (name)
values
  ('Andre'),
  ('Ashley'),
  ('Isaac'),
  ('Dennis'),
  ('Paradise HVAC'),
  ('Stainley')
on conflict (name) do nothing;

create table if not exists public.calendar_task_creators (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.calendar_task_creators (name)
values
  ('Zack'),
  ('Isaac'),
  ('Ashley')
on conflict (name) do nothing;

create table if not exists public.calendar_task_media (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  file_name text not null,
  file_type text not null,
  file_url text not null,
  storage_path text not null,
  media_kind text not null check (media_kind in ('image', 'video')),
  uploaded_for text not null default 'open' check (uploaded_for in ('open', 'complete')),
  created_at timestamptz not null default now()
);

create index if not exists calendar_task_media_task_id_idx
  on public.calendar_task_media(task_id);

insert into storage.buckets (id, name, public)
values ('calendar-task-media', 'calendar-task-media', true)
on conflict (id) do update set public = excluded.public;
