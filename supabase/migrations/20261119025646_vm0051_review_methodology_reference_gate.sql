begin;
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
       and (
         nullif(btrim(new.methodology_version),'') is null
         or nullif(btrim(new.monitoring_plan_reference),'') is null
       ) then
      raise exception 'Enter the approved methodology version and monitoring plan reference before marking this record reviewed.';
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
commit;
