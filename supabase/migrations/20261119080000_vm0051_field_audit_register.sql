begin;

create table if not exists public.vm0051_drainage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  field_record_id uuid not null references public.beta_field_records(id) on delete restrict,
  season_key text not null,
  field_no text not null,
  farmer_name text not null,
  village text,
  district text,
  crop text,
  hybrid text,
  event_type text not null default 'single_drainage'
    check (event_type = 'single_drainage'),
  drainage_started_at timestamptz not null,
  drainage_completed_at timestamptz,
  water_level_before_cm numeric(8,2) check (water_level_before_cm is null or water_level_before_cm >= 0),
  water_level_before_measured_at timestamptz,
  water_level_after_cm numeric(8,2) check (water_level_after_cm is null or water_level_after_cm >= 0),
  water_level_after_measured_at timestamptz,
  measurement_method text check (measurement_method is null or measurement_method in ('staff_gauge','measuring_ruler','other')),
  measurement_notes text,
  field_officer_name text not null,
  field_officer_user_id uuid references auth.users(id) on delete set null,
  farmer_confirmed boolean not null default false,
  farmer_confirmation_name text,
  farmer_confirmation_method text check (farmer_confirmation_method is null or farmer_confirmation_method in ('verbal','paper_record','photo_record','other')),
  farmer_confirmed_at timestamptz,
  irrigation_log_reference text,
  drainage_log_reference text,
  field_notes text,
  gps_latitude numeric(10,7) check (gps_latitude is null or gps_latitude between -90 and 90),
  gps_longitude numeric(10,7) check (gps_longitude is null or gps_longitude between -180 and 180),
  satellite_run_id uuid references public.vm0051_drainage_evidence_runs(id) on delete set null,
  status text not null default 'submitted'
    check (status in ('submitted','reviewed','returned')),
  review_checklist jsonb not null default '{}'::jsonb
    check (jsonb_typeof(review_checklist) = 'object'),
  reviewer_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint vm0051_drainage_completed_after_start
    check (drainage_completed_at is null or drainage_completed_at >= drainage_started_at),
  constraint vm0051_drainage_company_field_unique
    unique (company_id, id)
);

create index if not exists vm0051_drainage_events_company_created_idx
  on public.vm0051_drainage_events(company_id, created_at desc);
create index if not exists vm0051_drainage_events_field_period_idx
  on public.vm0051_drainage_events(company_id, field_record_id, drainage_started_at desc);
create index if not exists vm0051_drainage_events_satellite_run_idx
  on public.vm0051_drainage_events(satellite_run_id)
  where satellite_run_id is not null;

create table if not exists public.vm0051_drainage_event_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  event_id uuid not null references public.vm0051_drainage_events(id) on delete restrict,
  evidence_type text not null
    check (evidence_type in ('field_photo','water_level_record','irrigation_drainage_log','farmer_confirmation','satellite_export','other')),
  evidence_class text not null default 'reported'
    check (evidence_class in ('verified','derived','satellite','reported','missing')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 26214400),
  sha256_hex text not null check (sha256_hex ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz,
  latitude numeric(10,7) check (latitude is null or latitude between -90 and 90),
  longitude numeric(10,7) check (longitude is null or longitude between -180 and 180),
  notes text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint vm0051_event_evidence_company_event_fk
    foreign key (company_id, event_id)
    references public.vm0051_drainage_events(company_id, id)
    on delete restrict
);

create index if not exists vm0051_event_evidence_event_created_idx
  on public.vm0051_drainage_event_evidence(event_id, created_at);
create index if not exists vm0051_event_evidence_company_created_idx
  on public.vm0051_drainage_event_evidence(company_id, created_at desc);

create table if not exists public.vm0051_drainage_event_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  event_id uuid not null references public.vm0051_drainage_events(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('event_submitted','event_reviewed','event_returned','evidence_attached')),
  old_values jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint vm0051_event_audit_company_event_fk
    foreign key (company_id, event_id)
    references public.vm0051_drainage_events(company_id, id)
    on delete restrict
);

create index if not exists vm0051_event_audit_event_created_idx
  on public.vm0051_drainage_event_audit(event_id, created_at desc);
create index if not exists vm0051_event_audit_company_created_idx
  on public.vm0051_drainage_event_audit(company_id, created_at desc);

alter table public.vm0051_drainage_events enable row level security;
alter table public.vm0051_drainage_event_evidence enable row level security;
alter table public.vm0051_drainage_event_audit enable row level security;

revoke all on table public.vm0051_drainage_events from anon, authenticated;
revoke all on table public.vm0051_drainage_event_evidence from anon, authenticated;
revoke all on table public.vm0051_drainage_event_audit from anon, authenticated;
grant select, insert, update on table public.vm0051_drainage_events to authenticated;
grant select, insert on table public.vm0051_drainage_event_evidence to authenticated;
grant select on table public.vm0051_drainage_event_audit to authenticated;

