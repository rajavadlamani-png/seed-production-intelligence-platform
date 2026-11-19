begin;

-- Compatibility columns keep this migration reproducible from the repository's
-- earlier baseline while remaining no-ops on the deployed Beta schema.
alter table public.company_memberships
  add column if not exists role_key text not null default 'company_admin',
  add column if not exists status text not null default 'active';

create schema if not exists private;

create or replace function private.has_company_role(p_company_id uuid, p_allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role_key = any(p_allowed_roles)
  );
$$;

revoke all on function private.has_company_role(uuid,text[]) from public, anon;
grant execute on function private.has_company_role(uuid,text[]) to authenticated;

create table public.beta_field_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  season_key text not null default 'Kharif 2026',
  field_no text not null check (length(btrim(field_no)) > 0),
  record_data jsonb not null check (jsonb_typeof(record_data) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, season_key, field_no)
);

create index beta_field_records_company_updated_idx
  on public.beta_field_records(company_id, updated_at desc);

alter table public.beta_field_records enable row level security;
revoke all on public.beta_field_records from anon, authenticated;
grant select, insert, update on public.beta_field_records to authenticated;

create policy beta_field_records_company_select
on public.beta_field_records for select to authenticated
using (exists (
  select 1 from public.company_memberships m
  where m.company_id = beta_field_records.company_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
));

create policy beta_field_records_company_insert
on public.beta_field_records for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and exists (
    select 1 from public.company_memberships m
    where m.company_id = beta_field_records.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

create policy beta_field_records_company_update
on public.beta_field_records for update to authenticated
using (exists (
  select 1 from public.company_memberships m
  where m.company_id = beta_field_records.company_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
))
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.company_memberships m
    where m.company_id = beta_field_records.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

commit;
