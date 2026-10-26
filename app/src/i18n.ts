import { createContext, useContext } from 'react';
import type { AvatarColor } from './groups.ts';
import type { Tab } from './navigation.ts';

export type Language = 'en' | 'es';

// Glossary terms that appear in the interface, each explained by an ⓘ.
export type Term = 'weeklyTarget' | 'routine' | 'group' | 'rank' | 'owner';

type Messages = {
  tagline: string;
  tabs: Record<Tab, string>;
  screens: Record<Tab, { label: string; text: string }>;
  close: string;
  glossary: Record<Term, { term: string; explanation: string }>;
  // Groups: creating, inviting, joining and leaving, and the display name and avatar members see.
  groups: {
    create: string;
    newGroup: string;
    groupName: string;
    members: (count: number) => string;
    you: string;
    invite: string;
    inviteTitle: string;
    inviteText: string;
    inviteTextOwner: string;
    share: string;
    copy: string;
    copied: string;
    shareText: (group: string) => string;
    reset: string;
    resetConfirm: string;
    resetDone: string;
    leave: string;
    leaveTitle: (group: string) => string;
    leaveText: string;
    leaveNextOwner: (name: string) => string;
    leaveLast: string;
    leaveConfirm: string;
    cancel: string;
    invited: string;
    invitedText: string;
    joinText: string;
    join: string;
    joining: string;
    inviteNotFound: string;
    retry: string;
    notNow: string;
    profileTitle: string;
    displayName: string;
    displayNameHint: string;
    avatarColor: string;
    colors: Record<AvatarColor, string>;
    save: string;
    saved: string;
  };
  auth: {
    pitch: string;
    createAccount: string;
    haveAccount: string;
    back: string;
    signUpTitle: string;
    email: string;
    password: string;
    passwordHint: string;
    // Followed by the email address in bold.
    codeSentTo: string;
    checkEmailTitle: string;
    code: string;
    resend: string;
    resent: string;
    verify: string;
    signInTitle: string;
    signIn: string;
    forgot: string;
    forgotTitle: string;
    forgotText: string;
    sendCode: string;
    newPassword: string;
    saveAndSignIn: string;
    signOut: string;
    errors: {
      offline: string;
      wrongPassword: string;
      wrongCode: string;
      tooMany: string;
      samePassword: string;
      alreadyRegistered: string;
      other: string;
    };
  };
};

