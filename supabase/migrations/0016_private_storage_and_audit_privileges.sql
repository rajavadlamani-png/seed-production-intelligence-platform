-- Private object storage and append-only audit table privileges.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'seed-documents',
  'seed-documents',
  false,
  52428800,
  array['application/pdf','image/jpeg','image/png','text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object keys must begin with the owning company UUID, for example:
-- <company-uuid>/fields/<field-uuid>/boundary-photo.jpg
-- Bucket access remains private; the storage API enforces these object RLS policies.
drop policy if exists seed_documents_select_member on storage.objects;
drop policy if exists seed_documents_insert_member on storage.objects;
drop policy if exists seed_documents_update_owner_or_admin on storage.objects;
drop policy if exists seed_documents_delete_admin on storage.objects;

create policy seed_documents_select_member on storage.objects
for select to authenticated
using (
  bucket_id = 'seed-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_company_member(split_part(name, '/', 1)::uuid)
    else false
  end
);

create policy seed_documents_insert_member on storage.objects
for insert to authenticated
with check (
  bucket_id = 'seed-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_company_member(split_part(name, '/', 1)::uuid)
    else false
  end
);

create policy seed_documents_update_owner_or_admin on storage.objects
for update to authenticated
using (
  bucket_id = 'seed-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (
      public.has_company_role(split_part(name, '/', 1)::uuid,
        array['customer_admin','platform_admin','production_manager']::public.member_role[])
      or owner_id = (select auth.uid()::text)
    )
    else false
  end
)
with check (
  bucket_id = 'seed-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_company_member(split_part(name, '/', 1)::uuid)
    else false
  end
);

create policy seed_documents_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'seed-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.has_company_role(split_part(name, '/', 1)::uuid,
      array['customer_admin','platform_admin','production_manager']::public.member_role[])
    else false
  end
);

-- Audit records are server-written and client-read-only. Do not grant direct
-- INSERT/UPDATE/DELETE to ordinary roles; SECURITY DEFINER workflow/onboarding
-- functions append audit events after their authorization checks.
revoke insert, update, delete, truncate, references, trigger
  on table public.audit_events from anon, authenticated;

commit;
