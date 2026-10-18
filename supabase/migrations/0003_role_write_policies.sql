-- Supplemental migration 0003: role-specific client write permissions.
-- Apply only after migrations 0001 and 0002 have been reviewed and successfully applied.
-- This narrows client writes. Approval, release, form publication and onboarding should be
-- implemented as trusted server-side functions after this baseline is tested.

begin;

-- Remove broad generic client write policies from tables where workflow ownership matters.
do $$
declare t text;
begin
  foreach t in array array[
    'seasons','crops','hybrids','growers','fields','production_plans','target_allocations',
    'parent_seed_lots','parent_seed_distributions','grower_upload_batches','grower_upload_rows',
    'field_assignments','field_boundaries','form_submissions','documents'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert_member', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_member', t);
  end loop;
end $$;

-- Customer administrators may maintain reference data and operational records during setup.
-- Workflow transitions such as approval/release must be moved to validated RPCs before production.
create policy seasons_insert_admin_pm on public.seasons for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));
create policy seasons_update_admin_pm on public.seasons for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

create policy crops_insert_admin on public.crops for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));
create policy crops_update_admin on public.crops for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));

create policy hybrids_insert_admin on public.hybrids for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));
create policy hybrids_update_admin on public.hybrids for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin']::public.member_role[]));

create policy growers_insert_ops on public.growers for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));
create policy growers_update_ops on public.growers for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));

create policy fields_insert_ops on public.fields for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));
create policy fields_update_ops on public.fields for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));

create policy production_plans_insert_pm on public.production_plans for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));
create policy production_plans_update_pm on public.production_plans for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

create policy target_allocations_insert_pm_tm on public.target_allocations for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));
create policy target_allocations_update_pm_tm on public.target_allocations for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

create policy parent_seed_lots_insert_ops on public.parent_seed_lots for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));
create policy parent_seed_lots_update_ops on public.parent_seed_lots for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));

create policy parent_seed_distributions_insert_ops on public.parent_seed_distributions for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));
create policy parent_seed_distributions_update_ops on public.parent_seed_distributions for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));

create policy grower_upload_batches_insert_pm_tm on public.grower_upload_batches for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));
create policy grower_upload_batches_update_pm on public.grower_upload_batches for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

create policy grower_upload_rows_insert_pm_tm on public.grower_upload_rows for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));
create policy grower_upload_rows_update_pm on public.grower_upload_rows for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

create policy field_assignments_insert_pm_tm on public.field_assignments for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));
create policy field_assignments_update_pm_tm on public.field_assignments for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager']::public.member_role[]));

create policy field_boundaries_insert_field_ops on public.field_boundaries for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager','field_officer']::public.member_role[]));
create policy field_boundaries_update_field_ops on public.field_boundaries for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager','field_officer']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager','field_officer']::public.member_role[]));

create policy form_submissions_insert_field_ops on public.form_submissions for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager','field_officer']::public.member_role[]));
create policy form_submissions_update_field_ops on public.form_submissions for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager','field_officer']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager','field_officer']::public.member_role[]));

create policy documents_insert_ops on public.documents for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager','territory_manager','field_officer']::public.member_role[]));
create policy documents_update_admin_pm on public.documents for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

-- Deliberately no client DELETE policies. Use controlled archival/retirement workflows.
-- This baseline still requires territory-level row filters and server-side transition RPCs
-- before it is production-ready. Do not treat these policies alone as complete authorization.

commit;
