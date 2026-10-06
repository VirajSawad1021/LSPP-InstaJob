alter table public.developers add column github_signals jsonb;

alter table public.negotiation_events
  add column audience text not null default 'all' check (audience in ('all','client','developer'));

create or replace function private.negotiation_side(nid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p.client_id = (select auth.uid()) then 'client'
    when d.user_id = (select auth.uid()) then 'developer'
  end
  from public.negotiations n
  join public.projects p on p.id = n.project_id
  join public.developers d on d.id = n.developer_id
  where n.id = nid
$$;
revoke execute on function private.negotiation_side(uuid) from anon, public;
grant execute on function private.negotiation_side(uuid) to authenticated;

drop policy "event parties" on public.negotiation_events;
create policy "event parties by audience" on public.negotiation_events for select to authenticated
  using (audience = 'all' and private.can_access_negotiation(negotiation_id)
         or audience = private.negotiation_side(negotiation_id));
