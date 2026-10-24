-- Seed Production Intelligence Platform: immutable daily weather audit trail.
-- Apply to a dedicated pilot PostgreSQL/Supabase database before enabling collection.
create extension if not exists pgcrypto;
create table if not exists public.seed_weather_locations (
 id uuid primary key default gen_random_uuid(), company_id text not null, crop_season_id text not null,
 farmer_id text not null, field_id text not null, field_code text, farmer_reference text,
 village text not null, district text not null, state text not null, crop text not null default 'Paddy',
 hybrid text, latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 boundary_centroid boolean not null default false, active boolean not null default true,
 crop_start_date date, expected_harvest_date date, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(company_id,crop_season_id,field_id)
);
create index if not exists seed_weather_locations_active_idx on public.seed_weather_locations(active,state,district,village);
create table if not exists public.seed_weather_ingestion_runs (
 id uuid primary key default gen_random_uuid(), location_id uuid references public.seed_weather_locations(id),
 company_id text not null, crop_season_id text not null, farmer_id text not null, field_id text not null,
 target_date date not null, status text not null check(status in ('success','failed','skipped')),
 source text not null default 'Open-Meteo Archive API', source_url text,
 requested_latitude double precision, requested_longitude double precision,
 started_at timestamptz not null, completed_at timestamptz not null default now(),
 error_code text, error_message text, response_sha256 text, created_at timestamptz not null default now()
);
create index if not exists seed_weather_ingestion_runs_field_date_idx on public.seed_weather_ingestion_runs(company_id,crop_season_id,field_id,target_date desc);
create table if not exists public.seed_weather_daily (
 id uuid primary key default gen_random_uuid(), location_id uuid not null references public.seed_weather_locations(id),
 company_id text not null, crop_season_id text not null, farmer_id text not null, field_id text not null,
 field_code text, village text not null, district text not null, state text not null, crop text not null, hybrid text,
 observation_date date not null, timezone text not null default 'Asia/Kolkata',
 latitude double precision not null, longitude double precision not null,
 location_method text not null check(location_method in ('field_gps','boundary_centroid','verified_village_coordinate')),
 precipitation_mm numeric(8,2), rain_mm numeric(8,2), showers_mm numeric(8,2), precipitation_hours numeric(6,2),
 temperature_max_c numeric(5,2), temperature_min_c numeric(5,2), wind_speed_max_kmh numeric(7,2),
 wind_gust_max_kmh numeric(7,2), reference_et0_mm numeric(7,2),
 source text not null default 'Open-Meteo Archive API', source_url text not null,
 source_licence text not null default 'CC BY 4.0; attribution required', source_payload jsonb not null,
 response_sha256 text not null, retrieved_at timestamptz not null default now(),
 ingestion_run_id uuid references public.seed_weather_ingestion_runs(id), created_at timestamptz not null default now(),
 unique(company_id,crop_season_id,field_id,observation_date,source)
);
create index if not exists seed_weather_daily_season_date_idx on public.seed_weather_daily(company_id,crop_season_id,observation_date desc);
create index if not exists seed_weather_daily_farmer_date_idx on public.seed_weather_daily(company_id,crop_season_id,farmer_id,observation_date desc);
create index if not exists seed_weather_daily_village_date_idx on public.seed_weather_daily(company_id,crop_season_id,state,district,village,observation_date desc);

-- Enforce immutability at the database layer. Corrections should be separately
-- reviewed and appended through a future versioned correction workflow.
create or replace function public.prevent_seed_weather_daily_mutation()
returns trigger language plpgsql as $
begin
 raise exception 'seed_weather_daily is immutable; append a reviewed correction instead';
end;
$;
drop trigger if exists seed_weather_daily_immutable on public.seed_weather_daily;
create trigger seed_weather_daily_immutable
 before update or delete on public.seed_weather_daily
 for each row execute function public.prevent_seed_weather_daily_mutation();
alter table public.seed_weather_locations enable row level security;
alter table public.seed_weather_ingestion_runs enable row level security;
alter table public.seed_weather_daily enable row level security;
-- No anonymous/authenticated policies: farmer-linked history is not public.
revoke all on public.seed_weather_locations from anon, authenticated;
revoke all on public.seed_weather_ingestion_runs from anon, authenticated;
revoke all on public.seed_weather_daily from anon, authenticated;
grant all on public.seed_weather_locations to service_role;
grant all on public.seed_weather_ingestion_runs to service_role;
grant all on public.seed_weather_daily to service_role;
comment on table public.seed_weather_daily is 'Append-only daily field weather per crop season; forecasts are not observed rainfall.';
comment on table public.seed_weather_ingestion_runs is 'Attempt-level audit log, including failures, so missing weather days are explainable.';
