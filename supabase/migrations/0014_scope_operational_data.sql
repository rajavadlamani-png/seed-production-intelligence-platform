-- Close field-boundary visibility gap and scope operational records by field/territory.
begin;

-- Remove the actual policy names introduced by migration 0003; policy names differ
-- from the generic names in the initial baseline.
drop policy if exists growers_update_ops on public.growers;
drop policy if exists target_allocations_update_pm_tm on public.target_allocations;
drop policy if exists parent_seed_lots_insert_ops on public.parent_seed_lots;
drop policy if exists parent_seed_lots_update_ops on public.parent_seed_lots;
drop policy if exists parent_seed_distributions_update_ops on public.parent_seed_distributions;
drop policy if exists parent_seed_distributions_insert_ops on public.parent_seed_distributions;
drop policy if exists grower_upload_batches_insert_pm_tm on public.grower_upload_batches;
drop policy if exists grower_upload_batches_update_pm on public.grower_upload_batches;
drop policy if exists grower_upload_rows_insert_pm_tm on public.grower_upload_rows;
drop policy if exists grower_upload_rows_update_pm on public.grower_upload_rows;

drop policy if exists field_boundaries_select_scoped on public.field_boundaries;
create policy field_boundaries_select_scoped on public.field_boundaries
for select to authenticated
using (public.user_can_access_field(company_id, field_id));

-- Grower master data is visible only to managers or users who can access at least
-- one field belonging to that grower. Field officers may read, but not edit, growers.
drop policy if exists growers_select_member on public.growers;
drop policy if exists growers_update_member on public.growers;
create policy growers_select_scoped on public.growers
for select to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.fields f
     where f.company_id = growers.company_id
       and f.grower_id = growers.id
       and public.user_can_access_field(f.company_id, f.id)
  )
);
create policy growers_update_scoped on public.growers
for update to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.fields f
     where f.company_id = growers.company_id
       and f.grower_id = growers.id
       and f.territory_code is not null
       and exists (
         select 1 from public.company_memberships m
          where m.company_id = f.company_id and m.user_id = auth.uid()
            and m.is_active and m.role = 'territory_manager'::public.member_role
            and m.territory_code = f.territory_code
       )
  )
)
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.fields f
     where f.company_id = growers.company_id
       and f.grower_id = growers.id
       and f.territory_code is not null
       and exists (
         select 1 from public.company_memberships m
          where m.company_id = f.company_id and m.user_id = auth.uid()
            and m.is_active and m.role = 'territory_manager'::public.member_role
            and m.territory_code = f.territory_code
       )
  )
);

-- Target allocations and parent-seed distribution are territory-scoped.
drop policy if exists target_allocations_select_member on public.target_allocations;
drop policy if exists target_allocations_update_member on public.target_allocations;
create policy target_allocations_select_scoped on public.target_allocations
for select to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.company_memberships m
     where m.company_id = target_allocations.company_id and m.user_id = auth.uid()
       and m.is_active and m.role = 'territory_manager'::public.member_role
       and m.id = target_allocations.territory_manager_membership_id
  )
);
create policy target_allocations_update_scoped on public.target_allocations
for update to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.company_memberships m
     where m.company_id = target_allocations.company_id and m.user_id = auth.uid()
       and m.is_active and m.role = 'territory_manager'::public.member_role
       and m.id = target_allocations.territory_manager_membership_id
  )
)
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.company_memberships m
     where m.company_id = target_allocations.company_id and m.user_id = auth.uid()
       and m.is_active and m.role = 'territory_manager'::public.member_role
       and m.id = target_allocations.territory_manager_membership_id
  )
);

drop policy if exists parent_seed_distributions_select_member on public.parent_seed_distributions;
drop policy if exists parent_seed_distributions_update_member on public.parent_seed_distributions;
create policy parent_seed_distributions_select_scoped on public.parent_seed_distributions
for select to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.company_memberships m
     where m.company_id = parent_seed_distributions.company_id and m.user_id = auth.uid()
       and m.is_active and m.role = 'territory_manager'::public.member_role
       and m.territory_code = parent_seed_distributions.destination_territory_code
  )
);
create policy parent_seed_distributions_update_scoped on public.parent_seed_distributions
for update to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.company_memberships m
     where m.company_id = parent_seed_distributions.company_id and m.user_id = auth.uid()
       and m.is_active and m.role = 'territory_manager'::public.member_role
       and m.territory_code = parent_seed_distributions.destination_territory_code
  )
)
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.company_memberships m
     where m.company_id = parent_seed_distributions.company_id and m.user_id = auth.uid()
       and m.is_active and m.role = 'territory_manager'::public.member_role
       and m.territory_code = parent_seed_distributions.destination_territory_code
  )
);

create policy parent_seed_distributions_insert_scoped on public.parent_seed_distributions
for insert to authenticated
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.company_memberships m
     where m.company_id = parent_seed_distributions.company_id and m.user_id = auth.uid()
       and m.is_active and m.role = 'territory_manager'::public.member_role
       and m.territory_code = parent_seed_distributions.destination_territory_code
  )
);

-- Parent seed lots, upload batches/rows and generic documents are not field-worker
-- write surfaces. Keep their operational access to managers/admins until an
-- explicit parent-seed/document linkage model is introduced.
drop policy if exists parent_seed_lots_select_member on public.parent_seed_lots;
drop policy if exists parent_seed_lots_insert_member on public.parent_seed_lots;
drop policy if exists parent_seed_lots_update_member on public.parent_seed_lots;
create policy parent_seed_lots_select_ops on public.parent_seed_lots
for select to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));
create policy parent_seed_lots_insert_ops on public.parent_seed_lots
for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));
create policy parent_seed_lots_update_ops on public.parent_seed_lots
for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

