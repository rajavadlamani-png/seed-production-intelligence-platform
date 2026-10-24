-- Seed Production Intelligence Platform: foundational schema for the Paddy pilot.
-- DESIGN REVIEW DRAFT: do not apply until the pilot data dictionary and role matrix are approved.
-- Apply before the weather and satellite audit-trail migrations.
begin;

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  company_code text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('platform_admin','customer_admin','production_manager','territory_manager','field_officer','viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id),
  unique (company_id, id)
);
create index if not exists company_memberships_user_active_idx
  on public.company_memberships(user_id, is_active, company_id);

create table if not exists public.farmers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  farmer_reference text not null,
  display_name text not null,
  village text not null,
  district text not null,
  state text not null,
  mobile_e164 text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, farmer_reference),
  check (mobile_e164 is null or mobile_e164 ~ '^[+][1-9][0-9]{7,14}$')
);
create index if not exists farmers_location_idx on public.farmers(company_id, state, district, village);

create table if not exists public.crop_seasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  crop text not null check (crop in ('Paddy')),
  season_code text not null,
  season_label text not null,
  state text not null,
  district text not null,
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft','planned','active','closed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, season_code),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  farmer_id uuid not null,
  field_code text not null,
  field_name text,
  village text not null,
  district text not null,
  state text not null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  boundary_geojson jsonb,
  boundary_status text not null default 'unverified' check (boundary_status in ('unverified','pending_review','verified','rejected')),
  boundary_verified_at timestamptz,
  boundary_verified_by uuid references auth.users(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, field_code),
  foreign key (company_id, farmer_id) references public.farmers(company_id, id) on delete restrict,
  check ((boundary_status <> 'verified') or (boundary_geojson is not null and boundary_verified_at is not null and boundary_verified_by is not null))
);
create index if not exists fields_farmer_idx on public.fields(company_id, farmer_id, active);
create index if not exists fields_location_idx on public.fields(company_id, state, district, village);

create table if not exists public.seasonal_field_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  crop_season_id uuid not null,
  field_id uuid not null,
  farmer_id uuid not null,
  seasonal_field_number text not null,
  crop text not null check (crop in ('Paddy')),
  hybrid text not null,
  planting_date date,
  expected_harvest_date date,
  assigned_acres numeric(12,4) check (assigned_acres is null or assigned_acres > 0),
  parent_seed_reference text,
  sap_lot_reference text,
  status text not null default 'planned' check (status in ('planned','active','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, id, crop_season_id),
  unique (crop_season_id, seasonal_field_number),
  foreign key (company_id, crop_season_id) references public.crop_seasons(company_id, id) on delete restrict,
  foreign key (company_id, field_id) references public.fields(company_id, id) on delete restrict,
  foreign key (company_id, farmer_id) references public.farmers(company_id, id) on delete restrict,
  check (expected_harvest_date is null or planting_date is null or expected_harvest_date >= planting_date)
);
create index if not exists seasonal_field_records_season_idx
  on public.seasonal_field_records(company_id, crop_season_id, status);

create table if not exists public.field_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  field_officer_membership_id uuid not null,
  field_id uuid not null,
  crop_season_id uuid,
  starts_on date not null default current_date,
  ends_on date,
  is_active boolean not null default true,
  assigned_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, field_officer_membership_id)
    references public.company_memberships(company_id, id) on delete restrict,
  foreign key (company_id, field_id) references public.fields(company_id, id) on delete restrict,
  foreign key (company_id, crop_season_id) references public.crop_seasons(company_id, id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists field_assignments_officer_active_idx
  on public.field_assignments(company_id, field_officer_membership_id, is_active, starts_on, ends_on);
create index if not exists field_assignments_field_active_idx
  on public.field_assignments(company_id, field_id, is_active);

create or replace function public.validate_seed_field_assignment()
returns trigger language plpgsql as $$
declare member_role text; member_active boolean;
begin
  select role, is_active into member_role, member_active
  from public.company_memberships
  where company_id = new.company_id and id = new.field_officer_membership_id;
  if not found or member_role <> 'field_officer' or member_active is distinct from true then
    raise exception 'field assignment must reference an active field_officer membership in the same company';
  end if;
  return new;
end;
$$;
drop trigger if exists field_assignment_membership_guard on public.field_assignments;
create trigger field_assignment_membership_guard
  before insert or update
  on public.field_assignments
  for each row execute function public.validate_seed_field_assignment();

-- Business designations (TFA, Field Officer, Production Officer, TPL) are deliberately
-- not mapped to platform roles here. Add an approved mapping only after business sign-off.

create table if not exists public.inspection_template_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  crop text not null check (crop in ('Paddy')),
  stage_key text not null check (stage_key in ('first-inspection','vegetative','pre-flowering','flowering','pre-harvesting','harvesting')),
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft','preview_test','submitted_for_approval','approved_scheduled','active','retired')),
  schema_json jsonb not null,
  created_by uuid references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, crop, stage_key, version_number),
  check ((lifecycle_status <> 'active') or (approved_by is not null and approved_at is not null))
);

