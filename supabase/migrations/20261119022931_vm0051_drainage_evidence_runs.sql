begin;

create table public.vm0051_drainage_evidence_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  season_key text not null default 'Kharif 2026',
  methodology_version text not null default 'VM0051 v1.1',
  monitoring_from date not null,
  monitoring_to date not null,
  generated_at timestamptz not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  field_count integer not null default 0 check (field_count >= 0),
  fields_with_boundary integer not null default 0 check (fields_with_boundary >= 0),
  fields_with_observations integer not null default 0 check (fields_with_observations >= 0),
  evidence_payload jsonb not null check (jsonb_typeof(evidence_payload) = 'object'),
  app_version text not null default 'SEED-PRODUCTION-MONITOR-MIS-1.0',
  created_at timestamptz not null default now(),
  constraint vm0051_drainage_monitoring_period_check
    check (monitoring_to >= monitoring_from)
);

create index vm0051_drainage_runs_company_created_idx
  on public.vm0051_drainage_evidence_runs(company_id, created_at desc);

alter table public.vm0051_drainage_evidence_runs enable row level security;

create policy vm0051_drainage_runs_tenant_select
on public.vm0051_drainage_evidence_runs for select to authenticated
using (
  exists (
    select 1 from public.company_memberships m
    where m.company_id = vm0051_drainage_evidence_runs.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

create policy vm0051_drainage_runs_manager_insert
on public.vm0051_drainage_evidence_runs for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_company_role(company_id,
    array['company_admin','seed_production_manager','state_head','district_manager'])
);

commit;
