-- Supplemental migration 0010: preserve published form versions and their schema.
-- Published definitions are immutable; create a new draft version for changes.
begin;

create or replace function public.guard_published_form_schema()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
  v_status public.form_status;
  v_definition_id uuid;
  v_side text;
begin
  if tg_table_name = 'form_versions' then
    if tg_op = 'DELETE' then
      if old.status = 'published' then
        raise exception 'Published form versions are immutable; create a new version';
      end if;
      return old;
    end if;
    if tg_op = 'UPDATE' and old.status = 'published' then
      if new.company_id is distinct from old.company_id
        or new.form_definition_id is distinct from old.form_definition_id
        or new.version is distinct from old.version
        or new.status is distinct from old.status
        or new.definition_snapshot is distinct from old.definition_snapshot then
        raise exception 'Published form versions are immutable; create a new version';
      end if;
    end if;
    return new;
  end if;

  -- On UPDATE, check both the old and new parent version. Otherwise a child
  -- could be moved out of a published version while changing its definition.
  foreach v_side in array
    case when tg_op = 'INSERT' then array['new']
         when tg_op = 'DELETE' then array['old']
         else array['old','new'] end
  loop
    if v_side = 'old' then
      if tg_table_name in ('form_sections','field_definitions') then
        v_version_id := old.form_version_id;
      elsif tg_table_name = 'field_options' then
        select fd.form_version_id into v_version_id
          from public.field_definitions fd where fd.id = old.field_definition_id;
      end if;
    else
      if tg_table_name in ('form_sections','field_definitions') then
        v_version_id := new.form_version_id;
      elsif tg_table_name = 'field_options' then
        select fd.form_version_id into v_version_id
          from public.field_definitions fd where fd.id = new.field_definition_id;
      end if;
    end if;

    select fv.status into v_status
      from public.form_versions fv where fv.id = v_version_id;

    if v_status = 'published'::public.form_status then
      raise exception 'Published form schema is immutable; create a new form version';
    end if;
    v_version_id := null;
    v_status := null;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['form_versions','form_sections','field_definitions','field_options'] loop
    execute format('drop trigger if exists %I_published_immutable on public.%I', t, t);
    execute format(
      'create trigger %I_published_immutable before update or delete on public.%I for each row execute function public.guard_published_form_schema()',
      t, t
    );
  end loop;
  foreach t in array array['form_sections','field_definitions','field_options'] loop
    execute format('drop trigger if exists %I_published_insert_guard on public.%I', t, t);
    execute format(
      'create trigger %I_published_insert_guard before insert on public.%I for each row execute function public.guard_published_form_schema()',
      t, t
    );
  end loop;
end $$;

revoke all on function public.guard_published_form_schema() from public;
revoke all on function public.guard_published_form_schema() from anon;
revoke all on function public.guard_published_form_schema() from authenticated;

commit;
