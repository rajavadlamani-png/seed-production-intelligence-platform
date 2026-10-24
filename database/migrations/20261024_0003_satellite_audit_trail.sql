-- Sentinel imagery, field metrics, plain-language interpretation and audit trail.
-- Apply only to the dedicated Seed Production Intelligence Platform database.
alter table public.seed_weather_locations
 add column if not exists field_boundary_geojson jsonb,
 add column if not exists crop_variety text,
 add column if not exists planting_date date;
create table if not exists public.seed_satellite_ingestion_runs (
 id uuid primary key default gen_random_uuid(), location_id uuid,
 company_id uuid not null references public.companies(id), crop_season_id uuid not null,
 farmer_id uuid not null, field_id uuid not null,
 foreign key (company_id, crop_season_id) references public.crop_seasons(company_id, id) on delete restrict,
 foreign key (company_id, field_id, farmer_id) references public.fields(company_id, id, farmer_id) on delete restrict,
 foreign key (location_id, company_id, crop_season_id, field_id) references public.seed_weather_locations(id, company_id, crop_season_id, field_id) on delete restrict,
 provider text not null default 'Copernicus Data Space / Sentinel Hub',
 collection text not null check(collection in ('sentinel-2-l2a','sentinel-1-grd')),
 interval_start date not null, interval_end date not null,
 status text not null check(status in ('running','success','partial','failed','no_observation')),
 request_started_at timestamptz not null default now(), request_completed_at timestamptz,
 request_parameters jsonb, response_sha256 text, error_code text, error_message text, created_at timestamptz not null default now(),
 unique(id, company_id, crop_season_id, field_id, collection, interval_start, interval_end)
);
create index if not exists seed_satellite_runs_field_date_idx on public.seed_satellite_ingestion_runs(company_id,crop_season_id,field_id,interval_start desc);
create table if not exists public.seed_satellite_observations (
 id uuid primary key default gen_random_uuid(), location_id uuid not null,
 company_id uuid not null references public.companies(id), crop_season_id uuid not null,
 farmer_id uuid not null, field_id uuid not null,
 foreign key (company_id, crop_season_id) references public.crop_seasons(company_id, id) on delete restrict,
 foreign key (company_id, field_id, farmer_id) references public.fields(company_id, id, farmer_id) on delete restrict,
 foreign key (location_id, company_id, crop_season_id, field_id) references public.seed_weather_locations(id, company_id, crop_season_id, field_id) on delete restrict,
 foreign key (ingestion_run_id, company_id, crop_season_id, field_id, collection, interval_start, interval_end) references public.seed_satellite_ingestion_runs(id, company_id, crop_season_id, field_id, collection, interval_start, interval_end) on delete restrict,
 field_code text, village text not null, district text not null, state text not null, crop text not null,
 hybrid text, planting_date date, crop_stage text,
 collection text not null check(collection in ('sentinel-2-l2a','sentinel-1-grd')),
 interval_start date not null, interval_end date not null, acquisition_dates date[] not null default '{}',
 field_boundary_geojson jsonb not null, field_area_coverage_pct numeric(5,2), cloud_coverage_pct numeric(5,2), valid_pixel_pct numeric(5,2),
 metrics jsonb not null default '{}'::jsonb, indices jsonb not null default '{}'::jsonb,
 plain_language_interpretation jsonb not null default '{}'::jsonb, interpretation_version text not null default 'heuristics-v1',
 provider text not null default 'Copernicus Data Space / Sentinel Hub', provider_product_ids jsonb not null default '[]'::jsonb,
 source_payload jsonb not null, source_sha256 text not null, retrieved_at timestamptz not null default now(),
 ingestion_run_id uuid, created_at timestamptz not null default now(),
 unique(company_id,crop_season_id,field_id,collection,interval_start,interval_end,source_sha256)
);
create index if not exists seed_satellite_obs_field_date_idx on public.seed_satellite_observations(company_id,crop_season_id,field_id,interval_start desc);
create index if not exists seed_satellite_obs_farmer_date_idx on public.seed_satellite_observations(company_id,crop_season_id,farmer_id,interval_start desc);
create table if not exists public.seed_satellite_interpretation_reviews (
 id uuid primary key default gen_random_uuid(), observation_id uuid not null references public.seed_satellite_observations(id),
 reviewer_id uuid references auth.users(id) on delete restrict, review_status text not null default 'pending' check(review_status in ('pending','accepted','corrected','rejected')),
 reviewer_notes text, reviewed_at timestamptz, correction_payload jsonb, created_at timestamptz not null default now()
);
create or replace function public.prevent_seed_satellite_observation_mutation()
returns trigger language plpgsql as $$
begin raise exception 'seed_satellite_observations is immutable; append a reviewed correction instead'; end;
$$;
drop trigger if exists seed_satellite_observations_immutable on public.seed_satellite_observations;
create trigger seed_satellite_observations_immutable before update or delete on public.seed_satellite_observations
 for each row execute function public.prevent_seed_satellite_observation_mutation();
alter table public.seed_satellite_ingestion_runs enable row level security;
alter table public.seed_satellite_observations enable row level security;
alter table public.seed_satellite_interpretation_reviews enable row level security;
revoke all on public.seed_satellite_ingestion_runs from anon, authenticated;
revoke all on public.seed_satellite_observations from anon, authenticated;
revoke all on public.seed_satellite_interpretation_reviews from anon, authenticated;
grant all on public.seed_satellite_ingestion_runs to service_role;
grant all on public.seed_satellite_observations to service_role;
grant all on public.seed_satellite_interpretation_reviews to service_role;
comment on table public.seed_satellite_observations is 'Append-only field-specific Sentinel optical/radar statistics, indices, plain-language interpretation, source payload and provenance.';
