begin;
alter table public.vm0051_drainage_events
  add column if not exists gps_accuracy_m numeric(10,2)
    check (gps_accuracy_m is null or gps_accuracy_m >= 0),
  add column if not exists gps_captured_at timestamptz;
commit;
