\set ON_ERROR_STOP on
-- Synthetic operational transition tests against the real Supabase local stack.
BEGIN;

INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
 ('10000000-0000-0000-0000-000000000101','authenticated','authenticated','ops-manager@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now()),
 ('10000000-0000-0000-0000-000000000102','authenticated','authenticated','territory-manager@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now()),
 ('10000000-0000-0000-0000-000000000103','authenticated','authenticated','company-admin@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.companies(id,name,slug)
VALUES ('10000000-0000-0000-0000-000000000110','Transition Test Company','transition-test-company')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.company_memberships(id,company_id,user_id,role,territory_code,is_active)
VALUES
 ('10000000-0000-0000-0000-000000000111','10000000-0000-0000-0000-000000000110','10000000-0000-0000-0000-000000000101','production_manager',NULL,true),
 ('10000000-0000-0000-0000-000000000112','10000000-0000-0000-0000-000000000110','10000000-0000-0000-0000-000000000102','territory_manager','T-01',true),
 ('10000000-0000-0000-0000-000000000113','10000000-0000-0000-0000-000000000110','10000000-0000-0000-0000-000000000103','customer_admin',NULL,true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.seasons(id,company_id,name)
VALUES ('10000000-0000-0000-0000-000000000114','10000000-0000-0000-0000-000000000110','Synthetic Season')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.production_plans(id,company_id,season_id,plan_reference,status)
VALUES ('10000000-0000-0000-0000-000000000115','10000000-0000-0000-0000-000000000110','10000000-0000-0000-0000-000000000114','PLAN-TEST-001','draft')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.target_allocations(id,company_id,production_plan_id,territory_manager_membership_id,status)
VALUES ('10000000-0000-0000-0000-000000000116','10000000-0000-0000-0000-000000000110','10000000-0000-0000-0000-000000000115','10000000-0000-0000-0000-000000000112','draft')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.grower_upload_batches(id,company_id,season_id,original_filename,status,total_rows,valid_rows,invalid_rows)
VALUES ('10000000-0000-0000-0000-000000000117','10000000-0000-0000-0000-000000000110','10000000-0000-0000-0000-000000000114','synthetic.csv','uploaded',1,1,0)
ON CONFLICT (id) DO NOTHING;

-- Production manager can submit a plan, but cannot approve it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000101',true);
SELECT public.transition_production_plan('10000000-0000-0000-0000-000000000115','submitted'::public.record_status);
DO $test$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.transition_production_plan('10000000-0000-0000-0000-000000000115','approved'::public.record_status);
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'Production plan transition from submitted to approved is not permitted%' THEN
      denied := true;
    ELSE RAISE;
    END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: production manager improperly approved a submitted plan'; END IF;
END $test$;

-- Company admin approves; production manager releases.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000103',true);
SELECT public.transition_production_plan('10000000-0000-0000-0000-000000000115','approved'::public.record_status);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000101',true);
SELECT public.transition_production_plan('10000000-0000-0000-0000-000000000115','released'::public.record_status);

-- Territory manager can submit only the allocation assigned to their own membership.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000102',true);
SELECT public.transition_target_allocation('10000000-0000-0000-0000-000000000116','submitted'::public.record_status);
DO $test$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.transition_target_allocation('10000000-0000-0000-0000-000000000116','released'::public.record_status);
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'Target allocation transition from submitted to released is not permitted%' THEN
      denied := true;
    ELSE RAISE;
    END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: territory manager skipped allocation approval'; END IF;
END $test$;

-- Production manager can approve and release the allocation.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000101',true);
SELECT public.transition_target_allocation('10000000-0000-0000-0000-000000000116','approved'::public.record_status);
SELECT public.transition_target_allocation('10000000-0000-0000-0000-000000000116','released'::public.record_status);

-- Upload review state transitions reconcile counts; a client cannot mark a batch committed.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000101',true);
SELECT public.transition_grower_upload_batch('10000000-0000-0000-0000-000000000117','validating');
SELECT public.transition_grower_upload_batch('10000000-0000-0000-0000-000000000117','preview_ready');
SELECT public.transition_grower_upload_batch('10000000-0000-0000-0000-000000000117','approved');
DO $test$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.transition_grower_upload_batch('10000000-0000-0000-0000-000000000117','committed');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'Commit requires the trusted atomic upload importer%' THEN
      denied := true;
    ELSE RAISE;
    END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: upload batch was marked committed without the trusted importer'; END IF;
END $test$;

RESET ROLE;
DO $test$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.audit_events
   WHERE record_id IN (
     '10000000-0000-0000-0000-000000000115',
     '10000000-0000-0000-0000-000000000116',
     '10000000-0000-0000-0000-000000000117'
   );
  IF n < 8 THEN RAISE EXCEPTION 'FAIL: expected workflow audit events, found %', n; END IF;
END $test$;


-- Storage object policies: a tenant member sees only paths under their company UUID.
RESET ROLE;
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('20000000-0000-0000-0000-000000000201','authenticated','authenticated',
        'storage-other-company@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.companies(id,name,slug)
VALUES ('20000000-0000-0000-0000-000000000210','Storage Other Company','storage-other-company')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.company_memberships(id,company_id,user_id,role,is_active)
VALUES ('20000000-0000-0000-0000-000000000211','20000000-0000-0000-0000-000000000210',
        '20000000-0000-0000-0000-000000000201','customer_admin',true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
VALUES
 ('seed-documents','10000000-0000-0000-0000-000000000110/fields/synthetic-a.pdf',
  '10000000-0000-0000-0000-000000000102','{}'::jsonb),
 ('seed-documents','20000000-0000-0000-0000-000000000210/fields/synthetic-b.pdf',
  '20000000-0000-0000-0000-000000000201','{}'::jsonb)


SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000102',true);
DO $test$
DECLARE own_count integer; other_count integer;
BEGIN
  SELECT count(*) INTO own_count FROM storage.objects
   WHERE name='10000000-0000-0000-0000-000000000110/fields/synthetic-a.pdf';
  SELECT count(*) INTO other_count FROM storage.objects
   WHERE name='20000000-0000-0000-0000-000000000210/fields/synthetic-b.pdf';
  IF own_count <> 1 THEN RAISE EXCEPTION 'FAIL: tenant member cannot read own storage object'; END IF;
  IF other_count <> 0 THEN RAISE EXCEPTION 'FAIL: tenant member can read another company storage object'; END IF;
END $test$;
DO $test$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
    VALUES ('seed-documents','20000000-0000-0000-0000-000000000210/forged/forbidden.pdf',
            '10000000-0000-0000-0000-000000000102','{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: tenant member inserted an object into another company path'; END IF;
END $test$;
DELETE FROM storage.objects
 WHERE bucket_id='seed-documents'
   AND name='10000000-0000-0000-0000-000000000110/fields/synthetic-a.pdf';
RESET ROLE;
DO $test$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='seed-documents'
     AND name='10000000-0000-0000-0000-000000000110/fields/synthetic-a.pdf';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: non-admin tenant member deleted a storage object'; END IF;
END $test$;


-- Trusted onboarding works through service_role; ordinary authenticated users lack EXECUTE.
SET LOCAL ROLE service_role;
SELECT public.bootstrap_customer_company(
  'Trusted Bootstrap Company','trusted-bootstrap-company',
  '10000000-0000-0000-0000-000000000101'
);
SELECT public.provision_company_member(
  (SELECT id FROM public.companies WHERE slug='trusted-bootstrap-company'),
  '10000000-0000-0000-0000-000000000102',
  'territory_manager'::public.member_role,
  'T-02'
);
DO $test$
DECLARE v_company_id uuid; v_membership_id uuid;
BEGIN
  SELECT c.id INTO v_company_id FROM public.companies c WHERE c.slug='trusted-bootstrap-company';
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'FAIL: trusted bootstrap did not create company'; END IF;
  SELECT m.id INTO v_membership_id FROM public.company_memberships m
   WHERE m.company_id=v_company_id AND m.user_id='10000000-0000-0000-0000-000000000102';
  IF v_membership_id IS NULL THEN RAISE EXCEPTION 'FAIL: trusted onboarding did not provision membership'; END IF;
  PERFORM public.deactivate_company_member(v_membership_id);
  IF EXISTS (SELECT 1 FROM public.company_memberships m WHERE m.id=v_membership_id AND m.is_active) THEN
    RAISE EXCEPTION 'FAIL: trusted membership deactivation did not persist';
  END IF;
END $test$;
RESET ROLE;

ROLLBACK;
