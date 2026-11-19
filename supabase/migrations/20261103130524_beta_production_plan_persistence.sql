create table public.beta_production_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  season_key text not null check (length(btrim(season_key)) > 0),
  plan_data jsonb not null default '{}'::jsonb check (jsonb_typeof(plan_data) = 'object'),
  allocations jsonb not null default '[]'::jsonb check (jsonb_typeof(allocations) = 'array'),
  signoff_file_path text,
  signoff_file_name text,
  status text not null default 'Draft' check (status = any (array['Draft','Saved','Released']::text[])),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, season_key)
);

alter table public.beta_production_plans enable row level security;
grant select, insert, update on public.beta_production_plans to authenticated;
revoke all on public.beta_production_plans from anon;

create policy beta_production_plans_company_select
on public.beta_production_plans for select to authenticated
using (exists (
  select 1 from public.company_memberships m
  where m.company_id = beta_production_plans.company_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
));

create policy beta_production_plans_manager_insert
on public.beta_production_plans for insert to authenticated
with check (
  private.has_company_role(company_id, array['company_admin','seed_production_manager','state_head','district_manager']::text[])
  and updated_by = (select auth.uid())
);

create policy beta_production_plans_manager_update
on public.beta_production_plans for update to authenticated
using (private.has_company_role(company_id, array['company_admin','seed_production_manager','state_head','district_manager']::text[]))
with check (
  private.has_company_role(company_id, array['company_admin','seed_production_manager','state_head','district_manager']::text[])
  and updated_by = (select auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'beta-production-plan-signoffs',
  'beta-production-plan-signoffs',
  false,
  15728640,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
);

create policy beta_plan_signoffs_company_read
on storage.objects for select to authenticated
using (
  bucket_id = 'beta-production-plan-signoffs'
  and private.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['company_admin','seed_production_manager','state_head','district_manager']::text[]
  )
);

create policy beta_plan_signoffs_manager_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'beta-production-plan-signoffs'
  and private.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['company_admin','seed_production_manager','state_head','district_manager']::text[]
  )
);

create policy beta_plan_signoffs_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'beta-production-plan-signoffs'
  and private.has_company_role(
    ((storage.foldername(name))[1])::uuid,
    array['company_admin','seed_production_manager','state_head','district_manager']::text[]
  )
);