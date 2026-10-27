import type { Division, Tier } from '@ulti/rules';
import { supabase } from './auth.ts';
import { paths } from './navigation.ts';
import { today } from './profile.ts';
import { useStored, write } from './stored.ts';

// What my_groups() returns: of each member, only what the server lets members see of each other.
export type Member = { display_name: string; avatar_color: string; owner: boolean; me: boolean };
export type Group = { id: string; name: string; invite_code: string; members: Member[] };

// The display name and avatar colour a user's Groups show (design: Avatars).
export type Profile = { display_name: string; avatar_color: string };

// The colours a user can pick: light enough for dark initials in both themes, and none of them a
// Tier colour or the accent.
export const avatarColors = {
  coral: '#ff8f6b',
  sand: '#e8c39e',
  lime: '#c5e46a',
  teal: '#55d6c6',
  sky: '#6fb6f7',
  pink: '#f4a0c4',
} as const;
export type AvatarColor = keyof typeof avatarColors;

// "Ana" → "AN", "Ana Pérez" → "AP".
export function initials(name: string) {
  const words = name.trim().split(/\s+/);
  const letters = words.length > 1 ? words.slice(0, 2).map((word) => Array.from(word)[0]) : Array.from(words[0]).slice(0, 2);
  return letters.join('').toLocaleUpperCase();
}

// Group actions are online calls: the server checks every invite and decides who the Owner is.
export class GroupsError extends Error {
  reason: 'offline' | 'inviteNotFound' | 'other';
  constructor(reason: GroupsError['reason']) {
    super(reason);
    this.reason = reason;
  }
}

async function call<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null; status: number }>) {
  const { data, error, status } = await request;
  // supabase-js answers status 0 when the request never reached the server.
  if (status === 0) throw new GroupsError('offline');
  if (error) throw new GroupsError(error.message === 'invite_not_found' ? 'inviteNotFound' : 'other');
  return data as T;
}

// The signed-in user's Groups and profile, as last fetched, so the tabs show them offline too.
const groupsKey = (userId: string) => `ulti-groups:${userId}`;
const profileKey = (userId: string) => `ulti-profile:${userId}`;

export const useGroups = (userId: string) => useStored<Group[]>(groupsKey(userId));
export const useProfile = (userId: string) => useStored<Profile>(profileKey(userId));

export async function refreshGroups(userId: string) {
  write(groupsKey(userId), await call<Group[]>(supabase.rpc('my_groups')));
}

// The user's profile, or null while they haven't picked both a display name and a colour.
export async function refreshProfile(userId: string) {
  const row = await call<Partial<Profile> | null>(supabase.from('profiles').select('display_name, avatar_color').maybeSingle());
  const profile = row?.display_name && row.avatar_color ? (row as Profile) : null;
  write(profileKey(userId), profile);
  return profile;
}

export async function saveProfile(userId: string, profile: Profile) {
  await call(supabase.from('profiles').upsert({ user_id: userId, ...profile }));
  write(profileKey(userId), profile);
}

// The screen for creating a Group, a path so that Back closes it and a reload keeps it open.
export const newGroupPath = '/groups/new';

// The Group the Groups tab shows.
const selectedKey = 'ulti-group';
export const useSelectedGroup = () => useStored<string>(selectedKey);
export const selectGroup = (id: string) => write(selectedKey, id);

export async function createGroup(userId: string, name: string) {
  const id = await call<string>(supabase.rpc('create_group', { name }));
  await refreshGroups(userId);
  selectGroup(id);
}

export async function leaveGroup(userId: string, groupId: string) {
  await call(supabase.rpc('leave_group', { group_id: groupId }));
  await refreshGroups(userId);
}

export async function resetInvite(userId: string, groupId: string) {
  await call(supabase.rpc('reset_invite', { group_id: groupId }));
  await refreshGroups(userId);
}

// An invite link opens /i/<code>, in the installed app or in a browser, which then shows the Groups
// tab. The code is kept until a signed-in account has joined with it, through sign-up or sign-in
// and any reload in between.
const inviteKey = 'ulti-invite';
export const usePendingInvite = () => useStored<string>(inviteKey);
export const dropInvite = () => write(inviteKey, null);

export function captureInvite() {
  const code = location.pathname.match(/^\/i\/([\w-]+)$/)?.[1];
  if (!code) return;
  write(inviteKey, code);
  history.replaceState(null, '', paths.groups);
}

export async function joinGroup(userId: string, code: string) {
  const id = await call<string>(supabase.rpc('join_group', { invite_code: code }));
  await refreshGroups(userId);
  selectGroup(id);
  dropInvite();
}

export const inviteLink = (code: string) => `${location.origin}/i/${code}`;

// A Group's race for a Period, as group_board() returns it: each member's position, points, this
// week's Session dots and latest Personal Records, and nothing more.
export type Period = 'week' | 'month' | 'year';
export type BoardRow = {
  position: number;
  display_name: string;
  avatar_color: string;
  me: boolean;
  points: number;
  tier: Tier;
  division: Division | null;
  weekly_target: number | null;
  session_dates: string[];
  records: { exercise: string; percent_gain: number; points: number }[];
};
export type Board = { members: BoardRow[] };

// Boards are kept as last fetched, so they show offline too.
const boardKey = (userId: string, groupId: string, period: Period) => `ulti-board:${userId}:${groupId}:${period}`;

export const useBoard = (userId: string, groupId: string, period: Period) => useStored<Board>(boardKey(userId, groupId, period));

export async function refreshBoard(userId: string, groupId: string, period: Period) {
  const board = await call<Board>(supabase.rpc('group_board', { group_id: groupId, period, on_date: today() }));
  write(boardKey(userId, groupId, period), board);
}
