import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { device, newUser } from './users.ts';

// Avatar colours, as each user picks one in Profile.
const coral = '#ff8f6b';
const sky = '#6fb6f7';
const teal = '#55d6c6';

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

test("Bea joins Ana's Group with its invite link, and each sees the other's display name and avatar colour", async () => {
  const ana = await lifter('Ana', coral);
  const bea = await lifter('Bea', sky);
  const { data: gymCrew } = await ana.rpc('create_group', { name: 'Gym crew' });
  const [{ invite_code }] = await groupsOf(ana);
  // Bea already has a Group of her own: a user can belong to many.
  const { data: work } = await bea.rpc('create_group', { name: 'Work' });

  const joined = await bea.rpc('join_group', { invite_code });
  // Opening the link again changes nothing.
  const again = await bea.rpc('join_group', { invite_code });

  expect(joined).toMatchObject({ error: null, data: gymCrew });
  expect(again).toMatchObject({ error: null, data: gymCrew });
  expect(await groupsOf(bea)).toEqual([
    {
      id: work,
      name: 'Work',
      invite_code: expect.any(String),
      members: [{ display_name: 'Bea', avatar_color: sky, owner: true, me: true }],
    },
    {
      id: gymCrew,
      name: 'Gym crew',
      invite_code,
      members: [
        { display_name: 'Ana', avatar_color: coral, owner: true, me: false },
        { display_name: 'Bea', avatar_color: sky, owner: false, me: true },
      ],
    },
  ]);
  expect((await groupsOf(ana))[0].members).toEqual([
    { display_name: 'Ana', avatar_color: coral, owner: true, me: true },
    { display_name: 'Bea', avatar_color: sky, owner: false, me: false },
  ]);
});

test("Bea can't join a Group before she picks the display name and avatar colour its members will see", async () => {
  const ana = await lifter('Ana', coral);
  await ana.rpc('create_group', { name: 'Gym crew' });
  const [{ invite_code }] = await groupsOf(ana);
  const bea = (await newUser('Bea')).device;

  const joined = await bea.rpc('join_group', { invite_code });

  expect(joined.error?.message).toBe('profile_incomplete');
  expect(await groupsOf(bea)).toEqual([]);
});

test('an invite is bound to the account that accepts it, so the Group shows up on every device that account signs in on', async () => {
  const ana = await lifter('Ana', coral);
  await ana.rpc('create_group', { name: 'Gym crew' });
  const [{ invite_code }] = await groupsOf(ana);
  const bea = await newUser('Bea');
  const browser = bea.device;
  await browser.from('profiles').upsert({ user_id: bea.id, display_name: 'Bea', avatar_color: sky });

  // Before Bea signs in, the link can't be accepted: there's no account to bind it to.
  const signedOut = await device().rpc('join_group', { invite_code });
  // Once she has signed in on the browser that opened it, it can.
  const joined = await browser.rpc('join_group', { invite_code });
  // Her installed app, signed in separately, shows the Group.
  const phone = await bea.signIn();

  expect(signedOut.error?.code).toBe('42501');
  expect(joined.error).toBeNull();
  expect((await groupsOf(phone)).map(({ name }: { name: string }) => name)).toEqual(['Gym crew']);
});

test('members see each other only as a display name, an avatar colour and who the Owner is, and nobody else sees the Group', async () => {
  const ana = await lifter('Ana', coral);
  const bea = await lifter('Bea', sky);
  const cy = await lifter('Cy', teal);
  await ana.rpc('create_group', { name: 'Gym crew' });
  const [{ invite_code }] = await groupsOf(ana);
  await bea.rpc('join_group', { invite_code });

  // Cy isn't a member, so his Groups tab shows nothing of it.
  expect(await groupsOf(cy)).toEqual([]);
  // Nobody reads Groups or their members straight from the tables, member or not.
  for (const someone of [bea, cy]) {
    for (const table of ['groups', 'group_members']) {
      expect(await someone.from(table).select()).toMatchObject({ data: null, error: { code: '42501' } });
    }
  }
  // Each profile is read and changed only by its own user.
  expect((await bea.from('profiles').select('display_name, avatar_color')).data).toEqual([
    { display_name: 'Bea', avatar_color: sky },
  ]);
  const renamed = await bea.from('profiles').update({ display_name: 'Not Ana' }).neq('display_name', 'Bea').select();
  expect(renamed.data).toEqual([]);
  expect((await groupsOf(bea))[0].members[0]).toEqual({ display_name: 'Ana', avatar_color: coral, owner: true, me: false });
});
