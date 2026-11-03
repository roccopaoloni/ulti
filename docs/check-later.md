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

## Check after deploy

- **The backend deploy is blocked until you widen the Supabase token** (#146, PR #150). See `docs/setup.md` §16. The merges of #150 and #152 both failed at "Set the recompute secret on the Edge Functions" with `edge_functions_secrets_write` missing. The backend is still at #151's deploy and consistent: the job stopped before migrations or functions. But the ceiling rule (#147) and the recompute secret aren't live on the server yet, while the app already refuses Sets over the ceiling.

- **The recompute secret reached both places** (#146, PR #150). After the first deploy with it, **Integrations → Vault → Secrets** should list `recompute_secret` and **Edge Functions → Secrets** should list `RECOMPUTE_SECRET` (`docs/setup.md` §11). After 5–10 minutes, `private.dirty_users` should be empty again: #151 marked everyone dirty, so this also proves the retry job gets through. If the deploy stops between "Set the recompute secret" and "Apply migrations", the two can disagree and the retry job gets `401` until the next deploy.

## Never tried on a real phone

- **The "Nobody lifts that" sheet** (#147, PR #152). Only the List layout was screenshotted. Focus's Done and the Session detail edit sheet, where it opens over the edit sheet, run the same code but were never seen. Try a 1000 kg squat in each.

## Robustness nits

- **The phone and the server use different bodyweights for the ceiling** (#147, PR #152). The phone checks bodyweight Exercises against the latest logged bodyweight, while the server uses the 28-day average. A bodyweight Set right at the ceiling can save on the phone and then be dropped by the server.
- **A refused Set forgets its remembered label** (#147, PR #152). `ExerciseBlock` clears `unlogged` before calling `onLog`, so when a Set that was un-logged and re-typed is refused, its Warm-up/Working choice is lost. #148's implementer was asked to fix it if it's trivial.

## Test gaps

- **No test for a >12-rep Set over the ceiling** (#147, PR #152). It's covered only because the single filter at the top of `deriveScoringEvents` runs before both tracks.

- **The deploy steps for the recompute secret aren't exercised by CI** (#146, PR #150): the `openssl` derivation and `supabase secrets set` run only on a push to main.

- **Rep PRs on bodyweight Exercises and the Strength Level fallback are untested** (#149, PR #151).
