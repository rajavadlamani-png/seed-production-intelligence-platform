-- Authorization smoke tests using synthetic data only.
-- Run against the real Supabase CLI local stack after migrations have been applied.
\set ON_ERROR_STOP on
begin;

-- Supabase normally grants these privileges; the disposable harness models that baseline.
grant usage on schema public to authenticated;
grant select, insert, update on public.fields to authenticated;
grant select, insert on public.form_submissions to authenticated;
grant select on public.companies, public.company_memberships, public.seasons,
  public.growers, public.form_definitions, public.form_versions, public.form_role_rules,
  public.field_assignments, public.field_boundaries to authenticated;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
 ('10000000-0000-0000-0000-000000000001','authenticated','authenticated','alpha-officer@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now()),
 ('20000000-0000-0000-0000-000000000002','authenticated','authenticated','beta-officer@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;

insert into public.companies(id,name,slug) values
 ('10000000-0000-0000-0000-000000000010','Synthetic Alpha','synthetic-alpha'),
 ('20000000-0000-0000-0000-000000000020','Synthetic Beta','synthetic-beta')
on conflict do nothing;

insert into public.company_memberships(id,company_id,user_id,role,territory_code,is_active) values
 ('10000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000001','field_officer',null,true),
 ('20000000-0000-0000-0000-000000000021','20000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000002','field_officer',null,true)
on conflict do nothing;

insert into public.seasons(id,company_id,name) values
 ('10000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000010','Test Season'),
 ('20000000-0000-0000-0000-000000000022','20000000-0000-0000-0000-000000000020','Test Season')
on conflict do nothing;

insert into public.growers(id,company_id,full_name) values
 ('10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000010','Synthetic Alpha Grower'),
 ('20000000-0000-0000-0000-000000000023','20000000-0000-0000-0000-000000000020','Synthetic Beta Grower')
on conflict do nothing;

insert into public.fields(id,company_id,season_id,grower_id,field_code,territory_code) values
 ('10000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000013','ALPHA-F1','T1'),
 ('20000000-0000-0000-0000-000000000024','20000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000022','20000000-0000-0000-0000-000000000023','BETA-F1','T9')
on conflict do nothing;

insert into public.field_assignments(company_id,field_id,field_officer_membership_id,status) values
 ('10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000011','active'),
 ('20000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000024','20000000-0000-0000-0000-000000000021','active');

insert into public.form_definitions(id,company_id,form_key,name,business_area,status) values
 ('10000000-0000-0000-0000-000000000015','10000000-0000-0000-0000-000000000010','field-check','Field Check','inspection','published'),
 ('20000000-0000-0000-0000-000000000025','20000000-0000-0000-0000-000000000020','field-check','Field Check','inspection','published')
on conflict do nothing;

insert into public.form_versions(id,company_id,form_definition_id,version,status,definition_snapshot) values
 ('10000000-0000-0000-0000-000000000016','10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000015',1,'published','{}'),
 ('20000000-0000-0000-0000-000000000026','20000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000025',1,'published','{}')
on conflict do nothing;

insert into public.form_role_rules(company_id,form_definition_id,role,can_view,can_edit) values
 ('10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000015','field_officer',true,true),
 ('20000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000025','field_officer',true,true)
on conflict do nothing;

insert into public.form_submissions(id,company_id,form_definition_id,form_version_id,field_id,payload,status) values
 ('10000000-0000-0000-0000-000000000017','10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000015','10000000-0000-0000-0000-000000000016','10000000-0000-0000-0000-000000000014','{"synthetic":"alpha"}','draft'),
 ('20000000-0000-0000-0000-000000000027','20000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000025','20000000-0000-0000-0000-000000000026','20000000-0000-0000-0000-000000000024','{"synthetic":"beta"}','draft')
on conflict do nothing;

-- A second draft version is reserved for the direct-publish permission test.
insert into public.form_versions(id,company_id,form_definition_id,version,status,definition_snapshot) values
 ('10000000-0000-0000-0000-000000000030','10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000015',2,'draft','{}')
on conflict do nothing;

-- Cross-company relationship guard: a field in Alpha cannot reference Beta's grower.
do $test$
declare actual_error text;
begin
  begin
    insert into public.fields(id,company_id,season_id,grower_id,field_code,territory_code)
    values ('10000000-0000-0000-0000-000000000028',
      '10000000-0000-0000-0000-000000000010',
      '10000000-0000-0000-0000-000000000012',
      '20000000-0000-0000-0000-000000000023',
      'CROSS-TENANT-GROWER','T1');
  exception when others then
    get stacked diagnostics actual_error = message_text;
  end;
  if actual_error is distinct from 'Related record must exist and belong to the same company' then
    raise exception 'FAIL: cross-company grower relationship failed for an unexpected reason: %', coalesce(actual_error, 'no error');
  end if;
end $test$;

-- Field Officer Alpha must see its assigned Alpha field, never Beta's field or submission.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);

-- Authenticated clients cannot publish a draft version by directly updating status.
do $test$
declare denied boolean := false;
begin
  begin
    update public.form_versions set status='published'
    where id='10000000-0000-0000-0000-000000000030';
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: direct form-version publication was not blocked';
  end if;
end $test$;
-- Relationship validation must still detect cross-company references under RLS.
do $test$
declare actual_error text;
begin
  begin
    insert into public.fields(id,company_id,season_id,grower_id,field_code,territory_code)
    values ('10000000-0000-0000-0000-000000000029',
      '10000000-0000-0000-0000-000000000010',
      '10000000-0000-0000-0000-000000000012',
      '20000000-0000-0000-0000-000000000023',
      'CROSS-TENANT-AUTH-TEST','T1');
  exception when others then
    get stacked diagnostics actual_error = message_text;
  end;
  if actual_error is distinct from 'Related record must exist and belong to the same company' then
    raise exception 'FAIL: authenticated cross-company relationship was not rejected by the tenant guard: %', coalesce(actual_error, 'no error');
  end if;
end $test$;
do $test$
declare n integer;
begin
 select count(*) into n from public.fields where id='10000000-0000-0000-0000-000000000014';
 if n <> 1 then raise exception 'FAIL: Alpha officer cannot see assigned Alpha field'; end if;
 select count(*) into n from public.fields where id='20000000-0000-0000-0000-000000000024';
 if n <> 0 then raise exception 'FAIL: Alpha officer can see Beta field'; end if;
 select count(*) into n from public.form_submissions where id='10000000-0000-0000-0000-000000000017';
 if n <> 1 then raise exception 'FAIL: Alpha officer cannot see permitted Alpha submission'; end if;
 select count(*) into n from public.form_submissions where id='20000000-0000-0000-0000-000000000027';
 if n <> 0 then raise exception 'FAIL: Alpha officer can see Beta submission'; end if;
end $test$;

-- Published form versions cannot be edited directly; execute as the database owner
-- so the test exercises the trigger rather than being masked by RLS or table grants.
reset role;
do $test$
declare denied boolean := false;
begin
  begin
    update public.form_versions set definition_snapshot='{"tampered":true}'
    where id='10000000-0000-0000-0000-000000000016';
  exception when others then
    if sqlerrm = 'Published form versions are immutable; create a new version' then
      denied := true;
    else
      raise;
    end if;
  end;
  if not denied then
    raise exception 'FAIL: published form version was editable';
  end if;
end $test$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);

-- Submission creation must honor form_role_rules.can_create/can_submit.
do $test$
declare denied boolean := false;
begin
  begin
    insert into public.form_submissions(id,company_id,form_definition_id,form_version_id,field_id,payload,status)
    values ('10000000-0000-0000-0000-000000000018',
      '10000000-0000-0000-0000-000000000010',
      '10000000-0000-0000-0000-000000000015',
      '10000000-0000-0000-0000-000000000016',
      '10000000-0000-0000-0000-000000000014',
      '{"synthetic":"must-be-denied"}','draft');
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: Field Officer created a submission without can_create/can_submit';
  end if;
end $test$;

reset role;
update public.form_role_rules
set can_create = true
where company_id='10000000-0000-0000-0000-000000000010'
  and form_definition_id='10000000-0000-0000-0000-000000000015'
  and role='field_officer';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
insert into public.form_submissions(id,company_id,form_definition_id,form_version_id,field_id,payload,status)
values ('10000000-0000-0000-0000-000000000019',
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000015',
  '10000000-0000-0000-0000-000000000016',
  '10000000-0000-0000-0000-000000000014',
  '{"synthetic":"permitted-create"}','draft');

-- Field Officer Alpha cannot directly change lifecycle status; only payload updates are granted.
do $test$
declare denied boolean := false;
begin
  begin
    update public.form_submissions set status='submitted'
    where id='10000000-0000-0000-0000-000000000019';
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: direct lifecycle status update was not blocked';
  end if;
end $test$;

-- Authorized payload-only edits must remain possible.
update public.form_submissions set payload='{"synthetic":"payload-updated"}'
where id='10000000-0000-0000-0000-000000000019';
do $test$
declare actual jsonb;
begin
 select payload into actual from public.form_submissions where id='10000000-0000-0000-0000-000000000019';
 if actual is distinct from '{"synthetic":"payload-updated"}'::jsonb then
   raise exception 'FAIL: permitted payload update did not persist';
 end if;
end $test$;

-- Lifecycle transitions must use the validated RPC and the form-specific permission.
reset role;
update public.form_role_rules set can_submit = true
where company_id='10000000-0000-0000-0000-000000000010'
  and form_definition_id='10000000-0000-0000-0000-000000000015'
  and role='field_officer';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.transition_form_submission(
  '10000000-0000-0000-0000-000000000019',
  'submitted'::public.record_status
);
do $test$
declare actual_status public.record_status;
begin
  select status into actual_status from public.form_submissions
   where id='10000000-0000-0000-0000-000000000019';
  if actual_status is distinct from 'submitted'::public.record_status then
    raise exception 'FAIL: validated submit transition did not update status';
  end if;
end $test$;

-- A Field Officer cannot skip review and release a submitted record.
do $test$
declare denied boolean := false;
begin
  begin
    perform public.transition_form_submission(
      '10000000-0000-0000-0000-000000000019',
      'released'::public.record_status
    );
  exception when others then
    if sqlerrm like 'Transition from submitted to released is not permitted%' then
      denied := true;
    else
      raise;
    end if;
  end;
  if not denied then
    raise exception 'FAIL: invalid submission transition was accepted';
  end if;
end $test$;
reset role;
do $test$
declare v_action text; v_details jsonb;
begin
  select action, details into v_action, v_details
    from public.audit_events
   where record_type='form_submission'
     and record_id='10000000-0000-0000-0000-000000000019'
   order by occurred_at desc limit 1;
  if v_action is distinct from 'form_submission_status_transition'
     or v_details->>'from_status' is distinct from 'draft'
     or v_details->>'to_status' is distinct from 'submitted' then
    raise exception 'FAIL: lifecycle transition audit event missing or incorrect';
  end if;
end $test$;

-- Field Officer Alpha cannot change an unassigned Beta submission, even by knowing its UUID.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
update public.form_submissions set payload='{"tampered":true}'
where id='20000000-0000-0000-0000-000000000027';
reset role;
do $test$
declare actual jsonb;
begin
 select payload into actual from public.form_submissions where id='20000000-0000-0000-0000-000000000027';
 if actual is distinct from '{"synthetic":"beta"}'::jsonb then
   raise exception 'FAIL: cross-tenant update changed Beta submission';
 end if;
end $test$;
-- Cross-tenant update and direct-delete negative tests (synthetic records only).
-- Knowing another tenant's UUID must not grant access or mutate its field.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
update public.fields
   set field_code='TAMPERED-BETA-FIELD'
 where id='20000000-0000-0000-0000-000000000024';
reset role;
do $test$
declare actual_code text;
begin
  select field_code into actual_code from public.fields
   where id='20000000-0000-0000-0000-000000000024';
  if actual_code is distinct from 'BETA-F1' then
    raise exception 'FAIL: Alpha Field Officer modified a known Beta field UUID';
  end if;
end $test$;

-- Direct deletion of an assigned submission must be denied to a Field Officer.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $test$
declare denied boolean := false;
begin
  begin
    delete from public.form_submissions
     where id='10000000-0000-0000-0000-000000000017';
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'FAIL: Field Officer directly deleted a form submission';
  end if;
end $test$;
reset role;
do $test$
declare n integer;
begin
  select count(*) into n from public.form_submissions
   where id='10000000-0000-0000-0000-000000000017';
  if n <> 1 then
    raise exception 'FAIL: direct-delete denial test did not preserve the submission';
  end if;
end $test$;

-- Territory boundary tests: a Field Officer needs an active assignment; a Territory Manager
-- sees only fields matching their own active territory, even within the same company.
reset role;
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('10000000-0000-0000-0000-000000000031','authenticated','authenticated',
        'alpha-territory-manager@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;

insert into public.company_memberships(id,company_id,user_id,role,territory_code,is_active)
values ('10000000-0000-0000-0000-000000000032',
        '10000000-0000-0000-0000-000000000010',
        '10000000-0000-0000-0000-000000000031',
        'territory_manager','T1',true)
on conflict (id) do nothing;

insert into public.fields(id,company_id,season_id,grower_id,field_code,territory_code) values
 ('10000000-0000-0000-0000-000000000033',
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000013',
  'ALPHA-T2-FIELD','T2'),
 ('10000000-0000-0000-0000-000000000034',
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000013',
  'ALPHA-T1-UNASSIGNED','T1')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $test$
declare n integer;
begin
  select count(*) into n from public.fields where id='10000000-0000-0000-0000-000000000033';
  if n <> 0 then raise exception 'FAIL: Field Officer read a field in another territory'; end if;
  select count(*) into n from public.fields where id='10000000-0000-0000-0000-000000000034';
  if n <> 0 then raise exception 'FAIL: Field Officer read an unassigned field in their own territory'; end if;
end $test$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000031',true);
do $test$
declare n integer;
begin
  select count(*) into n from public.fields where id='10000000-0000-0000-0000-000000000014';
  if n <> 1 then raise exception 'FAIL: Territory Manager cannot read a field in their territory'; end if;
  select count(*) into n from public.fields where id='10000000-0000-0000-0000-000000000033';
  if n <> 0 then raise exception 'FAIL: Territory Manager read a field in another territory'; end if;
end $test$;


-- Upload batches must never be marked committed until a trusted atomic importer exists.
reset role;
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('10000000-0000-0000-0000-000000000040','authenticated','authenticated',
        'alpha-production-manager@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;

insert into public.company_memberships(id,company_id,user_id,role,territory_code,is_active)
values ('10000000-0000-0000-0000-000000000041',
        '10000000-0000-0000-0000-000000000010',
        '10000000-0000-0000-0000-000000000040',
        'production_manager',null,true)
on conflict (id) do nothing;

insert into public.grower_upload_batches(
  id, company_id, season_id, original_filename, status, total_rows, valid_rows, invalid_rows
) values (
  '10000000-0000-0000-0000-000000000042',
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000012',
  'synthetic-upload.csv', 'uploaded', 2, 2, 0
)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000040',true);
select public.transition_grower_upload_batch(
  '10000000-0000-0000-0000-000000000042', 'validating'
);
select public.transition_grower_upload_batch(
  '10000000-0000-0000-0000-000000000042', 'preview_ready'
);
select public.transition_grower_upload_batch(
  '10000000-0000-0000-0000-000000000042', 'approved'
);

do $test$
declare denied boolean := false;
begin
  begin
    perform public.transition_grower_upload_batch(
      '10000000-0000-0000-0000-000000000042', 'committed'
    );
  exception when others then
    if sqlerrm = 'Commit requires the trusted atomic upload importer; direct status transition is prohibited' then
      denied := true;
    else
      raise;
    end if;
  end;
  if not denied then
    raise exception 'FAIL: upload batch could be committed without the trusted atomic importer';
  end if;
end $test$;

reset role;
do $test$
declare actual_status text;
begin
  select status into actual_status from public.grower_upload_batches
   where id='10000000-0000-0000-0000-000000000042';
  if actual_status is distinct from 'approved' then
    raise exception 'FAIL: rejected commit attempt changed upload batch status';
  end if;
end $test$;


-- Production-plan lifecycle is role-gated and auditable: Field Officer denied, Production Manager allowed.
reset role;
insert into public.production_plans(
  id, company_id, season_id, plan_reference, version, status, created_by
) values (
  '10000000-0000-0000-0000-000000000043',
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000012',
  'SYNTHETIC-PLAN-001', 1, 'draft',
  '10000000-0000-0000-0000-000000000040'
)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $test$
declare denied boolean := false;
begin
  begin
    perform public.transition_production_plan(
      '10000000-0000-0000-0000-000000000043',
      'submitted'::public.record_status
    );
  exception when others then
    if sqlerrm like 'Production plan transition from draft to submitted is not permitted%' then
      denied := true;
    else
      raise;
    end if;
  end;
  if not denied then
    raise exception 'FAIL: Field Officer transitioned a production plan';
  end if;
end $test$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000040',true);
select public.transition_production_plan(
  '10000000-0000-0000-0000-000000000043',
  'submitted'::public.record_status
);
reset role;

do $test$
declare actual_status public.record_status; v_action text; v_details jsonb;
begin
  select status into actual_status from public.production_plans
   where id='10000000-0000-0000-0000-000000000043';
  if actual_status is distinct from 'submitted'::public.record_status then
    raise exception 'FAIL: permitted Production Manager plan transition did not persist';
  end if;
  select action, details into v_action, v_details from public.audit_events
   where record_type='production_plan'
     and record_id='10000000-0000-0000-0000-000000000043'
   order by occurred_at desc limit 1;
  if v_action is distinct from 'production_plan_status_transition'
     or v_details->>'from_status' is distinct from 'draft'
     or v_details->>'to_status' is distinct from 'submitted' then
    raise exception 'FAIL: production plan transition audit event missing or incorrect';
  end if;
end $test$;


-- Target allocation transitions must be limited to the assigned Territory Manager and audited.
reset role;
insert into public.production_plans(
  id, company_id, season_id, plan_reference, version, status
) values (
  '10000000-0000-0000-0000-000000000044',
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000012',
  'SYNTHETIC-PLAN-ALLOC-001', 1, 'draft'
)
on conflict (id) do nothing;

insert into public.target_allocations(
  id, company_id, production_plan_id, territory_manager_membership_id, status
) values (
  '10000000-0000-0000-0000-000000000045',
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000044',
  '10000000-0000-0000-0000-000000000032',
  'draft'
)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $test$
declare denied boolean := false;
begin
  begin
    perform public.transition_target_allocation(
      '10000000-0000-0000-0000-000000000045',
      'submitted'::public.record_status
    );
  exception when others then
    if sqlerrm like 'Target allocation transition from draft to submitted is not permitted%' then
      denied := true;
    else
      raise;
    end if;
  end;
  if not denied then
    raise exception 'FAIL: Field Officer transitioned a target allocation';
  end if;
end $test$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000031',true);
select public.transition_target_allocation(
  '10000000-0000-0000-0000-000000000045',
  'submitted'::public.record_status
);
reset role;

do $test$
declare actual_status public.record_status; v_action text; v_details jsonb;
begin
  select status into actual_status from public.target_allocations
   where id='10000000-0000-0000-0000-000000000045';
  if actual_status is distinct from 'submitted'::public.record_status then
    raise exception 'FAIL: assigned Territory Manager target-allocation transition did not persist';
  end if;
  select action, details into v_action, v_details from public.audit_events
   where record_type='target_allocation'
     and record_id='10000000-0000-0000-0000-000000000045'
   order by occurred_at desc limit 1;
  if v_action is distinct from 'target_allocation_status_transition'
     or v_details->>'from_status' is distinct from 'draft'
     or v_details->>'to_status' is distinct from 'submitted' then
    raise exception 'FAIL: target allocation transition audit event missing or incorrect';
  end if;
end $test$;


-- Form publication is admin-only, requires a configured draft, and emits an audit event.
reset role;
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('10000000-0000-0000-0000-000000000050','authenticated','authenticated',
        'alpha-customer-admin@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;

insert into public.company_memberships(id,company_id,user_id,role,territory_code,is_active)
values ('10000000-0000-0000-0000-000000000051',
        '10000000-0000-0000-0000-000000000010',
        '10000000-0000-0000-0000-000000000050',
        'customer_admin',null,true)
on conflict (id) do nothing;

insert into public.field_definitions(
  id, company_id, form_version_id, field_key, label, value_type, is_required
) values (
  '10000000-0000-0000-0000-000000000052',
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000030',
  'synthetic_observation', 'Synthetic Observation',
  'short_text', true
)
on conflict (id) do nothing;

update public.form_versions
   set definition_snapshot='{"title":"Synthetic Draft","fields":["synthetic_observation"]}'::jsonb
 where id='10000000-0000-0000-0000-000000000030';

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $test$
declare denied boolean := false;
begin
  begin
    perform public.publish_form_version('10000000-0000-0000-0000-000000000030');
  exception when others then
    if sqlerrm = 'Only an active company admin can publish a form version' then
      denied := true;
    else
      raise;
    end if;
  end;
  if not denied then
    raise exception 'FAIL: Field Officer published a form version';
  end if;
end $test$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000050',true);
select public.publish_form_version('10000000-0000-0000-0000-000000000030');
reset role;

do $test$
declare actual_status public.form_status; v_action text; v_record uuid;
begin
  select status into actual_status from public.form_versions
   where id='10000000-0000-0000-0000-000000000030';
  if actual_status is distinct from 'published'::public.form_status then
    raise exception 'FAIL: customer admin could not publish a valid draft form';
  end if;
  select action, record_id into v_action, v_record from public.audit_events
   where record_type='form_version'
     and record_id='10000000-0000-0000-0000-000000000030'
   order by occurred_at desc limit 1;
  if v_action is distinct from 'form_version_published'
     or v_record is distinct from '10000000-0000-0000-0000-000000000030'::uuid then
    raise exception 'FAIL: form publication audit event missing or incorrect';
  end if;
end $test$;

reset role;

-- Tenant identity hardening: RLS should hide out-of-scope rows from a normal
-- authenticated update; separately, the trigger itself must reject a tenant move
-- when exercised by the privileged test role (to distinguish trigger coverage from RLS).
set local role postgres;
do $test$
declare denied boolean := false;
begin
  begin
    update public.fields
       set company_id='20000000-0000-0000-0000-000000000020'
     where id='10000000-0000-0000-0000-000000000014';
  exception when others then
    if sqlerrm = 'company_id is immutable; create a new record through an approved transfer workflow' then
      denied := true;
    else
      raise;
    end if;
  end;
  if not denied then
    raise exception 'FAIL: immutable company_id trigger did not reject tenant move';
  end if;
end $test$;
reset role;
do $test$
declare actual_company uuid;
begin
  select company_id into actual_company from public.fields
   where id='10000000-0000-0000-0000-000000000014';
  if actual_company is distinct from '10000000-0000-0000-0000-000000000010'::uuid then
    raise exception 'FAIL: attempted tenant move changed the field company_id';
  end if;
end $test$;

-- Company administration guard: customer admins cannot directly change a
-- company's identity (slug). Such changes must use a future trusted procedure.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000050',true);
-- RLS may reject this UPDATE by filtering the target row (UPDATE 0)
-- rather than raising an exception. Verify the effective outcome below.
update public.companies
   set slug='tampered-alpha'
 where id='10000000-0000-0000-0000-000000000010';
reset role;
do $test$
declare actual_slug text;
begin
  select slug into actual_slug from public.companies
   where id='10000000-0000-0000-0000-000000000010';
  if actual_slug is distinct from 'synthetic-alpha' then
    raise exception 'FAIL: denied company slug update changed the slug';
  end if;
end $test$;

rollback;
