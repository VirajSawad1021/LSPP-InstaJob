-- Chat reuses project_comments (milestone_id null = general conversation).
alter table public.project_comments
  add column attachments jsonb not null default '[]'::jsonb,   -- [{path, name, type, size}]
  add column pinned boolean not null default false,             -- pinned = agreed decision / clarification
  add column pinned_by uuid references auth.users(id) on delete set null,
  add column pinned_at timestamptz;
create index on public.project_comments (contract_id) where pinned;

-- Read receipts / unread counts: last time each party opened the conversation.
create table public.message_reads (
  contract_id uuid not null references public.contracts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (contract_id, user_id)
);

-- Weekly structured updates from the developer.
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  done text not null default '',
  next text not null default '',
  blockers text not null default '',
  needs text not null default '',
  ai_drafted boolean not null default false,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.check_ins (contract_id, created_at desc);

alter table public.message_reads enable row level security;
alter table public.check_ins enable row level security;
create policy "read parties" on public.message_reads for select to authenticated using (private.can_access_contract(contract_id));
create policy "check-in parties" on public.check_ins for select to authenticated using (private.can_access_contract(contract_id));

alter publication supabase_realtime add table public.message_reads, public.check_ins;

-- Private bucket for chat attachments; the API uploads with the service role and hands out signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 10485760)
on conflict (id) do nothing;
