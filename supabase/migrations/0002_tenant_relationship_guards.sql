-- Supplemental migration 0002: tenant-consistent relationships.
-- Apply only after migration 0001 has been reviewed and successfully applied.
-- This is defense in depth alongside RLS, not a substitute for authorization tests.

begin;

create or replace function public.assert_related_company(p_parent_table text, p_parent_id uuid, p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_company_id uuid;
begin
  if p_parent_id is null then return; end if;
  execute format('select company_id from public.%I where id = $1', p_parent_table)
    into v_company_id using p_parent_id;
  if v_company_id is null or v_company_id is distinct from p_company_id then
    raise exception 'Related record must exist and belong to the same company';
  end if;
end;
$$;

create or replace function public.assert_same_company_relationships()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare v_role public.member_role;
begin
  case tg_table_name
    when 'hybrids' then
      perform public.assert_related_company('crops', new.crop_id, new.company_id);
    when 'fields' then
      perform public.assert_related_company('seasons', new.season_id, new.company_id);
      perform public.assert_related_company('growers', new.grower_id, new.company_id);
      perform public.assert_related_company('crops', new.crop_id, new.company_id);
      perform public.assert_related_company('hybrids', new.hybrid_id, new.company_id);
    when 'production_plans' then
      perform public.assert_related_company('seasons', new.season_id, new.company_id);
      perform public.assert_related_company('crops', new.crop_id, new.company_id);
      perform public.assert_related_company('hybrids', new.hybrid_id, new.company_id);
    when 'target_allocations' then
      perform public.assert_related_company('production_plans', new.production_plan_id, new.company_id);
      select role into v_role from public.company_memberships
       where id = new.territory_manager_membership_id and company_id = new.company_id and is_active;
      if v_role is distinct from 'territory_manager'::public.member_role then
        raise exception 'Allocation must target an active Territory Manager in the same company';
      end if;
    when 'parent_seed_lots' then
      perform public.assert_related_company('seasons', new.season_id, new.company_id);
      perform public.assert_related_company('crops', new.crop_id, new.company_id);
      perform public.assert_related_company('hybrids', new.hybrid_id, new.company_id);
    when 'parent_seed_distributions' then
      perform public.assert_related_company('parent_seed_lots', new.parent_seed_lot_id, new.company_id);
      perform public.assert_related_company('target_allocations', new.target_allocation_id, new.company_id);
    when 'grower_upload_batches' then
      perform public.assert_related_company('seasons', new.season_id, new.company_id);
    when 'grower_upload_rows' then
      perform public.assert_related_company('grower_upload_batches', new.batch_id, new.company_id);
    when 'field_assignments' then
      perform public.assert_related_company('fields', new.field_id, new.company_id);
      select role into v_role from public.company_memberships
       where id = new.field_officer_membership_id and company_id = new.company_id and is_active;
      if v_role is distinct from 'field_officer'::public.member_role then
        raise exception 'Assignment must target an active Field Officer in the same company';
      end if;
    when 'field_boundaries' then
      perform public.assert_related_company('fields', new.field_id, new.company_id);
    when 'form_versions' then
      perform public.assert_related_company('form_definitions', new.form_definition_id, new.company_id);
    when 'form_sections' then
      perform public.assert_related_company('form_versions', new.form_version_id, new.company_id);
    when 'field_definitions' then
      perform public.assert_related_company('form_versions', new.form_version_id, new.company_id);
      perform public.assert_related_company('form_sections', new.section_id, new.company_id);
    when 'field_options' then
      perform public.assert_related_company('field_definitions', new.field_definition_id, new.company_id);
    when 'form_role_rules' then
      perform public.assert_related_company('form_definitions', new.form_definition_id, new.company_id);
    when 'form_submissions' then
      perform public.assert_related_company('form_definitions', new.form_definition_id, new.company_id);
      perform public.assert_related_company('fields', new.field_id, new.company_id);
      perform public.assert_related_company('form_versions', new.form_version_id, new.company_id);
      if not exists (
        select 1 from public.form_versions v
        where v.id = new.form_version_id
          and v.form_definition_id = new.form_definition_id
          and v.company_id = new.company_id
      ) then
        raise exception 'Submission form version must belong to its form and company';
      end if;
    else
      raise exception 'No tenant relationship rules defined for table %', tg_table_name;
  end case;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'hybrids','fields','production_plans','target_allocations','parent_seed_lots',
    'parent_seed_distributions','grower_upload_batches','grower_upload_rows',
    'field_assignments','field_boundaries','form_versions','form_sections',
    'field_definitions','field_options','form_role_rules','form_submissions'
  ] loop
    execute format(
      'create trigger %I_same_company before insert or update on public.%I for each row execute function public.assert_same_company_relationships()',
      t, t
    );
  end loop;
end $$;

commit;
