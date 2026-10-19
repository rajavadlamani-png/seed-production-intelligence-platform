-- Supplemental migration 0008: restrict direct form-submission updates to payload only.
-- Draft security hardening: lifecycle transitions must be implemented as validated RPCs
-- before users can submit, review, approve, or release records through the application.
begin;

-- Table-level UPDATE grants override the protection offered by column grants.
-- Remove that broad privilege first, then allow payload edits only. RLS policies
-- still determine which rows the caller may update.
revoke update on table public.form_submissions from anon;
revoke update on table public.form_submissions from authenticated;

grant update (payload) on table public.form_submissions to authenticated;

commit;
