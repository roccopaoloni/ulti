-- A Session finished with no Sets is discarded. Like a deleted Set it stays as a row marked deleted,
-- so the latest write still wins: a late save of the Session older than the discard changes
-- nothing. The phone doesn't download discarded Sessions.
alter table public.sessions add column deleted boolean not null default false;
