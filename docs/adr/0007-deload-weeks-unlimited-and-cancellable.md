# Deload Weeks are unlimited and cancellable, and each Session records whether it is a Deload Session

The first version (#18) let a lifter start a Deload Week at most once every four weeks, with no way to undo it. In testing, the owner tapped Start to see what it looked like and was then stuck with a lighter week. Now a lifter can start a Deload Week whenever they like and cancel the current one at any time. The only friction left is a confirm when last week was also a Deload Week. Lifters know their own recovery, so the app suggests and warns but doesn't forbid.

Cancelling a Deload Week partway through must not rewrite the Sessions already trained: their Sets are what was really lifted. So a Session records, when it starts, whether it is a Deload Session, and scoring, pre-fill, go heavier, Stall and Calibration read that record instead of asking whether its week is a Deload Week. A week can therefore hold both Deload Sessions and normal ones, and a lifter can cancel and restart within the same week.

## Consequences

- A Deload Session keeps counting with three Working Sets, and stays out of progression maths, even after its Deload Week is cancelled. Sessions started after the cancel are normal and pre-fill from the last normal Session.
- Cancelling the app's suggestion counts as dismissing it for that week.
- A cancelled Deload Week resets the "eight weeks without a deload" suggestion clock only if it holds at least one Deload Session, so a mis-tap followed by a cancel leaves no trace. Suggestions from Stalls or falling RIR are unaffected.
- Only the current week's Deload Week can be cancelled; past ones are history.
- Sessions logged before this change are marked as Deload Sessions if their week was a Deload Week, so no Points or pre-fill change.

## Considered Options

- **Keep the four-week limit and only add Cancel**: rejected by the owner, because a limit on recovery is the app second-guessing the lifter.
- **Cancelling turns the whole week normal, retroactively**: simpler (the week alone decides), but it would make Sessions already trained count as normal ones they never were, and could take away their Points.
- **Decide by the cancel time instead of a per-Session record**: works for one cancel, but becomes fragile once a week can be started, cancelled and started again.
