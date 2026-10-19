-- Validated lifecycle RPCs for production plans, target allocations and grower upload batches.
-- Upload batches cannot be marked committed by this RPC: a dedicated atomic importer must
-- persist normalized business records before a batch may enter the committed state.
begin;

create or replace function public.transition_production_plan(
  p_plan_id uuid,
  p_target_status public.record_status
)
returns public.production_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.production_plans%rowtype;
  v_role public.member_role;
  v_allowed boolean := false;
  v_old_status public.record_status;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select p.* into v_row
    from public.production_plans p
   where p.id = p_plan_id
   for update;
  if not found then raise exception 'Production plan not found'; end if;

  select m.role into v_role
    from public.company_memberships m
   where m.company_id = v_row.company_id and m.user_id = v_user and m.is_active;
  if v_role is null then raise exception 'Active company membership required'; end if;

  if v_row.status = 'draft'::public.record_status
     and p_target_status = 'submitted'::public.record_status then
    v_allowed := v_role in ('production_manager'::public.member_role,
                            'customer_admin'::public.member_role,
                            'platform_admin'::public.member_role);
  elsif v_row.status = 'submitted'::public.record_status
     and p_target_status = 'approved'::public.record_status then
    v_allowed := v_role in ('customer_admin'::public.member_role,
                            'platform_admin'::public.member_role);
  elsif v_row.status = 'submitted'::public.record_status
     and p_target_status = 'rejected'::public.record_status then
    v_allowed := v_role in ('customer_admin'::public.member_role,
                            'platform_admin'::public.member_role);
  elsif v_row.status = 'approved'::public.record_status
     and p_target_status = 'released'::public.record_status then
    v_allowed := v_role in ('production_manager'::public.member_role,
                            'customer_admin'::public.member_role,
                            'platform_admin'::public.member_role);
  end if;

  if not v_allowed then
    raise exception 'Production plan transition from % to % is not permitted for this role',
      v_row.status, p_target_status;
  end if;

  v_old_status := v_row.status;
  update public.production_plans
     set status = p_target_status,
         approved_by = case when p_target_status = 'approved'::public.record_status then v_user else approved_by end,
         approved_at = case when p_target_status = 'approved'::public.record_status then pg_catalog.now() else approved_at end,
         released_at = case when p_target_status = 'released'::public.record_status then pg_catalog.now() else released_at end
   where id = v_row.id
   returning * into v_row;

  insert into public.audit_events(company_id, actor_user_id, action, record_type, record_id, details)
  values (v_row.company_id, v_user, 'production_plan_status_transition', 'production_plan',
          v_row.id, pg_catalog.jsonb_build_object('from_status', v_old_status::text,
                                                   'to_status', p_target_status::text));
  return v_row;
end;
$$;

create or replace function public.transition_target_allocation(
  p_allocation_id uuid,
  p_target_status public.record_status
)
returns public.target_allocations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.target_allocations%rowtype;
  v_membership public.company_memberships%rowtype;
  v_role public.member_role;
  v_allowed boolean := false;
  v_old_status public.record_status;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select a.* into v_row
    from public.target_allocations a
   where a.id = p_allocation_id
   for update;
  if not found then raise exception 'Target allocation not found'; end if;

  select m.* into v_membership
    from public.company_memberships m
   where m.company_id = v_row.company_id and m.user_id = v_user and m.is_active;
  if not found then raise exception 'Active company membership required'; end if;
  v_role := v_membership.role;

  if v_role = 'territory_manager'::public.member_role then
    if v_row.territory_manager_membership_id <> v_membership.id then
      raise exception 'Territory manager is not assigned to this allocation';
    end if;
  end if;

  if v_row.status = 'draft'::public.record_status
     and p_target_status = 'submitted'::public.record_status then
    v_allowed := v_role in ('territory_manager'::public.member_role,
                            'production_manager'::public.member_role,
                            'customer_admin'::public.member_role,
                            'platform_admin'::public.member_role);
  elsif v_row.status = 'submitted'::public.record_status
     and p_target_status = 'approved'::public.record_status then
    v_allowed := v_role in ('production_manager'::public.member_role,
                            'customer_admin'::public.member_role,
                            'platform_admin'::public.member_role);
  elsif v_row.status = 'submitted'::public.record_status
     and p_target_status = 'rejected'::public.record_status then
    v_allowed := v_role in ('production_manager'::public.member_role,
                            'customer_admin'::public.member_role,
                            'platform_admin'::public.member_role);
  elsif v_row.status = 'approved'::public.record_status
     and p_target_status = 'released'::public.record_status then
    v_allowed := v_role in ('production_manager'::public.member_role,
                            'customer_admin'::public.member_role,
                            'platform_admin'::public.member_role);
  end if;

  if not v_allowed then
    raise exception 'Target allocation transition from % to % is not permitted for this role',
      v_row.status, p_target_status;
  end if;

  v_old_status := v_row.status;
  update public.target_allocations
     set status = p_target_status,
         released_by = case when p_target_status = 'released'::public.record_status then v_user else released_by end,
         released_at = case when p_target_status = 'released'::public.record_status then pg_catalog.now() else released_at end
   where id = v_row.id
   returning * into v_row;

  insert into public.audit_events(company_id, actor_user_id, action, record_type, record_id, details)
  values (v_row.company_id, v_user, 'target_allocation_status_transition', 'target_allocation',
          v_row.id, pg_catalog.jsonb_build_object('from_status', v_old_status::text,
                                                   'to_status', p_target_status::text));
  return v_row;
