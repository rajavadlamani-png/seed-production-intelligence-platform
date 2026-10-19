\set ON_ERROR_STOP on
-- Run against the real Supabase CLI local stack (Auth schema and roles), never the shim.
DO $$
DECLARE
  t text;
  missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','company_memberships','seasons','crops','hybrids','growers',
    'fields','production_plans','target_allocations','parent_seed_lots',
    'parent_seed_distributions','grower_upload_batches','grower_upload_rows',
    'field_assignments','field_boundaries','form_definitions','form_versions',
    'form_sections','field_definitions','field_options','form_role_rules',
    'workflow_definitions','form_submissions','documents','audit_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity
    ) THEN
      missing := array_append(missing, t);
    END IF;
  END LOOP;
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'RLS missing on tenant tables: %', array_to_string(missing, ', ');
  END IF;
END $$;

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') AS config
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('is_company_member','has_company_role','user_can_access_field',
                         'assert_same_company_relationships','transition_form_submission',
                         'transition_production_plan','transition_target_allocation',
                         'transition_grower_upload_batch','bootstrap_customer_company',
                         'provision_company_member','deactivate_company_member')
  LOOP
    IF NOT fn.prosecdef THEN
      RAISE EXCEPTION 'Security helper % must be SECURITY DEFINER', fn.proname;
    END IF;
    IF fn.config NOT LIKE '%search_path=%' THEN
      RAISE EXCEPTION 'Security helper % must pin search_path', fn.proname;
    END IF;
  END LOOP;
END $$;


DO $$
BEGIN
  IF has_function_privilege('authenticated',
       'public.bootstrap_customer_company(text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Ordinary authenticated clients must not execute customer bootstrap';
  END IF;
  IF has_function_privilege('authenticated',
       'public.provision_company_member(uuid,uuid,public.member_role,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Ordinary authenticated clients must not provision memberships';
  END IF;
  IF has_function_privilege('authenticated',
       'public.deactivate_company_member(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Ordinary authenticated clients must not deactivate memberships';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.bootstrap_customer_company(text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Trusted service role must execute customer bootstrap';
  END IF;
END $$;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='seed-documents' AND public = false) THEN
    RAISE EXCEPTION 'seed-documents bucket must exist and be private';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='seed_documents_select_member') THEN
    RAISE EXCEPTION 'Storage tenant SELECT policy is missing';
  END IF;
  IF has_table_privilege('authenticated','public.audit_events','INSERT')
     OR has_table_privilege('authenticated','public.audit_events','UPDATE')
     OR has_table_privilege('authenticated','public.audit_events','DELETE') THEN
    RAISE EXCEPTION 'Authenticated clients must not write or delete audit events directly';
  END IF;
END $$;

-- Confirm the actual Supabase Auth function resolves JWT claims in the local stack.
BEGIN;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $$
BEGIN
  IF auth.uid() IS DISTINCT FROM '10000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'Supabase auth.uid() did not resolve the synthetic JWT subject';
  END IF;
END $$;
ROLLBACK;
