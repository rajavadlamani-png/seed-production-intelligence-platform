-- Controlled publication of draft form versions.
begin;

create or replace function public.publish_form_version(p_form_version_id uuid)
returns public.form_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_version public.form_versions%rowtype;
  v_role public.member_role;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select fv.* into v_version
    from public.form_versions fv
   where fv.id = p_form_version_id
   for update;
  if not found then raise exception 'Form version not found'; end if;

  select m.role into v_role
    from public.company_memberships m
   where m.company_id = v_version.company_id
     and m.user_id = v_user
     and m.is_active;
  if v_role not in ('customer_admin'::public.member_role,
                    'platform_admin'::public.member_role) then
    raise exception 'Only an active company admin can publish a form version';
  end if;
  if v_version.status <> 'draft'::public.form_status then
    raise exception 'Only draft form versions can be published';
  end if;
  if pg_catalog.jsonb_typeof(v_version.definition_snapshot) <> 'object'
     or v_version.definition_snapshot = '{}'::jsonb then
    raise exception 'A non-empty form definition snapshot is required';
  end if;
  if not exists (
    select 1 from public.field_definitions fd
     where fd.company_id = v_version.company_id
       and fd.form_version_id = v_version.id
  ) then
    raise exception 'At least one field definition is required before publication';
  end if;
  if not exists (
    select 1 from public.form_role_rules rr
     where rr.company_id = v_version.company_id
       and rr.form_definition_id = v_version.form_definition_id
  ) then
    raise exception 'At least one form role rule is required before publication';
  end if;

  update public.form_versions
     set status = 'published'::public.form_status,
         published_at = pg_catalog.now(),
         published_by = v_user
   where id = v_version.id
   returning * into v_version;

  update public.form_definitions
     set status = 'published'::public.form_status
   where id = v_version.form_definition_id
     and company_id = v_version.company_id;

  insert into public.audit_events(company_id, actor_user_id, action, record_type, record_id, details)
  values (v_version.company_id, v_user, 'form_version_published', 'form_version', v_version.id,
          pg_catalog.jsonb_build_object('form_definition_id', v_version.form_definition_id,
                                        'version', v_version.version));
  return v_version;
end;
$$;

revoke all on function public.publish_form_version(uuid) from public, anon;
grant execute on function public.publish_form_version(uuid) to authenticated;

commit;
