import { execFileSync } from 'node:child_process';

// SQL run straight on the local database, in its container (named after project_id in
// supabase/config.toml), for what no API does: reading the Scoring Events, which no user can,
// breaking the recompute, and running a scheduled job now.
export function sql(statement: string) {
  return execFileSync(
    'docker',
    ['exec', '-e', 'PGPASSWORD=postgres', 'supabase_db_ulti', 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-tAc', statement],
    { encoding: 'utf8' },
  ).trim();
}

// A user's stored Scoring Events, by ID.
export function scoringEventsOf(userId: string): { id: string; event: Record<string, any> }[] {
  return JSON.parse(
    sql(
      `select coalesce(json_agg(json_build_object('id', id, 'event', event) order by id), '[]') from public.scoring_events where user_id = '${userId}'`,
    ),
  );
}
