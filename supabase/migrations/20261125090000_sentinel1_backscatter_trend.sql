-- Acquisition-level Sentinel-1 backscatter screening observations and user annotations.
-- Additive only: does not alter the existing VWC or SDE tables and policies.

create table if not exists public.s1_backscatter_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_record_id uuid not null references public.beta_field_records(id) on delete cascade,
  field_no text not null,
  acquisition_id text not null,
  acquired_at timestamptz not null,
  relative_orbit integer not null check (relative_orbit between 1 and 175),
  orbit_direction text not null check (orbit_direction in ('ASCENDING','DESCENDING')),
  vv_db numeric not null,
  vh_db numeric not null,
  vv_minus_vh_db numeric not null,
  pixel_count integer not null check (pixel_count > 0),
  buffer_m integer not null check (buffer_m between 10 and 500),
  center_lat numeric not null check (center_lat between -90 and 90),
  center_lon numeric not null check (center_lon between -180 and 180),
  center_method text not null,
  processing_version text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (company_id, field_record_id, acquisition_id, buffer_m, processing_version)
);

create index if not exists s1_backscatter_observations_field_date_idx
  on public.s1_backscatter_observations (company_id, field_record_id, acquired_at);

create table if not exists public.s1_backscatter_annotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_record_id uuid not null references public.beta_field_records(id) on delete cascade,
  field_no text not null,
  event_type text not null check (event_type in ('planting','drainage','harvest')),
  event_date date not null,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists s1_backscatter_annotations_field_date_idx
  on public.s1_backscatter_annotations (company_id, field_record_id, event_date);

alter table public.s1_backscatter_observations enable row level security;
alter table public.s1_backscatter_annotations enable row level security;

drop policy if exists s1_backscatter_observations_member_select on public.s1_backscatter_observations;
create policy s1_backscatter_observations_member_select
  on public.s1_backscatter_observations for select to authenticated
  using (exists (
    select 1 from public.company_memberships m
    where m.company_id = s1_backscatter_observations.company_id
      and m.user_id = auth.uid() and m.status = 'active'
  ));

drop policy if exists s1_backscatter_annotations_member_select on public.s1_backscatter_annotations;
create policy s1_backscatter_annotations_member_select
  on public.s1_backscatter_annotations for select to authenticated
  using (exists (
    select 1 from public.company_memberships m
    where m.company_id = s1_backscatter_annotations.company_id
      and m.user_id = auth.uid() and m.status = 'active'
  ));

drop policy if exists s1_backscatter_annotations_member_insert on public.s1_backscatter_annotations;
create policy s1_backscatter_annotations_member_insert
  on public.s1_backscatter_annotations for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = s1_backscatter_annotations.company_id
        and m.user_id = auth.uid() and m.status = 'active'
    )
    and exists (
      select 1 from public.beta_field_records f
      where f.id = s1_backscatter_annotations.field_record_id
        and f.company_id = s1_backscatter_annotations.company_id
    )
  );

drop policy if exists s1_backscatter_annotations_member_update on public.s1_backscatter_annotations;
create policy s1_backscatter_annotations_member_update
  on public.s1_backscatter_annotations for update to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = s1_backscatter_annotations.company_id
        and m.user_id = auth.uid() and m.status = 'active'
    )
  )
  with check (created_by = auth.uid());

drop policy if exists s1_backscatter_annotations_member_delete on public.s1_backscatter_annotations;
create policy s1_backscatter_annotations_member_delete
  on public.s1_backscatter_annotations for delete to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = s1_backscatter_annotations.company_id
        and m.user_id = auth.uid() and m.status = 'active'
    )
  );

grant select on public.s1_backscatter_observations to authenticated;
grant select, insert, update, delete on public.s1_backscatter_annotations to authenticated;
