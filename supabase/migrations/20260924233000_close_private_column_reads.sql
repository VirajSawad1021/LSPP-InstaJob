-- The browser never reads these tables directly (the API returns safe projections),
-- but the policies allowed it: developers exposed rate_floor/dealbreakers, and
-- negotiations exposed both sides' private steering. Remove direct client reads.
-- (Supabase's linter reports "RLS enabled, no policy" for both: that is intended.)
drop policy if exists "developers readable" on public.developers;
drop policy if exists "negotiation parties" on public.negotiations;

-- Realtime is only needed for the event log, contracts and submissions.
alter publication supabase_realtime drop table public.negotiations;
