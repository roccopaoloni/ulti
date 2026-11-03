// Reads the catalog's migrations, so it lives outside src: the rules package is typed without Node.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CEILINGS } from '../src/index.ts';

test('every catalog Exercise has a ceiling with its source', () => {
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  const ids = new Set<string>();
  for (const file of readdirSync(dir).filter((name: string) => name.endsWith('.sql'))) {
    const sql = readFileSync(new URL(file, dir), 'utf8');
    if (!/insert into public\.exercises/.test(sql)) continue;
    for (const [, id] of sql.matchAll(/^\s*\('([a-z0-9-]+)', '[^']*', '[^']*', '(?:weighted|bodyweight)'/gm)) ids.add(id!);
  }
  expect(ids.size).toBeGreaterThanOrEqual(60);
  for (const id of ids) {
    expect(CEILINGS[id], id).toBeDefined();
    expect(CEILINGS[id]!.kg, id).toBeGreaterThan(0);
    expect(CEILINGS[id]!.source, id).not.toBe('');
  }
  expect(Object.keys(CEILINGS).filter((id) => !ids.has(id))).toEqual([]);
});