create policy vm0051_drainage_events_member_select
on public.vm0051_drainage_events for select to authenticated
using (
  exists (
    select 1 from public.company_memberships m
    where m.company_id = vm0051_drainage_events.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

create policy vm0051_drainage_events_authorized_insert
on public.vm0051_drainage_events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and field_officer_user_id = (select auth.uid())
  and status = 'submitted'
  and reviewed_by is null and reviewed_at is null
  and review_checklist = '{}'::jsonb and reviewer_notes is null
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

create policy vm0051_drainage_events_manager_review
on public.vm0051_drainage_events for update to authenticated
using (
  status = 'submitted'
  and private.has_company_role(company_id,
    array['company_admin','seed_production_manager','state_head','district_manager'])
)
with check (
  status in ('reviewed','returned')
  and reviewed_by = (select auth.uid())
  and private.has_company_role(company_id,
    array['company_admin','seed_production_manager','state_head','district_manager'])
);

create policy vm0051_drainage_event_evidence_member_select
on public.vm0051_drainage_event_evidence for select to authenticated
using (
  exists (
    select 1 from public.company_memberships m
    where m.company_id = vm0051_drainage_event_evidence.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

create policy vm0051_drainage_event_evidence_submitter_insert
on public.vm0051_drainage_event_evidence for insert to authenticated
with check (
  created_by = (select auth.uid())
  and evidence_class in ('reported','satellite')
  and storage_path like company_id::text || '/' || event_id::text || '/%'
  and exists (
    select 1 from public.vm0051_drainage_events e
    where e.id = event_id
      and e.company_id = vm0051_drainage_event_evidence.company_id
      and e.status = 'submitted'
      and (
        e.created_by = (select auth.uid())
        or private.has_company_role(e.company_id,
          array['company_admin','seed_production_manager','state_head','district_manager'])
      )
  )
);

create policy vm0051_drainage_event_audit_member_select
on public.vm0051_drainage_event_audit for select to authenticated
using (
  exists (
    select 1 from public.company_memberships m
    where m.company_id = vm0051_drainage_event_audit.company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

create or replace function private.guard_vm0051_drainage_event_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'submitted'
       or new.status not in ('reviewed','returned')
       or new.reviewed_by is distinct from (select auth.uid())
       or new.reviewed_at is null
       or (to_jsonb(new) - array['status','review_checklist','reviewer_notes','reviewed_by','reviewed_at'])
          is distinct from
          (to_jsonb(old) - array['status','review_checklist','reviewer_notes','reviewed_by','reviewed_at']) then
      raise exception 'Submitted VM0051 evidence may only receive a reviewer decision; create a new event to correct source evidence.';
    end if;
    if new.status = 'reviewed'
       and not (new.review_checklist @> '{"water_level_measurements_reviewed":true,"drainage_records_reviewed":true,"farmer_or_officer_confirmation_reviewed":true,"attachments_reviewed":true,"monitoring_plan_crosscheck_reviewed":true}'::jsonb) then
      raise exception 'Complete the internal evidence review checklist before marking this record reviewed.';
    end if;
    if new.status = 'returned' and coalesce(length(btrim(new.reviewer_notes)),0) = 0 then
      raise exception 'Reviewer notes are required when returning an evidence record.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.log_vm0051_drainage_event_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_event_id uuid;
  v_action text;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_table_name = 'vm0051_drainage_events' then
    v_company_id := coalesce(new.company_id, old.company_id);
    v_event_id := coalesce(new.id, old.id);
    if tg_op = 'INSERT' then
      v_action := 'event_submitted';
      v_old := null;
      v_new := to_jsonb(new);
    else
      v_action := case when new.status = 'reviewed' then 'event_reviewed' else 'event_returned' end;
      v_old := to_jsonb(old);
      v_new := to_jsonb(new);
    end if;
  else
    v_company_id := new.company_id;
    v_event_id := new.event_id;
    v_action := 'evidence_attached';
    v_old := null;
    v_new := jsonb_build_object(
      'evidence_id', new.id,
      'evidence_type', new.evidence_type,
      'evidence_class', new.evidence_class,
      'file_name', new.file_name,
      'storage_path', new.storage_path,
      'sha256_hex', new.sha256_hex,
      'captured_at', new.captured_at,
      'created_at', new.created_at
    );
  end if;

  insert into public.vm0051_drainage_event_audit
    (company_id, event_id, actor_id, action, old_values, new_values)
  values
    (v_company_id, v_event_id, auth.uid(), v_action, v_old, v_new);
  return new;
end;
$;

drop trigger if exists vm0051_drainage_event_review_guard on public.vm0051_drainage_events;
create trigger vm0051_drainage_event_review_guard
before update on public.vm0051_drainage_events
for each row execute function private.guard_vm0051_drainage_event_review();

drop trigger if exists vm0051_drainage_event_audit_log on public.vm0051_drainage_events;
create trigger vm0051_drainage_event_audit_log
after insert or update on public.vm0051_drainage_events
for each row execute function private.log_vm0051_drainage_event_audit();

drop trigger if exists vm0051_drainage_evidence_audit_log on public.vm0051_drainage_event_evidence;
create trigger vm0051_drainage_evidence_audit_log
after insert on public.vm0051_drainage_event_evidence
for each row execute function private.log_vm0051_drainage_event_audit();

revoke all on function private.guard_vm0051_drainage_event_review() from public, anon, authenticated;
revoke all on function private.log_vm0051_drainage_event_audit() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vm0051-audit-evidence',
  'vm0051-audit-evidence',
  false,
  26214400,
  array['application/pdf','image/jpeg','image/png','text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vm0051_audit_evidence_member_read on storage.objects;
drop policy if exists vm0051_audit_evidence_submitter_upload on storage.objects;

create policy vm0051_audit_evidence_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'vm0051-audit-evidence'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then exists (
      select 1 from public.vm0051_drainage_events e
      join public.company_memberships m on m.company_id = e.company_id
      where e.id = split_part(name, '/', 2)::uuid
        and e.company_id = split_part(name, '/', 1)::uuid
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
    else false
  end
);

create policy vm0051_audit_evidence_submitter_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vm0051-audit-evidence'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then exists (
      select 1 from public.vm0051_drainage_events e
      where e.id = split_part(name, '/', 2)::uuid
        and e.company_id = split_part(name, '/', 1)::uuid
        and e.status = 'submitted'
        and (
          e.created_by = (select auth.uid())
          or private.has_company_role(e.company_id,
            array['company_admin','seed_production_manager','state_head','district_manager'])
        )
    )
    else false
  end
);

commit;
