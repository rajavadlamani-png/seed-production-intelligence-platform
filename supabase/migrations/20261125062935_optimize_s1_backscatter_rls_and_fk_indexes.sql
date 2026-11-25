-- Index referencing columns and avoid per-row auth.uid() evaluation in S1 RLS policies.
create index if not exists s1_backscatter_observations_field_record_id_idx
  on public.s1_backscatter_observations (field_record_id);

create index if not exists s1_backscatter_annotations_field_record_id_idx
  on public.s1_backscatter_annotations (field_record_id);

create index if not exists s1_backscatter_annotations_created_by_idx
  on public.s1_backscatter_annotations (created_by);

drop policy if exists s1_backscatter_observations_member_select on public.s1_backscatter_observations;
create policy s1_backscatter_observations_member_select
  on public.s1_backscatter_observations for select to authenticated
  using (exists (
    select 1 from public.company_memberships m
    where m.company_id = s1_backscatter_observations.company_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  ));

drop policy if exists s1_backscatter_annotations_member_select on public.s1_backscatter_annotations;
create policy s1_backscatter_annotations_member_select
  on public.s1_backscatter_annotations for select to authenticated
  using (exists (
    select 1 from public.company_memberships m
    where m.company_id = s1_backscatter_annotations.company_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  ));

drop policy if exists s1_backscatter_annotations_member_insert on public.s1_backscatter_annotations;
create policy s1_backscatter_annotations_member_insert
  on public.s1_backscatter_annotations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.company_memberships m
      where m.company_id = s1_backscatter_annotations.company_id
        and m.user_id = (select auth.uid()) and m.status = 'active'
    )
    and exists (
      select 1 from public.beta_field_records f
      where f.id = s1_backscatter_annotations.field_record_id
        and f.company_id = s1_backscatter_annotations.company_id
    )
  );