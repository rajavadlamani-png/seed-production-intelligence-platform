begin;
revoke all on table public.vm0051_drainage_evidence_runs from anon, authenticated;
grant select, insert on table public.vm0051_drainage_evidence_runs to authenticated;
commit;
