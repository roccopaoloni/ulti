-- The sync endpoint's own records. Only the endpoint reads or writes them: the private schema
-- isn't exposed through the API, and nobody else can reach it.
create schema if not exists private;

-- Every mutation ID the endpoint has handled for each user. A phone that never heard back sends
-- its mutations again, and the endpoint skips the IDs it finds here.
create table private.mutation_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  received_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table private.mutation_log enable row level security;

-- Users whose Scoring Events may be out of date. Saving a batch marks its user in the same
-- transaction as the data, and a recompute that succeeds clears the mark, so a recompute that
-- fails, or never finishes, leaves the user here for the retry job below.
create table private.dirty_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  marked_at timestamptz not null default now()
);
alter table private.dirty_users enable row level security;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Every five minutes, while any user is dirty, the database asks the recompute Edge Function to
-- retry them. Where the functions live comes from Vault: config.toml sets it from
-- ULTI_FUNCTIONS_URL, which CI provides for the local stack and for the hosted project.
select cron.schedule(
  'recompute-dirty-users',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url') || '/recompute'
  )
  where exists (select from private.dirty_users)
  $$
);
