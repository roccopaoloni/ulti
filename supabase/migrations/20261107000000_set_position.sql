-- Where the lifter dragged a Set among its Exercise's Sets in a Session (spec: Logging a Session).
-- Null means they never did: the Set keeps its logged order, after any Set that has a position.
-- The recompute orders an Exercise's Sets by it, then by logged time.
alter table public.sets add column "position" integer check ("position" >= 0);
