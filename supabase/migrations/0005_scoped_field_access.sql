-- Supplemental migration 0005: scoped field and submission access.
-- DRAFT ONLY: review and test in a disposable Supabase project before execution.
-- This adds territory/assignment scoping to key field-level tables. It is not a
-- complete authorization model for every tenant table or a substitute for testing.

begin;

-- SECURITY DEFINER helper avoids recursive RLS between fields and field_assignments.
-- The function returns only a boolean and exposes no membership or assignment rows.
create or replace function public.user_can_access_field(p_company_id uuid, p_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.company_memberships m
      where m.company_id = p_company_id and m.user_id = auth.uid()
        and m.is_active
        and m.role in ('customer_admin'::public.member_role,
                       'platform_admin'::public.member_role,
                       'production_manager'::public.member_role)
    )
    or exists (
      select 1
      from public.company_memberships m
      join public.fields f on f.company_id = m.company_id
      where m.company_id = p_company_id and m.user_id = auth.uid()
        and m.is_active and m.role = 'territory_manager'::public.member_role
        and m.territory_code = f.territory_code and f.id = p_field_id
    )
    or exists (
      select 1
      from public.company_memberships m
      join public.field_assignments a on a.field_officer_membership_id = m.id
      where m.company_id = p_company_id and m.user_id = auth.uid()
        and m.is_active and m.role = 'field_officer'::public.member_role
        and a.company_id = p_company_id and a.field_id = p_field_id
        and a.status = 'active'
    );
$$;

revoke all on function public.user_can_access_field(uuid, uuid) from public;
grant execute on function public.user_can_access_field(uuid, uuid) to authenticated;

-- Remove company-wide read policies from the field-scoped tables. PostgreSQL
-- permissive policies are ORed, so leaving the old policy would defeat scoping.
drop policy if exists fields_select_member on public.fields;
drop policy if exists field_assignments_select_member on public.field_assignments;
drop policy if exists field_boundaries_select_member on public.field_boundaries;
drop policy if exists form_submissions_select_member on public.form_submissions;

-- Remove broad update policies before installing scoped replacements.
drop policy if exists fields_update_ops on public.fields;
drop policy if exists field_boundaries_update_field_ops on public.field_boundaries;
drop policy if exists form_submissions_update_field_ops on public.form_submissions;

-- Field visibility:
-- - customer/platform admins and production managers: all company fields
-- - territory managers: fields in their assigned territory
-- - field officers: fields explicitly assigned to their membership
create policy fields_select_scoped on public.fields
for select to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or (
    territory_code is not null
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = fields.company_id
        and m.user_id = auth.uid()
        and m.is_active
        and m.role = 'territory_manager'::public.member_role
        and m.territory_code = fields.territory_code
    )
  )
  or public.user_can_access_field(company_id, id)
);

create policy field_assignments_select_scoped on public.field_assignments
for select to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.fields f
    where f.id = field_assignments.field_id
      and f.company_id = field_assignments.company_id
      and (
        (f.territory_code is not null and exists (
          select 1 from public.company_memberships m
          where m.company_id = f.company_id and m.user_id = auth.uid()
            and m.is_active and m.role = 'territory_manager'::public.member_role
            and m.territory_code = f.territory_code
        ))
        or exists (
          select 1 from public.company_memberships m
          where m.id = field_assignments.field_officer_membership_id
            and m.user_id = auth.uid() and m.is_active
            and m.role = 'field_officer'::public.member_role
        )
      )
  )
);

create policy field_boundaries_select_scoped on public.field_boundaries
for select to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (select 1 from public.fields f where f.id = field_boundaries.field_id and f.company_id = field_boundaries.company_id)
);

create policy form_submissions_select_scoped on public.form_submissions
for select to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or (
    field_id is not null
    and public.user_can_access_field(company_id, field_id)
    and exists (
      select 1
      from public.company_memberships m
      join public.form_role_rules rr
        on rr.company_id = form_submissions.company_id
       and rr.form_definition_id = form_submissions.form_definition_id
       and rr.role = m.role
      where m.company_id = form_submissions.company_id
        and m.user_id = auth.uid()
        and m.is_active
        and rr.can_view
    )
  )
);

-- Only managers/admins can update field master records. Territory managers may
-- update fields in their territory; Field Officers do not update field master data.
create policy fields_update_scoped on public.fields
for update to authenticated
using (
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
)
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

-- Field boundary capture can be performed by an assigned Field Officer or a
-- Territory Manager responsible for the field, as well as company admins/managers.
create policy field_boundaries_update_scoped on public.field_boundaries
for update to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.fields f
    where f.id = field_boundaries.field_id and f.company_id = field_boundaries.company_id
      and (
        exists (
          select 1 from public.company_memberships m
          where m.company_id = f.company_id and m.user_id = auth.uid()
            and m.is_active and m.role = 'territory_manager'::public.member_role
            and m.territory_code = f.territory_code
        )
        or exists (
          select 1 from public.field_assignments a
          join public.company_memberships m on m.id = a.field_officer_membership_id
          where a.company_id = f.company_id and a.field_id = f.id
            and a.status = 'active' and m.user_id = auth.uid()
            and m.is_active and m.role = 'field_officer'::public.member_role
        )
      )
  )
)
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or exists (
    select 1 from public.fields f
    where f.id = field_boundaries.field_id and f.company_id = field_boundaries.company_id
      and (
        exists (
          select 1 from public.company_memberships m
          where m.company_id = f.company_id and m.user_id = auth.uid()
            and m.is_active and m.role = 'territory_manager'::public.member_role
            and m.territory_code = f.territory_code
        )
        or exists (
          select 1 from public.field_assignments a
          join public.company_memberships m on m.id = a.field_officer_membership_id
          where a.company_id = f.company_id and a.field_id = f.id
            and a.status = 'active' and m.user_id = auth.uid()
            and m.is_active and m.role = 'field_officer'::public.member_role
        )
      )
  )
);

-- Submission writes remain role-gated by migration 0003. Tighten row scope so
-- Field Officers/Territory Managers can only update submissions attached to
-- fields they are allowed to work on. Unlinked submissions are manager-only.
create policy form_submissions_update_scoped on public.form_submissions
for update to authenticated
using (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or (
    field_id is not null
    and public.user_can_access_field(company_id, field_id)
    and exists (
      select 1
      from public.company_memberships m
      join public.form_role_rules rr
        on rr.company_id = form_submissions.company_id
       and rr.form_definition_id = form_submissions.form_definition_id
       and rr.role = m.role
      where m.company_id = form_submissions.company_id
        and m.user_id = auth.uid()
        and m.is_active
        and rr.can_edit
    )
  )
)
with check (
  public.has_company_role(company_id, array['customer_admin','platform_admin','production_manager']::public.member_role[])
  or (
    field_id is not null
    and public.user_can_access_field(company_id, field_id)
    and exists (
      select 1
      from public.company_memberships m
      join public.form_role_rules rr
        on rr.company_id = form_submissions.company_id
       and rr.form_definition_id = form_submissions.form_definition_id
       and rr.role = m.role
      where m.company_id = form_submissions.company_id
        and m.user_id = auth.uid()
        and m.is_active
        and rr.can_edit
    )
  )
);

commit;
