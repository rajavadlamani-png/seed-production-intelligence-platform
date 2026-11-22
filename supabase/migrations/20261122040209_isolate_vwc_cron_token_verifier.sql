create schema if not exists vwc_internal;
grant usage on schema vwc_internal to anon, authenticated;

create or replace function vwc_internal.verify_vwc_cron_token(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'vwc_daily_capture_token'
      and decrypted_secret = p_token
  );
$$;
revoke all on function vwc_internal.verify_vwc_cron_token(text) from public;
grant execute on function vwc_internal.verify_vwc_cron_token(text) to anon, authenticated;

create or replace function public.verify_vwc_cron_token(p_token text)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select vwc_internal.verify_vwc_cron_token(p_token);
$$;
revoke all on function public.verify_vwc_cron_token(text) from public;
grant execute on function public.verify_vwc_cron_token(text) to anon, authenticated;

drop function if exists private.verify_vwc_cron_token(text);
