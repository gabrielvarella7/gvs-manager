create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  owner_sub text not null,
  stage text not null default 'production',
  nome text not null,
  identificacao text not null default '',
  concurso text not null default '',
  cargo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_owner_stage_idx on profiles (owner_sub, stage);

create table if not exists user_settings (
  owner_sub text not null,
  stage text not null default 'production',
  active_profile_id uuid references profiles (id) on delete set null,
  primary key (owner_sub, stage)
);

create table if not exists materias (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  nome text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists materias_profile_idx on materias (profile_id, sort_order);

create table if not exists topicos (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references materias (id) on delete cascade,
  nome text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists topicos_materia_idx on topicos (materia_id, sort_order);

create table if not exists assuntos (
  id uuid primary key default gen_random_uuid(),
  topico_id uuid not null references topicos (id) on delete cascade,
  nome text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists assuntos_topico_idx on assuntos (topico_id, sort_order);

create table if not exists historico (
  id uuid primary key default gen_random_uuid(),
  assunto_id uuid not null references assuntos (id) on delete cascade,
  acertos int not null check (acertos >= 0),
  quantidade int not null check (quantidade > 0),
  percentual double precision not null,
  created_at timestamptz not null default now(),
  check (acertos <= quantidade)
);

create index if not exists historico_assunto_created_idx on historico (assunto_id, created_at desc);
