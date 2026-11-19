begin;
alter table public.vm0051_drainage_events
  add column if not exists field_officer_confirmed boolean not null default false,
  add column if not exists field_officer_confirmation_method text
    check (field_officer_confirmation_method is null or field_officer_confirmation_method in ('verbal','paper_record','digital_record','other')),
  add column if not exists field_officer_confirmed_at timestamptz,
  add column if not exists field_officer_confirmation_reference text;

alter table public.vm0051_drainage_events
  add constraint vm0051_farmer_confirmation_complete
    check (
      not farmer_confirmed
      or (
        nullif(btrim(farmer_confirmation_name),'') is not null
        and farmer_confirmation_method is not null
        and farmer_confirmed_at is not null
      )
    ),
  add constraint vm0051_field_officer_confirmation_complete
    check (
      not field_officer_confirmed
      or (
        field_officer_confirmation_method is not null
        and field_officer_confirmed_at is not null
      )
    );
commit;
