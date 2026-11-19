begin;
drop policy if exists vm0051_drainage_events_authorized_insert
  on public.vm0051_drainage_events;

create policy vm0051_drainage_events_authorized_insert
on public.vm0051_drainage_events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'submitted'
  and reviewed_by is null
  and reviewed_at is null
  and review_checklist = '{}'::jsonb
  and reviewer_notes is null
  and private.has_company_role(company_id,
    array['company_admin','seed_production_manager','state_head','district_manager','field_officer'])
  and exists (
    select 1 from public.beta_field_records f
    where f.id = field_record_id and f.company_id = vm0051_drainage_events.company_id
  )
  and (satellite_run_id is null or exists (
    select 1 from public.vm0051_drainage_evidence_runs r
    where r.id = satellite_run_id and r.company_id = vm0051_drainage_events.company_id
  ))
);
commit;