const en: Messages = {
  tagline: 'one more.',
  tabs: { home: 'Home', train: 'Train', groups: 'Groups', profile: 'Profile' },
  screens: {
    home: { label: 'Your Weekly Target', text: 'Your week will show up here.' },
    train: { label: 'Your Routines', text: 'Your training plan and your history will show up here.' },
    groups: { label: 'Your Groups', text: 'Create a Group and invite your friends, or open the invite link a friend sent you.' },
    profile: { label: 'Your Rank', text: "How far you've climbed will show up here." },
  },
  close: 'Close',
  glossary: {
    weeklyTarget: {
      term: 'Weekly Target',
      explanation:
        'How many sessions you commit to each week. Hitting it is worth the most points: a full week is worth the same whether you train 3 or 5 days.',
    },
    routine: {
      term: 'Routine',
      explanation: 'Your saved training plan: which exercises you do in each session, with how many sets and reps.',
    },
    group: {
      term: 'Group',
      explanation: 'Friends who compete on shared boards. You can be in as many Groups as you like.',
    },
    rank: {
      term: 'Rank',
      explanation: 'Your Tier and Division this Season. During a Season it only goes up.',
    },
    owner: {
      term: 'Owner',
      explanation:
        "The member who runs a Group: whoever created it, or the member who's been in it longest once the creator leaves. Only the Owner can reset the invite link.",
    },
  },
  groups: {
    create: 'Create a Group',
    newGroup: 'New Group',
    groupName: 'Group name',
    members: (count) => (count === 1 ? '1 member' : `${count} members`),
    you: 'You',
    invite: 'Invite',
    inviteTitle: 'Invite your friends',
    inviteText: 'Anyone with this link can join. If it leaks, the Owner can reset it.',
    inviteTextOwner: 'Anyone with this link can join. If it leaks, you can reset it.',
    share: 'Share link',
    copy: 'Copy link',
    copied: 'Link copied.',
    shareText: (group) => `Join ${group} on ULTI`,
    reset: 'Reset link',
    resetConfirm: "The current link will stop working, and anyone who hasn't joined yet will need the new one.",
    resetDone: 'Done. The old link no longer works.',
    leave: 'Leave Group',
    leaveTitle: (group) => `Leave ${group}?`,
    leaveText: "You'll leave its boards. To come back, you'll need an invite link.",
    leaveNextOwner: (name) => `${name} will become the Owner.`,
    leaveLast: "You're the last member, so the Group will be deleted.",
    leaveConfirm: 'Leave',
    cancel: 'Cancel',
    invited: "You're invited",
    invitedText: "Create an account or sign in, and you'll join the Group your friend invited you to.",
    joinText: 'Choose how your friends will see you, then join the Group.',
    join: 'Join the Group',
    joining: 'Joining the Group…',
    inviteNotFound: "This invite link doesn't work anymore. Ask your friend for a new one.",
    retry: 'Try again',
    notNow: 'Not now',
    profileTitle: 'How your friends see you',
    displayName: 'Your name',
    displayNameHint: 'Your Groups show it, with your initials on your colour.',
    avatarColor: 'Your colour',
    colors: { coral: 'Coral', sand: 'Sand', lime: 'Lime', teal: 'Teal', sky: 'Sky blue', pink: 'Pink' },
    save: 'Save',
    saved: 'Saved.',
  },
  auth: {
    pitch: 'Compete with your friends on who shows up and improves most. Not on who lifts the most.',
    createAccount: 'Create account',
    haveAccount: 'I already have an account',
    back: 'Back',
    signUpTitle: 'Create your account',
    email: 'Email',
    password: 'Password',
    passwordHint: 'At least 8 characters.',
    codeSentTo: 'We sent a 6-digit code to',
    checkEmailTitle: 'Check your email',
    code: 'Code',
    resend: 'Resend code',
    resent: 'We sent you a new code.',
    verify: 'Verify',
    signInTitle: 'Welcome back',
    signIn: 'Sign in',
    forgot: 'Forgot your password?',
    forgotTitle: 'Recover your account',
    forgotText: "We'll send you a code to set a new password.",
    sendCode: 'Send code',
    newPassword: 'New password',
    saveAndSignIn: 'Save and sign in',
    signOut: 'Sign out',
    errors: {
      offline: "Couldn't reach ULTI. Check your connection and try again.",
      wrongPassword: 'Wrong email or password.',
      wrongCode: 'That code is wrong or has expired.',
      tooMany: 'Too many tries. Wait a minute and try again.',
      samePassword: "That's your current password. Choose a new one.",
      alreadyRegistered: 'This email already has an account. Sign in instead.',
      other: 'Something went wrong. Try again.',
    },
  },
};

