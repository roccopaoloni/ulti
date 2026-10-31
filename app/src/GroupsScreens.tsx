import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Field } from './AuthScreens.tsx';
import { GroupBoard } from './Boards.tsx';
import {
  avatarColors,
  createGroup,
  deleteAccount,
  dropInvite,
  GroupsError,
  initials,
  inviteLink,
  joinGroup,
  leaveGroup,
  newGroupPath,
  refreshGroups,
  refreshProfile,
  resetInvite,
  saveProfile,
  selectGroup,
  useGroups,
  useProfile,
  useSelectedGroup,
  type AvatarColor,
  type Group,
  type Profile,
} from './groups.ts';
import { useI18n, type I18n } from './i18n.ts';
import { backIcon } from './icons.tsx';
import { Info } from './Info.tsx';
import { navigate, paths } from './navigation.ts';
import { useStored, write } from './stored.ts';
import type { Training } from './training.ts';

export function errorText(error: unknown, t: I18n['t']) {
  if (!(error instanceof GroupsError)) return t.auth.errors.other;
  if (error.reason === 'offline') return t.auth.errors.offline;
  if (error.reason === 'inviteNotFound') return t.groups.inviteNotFound;
  return t.auth.errors.other;
}

// Runs one Group action at a time, keeping the message if it fails.
function useAction() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await task();
    } catch (caught) {
      setError(errorText(caught, t));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

// Initials on the colour the member picked (design: Avatars).
export function Avatar({ name, color, large }: { name: string; color: string; large?: boolean }) {
  return (
    <span className={large ? 'avatar large' : 'avatar'} style={{ '--c': color } as CSSProperties} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

// The display name and colour being typed, kept so that a reload doesn't lose them. It starts from
// the saved ones, or from no name on a colour that comes from the user's id.
const profileDraftKey = 'ulti-profile-draft';

function useProfileDraft(userId: string, saved: Profile | null) {
  const draft = useStored<Profile>(profileDraftKey);
  const colors = Object.values(avatarColors);
  const start = { display_name: '', avatar_color: colors[parseInt(userId.slice(0, 8), 16) % colors.length] };
  return [draft ?? saved ?? start, (next: Profile | null) => write(profileDraftKey, next)] as const;
}

const trimmed = (profile: Profile) => ({ ...profile, display_name: profile.display_name.trim() });

function ProfileFields({ value, onChange }: { value: Profile; onChange: (profile: Profile) => void }) {
  const { t } = useI18n();
  const g = t.groups;
  const colorsLabel = useId();
  return (
    <>
      <div className="profile-fields">
        <Avatar name={value.display_name} color={value.avatar_color} large />
        <Field
          label={g.displayName}
          hint={g.displayNameHint}
          autoComplete="nickname"
          maxLength={30}
          pattern=".*\S.*"
          required
          value={value.display_name}
          onChange={(event) => onChange({ ...value, display_name: event.target.value })}
        />
      </div>
      <div className="field">
        <span className="label" id={colorsLabel}>
          {g.avatarColor}
        </span>
        <div className="swatches" role="radiogroup" aria-labelledby={colorsLabel}>
          {(Object.keys(avatarColors) as AvatarColor[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              className="swatch"
              aria-checked={value.avatar_color === avatarColors[key]}
              aria-label={g.colors[key]}
              style={{ '--c': avatarColors[key] } as CSSProperties}
              onClick={() => onChange({ ...value, avatar_color: avatarColors[key] })}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// A full screen with its buttons at the bottom, like the sign-in screens.
function FormScreen({
  back,
  onSubmit,
  error,
  foot,
  children,
}: {
  back?: () => void;
  onSubmit: () => void;
  error?: string;
  foot: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <form
      className="auth"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <main className="screen auth-body">
        {back && (
          <button type="button" className="iconbtn back" aria-label={t.auth.back} onClick={back}>
            {backIcon}
          </button>
        )}
        {children}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </main>
      <div className="auth-foot">{foot}</div>
    </form>
  );
}

// Creating a Group. The first time, it also asks for the display name and colour members will see.
const groupDraftKey = 'ulti-group-draft';

export function CreateGroup({ userId }: { userId: string }) {
  const { t } = useI18n();
  const g = t.groups;
  const profile = useProfile(userId);
  const [draft, setDraft] = useProfileDraft(userId, profile);
  const name = useStored<string>(groupDraftKey) ?? '';
  const { busy, error, run } = useAction();

  useEffect(() => {
    refreshProfile(userId).catch(() => {});
  }, [userId]);

  const close = () => {
    write(groupDraftKey, null);
    navigate(paths.groups, true);
  };

  return (
    <FormScreen
      back={close}
      error={error}
      onSubmit={() =>
        run(async () => {
          if (!profile) await saveProfile(userId, trimmed(draft));
          setDraft(null);
          await createGroup(userId, name.trim());
          close();
        })
      }
      foot={
        <button className="btn-primary" disabled={busy}>
          {g.create}
        </button>
      }
    >
      <h1 className="disp auth-h">
        {g.newGroup} <Info term="group" />
      </h1>
      <Field
        label={g.groupName}
        maxLength={40}
        pattern=".*\S.*"
        required
        value={name}
        onChange={(event) => write(groupDraftKey, event.target.value)}
      />
      {!profile && (
        <>
          <h2 className="eyebrow">{g.profileTitle}</h2>
          <ProfileFields value={draft} onChange={setDraft} />
        </>
      )}
    </FormScreen>
  );
}

// An invite link, applied as soon as someone is signed in. It stops only to ask for a display name
// and colour the first time, or to say why it couldn't be applied.
export function JoinInvite({ userId, code }: { userId: string; code: string }) {
  const { t } = useI18n();
  const g = t.groups;
  const profile = useProfile(userId);
  const [draft, setDraft] = useProfileDraft(userId, profile);
  const { busy, error, run } = useAction();
  const [askProfile, setAskProfile] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const join = () =>
    run(async () => {
      if (askProfile) {
        await saveProfile(userId, trimmed(draft));
        setDraft(null);
      } else if (!(await refreshProfile(userId))) {
        return setAskProfile(true);
      }
      try {
        await joinGroup(userId, code);
      } catch (caught) {
        if (caught instanceof GroupsError && caught.reason === 'inviteNotFound') return setNotFound(true);
        throw caught;
      }
    });

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    join();
  });

  if (notFound) {
    return (
      <FormScreen onSubmit={dropInvite} foot={<button className="btn-primary">{t.close}</button>}>
        <h1 className="disp auth-h">{g.invited}</h1>
        <p className="lead">{g.inviteNotFound}</p>
      </FormScreen>
    );
  }
  return (
    <FormScreen
      onSubmit={join}
      error={error}
      foot={
        <>
          {(askProfile || error) && (
            <button className="btn-primary" disabled={busy}>
              {askProfile ? g.join : g.retry}
            </button>
          )}
          <button type="button" className="btn-link" onClick={dropInvite}>
            {g.notNow}
          </button>
        </>
      }
    >
      <h1 className="disp auth-h">{g.invited}</h1>
      <p className="lead">
        {askProfile ? g.joinText : !error && g.joining} <Info term="group" />
      </p>
      {askProfile && <ProfileFields value={draft} onChange={setDraft} />}
    </FormScreen>
  );
}

// The Groups tab: the user's Groups as chips, and the chosen one's members.
export function GroupsTab({ userId, training }: { userId: string; training: Training | null }) {
  const { t } = useI18n();
  const g = t.groups;
  const groups = useGroups(userId);
  const selected = useSelectedGroup();
  const [error, setError] = useState<string>();
  const invite = useRef<HTMLDialogElement>(null);
  const leave = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const refresh = () =>
      refreshGroups(userId).then(
        () => setError(undefined),
        (caught) => setError(errorText(caught, t)),
      );
    refresh();
    addEventListener('online', refresh);
    return () => removeEventListener('online', refresh);
  }, [userId, t]);

  const group = groups?.find(({ id }) => id === selected) ?? groups?.[0];
  const eyebrow = (
    <div className="eyebrow">
      {t.screens.groups.label} <Info term="group" />
    </div>
  );

  if (!group) {
    return (
      <section className="card">
        {eyebrow}
        <p className="muted">{t.screens.groups.text}</p>
        {error && !groups && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn-primary" onClick={() => navigate(newGroupPath)}>
          {g.create}
        </button>
      </section>
    );
  }
  return (
    <>
      {eyebrow}
      <div className="chips">
        {groups!.map(({ id, name }) => (
          <button key={id} type="button" className="chip" aria-pressed={id === group.id} onClick={() => selectGroup(id)}>
            {name}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => navigate(newGroupPath)}>
          + {g.newGroup}
        </button>
      </div>
      <div className="g-head">
        <h2 className="disp g-name">{group.name}</h2>
        <button type="button" className="btn-ghost" onClick={() => invite.current?.showModal()}>
          {g.invite}
        </button>
      </div>
      <GroupBoard userId={userId} group={group} training={training} />
      <section className="card">
        <div className="eyebrow">{g.members(group.members.length)}</div>
        <ul className="members">
          {group.members.map((member, index) => (
            <li key={index} className="member">
              <Avatar name={member.display_name} color={member.avatar_color} />
              <span className="member-name">
                {member.display_name}
                {member.me && <span className="muted"> · {g.you}</span>}
              </span>
              {member.owner && (
                <span className="owner">
                  {t.glossary.owner.term} <Info term="owner" />
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="btn-link danger" onClick={() => leave.current?.showModal()}>
        {g.leave}
      </button>
      <InviteSheet key={`invite-${group.id}`} dialog={invite} userId={userId} group={group} />
      <LeaveSheet key={`leave-${group.id}`} dialog={leave} userId={userId} group={group} />
    </>
  );
}

// A bottom sheet, like the ⓘ explanations. A tap on the backdrop closes it.
export function Sheet({ dialog, label, children }: { dialog: RefObject<HTMLDialogElement | null>; label: string; children: ReactNode }) {
  return createPortal(
    <dialog
      ref={dialog}
      className="sheet"
      aria-label={label}
      onClick={(event) => {
        // React passes portal events up the component tree; keep clicks and submits away from the parent.
        event.stopPropagation();
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onSubmit={(event) => event.stopPropagation()}
    >
      <div className="sheet-body">{children}</div>
    </dialog>,
    document.body,
  );
}

type SheetProps = { dialog: RefObject<HTMLDialogElement | null>; userId: string; group: Group };

function InviteSheet({ dialog, userId, group }: SheetProps) {
  const { t } = useI18n();
  const g = t.groups;
  const owner = group.members.some(({ me, owner }) => me && owner);
  const link = inviteLink(group.invite_code);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string>();
  const { busy, error, run } = useAction();

  // Phones open their share sheet; browsers without one copy the link instead.
  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    if (!canShare) {
      await navigator.clipboard.writeText(link).then(() => setNotice(g.copied), () => {});
      return;
    }
    // Closing the share sheet without picking anyone rejects; that's fine.
    await navigator.share({ text: g.shareText(group.name), url: link }).catch(() => {});
  };

  return (
    <Sheet dialog={dialog} label={g.inviteTitle}>
      <h2 className="disp sheet-title">{g.inviteTitle}</h2>
      <p className="muted">{owner ? g.inviteTextOwner : g.inviteText}</p>
      <div className="invite-link">{link.replace(/^https?:\/\//, '')}</div>
      <button type="button" className="btn-primary" onClick={share}>
        {canShare ? g.share : g.copy}
      </button>
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {owner &&
        (confirming ? (
          <>
            <p>{g.resetConfirm}</p>
            <button
              type="button"
              className="btn-ghost danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await resetInvite(userId, group.id);
                  setConfirming(false);
                  setNotice(g.resetDone);
                })
              }
            >
              {g.reset}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setConfirming(true);
              setNotice(undefined);
            }}
          >
            {g.reset}
          </button>
        ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form method="dialog">
        <button className="btn-ghost">{t.close}</button>
      </form>
    </Sheet>
  );
}

function LeaveSheet({ dialog, userId, group }: SheetProps) {
  const { t } = useI18n();
  const g = t.groups;
  const { members } = group;
  const owner = members.some(({ me, owner }) => me && owner);
  // Members come longest-standing first, so the next Owner is the first one after the user.
  const next = members.find(({ me }) => !me);
  const { busy, error, run } = useAction();

  return (
    <Sheet dialog={dialog} label={g.leaveTitle(group.name)}>
      <h2 className="disp sheet-title">{g.leaveTitle(group.name)}</h2>
      <p>{g.leaveText}</p>
      {!next ? <p>{g.leaveLast}</p> : owner && <p>{g.leaveNextOwner(next.display_name)}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn-danger"
        disabled={busy}
        onClick={() =>
          run(async () => {
            await leaveGroup(userId, group.id);
            dialog.current?.close();
          })
        }
      >
        {g.leaveConfirm}
      </button>
      <form method="dialog">
        <button className="btn-ghost">{g.cancel}</button>
      </form>
    </Sheet>
  );
}

// On Profile: who the user is, as friends see it. Editing is in Settings.
export function ProfileSummary({ userId }: { userId: string }) {
  const profile = useProfile(userId);
  if (!profile) return null;
  return (
    <div className="profile-summary">
      <Avatar name={profile.display_name} color={profile.avatar_color} large />
      <span className="disp profile-name">{profile.display_name}</span>
    </div>
  );
}

// In Settings: the display name and colour the user's Groups show. The fields to render, whether
// they were changed, and `save`, which goes straight to the server and throws if it can't.
export function useNameForm(userId: string) {
  const profile = useProfile(userId);
  const [draft, setDraft] = useProfileDraft(userId, profile);

  useEffect(() => {
    refreshProfile(userId).catch(() => {});
  }, [userId]);

  return {
    fields: <ProfileFields value={draft} onChange={setDraft} />,
    changed: draft.display_name !== profile?.display_name || draft.avatar_color !== profile?.avatar_color,
    save: async () => {
      await saveProfile(userId, trimmed(draft));
      setDraft(null);
    },
  };
}

// In Settings: deletes the account after a confirmation. On success the user is signed out and the
// device is cleared, so there is nothing left to close.
export function DeleteAccount({ training }: { training: Training | null }) {
  const { t } = useI18n();
  const g = t.groups;
  const dialog = useRef<HTMLDialogElement>(null);
  const { busy, error, run } = useAction();

  return (
    <>
      <button type="button" className="btn-link danger" onClick={() => dialog.current?.showModal()}>
        {g.deleteAccount}
      </button>
      <Sheet dialog={dialog} label={g.deleteAccountTitle}>
        <h2 className="disp sheet-title">{g.deleteAccountTitle}</h2>
        <p>{g.deleteAccountText}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn-danger" disabled={busy} onClick={() => run(() => deleteAccount(training))}>
          {g.deleteAccountConfirm}
        </button>
        <form method="dialog">
          <button className="btn-ghost">{g.cancel}</button>
        </form>
      </Sheet>
    </>
  );
}
