-- A Session records whether it is a Deload Session: started while a Deload Week was on (ADR 0007).
-- Scoring reads this record, not the Session's week, so cancelling a Deload Week later can't
-- rewrite Sessions already trained.
alter table public.sessions add column deload boolean not null default false;

-- Sessions logged before this change are marked if their week was an accepted Deload Week, so no
-- Points change. The week starts on Monday, which is what date_trunc('week') gives.
update public.sessions s
set deload = true
from public.deload_weeks d
where d.user_id = s.user_id
  and d.status = 'accepted'
  and d.week = date_trunc('week', s.local_date)::date;
