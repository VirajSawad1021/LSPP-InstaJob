-- Simulated escrow: an append-only ledger per milestone.
create table public.escrow_entries (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  milestone_id text not null,
  kind text not null check (kind in ('fund', 'release', 'refund')),
  amount numeric not null check (amount > 0),
  actor_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index on public.escrow_entries (contract_id, created_at);
alter table public.escrow_entries enable row level security;  -- API only

-- Disputes over whether a milestone is done, settled by the Mediator Agent's proposal.
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  milestone_id text not null,
  submission_id uuid references public.milestone_submissions(id) on delete set null,
  opened_by uuid references auth.users(id) on delete set null,
  opened_role text not null check (opened_role in ('client', 'developer')),
  client_statement text,
  developer_statement text,
  status text not null default 'awaiting_response'
    check (status in ('awaiting_response', 'mediating', 'proposed', 'resolved', 'rejected', 'withdrawn', 'failed')),
  ruling jsonb,
  client_accepted_at timestamptz,
  developer_accepted_at timestamptz,
  outcome text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.disputes (contract_id, created_at desc);
create unique index disputes_one_open_per_milestone on public.disputes (contract_id, milestone_id)
  where status in ('awaiting_response', 'mediating', 'proposed');
alter table public.disputes enable row level security;  -- API only

-- In-app notifications; each user reads only their own (also live via realtime).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  emailed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "own notifications readable" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
alter publication supabase_realtime add table public.notifications;

alter table public.profiles add column email_notifications boolean not null default true;
