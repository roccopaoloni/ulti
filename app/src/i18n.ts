import { createContext, useContext } from 'react';
import type { Tab } from './navigation.ts';

export type Language = 'en' | 'es';

// Glossary terms that appear in the interface, each explained by an ⓘ.
export type Term = 'weeklyTarget' | 'routine' | 'group' | 'rank';

type Messages = {
  tagline: string;
  tabs: Record<Tab, string>;
  screens: Record<Tab, { label: string; text: string }>;
  close: string;
  glossary: Record<Term, { term: string; explanation: string }>;
};

const en: Messages = {
  tagline: 'one more.',
  tabs: { home: 'Home', train: 'Train', groups: 'Groups', profile: 'Profile' },
  screens: {
    home: { label: 'Your Weekly Target', text: 'Your week will show up here.' },
    train: { label: 'Your Routines', text: 'Your training plan and your history will show up here.' },
    groups: { label: 'Your Groups', text: 'Your friends and their boards will show up here.' },
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
  },
};

// Rioplatense Spanish, with voseo and the glossary's Spanish terms.
const es: Messages = {
  tagline: 'una más.',
  tabs: { home: 'Inicio', train: 'Entrenar', groups: 'Grupos', profile: 'Perfil' },
  screens: {
    home: { label: 'Tu objetivo semanal', text: 'Acá vas a ver cómo va tu semana.' },
    train: { label: 'Tus rutinas', text: 'Acá vas a ver tu plan de entrenamiento y todo lo que entrenaste.' },
    groups: { label: 'Tus grupos', text: 'Acá vas a ver a tus amigos y sus tablas.' },
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
