-- Trusted tenant bootstrap and membership administration.
-- These entry points are callable only by the Supabase service_role, never browser users.
begin;

create or replace function public.bootstrap_customer_company(
  p_company_name text,
  p_company_slug text,
  p_owner_user_id uuid
)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
begin
  if p_company_name is null or pg_catalog.length(pg_catalog.btrim(p_company_name)) < 2 then
    raise exception 'Company name must contain at least two non-space characters';
  end if;
  if p_company_slug is null or p_company_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Company slug must be lowercase alphanumeric words separated by hyphens';
  end if;
  if p_owner_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_owner_user_id
  ) then
    raise exception 'A valid owner user is required';
  end if;

  insert into public.companies(name, slug)
  values (pg_catalog.btrim(p_company_name), p_company_slug)
  returning * into v_company;

  insert into public.company_memberships(company_id, user_id, role, is_active)
  values (v_company.id, p_owner_user_id, 'customer_admin'::public.member_role, true);

  insert into public.audit_events(company_id, actor_user_id, action, record_type, record_id, details)
  values (v_company.id, p_owner_user_id, 'customer_company_bootstrapped', 'company', v_company.id,
          pg_catalog.jsonb_build_object('company_slug', v_company.slug,
                                        'initial_owner_user_id', p_owner_user_id));
  return v_company;
end;
$$;

create or replace function public.provision_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_role public.member_role,
  p_territory_code text default null
)
returns public.company_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.company_memberships%rowtype;
begin
  if p_company_id is null or not exists (
    select 1 from public.companies c where c.id = p_company_id
  ) then
    raise exception 'Company not found';
  end if;
  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id
  ) then
    raise exception 'A valid user is required';
  end if;
  if p_role = 'platform_admin'::public.member_role then
    raise exception 'Platform administrator membership cannot be provisioned through customer onboarding';
  end if;
  if p_role = 'territory_manager'::public.member_role
     and nullif(pg_catalog.btrim(p_territory_code), '') is null then
    raise exception 'Territory managers require a territory code';
  end if;
  if p_role <> 'territory_manager'::public.member_role and p_territory_code is not null then
    raise exception 'Territory code is only valid for territory managers';
  end if;

  insert into public.company_memberships(company_id, user_id, role, territory_code, is_active)
  values (p_company_id, p_user_id, p_role, p_territory_code, true)
  returning * into v_membership;

  insert into public.audit_events(company_id, actor_user_id, action, record_type, record_id, details)
  values (p_company_id, null, 'company_member_provisioned', 'company_membership', v_membership.id,
          pg_catalog.jsonb_build_object('user_id', p_user_id,
                                        'role', p_role::text,
                                        'territory_code', p_territory_code));
  return v_membership;
end;
$$;

create or replace function public.deactivate_company_member(p_membership_id uuid)
returns public.company_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.company_memberships%rowtype;
begin
  update public.company_memberships
     set is_active = false
   where id = p_membership_id and is_active
   returning * into v_membership;
  if not found then raise exception 'Active company membership not found'; end if;

  insert into public.audit_events(company_id, actor_user_id, action, record_type, record_id, details)
  values (v_membership.company_id, null, 'company_member_deactivated', 'company_membership', v_membership.id,
          pg_catalog.jsonb_build_object('user_id', v_membership.user_id,
                                        'role', v_membership.role::text));
  return v_membership;
end;
$$;

revoke all on function public.bootstrap_customer_company(text, text, uuid) from public, anon, authenticated;
revoke all on function public.provision_company_member(uuid, uuid, public.member_role, text) from public, anon, authenticated;
revoke all on function public.deactivate_company_member(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_customer_company(text, text, uuid) to service_role;
grant execute on function public.provision_company_member(uuid, uuid, public.member_role, text) to service_role;
grant execute on function public.deactivate_company_member(uuid) to service_role;

commit;
