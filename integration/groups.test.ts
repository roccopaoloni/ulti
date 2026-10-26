import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { newUser } from './users.ts';

// Avatar colours, as each user picks one in Profile.
const coral = '#ff8f6b';

// A signed-in user who has picked the display name and avatar colour their Groups show.
async function lifter(name: string, avatarColor: string) {
  const user = await newUser(name);
  const { error } = await user.device
    .from('profiles')
    .upsert({ user_id: user.id, display_name: name, avatar_color: avatarColor });
  expect(error).toBeNull();
  return user.device;
}

// The Groups a user belongs to, as the Groups tab shows them.
async function groupsOf(device: SupabaseClient) {
  const { data, error } = await device.rpc('my_groups');
  expect(error).toBeNull();
  return data;
}

test('Ana creates a Group and becomes its Owner', async () => {
  const ana = await lifter('Ana', coral);

  const created = await ana.rpc('create_group', { name: 'Gym crew' });

  expect(created.error).toBeNull();
  expect(await groupsOf(ana)).toEqual([
    {
      id: created.data,
      name: 'Gym crew',
      invite_code: expect.any(String),
      members: [{ display_name: 'Ana', avatar_color: coral, owner: true, me: true }],
    },
  ]);
});

test("Ana can't create a Group before she picks the display name and avatar colour her friends will see", async () => {
  const ana = (await newUser('Ana')).device;

  const created = await ana.rpc('create_group', { name: 'Gym crew' });

  expect(created.error?.message).toBe('profile_incomplete');
  expect(await groupsOf(ana)).toEqual([]);
});
