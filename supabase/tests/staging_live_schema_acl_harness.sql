-- STAGING-ONLY, TRANSACTIONAL TEST HARNESS.
-- Do not run against production. Intended for a verified EMPTY Supabase staging project.
-- The outer transaction is rolled back at the end; no schema or grant changes persist.
-- This is a minimal contract harness, not a production schema dump or deployable migration.

begin;

create schema if not exists private;

create table public.company_memberships (
  id uuid primary key,
  company_id uuid not null,
  user_id uuid not null,
  role_key text not null,
  status text not null
);

create table public.crops (
  id uuid primary key,
  company_id uuid not null,
  crop_code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, crop_code),
  unique (company_id, id)
);

create table public.hybrids (
  id uuid primary key,
  company_id uuid not null,
  crop_id uuid not null,
  hybrid_code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, hybrid_code),
  foreign key (company_id, crop_id)
    references public.crops(company_id, id)
    deferrable initially immediate
);

create or replace function private.has_company_role(p_company_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role_key = any(p_roles)
  );
$function$;

alter table public.crops enable row level security;
alter table public.hybrids enable row level security;

create policy harness_crops_select on public.crops
  for select to authenticated
  using (exists (
    select 1 from public.company_memberships m
    where m.company_id = crops.company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ));

create policy harness_crops_write on public.crops
  for all to authenticated
  using (private.has_company_role(company_id,
    array['company_admin','seed_production_manager','state_head','district_manager']))
  with check (private.has_company_role(company_id,
    array['company_admin','seed_production_manager','state_head','district_manager']));

create policy harness_hybrids_select on public.hybrids
  for select to authenticated
  using (exists (
    select 1 from public.company_memberships m
    where m.company_id = hybrids.company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ));

create policy harness_hybrids_write on public.hybrids
  for all to authenticated
  using (private.has_company_role(company_id,
    array['company_admin','seed_production_manager','state_head','district_manager']))
  with check (private.has_company_role(company_id,
    array['company_admin','seed_production_manager','state_head','district_manager']));

-- Synthetic fixtures only. Never insert real company, grower, or field data.
insert into public.company_memberships (id, company_id, user_id, role_key, status) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','company_admin','active'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-000000000002','company_admin','active');

insert into public.crops (id, company_id, crop_code, name) values
('c1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','SYN-RICE','Synthetic Rice'),
('c2222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','SYN-COTTON','Synthetic Cotton');

insert into public.hybrids (id, company_id, crop_id, hybrid_code, name) values
('d1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','SYN-H1','Synthetic Hybrid One');

-- Baseline assertions: reproduce the excessive privilege pattern without executing
-- DELETE or TRUNCATE. RLS does not constrain TRUNCATE.
grant all privileges on table public.crops, public.hybrids to anon;
grant select, insert, update, delete, truncate on table public.crops, public.hybrids to authenticated;

do $assert_baseline$
begin
  if not has_table_privilege('anon', 'public.crops', 'truncate')
     or not has_table_privilege('anon', 'public.hybrids', 'truncate') then
    raise exception 'Harness baseline did not reproduce anon TRUNCATE grants';
  end if;
  if not has_table_privilege('authenticated', 'public.crops', 'truncate')
     or not has_table_privilege('authenticated', 'public.hybrids', 'truncate') then
    raise exception 'Harness baseline did not reproduce authenticated TRUNCATE grants';
  end if;
end;
$assert_baseline$;

-- Proposed remediation, applied only inside this transaction.
revoke all privileges on table public.crops, public.hybrids from anon;
revoke delete, truncate, references, trigger
  on table public.crops, public.hybrids from authenticated;
grant select, insert, update on table public.crops, public.hybrids to authenticated;

do $assert_remediation$
begin
  if has_table_privilege('anon', 'public.crops', 'select')
     or has_table_privilege('anon', 'public.crops', 'insert')
     or has_table_privilege('anon', 'public.crops', 'update')
     or has_table_privilege('anon', 'public.crops', 'delete')
     or has_table_privilege('anon', 'public.crops', 'truncate')
     or has_table_privilege('anon', 'public.hybrids', 'select')
     or has_table_privilege('anon', 'public.hybrids', 'insert')
     or has_table_privilege('anon', 'public.hybrids', 'update')
     or has_table_privilege('anon', 'public.hybrids', 'delete')
     or has_table_privilege('anon', 'public.hybrids', 'truncate') then
    raise exception 'anon retains an unexpected privilege on crops or hybrids';
  end if;

  if has_table_privilege('authenticated', 'public.crops', 'delete')
     or has_table_privilege('authenticated', 'public.crops', 'truncate')
     or has_table_privilege('authenticated', 'public.hybrids', 'delete')
     or has_table_privilege('authenticated', 'public.hybrids', 'truncate') then
    raise exception 'authenticated retains DELETE or TRUNCATE after remediation';
  end if;

  if not has_table_privilege('authenticated', 'public.crops', 'select')
     or not has_table_privilege('authenticated', 'public.crops', 'insert')
     or not has_table_privilege('authenticated', 'public.crops', 'update')
     or not has_table_privilege('authenticated', 'public.hybrids', 'select')
     or not has_table_privilege('authenticated', 'public.hybrids', 'insert')
     or not has_table_privilege('authenticated', 'public.hybrids', 'update') then
    raise exception 'Expected authenticated SELECT/INSERT/UPDATE grants were lost';
  end if;
end;
$assert_remediation$;

-- No destructive statements are executed. Everything created or granted above
-- is rolled back, leaving the staging project unchanged.
rollback;
