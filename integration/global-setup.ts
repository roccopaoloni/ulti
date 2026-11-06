import { sql } from './sql.ts';

// The tests run the finalizers themselves, at fixed moments. The scheduled job would also run them
// every five minutes at the real time, which is past the dates the tests use, so it could crown a
// test's Group in the middle of the test. It is paused while the tests run.
const setFinalizeJob = (active: boolean) =>
  sql(`select cron.alter_job(jobid, active := ${active}) from cron.job where jobname = 'finalize-periods'`);

export function setup() {
  setFinalizeJob(false);
}

export function teardown() {
  setFinalizeJob(true);
}
