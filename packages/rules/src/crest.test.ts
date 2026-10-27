import { expect, test } from 'vitest';
import { crestOf, type Division, type Tier } from './index.ts';

test('each Tier adds a wing layer to the crest, back to front', () => {
  const wings = (tier: Tier) => crestOf({ tier, division: 5 }).wings;
  expect(wings('bronze')).toEqual(['w1']);
  expect(wings('silver')).toEqual(['w2', 'w1']);
  expect(wings('gold')).toEqual(['w3', 'w2', 'w1']);
  expect(wings('diamond')).toEqual(['w0', 'w3', 'w2', 'w1']);
  expect(wings('elite')).toEqual(['wx', 'w0', 'w3', 'w2', 'w1']);
});

test('each Division adds one nameable step to the crest: studs, fins, a crown spike, glow and a gem flare', () => {
  const at = (division: Division) => crestOf({ tier: 'silver', division });
  expect(at(5)).toMatchObject({ studs: false, wings: ['w2', 'w1'], crown: false, spikes: false, glow: false, flare: false });
  expect(at(4)).toMatchObject({ studs: true, wings: ['w2', 'w1'], crown: false });
  expect(at(3)).toMatchObject({ studs: true, wings: ['w2', 'fin', 'w1'], crown: false });
  expect(at(2)).toMatchObject({ wings: ['w2', 'fin', 'w1'], crown: true, spikes: false });
  expect(at(1)).toMatchObject({ crown: true, glow: true, flare: true });
});

test('the wings spread wider and the gem grows with every Division', () => {
  const scales = ([5, 4, 3, 2, 1] as Division[]).map((division) => crestOf({ tier: 'bronze', division }).wingScale);
  expect(scales).toEqual([0.8, 0.85, 0.9, 0.95, 1]);
  expect(crestOf({ tier: 'bronze', division: 5 }).gemWidth).toBe(13);
  expect(crestOf({ tier: 'diamond', division: 1 }).gemWidth).toBe(25);
});

test('Gold and above wear a crown from Division V, and side spikes from Division II', () => {
  expect(crestOf({ tier: 'gold', division: 5 })).toMatchObject({ crown: true, spikes: false });
  expect(crestOf({ tier: 'gold', division: 2 })).toMatchObject({ crown: true, spikes: true });
  expect(crestOf({ tier: 'silver', division: 2 }).spikes).toBe(false);
});

test('Elite has every Division detail at once', () => {
  expect(crestOf({ tier: 'elite', division: null })).toMatchObject({
    studs: true, wings: ['wx', 'w0', 'w3', 'w2', 'fin', 'w1'], crown: true, spikes: true, glow: true, flare: true, wingScale: 1,
  });
});