drop policy if exists grower_upload_batches_select_member on public.grower_upload_batches;
drop policy if exists grower_upload_batches_insert_member on public.grower_upload_batches;
drop policy if exists grower_upload_batches_update_member on public.grower_upload_batches;
create policy grower_upload_batches_select_ops on public.grower_upload_batches
for select to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));
create policy grower_upload_batches_insert_ops on public.grower_upload_batches
for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));
create policy grower_upload_batches_update_ops on public.grower_upload_batches
for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

drop policy if exists grower_upload_rows_select_member on public.grower_upload_rows;
drop policy if exists grower_upload_rows_insert_member on public.grower_upload_rows;
drop policy if exists grower_upload_rows_update_member on public.grower_upload_rows;
create policy grower_upload_rows_select_ops on public.grower_upload_rows
for select to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));
create policy grower_upload_rows_insert_ops on public.grower_upload_rows
for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));
create policy grower_upload_rows_update_ops on public.grower_upload_rows
for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));


-- Further narrow generic policies that otherwise OR around scoped policies.
drop policy if exists fields_insert_ops on public.fields;
create policy fields_insert_scoped on public.fields
for insert to authenticated
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or (
    territory_code is not null
    and exists (
      select 1 from public.company_memberships m
       where m.company_id = fields.company_id and m.user_id = auth.uid()
         and m.is_active and m.role = 'territory_manager'::public.member_role
         and m.territory_code = fields.territory_code
    )
  )
);

-- Grower creation/import is manager-owned because growers have no intrinsic territory
-- column; territory managers may update only growers linked to a field in their territory.
drop policy if exists growers_insert_ops on public.growers;
create policy growers_insert_ops_scoped on public.growers
for insert to authenticated
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

-- Assignment administration is restricted to managers or a territory manager acting
-- within their own territory and assigning a field-officer membership from the same company.
drop policy if exists field_assignments_insert_pm_tm on public.field_assignments;
drop policy if exists field_assignments_update_pm_tm on public.field_assignments;
create policy field_assignments_insert_scoped on public.field_assignments
for insert to authenticated
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.fields f
    join public.company_memberships tm
      on tm.company_id=f.company_id and tm.user_id=auth.uid()
     and tm.is_active and tm.role='territory_manager'::public.member_role
     and tm.territory_code=f.territory_code
    join public.company_memberships officer
      on officer.id=field_assignments.field_officer_membership_id
     and officer.company_id=f.company_id and officer.role='field_officer'::public.member_role
    where f.id=field_assignments.field_id and f.company_id=field_assignments.company_id
  )
);
create policy field_assignments_update_scoped on public.field_assignments
for update to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.fields f
    join public.company_memberships tm
      on tm.company_id=f.company_id and tm.user_id=auth.uid()
     and tm.is_active and tm.role='territory_manager'::public.member_role
     and tm.territory_code=f.territory_code
    where f.id=field_assignments.field_id and f.company_id=field_assignments.company_id
  )
)
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.fields f
    join public.company_memberships tm
      on tm.company_id=f.company_id and tm.user_id=auth.uid()
     and tm.is_active and tm.role='territory_manager'::public.member_role
     and tm.territory_code=f.territory_code
    join public.company_memberships officer
      on officer.id=field_assignments.field_officer_membership_id
     and officer.company_id=f.company_id and officer.role='field_officer'::public.member_role
    where f.id=field_assignments.field_id and f.company_id=field_assignments.company_id
  )
);

-- Field boundary creation is permitted only for an accessible field.
drop policy if exists field_boundaries_insert_field_ops on public.field_boundaries;
create policy field_boundaries_insert_scoped on public.field_boundaries
for insert to authenticated
with check (public.user_can_access_field(company_id, field_id));

-- Target allocation creation must bind the allocation to the acting territory manager's
-- own active membership, unless the actor is a production manager/admin.
drop policy if exists target_allocations_insert_pm_tm on public.target_allocations;
create policy target_allocations_insert_scoped on public.target_allocations
for insert to authenticated
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.company_memberships m
     where m.id=target_allocations.territory_manager_membership_id
       and m.company_id=target_allocations.company_id
       and m.user_id=auth.uid() and m.is_active
       and m.role='territory_manager'::public.member_role
  )
);

-- Production plans are visible to operational managers and to territory managers
-- with an allocation against that plan. Audit events are restricted to managers/admins.
drop policy if exists production_plans_select_member on public.production_plans;
create policy production_plans_select_scoped on public.production_plans
for select to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.target_allocations a
    join public.company_memberships m on m.id=a.territory_manager_membership_id
    where a.company_id=production_plans.company_id
      and a.production_plan_id=production_plans.id
      and m.user_id=auth.uid() and m.is_active
      and m.role='territory_manager'::public.member_role
  )
);

drop policy if exists audit_events_select_member on public.audit_events;
create policy audit_events_select_ops on public.audit_events
for select to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

-- Generic documents are not company-wide field-worker data. Field users can read only
-- documents explicitly linked to a field they can access; only managers may insert/update.
drop policy if exists documents_select_member on public.documents;
drop policy if exists documents_insert_ops on public.documents;
drop policy if exists documents_update_admin_pm on public.documents;
create policy documents_select_scoped on public.documents
for select to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or (
    linked_record_type = 'field' and linked_record_id is not null
    and public.user_can_access_field(company_id, linked_record_id)
  )
);
create policy documents_insert_ops_scoped on public.documents
for insert to authenticated
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or (
    linked_record_type = 'field' and linked_record_id is not null
    and public.user_can_access_field(company_id, linked_record_id)
  )
);
create policy documents_update_ops_scoped on public.documents
for update to authenticated
using (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]))
with check (public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[]));

commit;
