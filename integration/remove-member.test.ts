import { expect, test } from 'vitest';
import { newUser } from './users.ts';

const coral = '#ff8f6b';
const sky = '#6fb6f7';
const teal = '#55d6c6';

async function lifter(name: string, avatarColor: string) {
  const user = await newUser(name);
  const { error } = await user.device
    .from('profiles')
    .upsert({ user_id: user.id, display_name: name, avatar_color: avatarColor });
  expect(error).toBeNull();
  return { id: user.id, device: user.device };
}

// Ana's Group with Bea in it, Ana being the Owner.
async function crew() {
  const ana = await lifter('Ana', coral);
  const bea = await lifter('Bea', sky);
  const { data: gymCrew } = await ana.device.rpc('create_group', { name: 'Gym crew' });
  const { data: groups } = await ana.device.rpc('my_groups');
  const invite_code: string = groups[0].invite_code;
  await bea.device.rpc('join_group', { invite_code });
  return { ana, bea, gymCrew, invite_code };
}

test('the Owner removes a member, who then no longer sees the Group or its board', async () => {
  const { ana, bea, gymCrew } = await crew();

  const removed = await ana.device.rpc('remove_member', { group_id: gymCrew, user_id: bea.id });

  expect(removed.error).toBeNull();
  expect((await bea.device.rpc('my_groups')).data).toEqual([]);
  const board = await bea.device.rpc('group_board', { group_id: gymCrew, period: 'week', on_date: '2026-10-28' });
  expect(board.error?.message).toBe('not_member');
  const names = (await ana.device.rpc('my_groups')).data[0].members.map((m: { display_name: string }) => m.display_name);
  expect(names).toEqual(['Ana']);
});

test("a member who isn't the Owner can't remove anyone, and the Owner can't remove themselves", async () => {
  const { ana, bea, gymCrew } = await crew();
  const cy = await lifter('Cy', teal);
  const { data: groups } = await ana.device.rpc('my_groups');
  await cy.device.rpc('join_group', { invite_code: groups[0].invite_code });

  const byMember = await bea.device.rpc('remove_member', { group_id: gymCrew, user_id: cy.id });
  const bySelf = await ana.device.rpc('remove_member', { group_id: gymCrew, user_id: ana.id });
  const byOutsider = await (await lifter('Dan', teal)).device.rpc('remove_member', { group_id: gymCrew, user_id: cy.id });

  expect(byMember.error?.message).toBe('not_owner');
  expect(bySelf.error?.message).toBe('cannot_remove_owner');
  expect(byOutsider.error?.message).toBe('not_owner');
  expect((await ana.device.rpc('my_groups')).data[0].members).toHaveLength(3);
});

test('a removed member can rejoin with the current invite link, but not after it is reset', async () => {
  const { ana, bea, gymCrew, invite_code } = await crew();

  await ana.device.rpc('remove_member', { group_id: gymCrew, user_id: bea.id });
  const rejoined = await bea.device.rpc('join_group', { invite_code });
  expect(rejoined).toMatchObject({ error: null, data: gymCrew });

  await ana.device.rpc('remove_member', { group_id: gymCrew, user_id: bea.id });
  await ana.device.rpc('reset_invite', { group_id: gymCrew });
  const stale = await bea.device.rpc('join_group', { invite_code });
  expect(stale.error?.message).toBe('invite_not_found');
  expect((await bea.device.rpc('my_groups')).data).toEqual([]);
});
