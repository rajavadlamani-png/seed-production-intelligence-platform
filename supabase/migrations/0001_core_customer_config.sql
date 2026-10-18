-- Seed Production Intelligence Platform
-- Migration 0001: core multi-tenant model + customer-configurable forms
-- REVIEW BEFORE RUNNING. Prototype baseline only; test in a dedicated project first.
-- Uses Supabase Auth (auth.uid()). Do not put service-role keys in clients.

begin;

create extension if not exists pgcrypto;
create extension if not exists postgis;

-- ---------- Shared enums ----------
create type public.member_role as enum ('platform_admin', 'customer_admin', 'production_manager', 'territory_manager', 'field_officer', 'viewer');
create type public.record_status as enum ('draft', 'submitted', 'approved', 'released', 'superseded', 'retired', 'rejected');
create type public.form_status as enum ('draft', 'published', 'retired');
create type public.field_value_type as enum ('short_text', 'long_text', 'integer', 'decimal', 'boolean', 'date', 'time', 'datetime', 'single_select', 'multi_select', 'photo', 'file', 'gps_point', 'field_polygon', 'lookup', 'calculated');

-- ---------- Tenant and identity ----------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  territory_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index company_memberships_user_idx on public.company_memberships(user_id, company_id) where is_active;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;

create or replace function public.has_company_role(p_company_id uuid, p_roles public.member_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role = any(p_roles)
  );
$$;

-- ---------- Crop and production core ----------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  season_year integer,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('planning','active','closed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, name)
);

create table public.crops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, code)
);

create table public.hybrids (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  crop_id uuid not null references public.crops(id),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, code)
);

create table public.growers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  external_grower_code text,
  full_name text not null,
  phone text,
  village text,
  district text,
  state text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, external_grower_code)
);

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  season_id uuid not null references public.seasons(id),
  grower_id uuid not null references public.growers(id),
  field_code text not null,
  crop_id uuid references public.crops(id),
  hybrid_id uuid references public.hybrids(id),
  declared_acres numeric(12,4),
  net_gps_acres numeric(12,4),
  satellite_estimated_acres numeric(12,4),
  territory_code text,
  village text,
  district text,
  status text not null default 'active' check (status in ('active','inactive','cancelled','completed')),
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, season_id, field_code)
);
create index fields_company_season_idx on public.fields(company_id, season_id);
create index fields_grower_idx on public.fields(company_id, grower_id);

create table public.production_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  season_id uuid not null references public.seasons(id),
  crop_id uuid references public.crops(id),
  hybrid_id uuid references public.hybrids(id),
  plan_reference text not null,
  version integer not null default 1 check (version > 0),
  planned_acres numeric(12,4),
  planned_productivity numeric(14,4),
  productivity_unit text,
  approved_planned_volume numeric(16,4),
  volume_unit text,
  calculated_volume numeric(16,4),
  status public.record_status not null default 'draft',
  notes text,
  signoff_document_id uuid,
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, plan_reference, version)
);

create table public.target_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  production_plan_id uuid not null references public.production_plans(id) on delete cascade,
  territory_manager_membership_id uuid not null references public.company_memberships(id),
  allocated_acres numeric(12,4),
  allocated_volume numeric(16,4),
  volume_unit text,
  status public.record_status not null default 'draft',
  released_by uuid references auth.users(id),
  released_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Parent seed, imports and field assignment ----------
create table public.parent_seed_lots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  season_id uuid not null references public.seasons(id),
  crop_id uuid references public.crops(id),
  hybrid_id uuid references public.hybrids(id),
  lot_code text not null,
  parent_type text not null,
  quantity numeric(16,4),
  quantity_unit text,
  status text not null default 'available',
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id, season_id, lot_code)
);

create table public.parent_seed_distributions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_seed_lot_id uuid not null references public.parent_seed_lots(id),
  target_allocation_id uuid references public.target_allocations(id),
  destination_territory_code text,
  planned_quantity numeric(16,4),
  issued_quantity numeric(16,4),
  dispatched_quantity numeric(16,4),
  received_quantity numeric(16,4),
  quantity_unit text,
  planned_at timestamptz,
  issued_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  receiver_name text,
  status text not null default 'planned' check (status in ('planned','issued','dispatched','partially_received','received','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.grower_upload_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  season_id uuid not null references public.seasons(id),
  original_filename text not null,
  storage_key text,
  file_checksum text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  status text not null default 'uploaded' check (status in ('uploaded','validating','preview_ready','approved','rejected','committed','failed')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  mapping_config jsonb not null default '{}'::jsonb,
  notes text
);

create table public.grower_upload_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  batch_id uuid not null references public.grower_upload_batches(id) on delete cascade,
  source_row_number integer not null,
  source_values jsonb not null,
  normalized_values jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','valid','invalid','accepted','rejected','committed')),
  created_at timestamptz not null default now(),
  unique(batch_id, source_row_number)
);

create table public.field_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade,
  field_officer_membership_id uuid not null references public.company_memberships(id),
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  effective_from date,
  effective_to date,
  status text not null default 'active' check (status in ('active','superseded','cancelled')),
  notes text
);
create index field_assignments_field_idx on public.field_assignments(company_id, field_id);

