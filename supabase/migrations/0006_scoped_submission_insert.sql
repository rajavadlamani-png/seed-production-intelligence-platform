-- Supplemental migration 0006: scope form-submission creation by field and form permissions.
-- DRAFT ONLY: validate in a disposable Supabase project before applying to customer data.
begin;

drop policy if exists form_submissions_insert_field_ops on public.form_submissions;

create policy form_submissions_insert_scoped on public.form_submissions
for insert to authenticated
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
        and (rr.can_create or rr.can_submit)
    )
  )
);

commit;
