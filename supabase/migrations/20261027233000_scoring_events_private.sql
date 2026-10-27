-- Scoring Events hold the Strength Level percentile and the bodyweight used (spec: Visibility), which
-- nobody may see, their owner included. No user reads the table any more: the app never did, and
-- the boards and Rank read through functions that return only the fields they may show.
drop policy "Users read their own Scoring Events" on public.scoring_events;
revoke select on public.scoring_events from authenticated;
