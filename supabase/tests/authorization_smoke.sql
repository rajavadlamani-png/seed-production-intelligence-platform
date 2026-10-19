-- Authorization smoke tests using synthetic data only.
-- Run after migrations 0001-0005 in the disposable PostgreSQL compatibility environment.
\set ON_ERROR_STOP on
begin;

-- Supabase normally grants these privileges; the disposable harness models that baseline.
grant usage on schema public to authenticated;
grant select, insert, update on public.fields to authenticated;
grant select, insert on public.form_submissions to authenticated;
grant select on public.companies, public.company_memberships, public.seasons,
  public.growers, public.form_definitions, public.form_versions, public.form_role_rules,
  public.field_assignments, public.field_boundaries to authenticated;

insert into auth.users(id) values
 ('10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002')
on conflict do nothing;

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

-- Field Officer Alpha cannot change an unassigned Beta submission, even by knowing its UUID.
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
rollback;
