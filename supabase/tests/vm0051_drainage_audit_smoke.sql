-- VM0051 drainage event evidence schema and privilege smoke checks.
do $$
declare
  v_rls boolean;
  v_bucket_public boolean;
begin
  select relrowsecurity into v_rls
  from pg_class where oid = 'public.vm0051_drainage_events'::regclass;
  if not coalesce(v_rls,false) then
    raise exception 'RLS is not enabled on vm0051_drainage_events';
  end if;

  select relrowsecurity into v_rls
  from pg_class where oid = 'public.vm0051_drainage_event_evidence'::regclass;
  if not coalesce(v_rls,false) then
    raise exception 'RLS is not enabled on vm0051_drainage_event_evidence';
  end if;

  select relrowsecurity into v_rls
  from pg_class where oid = 'public.vm0051_drainage_event_audit'::regclass;
  if not coalesce(v_rls,false) then
    raise exception 'RLS is not enabled on vm0051_drainage_event_audit';
  end if;

  if has_table_privilege('authenticated','public.vm0051_drainage_event_audit','INSERT')
     or has_table_privilege('authenticated','public.vm0051_drainage_event_audit','UPDATE')
     or has_table_privilege('authenticated','public.vm0051_drainage_event_audit','DELETE') then
    raise exception 'Authenticated clients must not mutate the VM0051 audit trail';
  end if;

  if has_table_privilege('anon','public.vm0051_drainage_events','SELECT')
     or has_table_privilege('anon','public.vm0051_drainage_event_evidence','SELECT')
     or has_table_privilege('anon','public.vm0051_drainage_event_audit','SELECT') then
    raise exception 'Anonymous access must not be granted to VM0051 audit tables';
  end if;

  select b.public into v_bucket_public
  from storage.buckets b where b.id = 'vm0051-audit-evidence';
  if coalesce(v_bucket_public,true) then
    raise exception 'VM0051 evidence bucket must remain private';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.vm0051_drainage_events'::regclass
      and tgname = 'vm0051_drainage_event_audit_log'
      and not tgisinternal
  ) then
    raise exception 'VM0051 event audit trigger is missing';
  end if;
end;
$$;
