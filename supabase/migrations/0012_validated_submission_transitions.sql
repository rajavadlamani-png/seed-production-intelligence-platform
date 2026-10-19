-- Supplemental migration 0012: validated form-submission lifecycle transitions.
-- Clients cannot write status directly; this RPC validates role rules and field scope,
-- records an audit event, and performs the state transition atomically.
begin;

create or replace function public.transition_form_submission(
  p_submission_id uuid,
  p_target_status public.record_status
)
returns public.form_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.form_submissions%rowtype;
  v_role public.member_role;
  v_old_status public.record_status;
  v_can_submit boolean := false;
  v_can_review boolean := false;
  v_can_approve boolean := false;
  v_allowed boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select s.* into v_submission
    from public.form_submissions s
   where s.id = p_submission_id
   for update;

  if not found then
    raise exception 'Submission not found';
  end if;

  select m.role into v_role
    from public.company_memberships m
   where m.company_id = v_submission.company_id
     and m.user_id = v_user_id
     and m.is_active;

  if v_role is null then
    raise exception 'Active company membership required';
  end if;

  if v_role in ('field_officer'::public.member_role, 'territory_manager'::public.member_role)
     and v_submission.field_id is null then
    raise exception 'Field-scoped roles require a field-linked submission';
  end if;

  if v_submission.field_id is not null
     and not public.user_can_access_field(v_submission.company_id, v_submission.field_id) then
    raise exception 'User cannot access the submission field';
  end if;

  select rr.can_submit, rr.can_review, rr.can_approve
    into v_can_submit, v_can_review, v_can_approve
    from public.form_role_rules rr
   where rr.company_id = v_submission.company_id
     and rr.form_definition_id = v_submission.form_definition_id
     and rr.role = v_role;

  v_can_submit := coalesce(v_can_submit, false);
  v_can_review := coalesce(v_can_review, false);
  v_can_approve := coalesce(v_can_approve, false);

  if v_submission.status = 'draft'::public.record_status
     and p_target_status = 'submitted'::public.record_status then
    v_allowed := v_can_submit;
  elsif v_submission.status = 'submitted'::public.record_status
     and p_target_status = 'approved'::public.record_status then
    v_allowed := v_can_approve;
  elsif v_submission.status = 'submitted'::public.record_status
     and p_target_status = 'rejected'::public.record_status then
    v_allowed := v_can_review;
  elsif v_submission.status = 'approved'::public.record_status
     and p_target_status = 'released'::public.record_status then
    v_allowed := v_can_approve
      and v_role in ('platform_admin'::public.member_role,
                     'customer_admin'::public.member_role,
                     'production_manager'::public.member_role);
  end if;

  if not v_allowed then
    raise exception 'Transition from % to % is not permitted for this role and form',
      v_submission.status, p_target_status;
  end if;

  v_old_status := v_submission.status;

  update public.form_submissions
     set status = p_target_status,
         submitted_by = case when p_target_status = 'submitted'::public.record_status then v_user_id else submitted_by end,
         submitted_at = case when p_target_status = 'submitted'::public.record_status then now() else submitted_at end,
         reviewed_by = case when p_target_status in ('approved'::public.record_status, 'rejected'::public.record_status) then v_user_id else reviewed_by end,
         reviewed_at = case when p_target_status in ('approved'::public.record_status, 'rejected'::public.record_status) then now() else reviewed_at end
   where id = v_submission.id
   returning * into v_submission;

  insert into public.audit_events(company_id, actor_user_id, action, record_type, record_id, details)
  values (
    v_submission.company_id, v_user_id, 'form_submission_status_transition',
    'form_submission', v_submission.id,
    jsonb_build_object('from_status', v_old_status::text,
                       'to_status', p_target_status::text)
  );

  return v_submission;
end;
$$;

revoke all on function public.transition_form_submission(uuid, public.record_status) from public;
revoke all on function public.transition_form_submission(uuid, public.record_status) from anon;
grant execute on function public.transition_form_submission(uuid, public.record_status) to authenticated;

commit;
