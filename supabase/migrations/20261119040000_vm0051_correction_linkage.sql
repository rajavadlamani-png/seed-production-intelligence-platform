begin;
alter table public.vm0051_drainage_events
  add column if not exists supersedes_event_id uuid,
  add column if not exists correction_reason text,
  add constraint vm0051_drainage_event_supersedes_fk
    foreign key (company_id,supersedes_event_id)
    references public.vm0051_drainage_events(company_id,id)
    on delete restrict,
  add constraint vm0051_drainage_event_not_self_superseding
    check (supersedes_event_id is null or supersedes_event_id <> id),
  add constraint vm0051_drainage_event_correction_reason_required
    check (supersedes_event_id is null or nullif(btrim(correction_reason),'') is not null);

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
  and (supersedes_event_id is null or exists (
    select 1 from public.vm0051_drainage_events previous
    where previous.id = supersedes_event_id
      and previous.company_id = vm0051_drainage_events.company_id
      and previous.field_record_id = vm0051_drainage_events.field_record_id
      and previous.status in ('returned','reviewed')
      and nullif(btrim(correction_reason),'') is not null
  ))
);
commit;
