select cron.unschedule(jobid) from cron.job where jobname = 'daily-field-vwc-capture';
select cron.schedule(
  'daily-field-vwc-capture',
  '30 6 * * *',
  $job$
    select net.http_post(
      url := 'https://xjtzvhtoeormizrhozoy.supabase.co/functions/v1/vwc-daily-capture',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_nyH0s0O1OH2mIZz8N1xvbQ_eII73UGp',
        'x-vwc-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'vwc_daily_capture_token')
      ),
      body := jsonb_build_object('trigger', 'daily_schedule', 'timezone', 'Asia/Kolkata'),
      timeout_milliseconds := 120000
    );
  $job$
);