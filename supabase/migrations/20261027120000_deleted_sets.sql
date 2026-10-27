-- A deleted Set stays as a row marked deleted, so the latest write still wins: a late edit older
-- than the deletion changes nothing. Readers and the recompute leave deleted Sets out.
alter table public.sets add column deleted boolean not null default false;
