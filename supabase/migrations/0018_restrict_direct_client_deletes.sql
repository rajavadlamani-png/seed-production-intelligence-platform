-- Deny direct client deletes on tenant-owned records.
-- Destructive actions must go through a future audited, role-checked server workflow.
revoke delete, truncate, references, trigger on table
  public.companies,
  public.company_memberships,
  public.seasons,
  public.crops,
  public.hybrids,
  public.growers,
  public.fields,
  public.production_plans,
  public.target_allocations,
  public.parent_seed_lots,
  public.parent_seed_distributions,
  public.grower_upload_batches,
  public.grower_upload_rows,
  public.field_assignments,
  public.field_boundaries,
  public.form_definitions,
  public.form_versions,
  public.form_sections,
  public.field_definitions,
  public.field_options,
  public.form_role_rules,
  public.workflow_definitions,
  public.form_submissions,
  public.documents,
  public.audit_events
from anon, authenticated;
