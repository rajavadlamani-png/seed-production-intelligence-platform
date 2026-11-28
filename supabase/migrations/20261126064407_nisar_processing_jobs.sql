-- NISAR Harmony job orchestration state.
-- This migration is intentionally source-controlled only until reviewed and applied.

create table if not exists public.nisar_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  field_record_id uuid not null references public.beta_field_records(id) on delete cascade,
  field_no text not null,
  product_id text not null,
  product_name text not null,
  collection_short_name text not null,
  acquired_at timestamptz not null,
  processing_version text not null default 'NISAR-GCOV-ZONAL-0.1.0',
  status text not null default 'discovered'
    check (status in (
      'discovered','queued','harmony_submitted','harmony_ready',
      'statistics_running','completed','insufficient_valid_pixels',
      'catalogue_failed','harmony_failed','processing_failed'
    )),
  harmony_job_id text,
  harmony_request_url text,
  polygon_snapshot jsonb not null,
  bbox jsonb not null,
  selected_variables text[] not null default '{}',
  product_metadata jsonb not null default '{}'::jsonb,
  harmony_metadata jsonb not null default '{}'::jsonb,
  processing_result jsonb,
  error_message text,
  submitted_by uuid,
  submitted_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nisar_processing_jobs_field_product_version_key
    unique (field_record_id, product_id, processing_version)
);

create index if not exists nisar_processing_jobs_company_status_idx
  on public.nisar_processing_jobs (company_id, status, created_at desc);

create index if not exists nisar_processing_jobs_harmony_job_idx
  on public.nisar_processing_jobs (harmony_job_id)
  where harmony_job_id is not null;

alter table public.nisar_processing_jobs enable row level security;
revoke all on public.nisar_processing_jobs from public, anon, authenticated;
grant all on public.nisar_processing_jobs to service_role;

comment on table public.nisar_processing_jobs is
  'Private service-managed NISAR GCOV processing state. Access only through authenticated Edge Functions using the service role.';
comment on column public.nisar_processing_jobs.polygon_snapshot is
  'Exact saved field polygon snapshot used for this processing run; does not update the source field record.';
comment on column public.nisar_processing_jobs.processing_result is
  'Derived field-polygon metrics and quality metadata. Temporary Harmony URLs are not persisted here.';


-- beta_field_records is the pilot registry. It is not the same entity as
-- public.fields, which is the FK target of public.satellite_observations.
-- Keep NISAR pilot observations attached to the exact beta field record.
create table if not exists public.nisar_field_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  field_record_id uuid not null references public.beta_field_records(id) on delete cascade,
  field_no text not null,
  observed_at timestamptz not null,
  provider text not null default 'NASA NISAR Harmony',
  product_or_sensor text not null default 'NISAR L-band GCOV',
  source_product_id text not null,
  collection_short_name text not null,
  processing_version text not null,
  quality_status text not null,
  indicators jsonb not null,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint nisar_field_observations_field_product_version_key
    unique (field_record_id, source_product_id, processing_version)
);

create index if not exists nisar_field_observations_company_field_time_idx
  on public.nisar_field_observations (company_id, field_record_id, observed_at desc);

alter table public.nisar_field_observations enable row level security;
revoke all on public.nisar_field_observations from public, anon;
revoke insert, update, delete on public.nisar_field_observations from authenticated;
grant select on public.nisar_field_observations to authenticated;
grant all on public.nisar_field_observations to service_role;

drop policy if exists nisar_field_observations_company_select on public.nisar_field_observations;
create policy nisar_field_observations_company_select
  on public.nisar_field_observations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_memberships m
      where m.company_id = nisar_field_observations.company_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

comment on table public.nisar_field_observations is
  'NISAR GCOV field-level observations linked to beta_field_records; separate from production satellite_observations which references public.fields.';
