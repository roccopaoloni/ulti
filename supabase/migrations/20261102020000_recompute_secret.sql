-- Only the retry job may call the recompute Edge Function. It sends the shared secret in a header,
-- and the function answers 401 to anything else. The secret sits in Vault next to functions_url
-- (config.toml sets it from ULTI_RECOMPUTE_SECRET) and in the function's own secrets.
-- This reschedules the job from 20261026103541_sync_bookkeeping.sql under the same name.
select cron.schedule(
  'recompute-dirty-users',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url') || '/recompute',
    headers := jsonb_build_object(
      'x-recompute-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'recompute_secret')
    )
  )
  where exists (select from private.dirty_users)
  $$
);
