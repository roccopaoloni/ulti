-- Deload Weeks are suggested for one reason now: Fatigue across Movement Patterns (ADR 0009). Rows
-- from the old rules keep their reasons, so the check accepts them too.
alter table public.deload_weeks drop constraint deload_weeks_reason_check;
alter table public.deload_weeks add constraint deload_weeks_reason_check check (reason in ('fatigue', 'stalled', 'rir', 'time'));
