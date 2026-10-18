-- Supplemental migration 0007: harden tenant authorization helper functions.
-- DRAFT ONLY: validate in a disposable Supabase project before production use.
begin;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;

create or replace function public.has_company_role(
  p_company_id uuid,
  p_roles public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role = any(p_roles)
  );
$$;

-- RLS policies call these as the authenticated user. Do not expose execution to
-- PUBLIC/anon; SECURITY DEFINER functions use a locked search path and qualified names.
revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.is_company_member(uuid) from anon;
grant execute on function public.is_company_member(uuid) to authenticated;

revoke all on function public.has_company_role(uuid, public.member_role[]) from public;
revoke all on function public.has_company_role(uuid, public.member_role[]) from anon;
grant execute on function public.has_company_role(uuid, public.member_role[]) to authenticated;

commit;