create table if not exists public.inspection_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  crop_season_id uuid not null,
  seasonal_field_record_id uuid not null,
  stage_key text not null check (stage_key in ('first-inspection','vegetative','pre-flowering','flowering','pre-harvesting','harvesting')),
  template_version_id uuid not null,
  revision_number integer not null default 1 check (revision_number > 0),
  status text not null default 'draft' check (status in ('draft','submitted','approved','returned','withdrawn')),
  answers jsonb not null default '{}'::jsonb,
  submitted_by uuid references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (seasonal_field_record_id, stage_key, revision_number),
  foreign key (company_id, crop_season_id) references public.crop_seasons(company_id, id) on delete restrict,
  foreign key (company_id, seasonal_field_record_id, crop_season_id) references public.seasonal_field_records(company_id, id, crop_season_id) on delete restrict,
  foreign key (company_id, template_version_id) references public.inspection_template_versions(company_id, id) on delete restrict,
  check ((status not in ('submitted','approved')) or (submitted_by is not null and submitted_at is not null)),
  check ((status <> 'approved') or (reviewed_by is not null and reviewed_at is not null))
);
create index if not exists inspection_reports_field_stage_idx
  on public.inspection_reports(company_id, seasonal_field_record_id, stage_key, revision_number desc);
create index if not exists inspection_reports_review_queue_idx
  on public.inspection_reports(company_id, status, submitted_at);

create table if not exists public.inspection_report_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  report_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('created','saved_draft','submitted','approved','returned','withdrawn','revision_created')),
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  foreign key (company_id, report_id) references public.inspection_reports(company_id, id) on delete restrict
);
create index if not exists inspection_report_events_report_idx
  on public.inspection_report_events(company_id, report_id, occurred_at);

create or replace function public.prevent_seed_inspection_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'inspection_report_events is append-only';
end;
$$;
drop trigger if exists inspection_report_events_immutable on public.inspection_report_events;
create trigger inspection_report_events_immutable
  before update or delete on public.inspection_report_events
  for each row execute function public.prevent_seed_inspection_event_mutation();

-- Enable RLS on all tenant and operational tables. There are deliberately no direct
-- anon/authenticated policies in this first draft; approved server-side APIs use
-- service_role only after authenticating and checking company/field scope.
do $$
declare t text;
begin
  foreach t in array array[
    'companies','company_memberships','farmers','crop_seasons','fields',
    'seasonal_field_records','field_assignments','inspection_template_versions',
    'inspection_reports','inspection_report_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

comment on table public.company_memberships is 'Tenant membership and platform authorization role; distinct from business designation.';
comment on table public.fields is 'Stable physical field registry. Boundary status is explicit; a centroid is not a verified polygon.';
comment on table public.seasonal_field_records is 'Field participation in one crop season; separates stable field identity from seasonal crop/hybrid data.';
comment on table public.inspection_template_versions is 'Versioned Paddy inspection templates. Active versions require an approver and approval timestamp.';
comment on table public.inspection_reports is 'Version-pinned six-stage inspection reports; server-side API must enforce sequence, field scope and transitions.';
comment on table public.inspection_report_events is 'Append-only audit events for inspection report lifecycle changes.';

commit;
