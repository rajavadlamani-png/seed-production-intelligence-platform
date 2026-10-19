-- Supplemental migration 0011: prevent direct form-version publication transitions.
-- Until a validated publish RPC exists, authenticated clients may edit only draft
-- snapshots; they cannot directly set status='published' or rewrite version identity.
begin;

revoke update on table public.form_versions from anon;
revoke update on table public.form_versions from authenticated;

grant update (definition_snapshot) on table public.form_versions to authenticated;

commit;
