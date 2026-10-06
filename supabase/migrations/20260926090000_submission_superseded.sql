-- A developer may replace a flagged delivery before the founder reviews it; the old one is kept as history.
alter table public.milestone_submissions drop constraint milestone_submissions_status_check;
alter table public.milestone_submissions add constraint milestone_submissions_status_check
  check (status in ('verifying', 'verified', 'needs_work', 'approved', 'changes_requested', 'error', 'superseded'));