create table public.field_boundaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade,
  geom geometry(MultiPolygon, 4326),
  measured_acres numeric(12,4),
  capture_method text not null check (capture_method in ('gps_walk','kml_upload','manual','satellite')),
  captured_by uuid references auth.users(id),
  captured_at timestamptz not null default now(),
  gps_accuracy_m numeric(8,3),
  source_filename text,
  is_current boolean not null default true,
  validation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index field_boundaries_geom_idx on public.field_boundaries using gist(geom);

-- ---------- Customer-configurable forms and fields ----------
create table public.form_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_key text not null,
  name text not null,
  description text,
  business_area text not null,
  status public.form_status not null default 'draft',
  current_published_version integer,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, form_key)
);

create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_definition_id uuid not null references public.form_definitions(id) on delete cascade,
  version integer not null check (version > 0),
  status public.form_status not null default 'draft',
  effective_from timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users(id),
  definition_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(form_definition_id, version)
);

create table public.form_sections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_version_id uuid not null references public.form_versions(id) on delete cascade,
  section_key text not null,
  label text not null,
  description text,
  display_order integer not null default 0,
  visibility_rules jsonb not null default '{}'::jsonb,
  unique(form_version_id, section_key)
);

create table public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_version_id uuid not null references public.form_versions(id) on delete cascade,
  section_id uuid references public.form_sections(id) on delete set null,
  field_key text not null,
  label text not null,
  help_text text,
  value_type public.field_value_type not null,
  is_required boolean not null default false,
  is_read_only boolean not null default false,
  default_value jsonb,
  unit text,
  validation_rules jsonb not null default '{}'::jsonb,
  visibility_rules jsonb not null default '{}'::jsonb,
  lookup_config jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(form_version_id, field_key)
);

create table public.field_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_definition_id uuid not null references public.field_definitions(id) on delete cascade,
  option_key text not null,
  label text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  unique(field_definition_id, option_key)
);

create table public.form_role_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_definition_id uuid not null references public.form_definitions(id) on delete cascade,
  role public.member_role not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_submit boolean not null default false,
  can_review boolean not null default false,
  can_approve boolean not null default false,
  unique(form_definition_id, role)
);

create table public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_key text not null,
  name text not null,
  version integer not null default 1,
  status public.form_status not null default 'draft',
  definition jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(company_id, workflow_key, version)
);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_definition_id uuid not null references public.form_definitions(id),
  form_version_id uuid not null references public.form_versions(id),
  record_type text,
  record_id uuid,
  field_id uuid references public.fields(id),
  payload jsonb not null default '{}'::jsonb,
  status public.record_status not null default 'draft',
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index form_submissions_company_form_idx on public.form_submissions(company_id, form_definition_id, created_at desc);
create index form_submissions_payload_gin_idx on public.form_submissions using gin(payload);

-- ---------- Documents and audit ----------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  storage_bucket text not null,
  storage_key text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  linked_record_type text,
  linked_record_id uuid,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(company_id, storage_bucket, storage_key)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  record_type text not null,
  record_id uuid,
  occurred_at timestamptz not null default now(),
  request_id text,
  details jsonb not null default '{}'::jsonb
);
create index audit_events_company_time_idx on public.audit_events(company_id, occurred_at desc);

