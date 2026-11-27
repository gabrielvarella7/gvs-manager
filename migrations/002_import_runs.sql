create table if not exists import_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  import_key text not null,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, import_key)
);

create index if not exists import_runs_profile_idx on import_runs (profile_id);
