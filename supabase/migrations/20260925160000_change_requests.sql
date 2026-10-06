create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  requested_role text not null check (requested_role in ('client', 'developer')),
  title text not null check (char_length(title) between 3 and 140),
  description text not null check (char_length(description) between 5 and 4000),
  source_message_id uuid references public.project_comments(id) on delete set null,
  status text not null default 'scoping'
    check (status in ('scoping', 'awaiting_client', 'negotiating', 'proposed', 'approved', 'rejected', 'withdrawn', 'impasse', 'failed')),
  max_extra_budget numeric,        -- founder's private cap for this change
  max_extra_weeks int,             -- founder's private cap for this change
  scope jsonb,                     -- Change Scoping Agent output
  transcript jsonb not null default '[]'::jsonb,   -- [{actor, kind, text, price, weeks, audience, at}]
  price_delta numeric,
  weeks_delta int,
  outcome text,
  client_approved_at timestamptz,
  developer_approved_at timestamptz,
  applied_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.change_requests (contract_id, created_at desc);

-- RLS on with no policies: the transcript holds developer-only guardrail notes (the floor) and the
-- row holds the founder's private caps, so both sides read change requests only through the API,
-- which filters by audience.
alter table public.change_requests enable row level security;
