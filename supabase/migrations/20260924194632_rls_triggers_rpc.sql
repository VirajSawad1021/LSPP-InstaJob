-- ---------- helpers ----------
create or replace function public.my_developer_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.developers where user_id = (select auth.uid())
$$;

create or replace function public.can_access_negotiation(nid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.negotiations n
    join public.projects p on p.id = n.project_id
    left join public.developers d on d.id = n.developer_id
    where n.id = nid and (p.client_id = (select auth.uid()) or d.user_id = (select auth.uid()))
  )
$$;

create or replace function public.can_access_project(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects p where p.id = pid and p.client_id = (select auth.uid()))
      or exists (
        select 1 from public.negotiations n join public.developers d on d.id = n.developer_id
        where n.project_id = pid and d.user_id = (select auth.uid())
      )
      or exists (select 1 from public.projects p where p.id = pid and p.status in ('open','negotiating'))
$$;

create or replace function public.can_access_contract(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contracts c left join public.developers d on d.id = c.developer_id
    where c.id = cid and (c.client_id = (select auth.uid()) or d.user_id = (select auth.uid()))
  )
$$;

revoke execute on function public.my_developer_id(), public.can_access_negotiation(uuid),
  public.can_access_project(uuid), public.can_access_contract(uuid) from anon, public;
grant execute on function public.my_developer_id(), public.can_access_negotiation(uuid),
  public.can_access_project(uuid), public.can_access_contract(uuid) to authenticated;

-- ---------- RLS: reads for parties, writes go through the API (service role) ----------
alter table public.profiles enable row level security;
alter table public.developers enable row level security;
alter table public.skill_interviews enable row level security;
alter table public.projects enable row level security;
alter table public.matches enable row level security;
alter table public.negotiations enable row level security;
alter table public.negotiation_events enable row level security;
alter table public.contracts enable row level security;
alter table public.milestone_submissions enable row level security;

create policy "own profile read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "developers readable" on public.developers for select to authenticated
  using (profile_complete or user_id = (select auth.uid()));
create policy "own interviews" on public.skill_interviews for select to authenticated using (user_id = (select auth.uid()));
create policy "project parties" on public.projects for select to authenticated using (public.can_access_project(id));
create policy "match parties" on public.matches for select to authenticated
  using (developer_id = public.my_developer_id()
         or exists (select 1 from public.projects p where p.id = project_id and p.client_id = (select auth.uid())));
create policy "negotiation parties" on public.negotiations for select to authenticated using (public.can_access_negotiation(id));
create policy "event parties" on public.negotiation_events for select to authenticated using (public.can_access_negotiation(negotiation_id));
create policy "contract parties" on public.contracts for select to authenticated using (public.can_access_contract(id));
create policy "submission parties" on public.milestone_submissions for select to authenticated using (public.can_access_contract(contract_id));

-- ---------- new user -> profile ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, role, full_name, avatar_url)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' in ('client','developer') then new.raw_user_meta_data->>'role' end,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- vector search (service role only) ----------
create or replace function public.match_developers(query_embedding extensions.vector(768), match_count int default 20)
returns table (id uuid, similarity float)
language sql stable set search_path = '' as $$
  select d.id, 1 - (d.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.developers d
  where d.profile_complete and d.embedding is not null
  order by d.embedding operator(extensions.<=>) query_embedding
  limit match_count
$$;
revoke execute on function public.match_developers(extensions.vector, int) from anon, authenticated, public;

create or replace function public.match_projects(query_embedding extensions.vector(768), match_count int default 20)
returns table (id uuid, similarity float)
language sql stable set search_path = '' as $$
  select p.id, 1 - (p.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.projects p
  where p.status in ('open','negotiating') and p.embedding is not null
  order by p.embedding operator(extensions.<=>) query_embedding
  limit match_count
$$;
revoke execute on function public.match_projects(extensions.vector, int) from anon, authenticated, public;

-- ---------- realtime for the live negotiation room ----------
alter publication supabase_realtime add table public.negotiation_events, public.negotiations,
  public.contracts, public.milestone_submissions;
