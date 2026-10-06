create extension if not exists vector with schema extensions;

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('client','developer')),
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ---------- developers (seed personas have user_id null) ----------
create table public.developers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  headline text,
  bio text,
  location text,
  timezone text,
  skills text[] not null default '{}',
  years_experience int,
  rate_floor numeric,            -- USD/hour, never negotiated below
  rate_target numeric,           -- USD/hour
  weekly_hours int default 30,
  availability text default 'immediate',
  work_style jsonb not null default '{}'::jsonb,
  shipped_projects jsonb not null default '[]'::jsonb,
  github_username text,
  negotiation_style text not null default 'collaborative' check (negotiation_style in ('firm','collaborative','flexible')),
  dealbreakers text[] not null default '{}',
  auto_negotiate boolean not null default true,
  is_demo_persona boolean not null default false,
  profile_complete boolean not null default false,
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skill_interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript jsonb not null default '[]'::jsonb,
  extracted jsonb not null default '{}'::jsonb,
  progress int not null default 0,
  complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- projects ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  raw_idea text not null,
  title text,
  status text not null default 'clarifying'
    check (status in ('clarifying','planned','open','negotiating','contracted','in_progress','completed','cancelled')),
  questions jsonb not null default '[]'::jsonb,   -- [{question, why, answer}]
  budget_max numeric,                              -- USD, total
  deadline_weeks int,
  plan jsonb,                                      -- Build Plan
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  developer_id uuid not null references public.developers(id) on delete cascade,
  score int not null,
  breakdown jsonb not null default '{}'::jsonb,
  reasons text[] not null default '{}',
  concerns text[] not null default '{}',
  initiated_by text not null default 'client' check (initiated_by in ('client','developer')),
  created_at timestamptz not null default now(),
  unique (project_id, developer_id)
);

-- ---------- negotiations ----------
create table public.negotiations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  developer_id uuid not null references public.developers(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','running','paused','agreed','impasse','failed','selected','not_selected')),
  round int not null default 0,
  max_rounds int not null default 6,
  latest_offer jsonb,
  agreed_offer jsonb,
  steering jsonb not null default '{}'::jsonb,     -- {client: "...", developer: "..."}
  outcome_summary text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, developer_id)
);

create table public.negotiation_events (
  id bigint generated always as identity primary key,
  negotiation_id uuid not null references public.negotiations(id) on delete cascade,
  seq int not null,
  actor text not null check (actor in ('developer_agent','client_agent','system','guardrail','client','developer')),
  kind text not null check (kind in ('message','offer','accept','walk_away','guardrail','status','steering')),
  content text not null,
  offer jsonb,
  prev_hash text,
  hash text not null,
  created_at timestamptz not null default now(),
  unique (negotiation_id, seq)
);

-- ---------- contracts ----------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  negotiation_id uuid not null references public.negotiations(id) on delete cascade,
  developer_id uuid not null references public.developers(id),
  client_id uuid not null references auth.users(id),
  title text not null,
  summary text,
  total_price numeric not null,
  timeline_weeks int not null,
  milestones jsonb not null,        -- [{id,title,deliverables,acceptance_criteria,price,weeks,status}]
  terms jsonb not null default '{}'::jsonb,   -- revisions, ip, payment, change_process
  status text not null default 'pending_approval'
    check (status in ('pending_approval','active','completed','cancelled')),
  client_approved_at timestamptz,
  developer_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.milestone_submissions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  milestone_id text not null,
  live_url text,
  repo_url text,
  notes text,
  status text not null default 'verifying'
    check (status in ('verifying','verified','needs_work','approved','changes_requested','error')),
  report jsonb,
  client_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- indexes ----------
create index on public.developers using hnsw (embedding extensions.vector_cosine_ops);
create index on public.projects (client_id);
create index on public.matches (project_id);
create index on public.matches (developer_id);
create index on public.negotiations (project_id);
create index on public.negotiations (developer_id);
create index on public.negotiation_events (negotiation_id, seq);
create index on public.contracts (developer_id);
create index on public.contracts (client_id);
create index on public.contracts (negotiation_id);
create index on public.milestone_submissions (contract_id);
create index on public.skill_interviews (user_id);
