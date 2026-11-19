begin;
alter table public.vm0051_drainage_events
  add column if not exists methodology_version text,
  add column if not exists monitoring_plan_reference text,
  add column if not exists project_reference text;
commit;