// Rioplatense Spanish, with voseo and the glossary's Spanish terms.
const es: Messages = {
  tagline: 'una más.',
  tabs: { home: 'Inicio', train: 'Entrenar', groups: 'Grupos', profile: 'Perfil' },
  screens: {
    home: { label: 'Tu objetivo semanal', text: 'Acá vas a ver cómo va tu semana.' },
    train: { label: 'Tus rutinas', text: 'Acá vas a ver tu plan de entrenamiento y todo lo que entrenaste.' },
    groups: { label: 'Tus grupos', text: 'Creá un grupo e invitá a tus amigos, o abrí el link de invitación que te mandó un amigo.' },
    profile: { label: 'Tu rango', text: 'Acá vas a ver hasta dónde llegaste.' },
  },
  close: 'Cerrar',
  glossary: {
    weeklyTarget: {
      term: 'Objetivo semanal',
      explanation:
        'Cuántas sesiones te comprometés a hacer por semana. Cumplirlo es lo que más puntos da: una semana completa vale lo mismo entrenes 3 o 5 días.',
    },
    routine: {
      term: 'Rutina',
      explanation: 'Tu plan de entrenamiento guardado: qué ejercicios hacés en cada sesión, con cuántas series y repeticiones.',
    },
    group: {
      term: 'Grupo',
      explanation: 'Amigos que compiten en las mismas tablas. Podés estar en todos los grupos que quieras.',
    },
    rank: {
      term: 'Rango',
      explanation: 'Tu liga y división en la temporada. Durante la temporada solo sube.',
    },
    owner: {
      term: 'Creador',
      explanation:
        'Quien maneja el grupo: el que lo creó o, si se va, el miembro que está hace más tiempo. Solo el creador puede cambiar el link de invitación.',
    },
  },
  groups: {
    create: 'Crear un grupo',
    newGroup: 'Nuevo grupo',
    groupName: 'Nombre del grupo',
    members: (count) => (count === 1 ? '1 miembro' : `${count} miembros`),
    you: 'Vos',
    invite: 'Invitar',
    inviteTitle: 'Invitá a tus amigos',
    inviteText: 'Cualquiera con este link entra al grupo. Si se filtra, el creador lo puede cambiar.',
    inviteTextOwner: 'Cualquiera con este link entra al grupo. Si se filtra, lo podés cambiar.',
    share: 'Compartir link',
    copy: 'Copiar link',
    copied: 'Link copiado.',
    shareText: (group) => `Sumate a ${group} en ULTI`,
    reset: 'Cambiar link',
    resetConfirm: 'El link actual va a dejar de funcionar, y quien todavía no entró va a necesitar el nuevo.',
    resetDone: 'Listo. El link anterior ya no funciona.',
    leave: 'Salir del grupo',
    leaveTitle: (group) => `¿Salir de ${group}?`,
    leaveText: 'Vas a salir de sus tablas. Para volver, vas a necesitar un link de invitación.',
    leaveNextOwner: (name) => `${name} va a pasar a ser el creador.`,
    leaveLast: 'Sos el último miembro, así que el grupo se va a borrar.',
    leaveConfirm: 'Salir',
    cancel: 'Cancelar',
    invited: 'Te invitaron',
    invitedText: 'Creá una cuenta o entrá, y vas a quedar en el grupo al que te invitó tu amigo.',
    joinText: 'Elegí cómo te van a ver tus amigos y entrá al grupo.',
    join: 'Entrar al grupo',
    joining: 'Entrando al grupo…',
    inviteNotFound: 'Este link de invitación ya no funciona. Pedile uno nuevo a tu amigo.',
    retry: 'Probar de nuevo',
    notNow: 'Ahora no',
    profileTitle: 'Cómo te ven tus amigos',
    displayName: 'Tu nombre',
    displayNameHint: 'Lo ven tus grupos, con tus iniciales sobre tu color.',
    avatarColor: 'Tu color',
    colors: { coral: 'Coral', sand: 'Arena', lime: 'Lima', teal: 'Turquesa', sky: 'Celeste', pink: 'Rosa' },
    save: 'Guardar',
    saved: 'Guardado.',
  },
  auth: {
    pitch: 'Competí con tus amigos por quién aparece y mejora más. No por quién levanta más.',
    createAccount: 'Crear cuenta',
    haveAccount: 'Ya tengo cuenta',
    back: 'Volver',
    signUpTitle: 'Creá tu cuenta',
    email: 'Email',
    password: 'Contraseña',
    passwordHint: 'Mínimo 8 caracteres.',
    codeSentTo: 'Te mandamos un código de 6 dígitos a',
    checkEmailTitle: 'Revisá tu mail',
    code: 'Código',
    resend: 'Reenviar código',
    resent: 'Te mandamos un código nuevo.',
    verify: 'Verificar',
    signInTitle: 'Hola de nuevo',
    signIn: 'Entrar',
    forgot: '¿Olvidaste tu contraseña?',
    forgotTitle: 'Recuperá tu cuenta',
    forgotText: 'Te mandamos un código para crear una contraseña nueva.',
    sendCode: 'Mandar código',
    newPassword: 'Contraseña nueva',
    saveAndSignIn: 'Guardar y entrar',
    signOut: 'Cerrar sesión',
    errors: {
      offline: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.',
      wrongPassword: 'El email o la contraseña no son correctos.',
      wrongCode: 'El código no es correcto o ya venció.',
      tooMany: 'Demasiados intentos. Esperá un minuto y probá de nuevo.',
      samePassword: 'Esa es tu contraseña actual. Elegí una nueva.',
      alreadyRegistered: 'Ya hay una cuenta con este email. Entrá con tu contraseña.',
      other: 'Algo salió mal. Probá de nuevo.',
    },
  },
};

const messages: Record<Language, Messages> = { en, es };

// es-AR writes 82,5 kg and 1.250 pts; en-US writes 82.5 kg and 1,250 pts.
const locales: Record<Language, string> = { en: 'en-US', es: 'es-AR' };

// The first of the phone's languages that ULTI speaks, else English.
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'en' || base === 'es') return base;
  }
  return 'en';
}

export type I18n = {
  language: Language;
  t: Messages;
  formatNumber: (value: number, maximumFractionDigits?: number) => string;
};

export function createI18n(language: Language): I18n {
  return {
    language,
    t: messages[language],
    formatNumber: (value, maximumFractionDigits = 1) =>
      new Intl.NumberFormat(locales[language], { maximumFractionDigits }).format(value),
  };
}

export const I18nContext = createContext<I18n>(createI18n('en'));

export function useI18n(): I18n {
  return useContext(I18nContext);
}
