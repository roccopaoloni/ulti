# Stall and Fatigue are told apart with RIR-adjusted e1RM, and Deload Weeks are suggested by Fatigue, never by the calendar

The first advice engine had one "Stall" for every Exercise that stopped improving, and always answered it the same way: drop about 10% and build back up. It suggested a Deload Week when two Exercises Stalled, when RIR fell across two, or after eight weeks without one. The owner's research (Banister's fitness–fatigue model; Coleman et al., 2024, on scheduled versus autoregulated deloads) separates two things that look alike in a logbook:

- **Accommodation**: e1RM and RIR stay flat for weeks while the lifter is fresh. The stimulus has gone stale, so the fix is a different Rep Range, not rest. This is now what **Stall** means.
- **Overreaching**: the lifter's RIR shrinks to defend the same numbers, or their strength falls across Sessions. Fatigue is masking fitness, so the fix is less training. This is **Fatigue**.

Raw weight × reps can't tell them apart, because a lifter who logs 100 kg × 8 at RIR 2, then 1, then 0 looks flat. So every comparison uses an **RIR-adjusted e1RM**, W × (1 + (reps + RIR) / 30), on Working Sets of 1–12 reps with RIR 4+ counted as 4. RIR is optional, so two Sessions are compared on the adjusted figure only when both logged RIR on their top Set, and on plain Epley otherwise. Inventing a default RIR would turn a skipped chip into a false 7% drop.

A rigid deload every few weeks can blunt growth when fatigue isn't high, so the eight-week nudge is gone. A Deload Week is suggested only when Fatigue shows on two or more different compound Movement Patterns, or on one when the lifter has trained very hard (average compound RIR ≤ 1) for six weeks in a row. Two tired presses are one pattern; a tired press and a tired hinge are systemic.

## Consequences

- One engine in the rules package replaces the old Stall, falling-RIR and eight-week rules. The precedence for one Exercise is Fatigue > Stall > go heavier, and a suggested Deload Week hides the per-Exercise advice of the lifts it covers.
- The adjusted e1RM is the engine's alone. Personal Records, the jump check, ceilings and Strength Level keep plain e1RM: they measure what was lifted, not how hard it felt.
- An Exercise trained only above 12 reps gets no Stall or Fatigue advice. Epley is unreliable there, and no advice beats wrong advice.
- A Session whose top Working Set is at least 7.5% lighter than the Session before starts a fresh window: only it and later Sessions count as the "best before". Without this, the lighter Sessions after a reset would read as more Fatigue and ask for another 10% off. A lifter who drops the weight on their own has taken the remedy too.
- Fatigue (B) compares each of the last 2 Sessions with the average of its window, not the best of it: one lucky day would otherwise make every normal Session after it read as a regression. When the Session logged RIR the average is over the window's Sessions that did too, else plain e1RM over all of them.
- A Switch, or any hand edit of the Rep Range on the Routine screen, stores the local date it happened (`rangeSince`) on that Exercise's entry in the Routine Day. The Routine is a document that already syncs whole, so this is one optional field and no migration. A Stall counts only Sessions on or after that date as failing, though the best before may still reach back before it, and its 3 weeks run from the Session that set the best or from that date, whichever is later. Fatigue ignores the date.
- A Stall needs at least 3 failing Sessions and at least 21 days from the Session that set the best (the Session just before the failing ones) to the last Session. The 6-Session window can't carry that on its own: it is under 3 weeks for someone training 3 times a week.
- Catalog Exercises gain a Movement Pattern. Custom Exercises count as isolation, so they never make a deload systemic.
- Deload Week suggestions have one reason, `fatigue`. The old `stalled`, `rir` and `time` reasons stay readable in history. ADR 0007's "eight weeks without a deload" clock no longer exists.
- The Calibration Sessions still only set the baseline, and no Deload Week is suggested in the first four weeks of training, as before.
- A trainer's attention flag for "Stall" becomes "Stall / Fatigue", saying which.

## Considered Options

- **Keep one Stall and add signals to it**: rejected, because the two states need opposite remedies.
- **A probability score with the streak as a prior multiplier**: rejected for threshold rules, which can be tested at the rules seam and explained in one sentence on screen. The streak lowers a threshold instead.
- **Assume RIR 2 when it's missing, or make RIR required**: rejected, see above; RIR stays optional ([design](../design.md#logging-a-session)).
- **Intra-session Set-to-Set decay as a fourth signal**: deferred, since it only holds with constant rest, which the app doesn't track ([deferred decisions](../deferred-decisions.md)).
- **Store an "advice taken" record per Exercise** to restart the windows: rejected for the stateless 7.5% drop, which needs no new sync record.
- **A muscle-group partial deload** (half the Sets for one muscle for a week, when two of its Exercises show Fatigue): settled as the next tier, but it extends ADR 0007's per-Session Deload mark down to individual Exercises, so it waits for its own ADR.
