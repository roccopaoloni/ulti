# Check later

Small things for the owner that didn't block a merge: decisions you may want to change, things never tried on a real phone, test gaps, robustness nits and CI flakes. Each is tagged with its ticket and PR.

## Decisions to revisit

- **Rep PRs: the first Set above 12 reps scores nothing** (#149, PR #151). It only sets the high-rep baseline, the way a first 1–12 rep Set does. Calibration (an Exercise's first 2 Sessions) is shared by the 1–12 rep and >12 rep tracks.
- **Rep PRs also need a higher e1RM** (#149, PR #151). The ticket's two conditions (at least as heavy, more reps than any Set at that weight or heavier) would let 50×40 followed by 60×20 count with a negative gain, so a rep PR must also beat the earlier high-rep e1RM. As a result, 110×13 after 100×19 isn't a PR, and 110×19 after 100×19 is.
- **Rep PRs: one Session can earn two records on the same Exercise** (#149, PR #151): a 1–12 rep PR and a rep PR, each with its own cap.
- **Rep PRs use the lifter's 1–12 rep best for Strength Level** (#149, PR #151). On a Benchmark Lift, the inflated high-rep e1RM isn't used for the weight. With no 1–12 best, it falls back to the average of the lifter's other lifts, or to the 50th percentile.

- **The recompute secret is derived from the database password** (#146, PR #150). The deploy job computes it as HMAC-SHA256 keyed with `SUPABASE_DB_PASSWORD`, so there's no new GitHub secret to set and it never rotates by accident. Changing the DB password changes it, in both places, on the next deploy. The alternative is a random GitHub secret you set by hand.

- **Review the ceiling numbers** (#147, PR #152). The table is in `packages/rules/src/ceilings.ts` and the PR body. The records were quoted from the implementer's memory, not looked up again, and most non-record numbers are hand-picked. The least certain are the equipped squat (600) and bench (520), hip thrust 700, barbell shrug 600, leg press 2500, hack squat 800 and standing calf raise 800. Dumbbell ceilings are per dumbbell.
- **The ceiling compares e1RM, so a world-record single can trip it** (#147, PR #152). Epley makes a 1-rep Set's e1RM 3.3% above its weight, so a lifter matching the squat record, about 592 kg, would compute to about 612 kg and be refused at a 600 ceiling. It's harmless for real users, but if you want "the record itself always passes", raise the ceilings about 4% or compare the raw weight on singles.
- **Bodyweight Exercises get a lot of room** (#147, PR #152). Push-up, hanging leg raise and inverted row are capped at a total load of 500, and dip, chin-up and pull-up at 450, so 100+ rep sets at bodyweight pass. As a result, an 80 kg lifter typing 300 kg added on a dip for 5 reps also passes, because 380 × 1.17 is about 443.
- **A Set in a jump's Session is checked only against the baseline** (#148, PR #154). The baseline is the best going into the last 28 days, and Sets earlier in the same Session don't move it. Say the baseline is 80 and the limit +20% (96). If a Session logs 95, then 100, the 100 is flagged at +25% even though it's 5% over the 95, and the 95 doesn't count as a PR because the saved jump at 100 became the best first. A Set after a confirmed jump is checked against the jump, and one that beats it earns a PR over it.
- **A beginner's progress within their first month counts toward one jump** (#148, PR #154). Before a lifter has a Session older than 28 days, the baseline is their Calibration best, as the spec says, so in-month gains don't raise it. A 50th-percentile beginner going 80 (Calibration) → 90 → 100 in three weeks is flagged at +25% on the 100.
- **Jump limit boundaries and buttons** (#148, PR #154). The bands are below the 25th, the 25th to 75th inclusive, and above the 75th, and exactly +20% passes. The 28 days count back from the Set's own Session date. On the sheet, "I lifted it" is the pink primary button and "Fix it" the outlined one. Escape or tapping outside counts as "Fix it".
- **Bodyweight Exercises always get the +20% jump limit** (#148, PR #154): their Strength Level is taken as the 50th percentile.

## Check after deploy

- **Done: the Supabase token now writes Edge Function secrets** (#146, PR #150, `docs/setup.md` §16). The deploys of #150 and #152 failed without it. After the owner widened the token, the deploy of #154 passed and brought the backend up to date with main.

- **The recompute secret reached both places** (#146, PR #150). Vault lists `recompute_secret`, and the retry job sends the `x-recompute-secret` header. On Nov 3 at 01:05 UTC it cleared the 8 users the rescore migrations had marked dirty, so the function accepted it. Still to check by eye: **Edge Functions → Secrets** lists `RECOMPUTE_SECRET`.

## Never tried on a real phone

- **The "Nobody lifts that" sheet** (#147, PR #152). Only the List layout was screenshotted. Focus's Done and the Session detail edit sheet, where it opens over the edit sheet, run the same code but were never seen. Try a 1000 kg squat in each.
- **The "Oh really? X% up in a month?" sheet** (#148, PR #154). It was only seen in headless Chromium, in the List layout. Never seen live: Focus's Done, the Session detail edit, where it opens over the edit sheet and "I lifted it" then saves the edit, and iOS. Try a Set 25% over your best in each.

## Robustness nits

- **The phone and the server use different bodyweights for the ceiling** (#147, PR #152). The phone checks bodyweight Exercises against the latest logged bodyweight, while the server uses the 28-day average. A bodyweight Set right at the ceiling can save on the phone and then be dropped by the server.
- **A refused Set forgets its remembered label** (#147, PR #152). `ExerciseBlock` clears `unlogged` before calling `onLog`, so when a Set that was un-logged and re-typed is refused, its Warm-up/Working choice is lost. #148's implementer was asked to fix it if it's trivial.
- **The Calibration hint stays up at the start of the third Session** (seen in #148's screenshots, from before it). `inCalibration` counts the Session in progress only once it holds a Working Set, so "Your first sessions set your baseline" shows on the third Session until its first Set is logged.
- **The retry job's HTTP call times out after 5 s while the recompute keeps going** (#146 era, seen Nov 3). When every user is dirty after a rescore migration, `recompute` takes more than 5 s, so `net._http_response` logs "Timeout of 5000 ms reached". The function still finishes and the users are cleared. Harmless now; as users grow, pass a larger `timeout_milliseconds` to `net.http_post` in the cron job, or recompute in batches.

## Test gaps

- **No test for a >12-rep Set over the ceiling** (#147, PR #152). It's covered only because the single filter at the top of `deriveScoringEvents` runs before both tracks.

- **The deploy steps for the recompute secret aren't exercised by CI** (#146, PR #150): the `openssl` derivation and `supabase secrets set` run only on a push to main.

- **Rep PRs on bodyweight Exercises and the Strength Level fallback are untested** (#149, PR #151).
- **No server integration test for jumps** (#148, PR #154). The server calls the same `deriveScoringEvents`, so they're covered by the rules tests. The sheet's wait-for-an-answer logic has no test, since v1 has no UI tests.

## CI flakes

- **`period-finalization.test.ts` > "tied winners each get a crown, and a week nobody trained has none" timed out** on main after #153 merged: 5078 ms against vitest's default 5000 ms. It passed on the PR and on the next run. It recurred on PR #169 (5004 ms), then failed on PR #174 with an extra October month crown. The cause: the scheduled `finalize-periods` job runs every five minutes at the real time, which is now past the October 2026 dates the tests use, so it could crown a test's Group mid-test. Integration runs now pause that job (`integration/global-setup.ts`), and the test also has a 30 s timeout. (#174)
