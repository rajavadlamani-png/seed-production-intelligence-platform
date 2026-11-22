create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.field_vwc_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_record_id uuid not null references public.beta_field_records(id) on delete cascade,
  field_no text not null,
  season_key text not null,
  observed_on date not null,
  vwc_m3_m3 numeric(8,6) not null check (vwc_m3_m3 >= 0 and vwc_m3_m3 <= 1),
  source text not null check (source in ('open_meteo_soil_moisture', 'sentinel1_model_estimate')),
  source_label text not null,
  provider text not null,
  product_or_sensor text not null,
  depth_cm text,
  source_observed_at timestamptz,
  captured_at timestamptz not null default now(),
  model_version text,
  quality_flag text not null default 'provisional',
  metadata jsonb not null default '{}'::jsonb,
  constraint field_vwc_observations_source_key unique (company_id, field_record_id, observed_on, source)
);

create index if not exists field_vwc_observations_field_date_idx
  on public.field_vwc_observations (company_id, field_record_id, observed_on desc);
create index if not exists field_vwc_observations_source_date_idx
  on public.field_vwc_observations (company_id, source, observed_on desc);

alter table public.field_vwc_observations enable row level security;
drop policy if exists "Company members can read field VWC observations" on public.field_vwc_observations;
create policy "Company members can read field VWC observations"
  on public.field_vwc_observations for select to authenticated
  using (exists (
    select 1 from public.company_memberships m
    where m.company_id = field_vwc_observations.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  ));
grant select on public.field_vwc_observations to authenticated;
revoke insert, update, delete on public.field_vwc_observations from anon, authenticated;

create table if not exists public.field_vwc_capture_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  fields_scanned integer not null default 0 check (fields_scanned >= 0),
  open_meteo_saved integer not null default 0 check (open_meteo_saved >= 0),
  sentinel1_saved integer not null default 0 check (sentinel1_saved >= 0),
  fields_failed integer not null default 0 check (fields_failed >= 0),
  details jsonb not null default '{}'::jsonb
);
create index if not exists field_vwc_capture_runs_company_started_idx
  on public.field_vwc_capture_runs (company_id, started_at desc);
alter table public.field_vwc_capture_runs enable row level security;
drop policy if exists "Company members can read VWC capture runs" on public.field_vwc_capture_runs;
create policy "Company members can read VWC capture runs"
  on public.field_vwc_capture_runs for select to authenticated
  using (exists (
    select 1 from public.company_memberships m
    where m.company_id = field_vwc_capture_runs.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  ));
grant select on public.field_vwc_capture_runs to authenticated;
revoke insert, update, delete on public.field_vwc_capture_runs from anon, authenticated;

select vault.create_secret(
  encode(gen_random_bytes(32), 'hex'),
  'vwc_daily_capture_token',
  'Private token authorising the scheduled daily VWC capture Edge Function'
);