end;
$$;

create or replace function public.transition_grower_upload_batch(
  p_batch_id uuid,
  p_target_status text
)
returns public.grower_upload_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.grower_upload_batches%rowtype;
  v_role public.member_role;
  v_allowed boolean := false;
  v_old_status text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select b.* into v_row
    from public.grower_upload_batches b
   where b.id = p_batch_id
   for update;
  if not found then raise exception 'Grower upload batch not found'; end if;

  select m.role into v_role
    from public.company_memberships m
   where m.company_id = v_row.company_id and m.user_id = v_user and m.is_active;
  if v_role is null then raise exception 'Active company membership required'; end if;
  if v_role not in ('production_manager'::public.member_role,
                    'customer_admin'::public.member_role,
                    'platform_admin'::public.member_role) then
    raise exception 'Upload batch lifecycle requires a production manager or company admin';
  end if;

  if v_row.status = 'uploaded' and p_target_status = 'validating' then
    v_allowed := true;
  elsif v_row.status = 'validating' and p_target_status in ('preview_ready','failed') then
    v_allowed := true;
    if p_target_status = 'preview_ready'
       and (v_row.total_rows <> v_row.valid_rows + v_row.invalid_rows) then
      raise exception 'Batch row counts must reconcile before preview_ready';
    end if;
  elsif v_row.status = 'preview_ready' and p_target_status in ('approved','rejected') then
    v_allowed := true;
    if p_target_status = 'approved' and (v_row.total_rows = 0 or v_row.valid_rows = 0) then
      raise exception 'A batch with no valid rows cannot be approved';
    end if;
  elsif v_row.status = 'rejected' and p_target_status = 'validating' then
    v_allowed := true;
  end if;

  if p_target_status = 'committed' then
    raise exception 'Commit requires the trusted atomic upload importer; direct status transition is prohibited';
  end if;
  if not v_allowed then
    raise exception 'Upload batch transition from % to % is not permitted',
      v_row.status, p_target_status;
  end if;

  v_old_status := v_row.status;
  update public.grower_upload_batches set status = p_target_status where id = v_row.id
   returning * into v_row;

  insert into public.audit_events(company_id, actor_user_id, action, record_type, record_id, details)
  values (v_row.company_id, v_user, 'grower_upload_batch_status_transition', 'grower_upload_batch',
          v_row.id, pg_catalog.jsonb_build_object('from_status', v_old_status,
                                                   'to_status', p_target_status,
                                                   'total_rows', v_row.total_rows,
                                                   'valid_rows', v_row.valid_rows,
                                                   'invalid_rows', v_row.invalid_rows));
  return v_row;
end;
$$;

revoke all on function public.transition_production_plan(uuid, public.record_status) from public, anon;
revoke all on function public.transition_target_allocation(uuid, public.record_status) from public, anon;
revoke all on function public.transition_grower_upload_batch(uuid, text) from public, anon;
grant execute on function public.transition_production_plan(uuid, public.record_status) to authenticated;
grant execute on function public.transition_target_allocation(uuid, public.record_status) to authenticated;
grant execute on function public.transition_grower_upload_batch(uuid, text) to authenticated;

commit;
