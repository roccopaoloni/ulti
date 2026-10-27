import { createContext, useContext } from 'react';
import type { AvatarColor } from './groups.ts';
import type { Tab } from './navigation.ts';

export type Language = 'en' | 'es';

// Glossary terms that appear in the interface, each explained by an ⓘ.
export type Term = 'weeklyTarget' | 'strengthLevel' | 'routine' | 'group' | 'rank' | 'owner' | 'scoringMode' | 'session' | 'set' | 'exercise' | 'calibration';

type Messages = {
  tagline: string;
  tabs: Record<Tab, string>;
  screens: Record<Tab, { label: string; text: string }>;
  close: string;
  about: { title: string; fitnessVoltLink: string; symmetricStrength: string };
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
    periods: { week: string; month: string; year: string };
    // A board's Scoring Mode: the label at its top, the Owner's choice and when a change applies.
    modes: { standard: string; prHunt: string; grind: string };
    scoringMode: (mode: string) => string;
    modeNext: (mode: string, period: string) => string;
    modeChoose: string;
    // A member's points and sessions on a board row, and a Personal Record chip ("Bench +3%").
    boardPoints: (points: number) => string;
    leader: string;
    // The Home race card: "2nd of 5, 40 pts behind Ana", or the lead when ahead.
    race: (position: number, size: number) => string;
    behind: (points: number, name: string) => string;
    ahead: (points: number, name: string) => string;
    leading: string;
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
  // Onboarding, the Profile tab's settings and the bodyweight prompt.
  body: {
    onboardingTitle: string;
    onboardingText: string;
    privacy: string;
    units: string;
    language: string;
    sex: string;
    male: string;
    female: string;
    unspecified: string;
    bodyweight: (units: string) => string;
    weeklyTarget: string;
    sessionsPerWeek: (count: number) => string;
    // A Weekly Target change waiting for its Monday.
    startsOn: (count: number, date: string) => string;
    invalid: string;
    continue: string;
    save: string;
    promptTitle: string;
    promptText: (last: string) => string;
    dismiss: string;
  };
  // Logging a Session.
  session: {
    start: string;
    startHint: string;
    resume: string;
    // How many Sets the Session in progress has, under "Back to session".
    logged: (sets: number) => string;
    title: string;
    sets: (count: number) => string;
    legend: string;
    leave: string;
    finish: string;
    empty: string;
    addExercise: string;
    chooseExercise: string;
    searchExercise: string;
    // The equipment shown beside each Exercise so its variants can be told apart, by equipment ID.
    equipment: Record<string, string>;
    customTag: string;
    // Creates a Custom Exercise named as typed in the search, logged as weight × reps.
    createCustom: (name: string) => string;
    weight: string;
    // The keypad's label for the weight added to a bodyweight Exercise, and how a Set shows it: "BW +10 kg", or "BW" with none (added is empty).
    addedWeight: string;
    bodyweightLoad: (added: string) => string;
    reps: string;
    logSet: string;
    // The label on a Set row, which one tap flips: a Warm-up Set or a Working Set.
    warmUp: string;
    working: string;
    flipLabel: (label: string) => string;
    // The bar on every tab while a Session is in progress.
    bar: string;
    // The keypad's buttons.
    done: string;
    increase: string;
    decrease: string;
    backspace: string;
    // The banner for a Personal Record, e.g. "PR! Bench press +3% · +40 pts", and the points on its Set.
    record: (exercise: string, percentGain: number, points: number) => string;
    points: (points: number) => string;
    // Shown on an Exercise during Calibration.
    calibration: string;
    // Home's button, when the Routine suggests the next Session, and the way to log without it.
    startNext: (day: string) => string;
    startUnplanned: string;
    // A Routine Day's plan for an Exercise, under its name: Sets × Rep Range.
    target: (sets: number, repMin: number, repMax: number) => string;
    // The Go heavier recommendation on the pre-filled rows, and the way to dismiss it.
    dismissGoHeavier: string;
    // The chips after ✓ asking for RIR (0 to 4+), and the Exercise's Increment that ± step by.
    rir: string;
    increment: (amount: string, units: string) => string;
    incrementLabel: string;
  };
  // The Train tab's Routine.
  routine: {
    title: string;
    empty: string;
    day: (number: number) => string;
    dayName: string;
    removeDay: string;
    addDay: string;
    exercise: string;
    pickExercise: string;
    addExercise: string;
    removeExercise: string;
    sets: string;
    // "Repeticiones objetivo" in Spanish, never "rango".
    repRange: string;
    from: string;
    to: string;
    save: string;
    suggestion: (count: number) => string;
    useSuggestion: string;
  };
  // Consistency Points, Week Stamps and the Streak.
  consistency: {
    thisWeek: string;
    // "2 of 3 sessions" under the dots.
    progress: (done: number, target: number) => string;
    points: (points: number) => string;
    // Shown on the summary card when the Session filled a dot, and when it didn't.
    filled: string;
    notCounted: string;
    summaryTitle: string;
    close: string;
    streak: (weeks: number) => string;
    stamps: string;
    noStamps: string;
  };
  // Rank and the Season.
  rank: {
    title: string;
    tier: Record<'bronze' | 'silver' | 'gold' | 'diamond' | 'elite', string>;
    topPercent: (percent: number) => string;
    position: (position: number) => string;
    toNext: (points: number, next: string) => string;
    maxed: string;
  };
  // The Train tab's history of past Sessions.
  history: {
    title: string;
    empty: string;
    edit: string;
    delete: string;
    save: string;
    cancel: string;
    // The points a past Session earned, under its date.
    points: (points: number) => string;
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
  about: {
    title: 'About',
    fitnessVoltLink: 'Powered by FitnessVolt',
    symmetricStrength: 'Built on the Symmetric Strength gym dataset.',
  },
  glossary: {
    weeklyTarget: {
      term: 'Weekly Target',
      explanation:
        'How many sessions you commit to each week. Hitting it is worth the most points: a full week is worth the same whether you train 3 or 5 days.',
    },
    strengthLevel: {
      term: 'Strength Level',
      explanation:
        "How advanced you are compared with lifters of your sex and bodyweight. It's what lets a small gain by an experienced lifter count as much as a big one by a beginner. Nobody sees it, not even your Group.",
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
    scoringMode: {
      term: 'Scoring Mode',
      explanation:
        "How a Group's weekly and monthly boards count points. Standard counts everything. PR Hunt counts only Progress Points from Personal Records. Grind counts only Consistency Points from showing up. The Owner picks it, and a change starts with the next week or month. The yearly board is always Standard.",
    },
    session: {
      term: 'Session',
      explanation: 'One visit to the gym, logged as a sequence of sets.',
    },
    set: {
      term: 'Set',
      explanation: 'One bout of an exercise, recorded as weight × reps: 100 kg × 5 is five reps with 100 kg.',
    },
    exercise: {
      term: 'Exercise',
      explanation: "A movement from ULTI's catalog, such as Back squat or Bench press.",
    },
    calibration: {
      term: 'Calibration',
      explanation:
        "Your first two sessions with an exercise only set your starting best, so they can't earn Progress Points. After that, beating your all-time best estimated one-rep max is a Personal Record.",
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
    periods: { week: 'Week', month: 'Month', year: 'Year' },
    modes: { standard: 'Standard', prHunt: 'PR Hunt', grind: 'Grind' },
    scoringMode: (mode) => `Scoring: ${mode}`,
    modeNext: (mode, period) => `${mode} from next ${period}`,
    modeChoose: 'Scoring Mode (from the next week or month)',
    boardPoints: (points) => `${points} pts`,
    leader: 'Leader',
    race: (position, size) => {
      const teens = position % 100 >= 11 && position % 100 <= 13;
      const suffix = teens ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[position % 10] ?? 'th';
      return `${position}${suffix} of ${size}`;
    },
    behind: (points, name) => `${points} pts behind ${name}`,
    ahead: (points, name) => `${points} pts ahead of ${name}`,
    leading: 'Leading the way',
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
  body: {
    onboardingTitle: 'About you',
    onboardingText: 'A few things so your progress is scored fairly. You can change any of them later in Profile.',
    privacy: 'Your sex, bodyweight and Strength Level are never shown to anyone, not even your Group.',
    units: 'Units',
    language: 'Language',
    sex: 'Sex',
    male: 'Male',
    female: 'Female',
    unspecified: 'Prefer not to say',
    bodyweight: (units) => `Bodyweight in ${units}`,
    weeklyTarget: 'Weekly Target',
    sessionsPerWeek: (count) => `${count} a week`,
    startsOn: (count, date) => `Changes to ${count} a week on ${date}.`,
    invalid: 'Enter a bodyweight between 20 and 500 kg.',
    continue: 'Continue',
    save: 'Save',
    promptTitle: 'Still the same weight?',
    promptText: (last) => `Your last bodyweight was ${last}. Update it, or keep it.`,
    dismiss: 'Keep it',
  },
  session: {
    start: 'Start session',
    startHint: 'It saves on your phone, even with no signal.',
    resume: 'Back to session',
    logged: (sets) => (sets === 1 ? '1 set logged' : `${sets} sets logged`),
    title: 'Session',
    sets: (count) => (count === 1 ? '1 set' : `${count} sets`),
    legend: 'Sets: weight × reps',
    leave: 'Back',
    finish: 'Finish',
    empty: 'Add an exercise to start logging sets.',
    addExercise: 'Add exercise',
    chooseExercise: 'Choose an exercise',
    searchExercise: 'Search exercises',
    equipment: { barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine', cable: 'Cable', smith: 'Smith machine', bodyweight: 'Bodyweight' },
    customTag: 'Custom',
    createCustom: (name) => `Create custom exercise "${name}"`,
    weight: 'Weight',
    addedWeight: 'Added weight',
    bodyweightLoad: (added) => (added ? `BW +${added}` : 'BW'),
    reps: 'Reps',
    logSet: 'Log set',
    warmUp: 'Warm-up',
    working: 'Working',
    flipLabel: (label) => `${label}: tap to change`,
    bar: 'Session in progress',
    done: 'Done',
    increase: 'Increase',
    decrease: 'Decrease',
    backspace: 'Delete',
    record: (exercise, percentGain, points) => `PR! ${exercise} +${percentGain}% · +${points} pts`,
    points: (points) => `+${points} pts`,
    calibration: 'Your first sessions set your baseline',
    startNext: (day) => `Next: ${day}`,
    startUnplanned: 'Log an unplanned session',
    target: (sets, repMin, repMax) => `${sets} × ${repMin}–${repMax} reps`,
    dismissGoHeavier: 'Keep the same weight',
    rir: 'Reps in reserve (RIR)',
    increment: (amount, units) => `Step ${amount} ${units}`,
    incrementLabel: 'Increment',
  },
  routine: {
    title: 'Routine',
    empty: 'Add the sessions of your week, each with its exercises.',
    day: (number) => `Session ${number}`,
    dayName: 'Name',
    removeDay: 'Remove session',
    addDay: 'Add session',
    exercise: 'Exercise',
    pickExercise: 'Choose an exercise',
    addExercise: 'Add exercise',
    removeExercise: 'Remove exercise',
    sets: 'Sets',
    repRange: 'Rep Range',
    from: 'From',
    to: 'To',
    save: 'Save Routine',
    suggestion: (count) => `Your Routine suggests a Weekly Target of ${count} per week.`,
    useSuggestion: 'Use it',
  },
  consistency: {
    thisWeek: 'This week',
    progress: (done, target) => `${done} of ${target} sessions`,
    points: (points) => `${points} pts this week`,
    filled: 'You showed up. That is what counts.',
    notCounted: 'Not counted yet: a session needs at least six working sets, and sessions beyond your target earn nothing extra.',
    summaryTitle: 'Session done',
    close: 'Continue',
    streak: (weeks) => (weeks === 1 ? 'Streak: 1 week' : `Streak: ${weeks} weeks`),
    stamps: 'Week Stamps',
    noStamps: 'Meet your Weekly Target in a week to earn your first stamp.',
  },
  rank: {
    title: 'Rank',
    tier: { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', diamond: 'Diamond', elite: 'Elite' },
    topPercent: (percent) => `top ${percent}% this Season`,
    position: (position) => `#${position} this Season`,
    toNext: (points, next) => `${points} pts to ${next}`,
    maxed: 'Top Tier reached',
  },
  history: {
    title: 'Past sessions',
    empty: 'Your finished sessions will show up here.',
    edit: 'Edit',
    delete: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    points: (points) => `${points} pts`,
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
  about: {
    title: 'Acerca de',
    fitnessVoltLink: 'Powered by FitnessVolt',
    symmetricStrength: 'Basados en el conjunto de datos de gimnasio de Symmetric Strength.',
  },
  glossary: {
    weeklyTarget: {
      term: 'Objetivo semanal',
      explanation:
        'Cuántas sesiones te comprometés a hacer por semana. Cumplirlo es lo que más puntos da: una semana completa vale lo mismo entrenes 3 o 5 días.',
    },
    strengthLevel: {
      term: 'Nivel de fuerza',
      explanation:
        'Qué tan avanzado estás comparado con gente de tu sexo y tu peso. Hace que una mejora chica de alguien con experiencia valga lo mismo que una grande de un principiante. Nadie lo ve, ni siquiera tu grupo.',
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
    scoringMode: {
      term: 'Modo de puntaje',
      explanation:
        'Cómo cuentan los puntos las tablas semanal y mensual de un grupo. Estándar cuenta todo. Caza de récords cuenta solo los puntos de progreso de los récords personales. Constancia cuenta solo los puntos de constancia por venir a entrenar. Lo elige el creador y un cambio rige desde la semana o el mes siguiente. La tabla anual siempre es Estándar.',
    },
    session: {
      term: 'Sesión',
      explanation: 'Una visita al gimnasio, registrada como una secuencia de series.',
    },
    set: {
      term: 'Serie',
      explanation: 'Una tanda de un ejercicio, registrada como peso × repeticiones: 100 kg × 5 son cinco repeticiones con 100 kg.',
    },
    exercise: {
      term: 'Ejercicio',
      explanation: 'Un movimiento del catálogo de ULTI, como Sentadilla o Press banca.',
    },
    calibration: {
      term: 'Calibración',
      explanation:
        'Tus primeras dos sesiones con un ejercicio solo fijan tu mejor marca de partida, así que no dan Puntos de progreso. Después, superar tu mejor 1RM estimado de siempre es un PR.',
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
    periods: { week: 'Semana', month: 'Mes', year: 'Año' },
    modes: { standard: 'Estándar', prHunt: 'Caza de récords', grind: 'Constancia' },
    scoringMode: (mode) => `Puntaje: ${mode}`,
    modeNext: (mode, period) => `${mode} desde la ${period} que viene`,
    modeChoose: 'Modo de puntaje (desde la semana o el mes que viene)',
    boardPoints: (points) => `${points} pts`,
    leader: 'Líder',
    race: (position, size) => `${position}º de ${size}`,
    behind: (points, name) => `${points} pts detrás de ${name}`,
    ahead: (points, name) => `${points} pts delante de ${name}`,
    leading: 'Vas al frente',
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
  body: {
    onboardingTitle: 'Sobre vos',
    onboardingText: 'Unos datos para puntuar tu progreso con justicia. Podés cambiarlos después en Perfil.',
    privacy: 'Tu sexo, tu peso corporal y tu nivel de fuerza no los ve nadie, ni siquiera tu grupo.',
    units: 'Unidades',
    language: 'Idioma',
    sex: 'Sexo',
    male: 'Masculino',
    female: 'Femenino',
    unspecified: 'Prefiero no decirlo',
    bodyweight: (units) => `Peso corporal en ${units}`,
    weeklyTarget: 'Objetivo semanal',
    sessionsPerWeek: (count) => `${count} por semana`,
    startsOn: (count, date) => `Pasa a ${count} por semana el ${date}.`,
    invalid: 'Ingresá un peso corporal entre 20 y 500 kg.',
    continue: 'Continuar',
    save: 'Guardar',
    promptTitle: '¿Seguís pesando lo mismo?',
    promptText: (last) => `Tu último peso corporal fue ${last}. Actualizalo o dejalo así.`,
    dismiss: 'Dejarlo así',
  },
  session: {
    start: 'Empezar sesión',
    startHint: 'Se guarda en tu teléfono, aunque no haya señal.',
    resume: 'Volver a la sesión',
    logged: (sets) => (sets === 1 ? '1 serie registrada' : `${sets} series registradas`),
    title: 'Sesión',
    sets: (count) => (count === 1 ? '1 serie' : `${count} series`),
    legend: 'Series: peso × repeticiones',
    leave: 'Volver',
    finish: 'Terminar',
    empty: 'Agregá un ejercicio para empezar a registrar series.',
    addExercise: 'Agregar ejercicio',
    chooseExercise: 'Elegí un ejercicio',
    searchExercise: 'Buscar ejercicios',
    equipment: { barbell: 'Barra', dumbbell: 'Mancuernas', machine: 'Máquina', cable: 'Polea', smith: 'Multipower', bodyweight: 'Peso corporal' },
    customTag: 'Personalizado',
    createCustom: (name) => `Crear ejercicio personalizado "${name}"`,
    weight: 'Peso',
    addedWeight: 'Peso añadido',
    bodyweightLoad: (added) => (added ? `PC +${added}` : 'PC'),
    reps: 'Repeticiones',
    logSet: 'Registrar serie',
    warmUp: 'Entrada en calor',
    working: 'Efectiva',
    flipLabel: (label) => `${label}: tocá para cambiar`,
    bar: 'Sesión en curso',
    done: 'Listo',
    increase: 'Subir',
    decrease: 'Bajar',
    backspace: 'Borrar',
    record: (exercise, percentGain, points) => `¡PR! ${exercise} +${percentGain}% · +${points} pts`,
    points: (points) => `+${points} pts`,
    calibration: 'Tus primeras sesiones fijan tu base',
    startNext: (day) => `Sigue: ${day}`,
    startUnplanned: 'Registrar una sesión sin rutina',
    target: (sets, repMin, repMax) => `${sets} × ${repMin}–${repMax} repeticiones`,
    dismissGoHeavier: 'Mantener el mismo peso',
    rir: 'Repeticiones en reserva (RIR)',
    increment: (amount, units) => `Salto de ${amount} ${units}`,
    incrementLabel: 'Incremento',
  },
  routine: {
    title: 'Rutina',
    empty: 'Agregá las sesiones de tu semana, cada una con sus ejercicios.',
    day: (number) => `Sesión ${number}`,
    dayName: 'Nombre',
    removeDay: 'Quitar sesión',
    addDay: 'Agregar sesión',
    exercise: 'Ejercicio',
    pickExercise: 'Elegí un ejercicio',
    addExercise: 'Agregar ejercicio',
    removeExercise: 'Quitar ejercicio',
    sets: 'Series',
    repRange: 'Repeticiones objetivo',
    from: 'Desde',
    to: 'Hasta',
    save: 'Guardar rutina',
    suggestion: (count) => `Tu rutina sugiere un objetivo semanal de ${count} por semana.`,
    useSuggestion: 'Usarlo',
  },
  consistency: {
    thisWeek: 'Esta semana',
    progress: (done, target) => `${done} de ${target} sesiones`,
    points: (points) => `${points} pts esta semana`,
    filled: 'Fuiste. Eso es lo que cuenta.',
    notCounted: 'Todavía no cuenta: una sesión necesita al menos seis series de trabajo, y las sesiones sobre tu objetivo no suman más.',
    summaryTitle: 'Sesión terminada',
    close: 'Continuar',
    streak: (weeks) => (weeks === 1 ? 'Racha: 1 semana' : `Racha: ${weeks} semanas`),
    stamps: 'Sellos de semana',
    noStamps: 'Cumplí tu objetivo semanal en una semana para ganar tu primer sello.',
  },
  rank: {
    title: 'Rango',
    tier: { bronze: 'Bronce', silver: 'Plata', gold: 'Oro', diamond: 'Diamante', elite: 'Élite' },
    topPercent: (percent) => `top ${percent}% esta temporada`,
    position: (position) => `#${position} esta temporada`,
    toNext: (points, next) => `${points} pts para ${next}`,
    maxed: 'Llegaste a la liga más alta',
  },
  history: {
    title: 'Sesiones anteriores',
    empty: 'Acá vas a ver las sesiones que termines.',
    edit: 'Editar',
    delete: 'Borrar',
    save: 'Guardar',
    cancel: 'Cancelar',
    points: (points) => `${points} pts`,
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
