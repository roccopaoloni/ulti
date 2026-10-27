// Run with `npm run simulate`: prints the simulated Season for a population of lifters.
import { ELITE_CUTOFF, TIER_CUTOFFS, seasonOf } from '../index.ts';
import { perfectConsistencyRank, simulatePopulation, type SeasonResult } from './lifters.ts';

declare const console: { log(...args: unknown[]): void };

const { results, summary } = simulatePopulation(1, 5000);
const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
const quantile = (values: number[], q: number) => Math.round(values[Math.floor(q * (values.length - 1))]);

console.log(`${summary.lifters} simulated lifters, one Season each`);
console.log(`Consistency share of Points: ${percent(summary.consistencyShare)} overall, ${percent(summary.medianConsistencyShare)} for the median lifter`);
const columns: [string, (r: SeasonResult) => number][] = [
  ['Consistency', (r) => r.consistencyPoints],
  ['Progress', (r) => r.progressPoints],
  ['Total', (r) => r.points],
];
for (const [name, pick] of columns) {
  const values = results.map(pick).sort((a, b) => a - b);
  const at = (q: number) => quantile(values, q);
  console.log(`${name} Points  p5 ${at(0.05)}  p10 ${at(0.1)}  p25 ${at(0.25)}  median ${at(0.5)}  p70 ${at(0.7)}  p75 ${at(0.75)}  p90 ${at(0.9)}  p97 ${at(0.97)}  max ${at(1)}`);
}
console.log('Rank distribution:', Object.entries(summary.tierShares).map(([tier, share]) => `${tier} ${percent(share)}`).join(', '));
console.log('Cutoffs:', TIER_CUTOFFS.map((t) => `${t.tier} ${t.start} (+${t.divisionSpan}/Division)`).join(', '), `elite ${ELITE_CUTOFF}`);
for (const season of [seasonOf('2026-11-15'), { id: '14-week quarter', start: '2030-07-01', end: '2030-09-30' }]) {
  const reached = [2, 3, 4, 5, 6].map((target) => perfectConsistencyRank(target, season)).map((r) => `${r.tier}${r.division ?? ''} (${r.points})`);
  console.log(`Perfect consistency, no Personal Records, ${season.id}:`, reached.join(', '));
}
