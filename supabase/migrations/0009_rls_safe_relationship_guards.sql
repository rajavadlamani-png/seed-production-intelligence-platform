-- Supplemental migration 0009: make tenant relationship trigger checks RLS-safe.
-- SECURITY DEFINER is limited to the trigger function; lock the search path and
-- revoke direct execution. This remains subject to disposable and live-Supabase tests.
begin;

create or replace function public.assert_same_company_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
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

revoke all on function public.assert_related_company(text, uuid, uuid) from public;
revoke all on function public.assert_related_company(text, uuid, uuid) from anon;
revoke all on function public.assert_related_company(text, uuid, uuid) from authenticated;
revoke all on function public.assert_same_company_relationships() from public;
revoke all on function public.assert_same_company_relationships() from anon;
revoke all on function public.assert_same_company_relationships() from authenticated;

commit;
