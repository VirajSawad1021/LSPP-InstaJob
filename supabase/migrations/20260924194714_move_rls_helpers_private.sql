create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.my_developer_id() set schema private;
alter function public.can_access_negotiation(uuid) set schema private;
alter function public.can_access_project(uuid) set schema private;
alter function public.can_access_contract(uuid) set schema private;

-- function bodies reference public.* explicitly, policies follow the moved oids automatically.
