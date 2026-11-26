begin;

create table if not exists public.calendar_lock_snapshot (
  id smallint primary key check (id = 1),
  captured_at timestamptz,
  locks jsonb not null default '[]'::jsonb check (jsonb_typeof(locks) = 'array')
);

alter table public.calendar_lock_snapshot enable row level security;
revoke all on public.calendar_lock_snapshot from public, anon, authenticated;
grant select, update on public.calendar_lock_snapshot to service_role;

insert into public.calendar_lock_snapshot (id) values (1)
on conflict (id) do nothing;

commit;
