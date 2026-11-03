-- Calculate the male PPI delay/advance from the two officer-entered durations.
-- The client cannot supply the authoritative derived value; this trigger replaces it.
CREATE OR REPLACE FUNCTION public.calculate_male_ppi_sync_difference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  stage_three jsonb;
  male_days_text text;
  female_days_text text;
  difference_days numeric;
BEGIN
  IF jsonb_typeof(NEW.record_data -> 'inspectionReports' -> '3') IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;

  stage_three := NEW.record_data -> 'inspectionReports' -> '3';
  male_days_text := stage_three ->> 'malePpiDays';
  female_days_text := stage_three ->> 'femalePpiDays';

  IF male_days_text ~ '^[0-9]+(\.[0-9]+)?$'
     AND female_days_text ~ '^[0-9]+(\.[0-9]+)?$' THEN
    difference_days := male_days_text::numeric - female_days_text::numeric;
    stage_three := jsonb_set(stage_three, '{maleSyncDifferenceDays}', to_jsonb(difference_days), true);
    stage_three := jsonb_set(
      stage_three,
      '{maleSyncInterpretation}',
      to_jsonb(CASE
        WHEN difference_days = 0 THEN 'Proper synchronization'
        WHEN difference_days > 0 THEN 'Male delayed'
        ELSE 'Male advanced'
      END),
      true
    );
  ELSE
    stage_three := stage_three - 'maleSyncDifferenceDays' - 'maleSyncInterpretation';
  END IF;

  NEW.record_data := jsonb_set(NEW.record_data, '{inspectionReports,3}', stage_three, true);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_male_ppi_sync_difference()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS beta_field_records_calculate_male_ppi_sync_difference
  ON public.beta_field_records;

CREATE TRIGGER beta_field_records_calculate_male_ppi_sync_difference
BEFORE INSERT OR UPDATE OF record_data
ON public.beta_field_records
FOR EACH ROW
EXECUTE FUNCTION public.calculate_male_ppi_sync_difference();
