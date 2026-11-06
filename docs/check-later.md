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

- **History's Personal Record chip has a dark trophy, not gold** (#165, PR #173). The chip is solid pink, and gold on it was nearly invisible, so the trophy takes the chip's ink like the logged-Set button. Everywhere else it's gold. Delete the `.pr .trophy` rule to make it gold.
- **A bodyweight Custom Exercise is tagged "Custom · Bodyweight"** (#164, PR #172) in the picker and the Routine editor, so it still reads as the lifter's own.
- **Trained-today avatars overlap by 6px, not the mockup's 10px** (#167, PR #176). At 10px the 34px avatars cut each other's initials.

- **A Division-up's tap stamps at once** (#180, PR #186). The first tap plays the stamp on the 90 ms beat a Tier-up's shatter uses; the old one-second hold is gone. Tier-up is unchanged until you've tried one in the prototype.
- **Sync is pinned to Oregon in the app** (#181, PR #187). The phone calls `sync?forceFunctionRegion=us-west-2`, because the database is in us-west-2, not São Paulo as `docs/setup.md` says. If the project ever moves region, change that line. Pinning means no automatic failover to another region during a Supabase outage there.
- **A move is judged by the labels before it** (#182, PR #188). A Set lands as a Warm-up when any Warm-up Set (detected or by hand) ends up after it. A detected Warm-up dragged behind the Working Sets becomes a Working Set, as the usual rule says; one labelled by hand stays a Warm-up.

## Check after deploy

- **Done: the Supabase token now writes Edge Function secrets** (#146, PR #150, `docs/setup.md` §16). The deploys of #150 and #152 failed without it. After the owner widened the token, the deploy of #154 passed and brought the backend up to date with main.

- **The recompute secret reached both places** (#146, PR #150). Vault lists `recompute_secret`, and the retry job sends the `x-recompute-secret` header. On Nov 3 at 01:05 UTC it cleared the 8 users the rescore migrations had marked dirty, so the function accepted it. Still to check by eye: **Edge Functions → Secrets** lists `RECOMPUTE_SECRET`.

- **Done: sync is fast again** (#181, PR #187). From 20:45 UTC on Nov 6, 22 real syncs all ran in us-west-2: median 1.07 s, max 2.0 s, against about 9.5 s before.

## Never tried on a real phone

- **The "Nobody lifts that" sheet** (#147, PR #152). Only the List layout was screenshotted. Focus's Done and the Session detail edit sheet, where it opens over the edit sheet, run the same code but were never seen. Try a 1000 kg squat in each.
- **The "Oh really? X% up in a month?" sheet** (#148, PR #154). It was only seen in headless Chromium, in the List layout. Never seen live: Focus's Done, the Session detail edit, where it opens over the edit sheet and "I lifted it" then saves the edit, and iOS. Try a Set 25% over your best in each.

- **The Day sheet's bottom gap** (#161, PR #169). Your iPhone screenshot showed about 60pt of blank space, which was the home-indicator inset with the sheet's padding stacked on top. Every bottom sheet now pads `max(14px, inset)` instead of `14px + inset`, and the Day sheet's last row sits on the inset. It was only checked with an emulated 34px inset. Open the Day sheet and an ⓘ sheet on the iPhone.
- **The Groups panel's swipe** (#166, PR #177). It's CSS scroll-snap, only scrolled programmatically in headless Chromium. Swipe it on the iPhone and check the dots follow.

- **Dragging Sets by touch** (#182, PR #188; #183, PR #189). Both were only dragged with a mouse in headless Chromium. Drag a Set in the live Session's List layout and in a History Session on the iPhone, and check the page doesn't scroll instead.
- **The Division-up tap** (#180, PR #186). Seen only in screenshots; the next real Division-up is the first live one.

## Robustness nits

- **The phone and the server use different bodyweights for the ceiling** (#147, PR #152). The phone checks bodyweight Exercises against the latest logged bodyweight, while the server uses the 28-day average. A bodyweight Set right at the ceiling can save on the phone and then be dropped by the server.
- **A refused Set forgets its remembered label** (#147, PR #152). `ExerciseBlock` clears `unlogged` before calling `onLog`, so when a Set that was un-logged and re-typed is refused, its Warm-up/Working choice is lost. #148's implementer was asked to fix it if it's trivial.
- **The Calibration hint stays up at the start of the third Session** (seen in #148's screenshots, from before it). `inCalibration` counts the Session in progress only once it holds a Working Set, so "Your first sessions set your baseline" shows on the third Session until its first Set is logged.
- **The retry job's HTTP call times out after 5 s while the recompute keeps going** (#146 era, seen Nov 3). When every user is dirty after a rescore migration, `recompute` takes more than 5 s, so `net._http_response` logs "Timeout of 5000 ms reached". The function still finishes and the users are cleared. Harmless now; as users grow, pass a larger `timeout_milliseconds` to `net.http_post` in the cron job, or recompute in batches.

- **The Calibration hint shows on Custom Exercises** (seen in #164's screenshots, from before it). "Your first sessions set your baseline" appears under a Custom Exercise, which never earns Personal Records.
- **History's PR chip cuts the exercise name sooner** (#165, PR #173). The trophy takes about 17px, so on a 390px screen "Bench press +3%" ellipsizes to "Bench pres…". The List layout's logged-Set button also wraps "+65 pts" onto two lines beside the trophy.
- **The Groups panel is as tall as its tallest page** (#166, PR #177), so a Group with no news shows blank space under its race line when another Group has news.
- **`Boards.tsx` and `GroupsScreens.tsx` import each other** (#167, PR #176): Boards now takes `Sheet` from GroupsScreens. It's used only at render time, so it works. Moving `Sheet` to its own file would break the cycle.
- **Trained today waits for fresh news after the deploy** (#167, PR #176). News cached before the server sent user ids is skipped, so the card is empty on a phone until its next news refresh (opening Home online).
- **ES Season countdown wraps under an hour** (#163, PR #170): "La temporada termina en menos de una hora" takes two lines at 390px. The row grows, which looks fine.
- **`screens.train` and `screens.profile` look unused** (#162, PR #171). The Home placeholder they were for is gone; only `screens.groups` is read. Left in place.

- **The unlogged row has no drag handle, so its number sits left of the logged rows'** (#182, PR #188). Visible in the List layout under the logged Sets.
- **Unlogging a Set leaves a gap in the others' positions** (#182, PR #188). Harmless: only the order is read.
- **The sync region and the CORS preflight** (#181, PR #187). The query parameter avoids the `x-region` header; switching to supabase-js's `region` option would need the function's CORS to allow that header.

## Test gaps

- **No test for a >12-rep Set over the ceiling** (#147, PR #152). It's covered only because the single filter at the top of `deriveScoringEvents` runs before both tracks.

- **The deploy steps for the recompute secret aren't exercised by CI** (#146, PR #150): the `openssl` derivation and `supabase secrets set` run only on a push to main.

- **Rep PRs on bodyweight Exercises and the Strength Level fallback are untested** (#149, PR #151).
- **No server integration test for jumps** (#148, PR #154). The server calls the same `deriveScoringEvents`, so they're covered by the rules tests. The sheet's wait-for-an-answer logic has no test, since v1 has no UI tests.

- **#182's red integration test was never seen red** (PR #188). It was pushed before the implementation, but only the green head run was looked at. #183's outbox test (PR #189) passed at once, since `moveSet` already worked on a finished Session.
- **Nothing tests the drag gesture or the Division-up's wait for a tap** (#180, #182, #183): v1 has no UI tests. The gate's "decide without the server" rule has a unit test (`rankUpReady`).
- **The Elite plaque arriving after an early Rank-up decision is untested** (#180, PR #186). It reads the server's standing at render time, so it fills in if it arrives, or is left out.

## CI flakes

- **`period-finalization.test.ts` > "tied winners each get a crown, and a week nobody trained has none" timed out** on main after #153 merged: 5078 ms against vitest's default 5000 ms. It passed on the PR and on the next run. It recurred on PR #169 (5004 ms), then failed on PR #174 with an extra October month crown. The cause: the scheduled `finalize-periods` job runs every five minutes at the real time, which is now past the October 2026 dates the tests use, so it could crown a test's Group mid-test. Integration runs now pause that job (`integration/global-setup.ts`), and the test also has a 30 s timeout. (#174)
- **Integration shard 1 is the slowest** (#179, PR #184): about 3m40s against 2m21s and 2m50s, because it also bundles the Edge Functions and its files are heavier. A server PR's CI takes about 4 min; moving the bundle check to its own job or rebalancing the shards could bring it nearer 3.
