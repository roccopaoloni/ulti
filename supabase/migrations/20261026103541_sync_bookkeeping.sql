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
