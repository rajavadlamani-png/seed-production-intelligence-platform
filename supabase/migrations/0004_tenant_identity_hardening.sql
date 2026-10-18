-- Supplemental migration 0004: protect tenant identity and company administration.
-- DRAFT ONLY. Do not execute until the full migration set is tested in a disposable project.
-- This does not solve territory-level authorization or workflow transition enforcement.

begin;

-- A record's tenant is immutable after creation. RLS alone does not enforce this
-- when a user legitimately belongs to more than one company.
create or replace function public.prevent_company_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id is immutable; create a new record through an approved transfer workflow';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'company_memberships','seasons','crops','hybrids','growers','fields',
    'production_plans','target_allocations','parent_seed_lots','parent_seed_distributions',
    'grower_upload_batches','grower_upload_rows','field_assignments','field_boundaries',
    'form_definitions','form_versions','form_sections','field_definitions','field_options',
    'form_role_rules','workflow_definitions','form_submissions','documents','audit_events'
  ] loop
    execute format('drop trigger if exists %I_company_id_immutable on public.%I', t, t);
    execute format(
      'create trigger %I_company_id_immutable before update of company_id on public.%I for each row execute function public.prevent_company_id_change()',
      t, t
    );
  end loop;
end $$;

-- Customer administrators should not directly edit company status or slug.
-- Add a trusted server-side function for explicitly allowed profile changes later.
drop policy if exists companies_update_admin on public.companies;

commit;
