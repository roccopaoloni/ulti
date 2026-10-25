# Deferred decisions

Design questions deliberately postponed, with the context needed to settle them later.

## Head-to-Head and Underdog (v1.1)

Scoring Modes must score each Scoring Event on its own, so that every leaderboard is a plain sum (see [ADR 0001](./adr/0001-scoring-modes-rescore-events.md)). Standard, PR Hunt and Grind satisfy this; the two ideas below do not.

- **Head-to-Head** decides a Period's winner by weekly one-on-one matchups instead of the highest total. Proposal: model it as a separate concept, a **Format** (how the winner is decided), that combines with any Scoring Mode, rather than as a Scoring Mode itself.
- **Underdog** makes points worth more the further behind a member is in the current Period. Because it depends on the standings, it cannot score events one at a time. Options: drop it, or redesign it as a Format.

## Timed exercises (v1.1)

Planks, dead hangs, wall sits and similar holds are logged in seconds, not weight × reps, so e1RM does not apply to them. In v1 they can only be logged as Custom Exercises. Still to decide for v1.1: what counts as a Personal Record for a hold, how it converts to Progress Points, and what "go heavier" means for one.

Assisted exercises (assisted pull-up and dip machines, where less weight means progress) were dropped from the roadmap entirely; they can still be logged as Custom Exercises.

## Produced Rank-up audio (pending)

The design calls for recorded or produced audio in the Metal style (see the design document's Sound section), but nobody on the project can produce it yet, so there is no ticket for it. Until someone can, the app ships the prototype's synthesized sound, which already follows the Sound rules: every sound lands on something visible, the weight comes from distorted low-mids rather than sub-bass, and nothing rings high and tonal. Swapping in produced audio later changes what plays, not when it plays.
