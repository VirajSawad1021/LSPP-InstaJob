-- When the contract became active; milestone due dates are derived from it.
alter table public.contracts add column started_at timestamptz;
update public.contracts set started_at = coalesce(developer_approved_at, client_approved_at, created_at)
  where status in ('active', 'completed') and started_at is null;

-- Checklist items inside a milestone, visible to both parties.
create table public.milestone_tasks (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  milestone_id text not null,
  title text not null check (char_length(title) between 1 and 200),
  done boolean not null default false,
  position int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.milestone_tasks (contract_id, milestone_id, position);

-- Shared discussion per project, optionally pinned to a milestone.
create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  milestone_id text,
  author_id uuid references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('client', 'developer')),
  author_name text,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.project_comments (contract_id, created_at);

alter table public.milestone_tasks enable row level security;
alter table public.project_comments enable row level security;
create policy "task parties" on public.milestone_tasks for select to authenticated using (private.can_access_contract(contract_id));
create policy "comment parties" on public.project_comments for select to authenticated using (private.can_access_contract(contract_id));

alter publication supabase_realtime add table public.milestone_tasks, public.project_comments;