-- ---------- Basic updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['companies','seasons','growers','fields','production_plans','target_allocations','parent_seed_distributions','form_definitions','form_submissions'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------- RLS ----------
-- Enable RLS on all tenant-owned tables. Policies use membership and role checks.
do $$
declare t text;
begin
  foreach t in array array[
    'companies','company_memberships','seasons','crops','hybrids','growers','fields',
    'production_plans','target_allocations','parent_seed_lots','parent_seed_distributions',
    'grower_upload_batches','grower_upload_rows','field_assignments','field_boundaries',
    'form_definitions','form_versions','form_sections','field_definitions','field_options',
    'form_role_rules','workflow_definitions','form_submissions','documents','audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Company rows: only active members can read; membership administration must be performed
-- through a trusted administrative process until dedicated invite/admin RPCs are added.
create policy companies_select_member on public.companies
for select to authenticated using (public.is_company_member(id));
create policy companies_update_admin on public.companies
for update to authenticated using (public.has_company_role(id, array['customer_admin','platform_admin']::public.member_role[]))
with check (public.has_company_role(id, array['customer_admin','platform_admin']::public.member_role[]));

create policy memberships_select_company on public.company_memberships
for select to authenticated using (public.is_company_member(company_id));
-- Membership creation, role changes and removal are deliberately not exposed to client SQL policies.
-- Add a trusted invitation/admin RPC or server-side workflow before onboarding users.

-- Generic tenant policies. Access requires company membership. Sensitive transitions
-- (approval/release/publication) will need server-side RPCs before production use.
do $$
declare t text;
begin
  foreach t in array array[
    'seasons','crops','hybrids','growers','fields','production_plans','target_allocations',
    'parent_seed_lots','parent_seed_distributions','grower_upload_batches','grower_upload_rows',
    'field_assignments','field_boundaries','form_definitions','form_versions','form_sections',
    'field_definitions','field_options','form_role_rules','workflow_definitions',
    'form_submissions','documents'
  ] loop
    execute format('create policy %I_select_member on public.%I for select to authenticated using (public.is_company_member(company_id))', t, t);
    execute format('create policy %I_insert_member on public.%I for insert to authenticated with check (public.has_company_role(company_id, array[''platform_admin'',''customer_admin'',''production_manager'',''territory_manager'',''field_officer'']::public.member_role[]))', t, t);
    execute format('create policy %I_update_member on public.%I for update to authenticated using (public.has_company_role(company_id, array[''platform_admin'',''customer_admin'',''production_manager'',''territory_manager'',''field_officer'']::public.member_role[])) with check (public.has_company_role(company_id, array[''platform_admin'',''customer_admin'',''production_manager'',''territory_manager'',''field_officer'']::public.member_role[]))', t, t);
  end loop;
end $$;

-- Audit events are intentionally read-only to authenticated clients. Inserts must be performed
-- by trusted server-side functions so clients cannot forge or alter the audit trail.
-- No INSERT, UPDATE or DELETE policy is created for audit_events.

-- Form configuration changes are restricted to customer admins / platform admins.
drop policy form_definitions_insert_member on public.form_definitions;
drop policy form_definitions_update_member on public.form_definitions;
drop policy form_versions_insert_member on public.form_versions;
drop policy form_versions_update_member on public.form_versions;
drop policy form_sections_insert_member on public.form_sections;
drop policy form_sections_update_member on public.form_sections;
drop policy field_definitions_insert_member on public.field_definitions;
drop policy field_definitions_update_member on public.field_definitions;
drop policy field_options_insert_member on public.field_options;
drop policy field_options_update_member on public.field_options;
drop policy form_role_rules_insert_member on public.form_role_rules;
drop policy form_role_rules_update_member on public.form_role_rules;
drop policy workflow_definitions_insert_member on public.workflow_definitions;
drop policy workflow_definitions_update_member on public.workflow_definitions;

create policy form_definitions_insert_admin on public.form_definitions for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));
create policy form_definitions_update_admin on public.form_definitions for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));

create policy form_versions_insert_admin on public.form_versions for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));
create policy form_versions_update_admin on public.form_versions for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));

create policy form_sections_insert_admin on public.form_sections for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));
create policy form_sections_update_admin on public.form_sections for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));

create policy field_definitions_insert_admin on public.field_definitions for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));
create policy field_definitions_update_admin on public.field_definitions for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));

create policy field_options_insert_admin on public.field_options for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));
create policy field_options_update_admin on public.field_options for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));

create policy form_role_rules_insert_admin on public.form_role_rules for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));
create policy form_role_rules_update_admin on public.form_role_rules for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));

create policy workflow_definitions_insert_admin on public.workflow_definitions for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));
create policy workflow_definitions_update_admin on public.workflow_definitions for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));

-- Audit events are intentionally excluded from client write policies; trusted server-side code
-- must append audit events. Membership administration likewise requires a trusted invitation flow.
-- The service role bypasses RLS by design and must only be used in trusted server-side code.
-- This migration intentionally does not create a public company bootstrap or grant anonymous access.
commit;
