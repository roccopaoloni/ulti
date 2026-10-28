import { ELITE_CUTOFF, rankOf, startingPointsAfter, TIER_CUTOFFS } from '@ulti/rules';
import { expect, test } from 'vitest';
import { sql } from './sql.ts';

// private.rank_of keeps its own copy of the rules package's cutoffs, so the boards can name
// other members' Ranks. This fails whenever one side changes without the other.
test("the database's Tier and Division cutoffs are the rules package's", () => {
  const firstPoints = TIER_CUTOFFS.flatMap(({ start, divisionSpan }) => [0, 1, 2, 3, 4].map((step) => start + step * divisionSpan));
  const points = [...new Set([...firstPoints, ELITE_CUTOFF].flatMap((first) => [first - 1, first, first + 1]))].filter((p) => p >= 0).sort((a, b) => a - b);

  const fromDatabase = points.map((p) => JSON.parse(sql(`select private.rank_of(${p})`)));

  expect(fromDatabase).toEqual(points.map(rankOf));
});

// private.starting_points_after keeps its own copy of the soft reset, so the next Season's starting
// points come from the final Tier the way the rules package says.
test("the database's soft reset is the rules package's", () => {
  const tiers = ['bronze', 'silver', 'gold', 'diamond', 'elite'] as const;

  const fromDatabase = tiers.map((tier) => Number(sql(`select private.starting_points_after('${tier}')`)));

  expect(fromDatabase).toEqual(tiers.map(startingPointsAfter));
});
